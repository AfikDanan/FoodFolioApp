"""Reading the price-transparency files that Israeli chains must publish.

Every chain publishes the same family of XML files (the regulation fixes the fields), but the
details drift between chains and vendors:

- Compression: `.gz` files are usually gzip, but some vendors serve a zip under a `.gz` name.
- Encoding: mostly UTF-8, some files are UTF-16 with a BOM.
- Tag case: `StoreId`, `StoreID` and `STOREID` all appear, so tags are matched case-insensitively.
- Layout: Stores files are either `SubChains/SubChain/Stores/Store` or a flat `STORES/STORE`.

Only the standard library is used so this runs the same on GitHub Actions, Lambda or a laptop.
"""

from __future__ import annotations

import gzip
import io
import re
import zipfile
from collections.abc import Iterator
from dataclasses import dataclass
from xml.etree import ElementTree as ET

GZIP_MAGIC = b"\x1f\x8b"
ZIP_MAGIC = b"PK"

# PriceFull7290058140886-001-202611200010.gz, Stores7290027600007-000-202611200201.gz,
# and the variant with a sub-chain segment: PriceFull7290058140886-001-039-20261120-0010.gz
_FILE_RE = re.compile(
    r"^(?P<kind>PriceFull|Price|PromoFull|Promo|Stores)(?P<chain>\d{13})-(?P<rest>[\d-]+)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class FileName:
    kind: str  # pricefull | price | promofull | promo | stores
    chain_id: str
    store_id: str | None  # None for Stores files
    stamp: str  # digits only, sortable (newest = max)


def parse_file_name(name: str) -> FileName | None:
    base = name.rsplit("/", 1)[-1].split("?", 1)[0]
    m = _FILE_RE.match(base)
    if not m:
        return None
    kind = m["kind"].lower()
    parts = [p for p in m["rest"].split("-") if p]
    # ids come first, then the timestamp: either 202611200010 or 20261124-020 (Shufersal).
    first_date = next((i for i, p in enumerate(parts) if len(p) >= 8), len(parts))
    ids, stamp = parts[:first_date], "".join(parts[first_date:])
    # chain-store-stamp, or chain-subchain-store-stamp (seen live: Rami Levy 001-732,
    # Shufersal 001-001), so the store is the last id before the timestamp.
    store = str(int(ids[-1])) if ids and kind != "stores" else None
    return FileName(kind, m["chain"], store, stamp)


def unpack(data: bytes) -> bytes:
    """gzip, zip-named-.gz or plain XML in, XML bytes out."""
    head = data[:2]
    if head == GZIP_MAGIC:
        return gzip.decompress(data)
    if head == ZIP_MAGIC:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            return zf.read(zf.infolist()[0])
    return data


def _root(xml: bytes) -> ET.Element:
    xml = unpack(xml)
    if xml.startswith((b"\xff\xfe", b"\xfe\xff")):
        text = xml.decode("utf-16")
        # ElementTree refuses a str that still declares encoding="utf-16".
        text = re.sub(r"^<\?xml[^>]*\?>", "", text.lstrip("﻿"))
        return ET.fromstring(text)
    return ET.fromstring(xml.lstrip(b"\xef\xbb\xbf"))


def _tag(el: ET.Element) -> str:
    return el.tag.rsplit("}", 1)[-1].lower()


def _fields(el: ET.Element) -> dict[str, str]:
    return {_tag(c): (c.text or "").strip() for c in el if len(c) == 0}


def _find_all(root: ET.Element, tag: str) -> Iterator[ET.Element]:
    tag = tag.lower()
    return (el for el in root.iter() if _tag(el) == tag)


def _num(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value.replace(",", ""))
    except ValueError:
        return None


@dataclass(frozen=True)
class Store:
    chain_id: str
    chain_name: str
    store_id: str
    name: str
    address: str
    city: str
    sub_chain: str


def parse_stores(xml: bytes) -> list[Store]:
    root = _root(xml)
    top = _fields(root)
    chain_id = top.get("chainid", "")
    chain_name = top.get("chainname", "")
    out = []
    for sub in [*_find_all(root, "SubChain"), root]:  # sub-chains first: they carry names
        sub_fields = _fields(sub)
        for st in sub.iter():
            if st is sub or _tag(st) != "store":
                continue
            f = _fields(st)
            if not f.get("storeid"):
                continue
            out.append(
                Store(
                    chain_id=f.get("chainid") or chain_id,
                    chain_name=f.get("chainname") or chain_name,
                    store_id=str(int(f["storeid"])),
                    name=f.get("storename", ""),
                    address=f.get("address", ""),
                    city=f.get("city", ""),
                    sub_chain=sub_fields.get("subchainname") or f.get("subchainname", ""),
                )
            )
    # The root walk repeats a SubChains file's stores; keep the first (named) copy.
    seen, unique = set(), []
    for s in out:
        if s.store_id not in seen:
            seen.add(s.store_id)
            unique.append(s)
    return unique


@dataclass(frozen=True)
class Item:
    code: str  # barcode (GTIN) for packaged goods; a chain-internal code for loose items
    name: str
    price: float  # shelf price; per kg when weighted
    qty: float | None  # pack size, e.g. 500
    unit: str  # unit of qty, normalized: g | ml | unit
    weighted: bool  # sold by weight (price is per kg)
    manufacturer: str


_UNIT_ALIASES = {
    "g": ("גרם", "גר", "ג'", "גר'", "gr", "g"),
    "kg": ('ק"ג', "קג", "קילו", "קילוגרם", "kg"),
    "ml": ('מ"ל', "מל", "מיליליטר", "ml"),
    "l": ("ליטר", "ל'", "l", "lt"),
    "unit": ("יחידה", "יח'", "יח", "יחידות", "unit", "units"),
}


def normalize_unit(raw: str) -> str | None:
    raw = (raw or "").strip().lower().replace("״", '"').replace("׳", "'")
    if not raw:
        return None
    for unit, aliases in _UNIT_ALIASES.items():
        if raw in aliases or any(raw.startswith(a) for a in aliases if len(a) > 2):
            return unit
    return None


def _to_base(qty: float | None, unit: str | None) -> tuple[float | None, str]:
    if unit == "kg":
        return (qty * 1000 if qty else None), "g"
    if unit == "l":
        return (qty * 1000 if qty else None), "ml"
    return qty, unit or "unit"


def xml_store_id(xml: bytes) -> str | None:
    """The StoreId a price file declares about itself, to check the file-name parse."""
    for el in _root(xml).iter():
        if _tag(el) == "storeid" and (el.text or "").strip().isdigit():
            return str(int(el.text))
    return None


def iter_items(xml: bytes) -> Iterator[Item]:
    root = _root(xml)
    for el in _find_all(root, "Item"):
        f = _fields(el)
        price = _num(f.get("itemprice"))
        code = f.get("itemcode", "")
        name = f.get("itemname") or f.get("manufactureritemdescription") or ""
        if not code or not name or not price or price <= 0:
            continue
        weighted = f.get("bisweighted", "0").strip() in ("1", "true")
        qty, unit = _to_base(_num(f.get("quantity")), normalize_unit(f.get("unitqty", "")))
        if weighted:
            qty, unit = 1000.0, "g"  # price is per kg
        yield Item(
            code=code,
            name=name,
            price=round(price, 2),
            qty=qty if qty and qty > 0 else None,
            unit=unit,
            weighted=weighted,
            manufacturer=f.get("manufacturername", ""),
        )
