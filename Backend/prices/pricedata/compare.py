"""Price a FoodFolio shopping list against one or more branches.

A shopping list row is generic ("קמח", 500, "גרם"), while a price file lists products
("קמח לבן מנופה סוגת 1 ק"ג"). This prototype matches by name only:

1. Normalize both sides (no niqqud or punctuation, ק"ג → קג).
2. A product is a candidate when every word of the list name appears in it; products whose
   name starts with the list name rank first, so "חלב" prefers "חלב 3% 1 ליטר" over "שוקולד חלב".
3. Among the best-ranked candidates, take the cheapest way to cover the needed amount
   (whole packs, or exact weight for weighed produce).

Barcodes (GTIN) are shared across chains, so once a product is chosen for one chain the same
barcode is preferred at the others. Rows that only make sense as a guess are flagged `estimated`.
"""

from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import asdict, dataclass, field

# App units (constants/recipeConstants.js) → base unit and factor.
_APP_UNITS = {
    "גרם": ("g", 1),
    'ק"ג': ("g", 1000),
    'מ"ג': ("g", 0.001),
    'מ"ל': ("ml", 1),
    "ליטר": ("ml", 1000),
    "כוס": ("ml", 240),
    "כף": ("ml", 15),
    "כפית": ("ml", 5),
    "יחידה": ("unit", 1),
}
PANTRY_UNITS = {"קורט"}  # a pinch: assume it is at home
GRAMS_PER_UNIT_GUESS = 150  # one onion, tomato, apple… when produce is sold by weight


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))  # niqqud
    text = text.replace('"', "").replace("״", "").replace("'", "").replace("׳", "")
    text = re.sub(r"[^\w%]+", " ", text)
    return " ".join(text.lower().split())


@dataclass
class Product:
    code: str
    name: str
    price: float
    qty: float | None
    unit: str
    weighted: bool
    norm: str = field(default="", repr=False)

    @classmethod
    def from_row(cls, row: list) -> Product:
        code, name, price, qty, unit, weighted = row
        return cls(code, name, price, qty, unit, bool(weighted), normalize(name))


@dataclass
class Branch:
    chain: str
    chain_name: str
    store_id: str
    store_name: str
    updated: str
    products: list[Product]

    @classmethod
    def from_json(cls, data: dict) -> Branch:
        return cls(
            chain=data["chain"],
            chain_name=data.get("chain_name", data["chain"]),
            store_id=data["store_id"],
            store_name=data.get("store_name", ""),
            updated=data.get("updated", ""),
            products=[Product.from_row(r) for r in data["items"]],
        )


@dataclass
class Line:
    name: str
    status: str  # matched | missing | pantry
    product: str = ""
    code: str = ""
    packs: float = 0
    cost: float = 0.0
    estimated: bool = False


@dataclass
class Quote:
    chain: str
    chain_name: str
    store_id: str
    store_name: str
    updated: str
    total: float
    matched: int
    missing: int
    lines: list[Line]


def _need(quantity: float, unit: str) -> tuple[float, str] | None:
    if unit in PANTRY_UNITS:
        return None
    base, factor = _APP_UNITS.get(unit, ("unit", 1))
    return max(quantity, 0) * factor, base


def _cost(product: Product, need: float, base: str) -> tuple[float, float, bool]:
    """(packs, cost, estimated) to cover `need` of `base` with this product."""
    estimated = False
    if product.weighted:  # price per kg, buy exactly what is needed
        grams = need if base in ("g", "ml") else need * GRAMS_PER_UNIT_GUESS
        estimated = base == "unit"
        kg = grams / 1000
        return round(kg, 3), round(kg * product.price, 2), estimated
    size, unit = product.qty, product.unit
    if not size:
        return 1, product.price, True
    if unit != base:
        if {unit, base} == {"g", "ml"}:
            estimated = True  # 1 ml ≈ 1 g is close enough for most cooking liquids
        else:
            return 1, product.price, True  # e.g. "2 eggs" vs a product sized in grams
    packs = max(1, math.ceil(need / size - 1e-9))
    return packs, round(packs * product.price, 2), estimated


def candidates(products: list[Product], name: str) -> list[Product]:
    words = normalize(name).split()
    if not words:
        return []
    hits = [p for p in products if all(w in p.norm.split() for w in words)]
    if not hits:  # allow prefixes: "עגבני" → "עגבניות", "ביצה" won't hit "ביצים" (by design)
        hits = [p for p in products if all(w in p.norm for w in words)]
    if not hits:
        return []
    starts = [p for p in hits if p.norm.startswith(words[0])]
    return starts or hits


def quote(branch: Branch, shopping: list[dict], pinned: dict[str, str] | None = None) -> Quote:
    """`pinned` maps a list name to a barcode chosen earlier (e.g. at another chain)."""
    pinned = pinned or {}
    by_code = {p.code: p for p in branch.products}
    lines = []
    for row in shopping:
        name = row["name"]
        need = _need(float(row.get("quantity") or 1), row.get("unit") or "יחידה")
        if need is None:
            lines.append(Line(name, "pantry"))
            continue
        amount, base = need
        pool = (
            [by_code[pinned[name]]]
            if pinned.get(name) in by_code
            else candidates(branch.products, name)
        )
        if not pool:
            lines.append(Line(name, "missing"))
            continue
        best = min(pool, key=lambda p: (_cost(p, amount, base)[1], p.name))
        packs, cost, est = _cost(best, amount, base)
        lines.append(Line(name, "matched", best.name, best.code, packs, cost, est))
    matched = [x for x in lines if x.status == "matched"]
    return Quote(
        chain=branch.chain,
        chain_name=branch.chain_name,
        store_id=branch.store_id,
        store_name=branch.store_name,
        updated=branch.updated,
        total=round(sum(x.cost for x in matched), 2),
        matched=len(matched),
        missing=sum(1 for x in lines if x.status == "missing"),
        lines=lines,
    )


def compare(branches: list[Branch], shopping: list[dict]) -> dict:
    """Quote every branch, then rank them on the items every branch carries.

    Ranking by raw total would favour the branch that matched the fewest items, so the
    comparable total only counts list rows matched at every branch.
    """
    quotes = [quote(b, shopping) for b in branches]
    # Second pass: prefer the same barcode everywhere so brands line up across chains.
    pins: dict[str, str] = {}
    for q in quotes:
        for line in q.lines:
            if line.code:
                pins.setdefault(line.name, line.code)
    quotes = [quote(b, shopping, pins) for b in branches]
    common = {
        row["name"]
        for row in shopping
        if all(
            any(x.name == row["name"] and x.status == "matched" for x in q.lines) for q in quotes
        )
    }
    ranked = []
    for q in quotes:
        comparable = round(sum(x.cost for x in q.lines if x.name in common), 2)
        ranked.append({"comparable_total": comparable, **asdict(q)})
    ranked.sort(key=lambda r: r["comparable_total"])
    return {"common_items": sorted(common), "branches": ranked}
