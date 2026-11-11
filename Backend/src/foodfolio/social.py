"""Read the caption of an Instagram or TikTok post.

A post shared from the Instagram or TikTok app reaches us as a bare link. The
server has no session on those sites, so the post page itself is a login wall
or an empty JavaScript shell. The caption, which is where creators write the
recipe, is still published in public places meant for link previews:

- TikTok: the public oEmbed endpoint returns it as `title`.
- Instagram: the post's embed page (the one other sites iframe) prints it.

Everything here is best effort: a failure returns "" and the caller decides
what to tell the person. No login, cookie or private API is ever used, so
private accounts cannot be read.
"""

import logging
import re
from html.parser import HTMLParser
from urllib.parse import quote, urlsplit

from .errors import ApiError
from .extract import meta_text
from .fetch import fetch_html, fetch_json, resolve_url

log = logging.getLogger(__name__)

TIKTOK_HOSTS = {"tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"}
INSTAGRAM_HOSTS = {"instagram.com", "www.instagram.com", "m.instagram.com"}
_TIKTOK_SHORT_HOSTS = {"vm.tiktok.com", "vt.tiktok.com"}
_INSTAGRAM_POST = re.compile(r"/(?:[\w.]+/)?(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)")
MAX_CAPTION_CHARS = 10_000
_TIMEOUT_S = 5.0  # several calls may run before the model; stay inside the 30 s API limit
_MAX_BYTES = 2_000_000


def platform(url: str) -> str | None:
    """'tiktok', 'instagram' or None for any other link."""
    host = (urlsplit(url).hostname or "").lower()
    if host in TIKTOK_HOSTS:
        return "tiktok"
    if host in INSTAGRAM_HOSTS:
        return "instagram"
    return None


def fetch_caption(url: str) -> str:
    """The post's caption, or "" when it cannot be read."""
    kind = platform(url)
    try:
        if kind == "tiktok":
            return _tiktok_caption(url)[:MAX_CAPTION_CHARS]
        if kind == "instagram":
            return _instagram_caption(url)[:MAX_CAPTION_CHARS]
    except ApiError as exc:
        log.info("caption lookup failed platform=%s code=%s", kind, exc.code)
    return ""


def _tiktok_caption(url: str) -> str:
    if (urlsplit(url).hostname or "").lower() in _TIKTOK_SHORT_HOSTS or "/t/" in url:
        url = resolve_url(url, timeout=_TIMEOUT_S)
    # Drop tracking parameters: oEmbed wants the canonical video address.
    parts = urlsplit(url)
    canonical = f"https://www.tiktok.com{parts.path}"
    data = fetch_json(
        f"https://www.tiktok.com/oembed?url={quote(canonical, safe='')}",
        timeout=_TIMEOUT_S,
        max_bytes=_MAX_BYTES,
    )
    if not isinstance(data, dict):
        return ""
    return str(data.get("title") or "").strip()


def instagram_embed_url(url: str) -> str | None:
    match = _INSTAGRAM_POST.search(urlsplit(url).path)
    return f"https://www.instagram.com/p/{match.group(1)}/embed/captioned/" if match else None


def _instagram_caption(url: str) -> str:
    embed = instagram_embed_url(url)
    if not embed:
        return ""
    html = fetch_html(embed, timeout=_TIMEOUT_S, max_bytes=_MAX_BYTES)
    return caption_from_embed(html) or meta_text(html)


class _CaptionCollector(HTMLParser):
    """Text inside Instagram's <div class="Caption">, minus the comments block."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._depth = 0  # open divs inside the caption; 0 = outside
        self._skip = 0  # open divs inside a nested comments block

    def handle_starttag(self, tag, attrs):
        classes = (dict(attrs).get("class") or "").split()
        if tag == "br" and self._depth and not self._skip:
            self.parts.append("\n")
        if tag != "div":
            return
        if self._depth:
            self._depth += 1
            if self._skip or "CaptionComments" in classes:
                self._skip += 1
        elif "Caption" in classes:
            self._depth = 1

    def handle_endtag(self, tag):
        if tag != "div" or not self._depth:
            return
        self._depth -= 1
        if self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if self._depth and not self._skip:
            self.parts.append(data)


def caption_from_embed(html: str) -> str:
    collector = _CaptionCollector()
    collector.feed(html)
    text = "".join(collector.parts).replace("\xa0", " ")
    lines = (re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines())
    return "\n".join(line for line in lines if line)
