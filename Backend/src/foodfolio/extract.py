"""Turn raw HTML into the smallest text the model needs.

Most recipe sites publish schema.org/Recipe JSON-LD; when present it is both
shorter and cleaner than the page text, so it is preferred. Otherwise the
visible text is used. Either way the model does the language work, so this
module has no per-site knowledge and nothing to maintain when a site redesigns.
"""

import json
import re
from html.parser import HTMLParser

_SKIP_TAGS = {
    "script",
    "style",
    "noscript",
    "svg",
    "nav",
    "header",
    "footer",
    "form",
    "aside",
    "template",
}
_BLOCK_TAGS = {
    "p",
    "div",
    "li",
    "ul",
    "ol",
    "br",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "tr",
    "section",
    "article",
}
_JSONLD_RE = re.compile(
    r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)
_RECIPE_KEYS = (
    "name",
    "recipeYield",
    "totalTime",
    "prepTime",
    "cookTime",
    "recipeIngredient",
    "recipeInstructions",
)


def find_jsonld_recipe(html: str) -> dict | None:
    """First schema.org Recipe object in the page's JSON-LD blocks, if any."""
    for block in _JSONLD_RE.findall(html):
        try:
            data = json.loads(block.strip())
        except json.JSONDecodeError:
            continue
        found = _search_recipe(data)
        if found:
            return found
    return None


def _search_recipe(node) -> dict | None:
    if isinstance(node, list):
        for item in node:
            found = _search_recipe(item)
            if found:
                return found
    elif isinstance(node, dict):
        kind = node.get("@type")
        kinds = kind if isinstance(kind, list) else [kind]
        if "Recipe" in kinds:
            return node
        return _search_recipe(node.get("@graph"))
    return None


class _TextCollector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in _SKIP_TAGS:
            self._skip_depth += 1
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in _SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._skip_depth:
            self.parts.append(data)


def visible_text(html: str, limit: int) -> str:
    collector = _TextCollector()
    collector.feed(html)
    text = "".join(collector.parts).replace("\xa0", " ")
    lines = (re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines())
    return "\n".join(line for line in lines if line)[:limit]


_META_KEYS = ("og:title", "og:description", "twitter:description", "description")


class _MetaCollector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.found: dict[str, str] = {}

    def handle_starttag(self, tag, attrs):
        if tag != "meta":
            return
        attrs = dict(attrs)
        key = (attrs.get("property") or attrs.get("name") or "").lower()
        content = (attrs.get("content") or "").strip()
        if key in _META_KEYS and content and key not in self.found:
            self.found[key] = content


def meta_text(html: str) -> str:
    """The page's preview title and description (og:/twitter:/description tags).

    Social sites that hide the page behind a login (Instagram) still put the post's
    caption here so link previews work, and the visible text skips the <head>.
    """
    collector = _MetaCollector()
    collector.feed(html)
    seen: list[str] = []
    for key in _META_KEYS:
        value = collector.found.get(key)
        if value and not any(value in other or other in value for other in seen):
            seen.append(value)
    return "\n".join(seen)


def page_to_model_input(html: str, limit: int) -> str:
    """Text to send to the model for a fetched page."""
    recipe = find_jsonld_recipe(html)
    if recipe and recipe.get("recipeIngredient") and recipe.get("recipeInstructions"):
        slim = {key: recipe[key] for key in _RECIPE_KEYS if key in recipe}
        return json.dumps(slim, ensure_ascii=False)[:limit]
    meta = meta_text(html)
    body = visible_text(html, limit)
    return (f"{meta}\n\n{body}" if meta else body)[:limit]
