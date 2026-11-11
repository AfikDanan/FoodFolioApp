"""The import use case: input -> model -> validated recipe."""

import base64
import binascii
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

from . import llm, pdf
from .config import get_settings
from .errors import ApiError, bad_request, caption_needed, not_a_recipe
from .extract import page_to_model_input
from .fetch import fetch_html
from .schemas import (
    APP_UNIT,
    HtmlImport,
    ImageImport,
    ImportRequest,
    ModelRecipe,
    PdfImport,
    Recipe,
    Substitute,
    SubstituteRequest,
    TextImport,
    UrlImport,
)
from .social import caption_from_page, fetch_caption
from .social import platform as social_platform

MAX_INGREDIENTS = 80
MIN_SOCIAL_PAGE_CHARS = 25  # "Instagram" alone is a login wall or error page
MAX_STEPS = 60
MAX_TAGS = 5
MAX_MINUTES = 3 * 24 * 60  # a three-day ferment is the longest we believe
_STEP_NUMBER = re.compile(r"^\s*(?:\d+\s*[.)]|[-•*])\s*")


def import_recipe(request: ImportRequest) -> Recipe:
    settings = get_settings()
    if isinstance(request, UrlImport | HtmlImport):
        text = _link_text(request, settings.max_page_chars)
        raw = llm.extract_recipe(text=text, image_b64=None, categories=request.categories)
    elif isinstance(request, TextImport):
        raw = llm.extract_recipe(
            text=request.text[: settings.max_page_chars],
            image_b64=None,
            categories=request.categories,
        )
    else:
        raw = llm.extract_recipe(
            text=None, image_b64=_checked_images(request), categories=request.categories
        )
    return clean_recipe(raw, request.categories)


def _link_text(request: UrlImport | HtmlImport, limit: int) -> str:
    """Everything we can learn about a link, as one text for the model.

    Sources: the text the other app shared with the link, the post caption from
    Instagram's or TikTok's public preview endpoints, and the page itself. The
    page is always read too (as before captions were looked up), because a
    lookup can come back empty or partial; the model gets all of it.
    """
    shared = (request.text or "").replace(request.url, "").strip()
    social = social_platform(request.url)
    caption = ""
    html = ""
    if isinstance(request, HtmlImport):
        html = request.html
    else:
        # In parallel: both are network calls and the API has 30 s in total.
        with ThreadPoolExecutor(max_workers=2) as pool:
            lookup = pool.submit(fetch_caption, request.url) if social else None
            page = pool.submit(_fetch_page, request.url)
            caption = lookup.result() if lookup else ""
            try:
                html = page.result()
            except ApiError:
                # With text in hand we can still try; otherwise let the app
                # fall back to fetching the page on the phone.
                if not (shared or caption):
                    raise

    page_text = page_to_model_input(html, limit) if html else ""
    page_caption = caption_from_page(html, social) if html and social else ""
    if social and len(page_text.strip()) < MIN_SOCIAL_PAGE_CHARS:
        # A login wall or error page ("Instagram"): not worth a model call, and
        # the person should be asked for screenshots instead.
        page_text = ""

    parts = []
    for label, value in (
        ("Shared text", shared),
        ("Post caption", caption or page_caption),
        ("Page", page_text),
    ):
        value = value.strip()
        if value and not any(value in seen for _, seen in parts):
            parts.append((label, value))
    if not parts:
        if social:
            raise caption_needed()
        raise not_a_recipe()
    if len(parts) == 1 and parts[0][0] == "Page":
        return parts[0][1][:limit]
    return "\n\n".join(f"{label}:\n{value}" for label, value in parts)[:limit]


def _fetch_page(url: str) -> str:
    settings = get_settings()
    return fetch_html(url, timeout=settings.fetch_timeout_s, max_bytes=settings.fetch_max_bytes)


def import_pdf(request: PdfImport) -> list[Recipe]:
    """Recipes from a PDF: FoodFolio's own data blocks if present, else one via the model."""
    text = pdf.pdf_text(pdf.decode_pdf(request.pdf))
    embedded = pdf.embedded_recipes(text, request.categories)
    if embedded:
        return [Recipe(**recipe) for recipe in embedded]
    text = pdf.strip_blocks(text).strip()
    if len(text) < 20:
        raise not_a_recipe()  # a scanned PDF has no text layer; a photo import reads it
    raw = llm.extract_recipe(
        text=text[: get_settings().max_page_chars], image_b64=None, categories=request.categories
    )
    return [clean_recipe(raw, request.categories)]


def _checked_images(request: ImageImport) -> list[str]:
    """Every image must be valid base64, and together they share one size budget."""
    total = 0
    for image in request.all_images:
        try:
            total += len(base64.b64decode(image, validate=True))
        except (binascii.Error, ValueError) as exc:
            raise bad_request("The image is not valid base64.") from exc
    if total > get_settings().max_image_bytes:
        raise bad_request("The image is too large.")
    return request.all_images


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
