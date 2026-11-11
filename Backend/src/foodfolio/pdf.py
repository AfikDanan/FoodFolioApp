"""Read recipes out of a PDF.

FoodFolio's own shared PDFs carry each recipe's exact data in a hidden block,
`#FFREC1#<base64 JSON>#FFEND#`, printed in white text so the page looks normal
but the text layer keeps it. Those recipes come back as they were saved, with
no model call. Any other PDF is reduced to its text and sent to the model like
pasted text, which yields one recipe.
"""

import base64
import binascii
import io
import json
import logging
import re

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from .errors import bad_request
from .schemas import APP_UNIT, DEPARTMENTS, UNITS

log = logging.getLogger(__name__)

MAX_PDF_BYTES = 4_400_000
MAX_PAGES = 80
MAX_RECIPES = 40
_BLOCK = re.compile(r"#FFREC1#([A-Za-z0-9+/=\s]+?)#FFEND#")
_APP_UNITS = {APP_UNIT.get(u, u) for u in UNITS}


def decode_pdf(b64: str) -> bytes:
    try:
        data = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise bad_request("The file is not valid base64.") from exc
    if len(data) > MAX_PDF_BYTES:
        raise bad_request("The PDF is too large.")
    if not data.startswith(b"%PDF"):
        raise bad_request("The file is not a PDF.")
    return data


def pdf_text(data: bytes) -> str:
    """All the text in the PDF, page by page (capped at MAX_PAGES)."""
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise bad_request("The PDF is password protected.")
        pages = reader.pages[:MAX_PAGES]
        return "\n".join(page.extract_text() or "" for page in pages)
    except PdfReadError as exc:
        raise bad_request("The PDF could not be read.") from exc


def embedded_recipes(text: str, categories: list[str]) -> list[dict]:
    """Recipes from FoodFolio data blocks, cleaned to what the app accepts."""
    recipes = []
    for block in _BLOCK.findall(text):
        try:
            raw = json.loads(base64.b64decode(re.sub(r"\s+", "", block)).decode("utf-8"))
        except (binascii.Error, ValueError, UnicodeDecodeError):
            log.info("skipped an unreadable FoodFolio data block")
            continue
        recipe = _clean_embedded(raw, categories)
        if recipe:
            recipes.append(recipe)
        if len(recipes) >= MAX_RECIPES:
            break
    return recipes


def strip_blocks(text: str) -> str:
    return _BLOCK.sub("", text)


def _num(value, default: float, low: float, high: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if low < number <= high else default


def _text(value, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _clean_embedded(raw, categories: list[str]) -> dict | None:
    if not isinstance(raw, dict):
        return None
    title = _text(raw.get("title"), 120)
    ingredients = []
    for item in (raw.get("ingredients") or [])[:80]:
        if not isinstance(item, dict) or not _text(item.get("name"), 80):
            continue
        unit = _text(item.get("unit"), 20)
        department = _text(item.get("department"), 40)
        ingredients.append(
            {
                "name": _text(item.get("name"), 80),
                "quantity": round(_num(item.get("quantity"), 1.0, 0, 100_000), 2),
                "unit": unit if unit in _APP_UNITS else "יחידה",
                "department": department if department in DEPARTMENTS else "אחר",
                "estimated": False,
                "optional": bool(item.get("optional")),
            }
        )
    steps = [_text(s, 2000) for s in (raw.get("steps") or [])[:60]]
    steps = [s for s in steps if s]
    if not title or not ingredients or not steps:
        return None
    tags = [_text(t, 30) for t in (raw.get("tags") or [])[:5]]
    fridge = raw.get("fridge_days")
    minutes = raw.get("total_minutes")
    source = _text(raw.get("source_url"), 2048)
    return {
        "title": title,
        "servings": int(_num(raw.get("servings"), 4, 0, 100)),
        "total_minutes": int(minutes)
        if isinstance(minutes, int | float) and 0 < minutes <= 3 * 24 * 60
        else None,
        "total_time": _text(raw.get("total_time"), 40) or None,
        "ingredients": ingredients,
        "steps": steps,
        "tags": [t for t in tags if t],
        "fridge_days": int(fridge)
        if isinstance(fridge, int | float) and 0 <= fridge <= 30
        else None,
        "suggested_category": raw.get("category") if raw.get("category") in categories else None,
        "source_url": source if re.match(r"^https?://", source) else None,
    }
