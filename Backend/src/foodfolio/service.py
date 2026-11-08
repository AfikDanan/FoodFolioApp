"""The import use case: input -> model -> validated recipe."""

import base64
import binascii
import re
from urllib.parse import urlsplit

from . import llm
from .config import get_settings
from .errors import bad_request, no_caption, not_a_recipe
from .extract import page_caption, page_to_model_input
from .fetch import fetch_html
from .schemas import (
    APP_UNIT,
    HtmlImport,
    ImageImport,
    ImportRequest,
    ModelRecipe,
    Recipe,
    Substitute,
    SubstituteRequest,
    TextImport,
    UrlImport,
)

MAX_INGREDIENTS = 80
MAX_STEPS = 60
MAX_TAGS = 5
MAX_MINUTES = 3 * 24 * 60  # a three-day ferment is the longest we believe
_STEP_NUMBER = re.compile(r"^\s*(?:\d+\s*[.)]|[-•*])\s*")


_SOCIAL_HOSTS = ("instagram.com", "tiktok.com")


def _is_social_host(url: str) -> bool:
    host = (urlsplit(url).hostname or "").lower()
    return any(host == h or host.endswith("." + h) for h in _SOCIAL_HOSTS)


def import_recipe(request: ImportRequest) -> Recipe:
    settings = get_settings()
    if isinstance(request, UrlImport | HtmlImport):
        if isinstance(request, UrlImport):
            html = fetch_html(
                request.url, timeout=settings.fetch_timeout_s, max_bytes=settings.fetch_max_bytes
            )
        else:
            html = request.html
        if _is_social_host(request.url) and not page_caption(html).strip():
            # Login-walled shell (Instagram, or a TikTok that hid the post): nothing to read.
            raise no_caption()
        text = page_to_model_input(html, settings.max_page_chars)
        if not text.strip():
            raise not_a_recipe()
        raw = llm.extract_recipe(text=text, image_b64=None, categories=request.categories)
    elif isinstance(request, TextImport):
        raw = llm.extract_recipe(
            text=request.text[: settings.max_page_chars],
            image_b64=None,
            categories=request.categories,
        )
    else:
        raw = llm.extract_recipe(
            text=None, image_b64=_checked_image(request), categories=request.categories
        )
    return clean_recipe(raw, request.categories)


def _checked_image(request: ImageImport) -> str:
    try:
        size = len(base64.b64decode(request.image, validate=True))
    except (binascii.Error, ValueError) as exc:
        raise bad_request("The image is not valid base64.") from exc
    if size > get_settings().max_image_bytes:
        raise bad_request("The image is too large.")
    return request.image


def _merge_duplicates(items) -> list[dict]:
    """One line per ingredient: the same name and unit (flour for the dough and for
    the coating) become a single entry with the amounts added, as on a shopping list."""
    merged: dict[tuple, dict] = {}
    for item in items:
        key = (item["name"], item["unit"], item["optional"])
        if key in merged:
            merged[key]["quantity"] += item["quantity"]
            merged[key]["estimated"] = merged[key]["estimated"] or item["estimated"]
        else:
            merged[key] = dict(item)
    for item in merged.values():
        item["quantity"] = round(item["quantity"], 2)
    return list(merged.values())


def clean_recipe(raw: ModelRecipe, categories: list[str]) -> Recipe:
    """Enforce in code what a prompt can only ask for."""
    ingredients = _merge_duplicates(
        {
            "name": ing.name.strip()[:80],
            "quantity": ing.quantity if ing.quantity > 0 else 1.0,
            "unit": APP_UNIT.get(ing.unit, ing.unit),
            "department": ing.department,
            "estimated": ing.estimated or ing.quantity <= 0,
            "optional": ing.optional,
        }
        for ing in raw.ingredients[:MAX_INGREDIENTS]
        if ing.name.strip()
    )
    steps = [_STEP_NUMBER.sub("", step).strip() for step in raw.steps[:MAX_STEPS]]
    steps = [step for step in steps if step]
    if not raw.is_recipe or not raw.title.strip() or not ingredients or not steps:
        raise not_a_recipe()

    tags = list(dict.fromkeys(tag.strip().lstrip("#").strip() for tag in raw.tags))
    tags = [tag for tag in tags if tag][:MAX_TAGS]
    minutes = raw.total_minutes
    return Recipe(
        title=raw.title.strip()[:120],
        servings=min(max(raw.servings, 1), 100),
        total_minutes=minutes if minutes and 0 < minutes <= MAX_MINUTES else None,
        ingredients=ingredients,
        steps=steps,
        tags=tags,
        fridge_days=raw.fridge_days
        if raw.fridge_days is not None and 0 <= raw.fridge_days <= 30
        else None,
        suggested_category=raw.suggested_category if raw.suggested_category in categories else None,
    )


def source_host(request: ImportRequest) -> str | None:
    """Host only, for logging; never the full URL or its query string."""
    return urlsplit(request.url).hostname if isinstance(request, UrlImport | HtmlImport) else None


MAX_SUBSTITUTES = 3


def substitute(request: SubstituteRequest) -> list[Substitute]:
    """Up to three cleaned-up substitutes for one ingredient."""
    raw = llm.suggest_substitutes(request)
    original = request.ingredient.strip()
    seen = set()
    options = []
    for option in raw.options:
        name = option.name.strip()[:80]
        if not name or name == original or name in seen or option.quantity <= 0:
            continue
        seen.add(name)
        options.append(
            Substitute(
                name=name,
                quantity=round(option.quantity, 2),
                unit=APP_UNIT.get(option.unit, option.unit),
                note=option.note.strip()[:200],
            )
        )
    return options[:MAX_SUBSTITUTES]
