"""Fetch a web page on behalf of a user, without becoming an SSRF proxy.

The URL is user-controlled, so every hop (including redirects) must resolve
only to public internet addresses on the standard web ports. This blocks the
Lambda runtime API on 127.0.0.1:9001, link-local metadata endpoints and any
private network.
"""

import ipaddress
import json
import socket
from urllib.parse import urljoin, urlsplit

import requests

from .errors import bad_request, fetch_failed

ALLOWED_PORTS = {80, 443}
MAX_REDIRECTS = 4
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
_HEADERS = {"User-Agent": USER_AGENT, "Accept-Language": "he,en;q=0.8"}


def check_public_url(url: str) -> None:
    """Raise unless `url` is an http(s) URL pointing at public addresses only."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise bad_request("Only http(s) links are supported.")
    if parts.username or parts.password:
        raise bad_request("Links with credentials are not supported.")
    port = parts.port or (443 if parts.scheme == "https" else 80)
    if port not in ALLOWED_PORTS:
        raise bad_request("Unsupported port.")
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(parts.hostname, port)}
    except socket.gaierror as exc:
        raise fetch_failed("The site could not be found.") from exc
    if not addresses or not all(ipaddress.ip_address(a).is_global for a in addresses):
        raise bad_request("This address is not allowed.")


def fetch_html(url: str, *, timeout: float, max_bytes: int) -> str:
    """GET `url`, following redirects manually so each hop is validated."""
    return _fetch(
        url,
        timeout=timeout,
        max_bytes=max_bytes,
        kinds=("text/html", "application/xhtml+xml"),
        not_ok="The link is not a web page.",
    )


def fetch_json(url: str, *, timeout: float, max_bytes: int):
    """GET a JSON document (an oEmbed answer, say), with the same safety checks."""
    text = _fetch(
        url,
        timeout=timeout,
        max_bytes=max_bytes,
        kinds=("application/json", "text/json", "text/javascript"),
        not_ok="The answer is not JSON.",
    )
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise fetch_failed("The answer is not valid JSON.") from exc


def resolve_url(url: str, *, timeout: float) -> str:
    """Where a short link (vm.tiktok.com/...) finally lands, without reading any page."""
    current = url
    with requests.Session() as session:
        for _ in range(MAX_REDIRECTS + 1):
            check_public_url(current)
            try:
                # GET, not HEAD (some sites answer HEAD with 405); the body is never read.
                response = session.get(
                    current, headers=_HEADERS, timeout=timeout, allow_redirects=False, stream=True
                )
            except requests.RequestException as exc:
                raise fetch_failed("The site did not respond.") from exc
            with response:
                location = response.headers.get("Location") if response.is_redirect else None
            if not location:
                return current
            current = urljoin(current, location)
    raise fetch_failed("Too many redirects.")


def _fetch(url: str, *, timeout: float, max_bytes: int, kinds: tuple, not_ok: str) -> str:
    current = url
    with requests.Session() as session:
        for _ in range(MAX_REDIRECTS + 1):
            check_public_url(current)
            try:
                response = session.get(
                    current,
                    headers=_HEADERS,
                    timeout=timeout,
                    allow_redirects=False,
                    stream=True,
                )
            except requests.RequestException as exc:
                raise fetch_failed("The site did not respond.") from exc
            with response:
                if response.is_redirect:
                    location = response.headers.get("Location")
                    if not location:
                        raise fetch_failed("Bad redirect.")
                    current = urljoin(current, location)
                    continue
                if response.status_code >= 400:
                    raise fetch_failed(f"The site answered with status {response.status_code}.")
                kind = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
                if kind not in kinds:
                    raise bad_request(not_ok)
                return _read_capped(response, max_bytes)
    raise fetch_failed("Too many redirects.")


def _read_capped(response: requests.Response, max_bytes: int) -> str:
    chunks, size = [], 0
    for chunk in response.iter_content(chunk_size=65536):
        size += len(chunk)
        if size > max_bytes:
            raise fetch_failed("The page is too large.")
        chunks.append(chunk)
    return b"".join(chunks).decode(response.encoding or "utf-8", errors="replace")
