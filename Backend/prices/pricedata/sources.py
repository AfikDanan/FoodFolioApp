"""Where each chain publishes its files.

Two portal families cover the three prototype chains:

- Cerberus ("publishedprices"): Rami Levy, Yochananof, Osher Ad, Tiv Taam and others. Files sit on
  an FTPS server with a public per-chain user name and an empty password.
- Shufersal: an HTML listing at prices.shufersal.co.il whose rows link to time-limited Azure blob
  URLs. The listing can be filtered by file type (catID) and branch (storeId).

Hosts, user names and chain ids come from the open-source il-supermarket-scraper (MIT), which is
maintained against the live portals; they were not verified from this repository's CI yet.
"""

from __future__ import annotations

import html
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass
from ftplib import FTP_TLS

from .formats import FileName, parse_file_name

TIMEOUT_S = 60
USER_AGENT = "Mozilla/5.0 (FoodFolio price prototype)"


@dataclass(frozen=True)
class Chain:
    key: str
    name: str
    chain_id: str
    portal: str  # cerberus | shufersal
    ftp_user: str = ""


CHAINS = {
    c.key: c
    for c in (
        Chain("ramilevy", "רמי לוי", "7290058140886", "cerberus", ftp_user="RamiLevi"),
        Chain("yohananof", "יוחננוף", "7290803800003", "cerberus", ftp_user="yohananof"),
        Chain("shufersal", "שופרסל", "7290027600007", "shufersal"),
    )
}

CERBERUS_HOST = "url.retail.publishedprices.co.il"
SHUFERSAL_URL = "https://prices.shufersal.co.il/FileObject/UpdateCategory"
_SHUFERSAL_CAT = {"stores": "5", "pricefull": "2"}


@dataclass(frozen=True)
class Listing:
    name: str
    meta: FileName
    locator: str  # FTP file name or https URL


def latest(listings: list[Listing], kind: str, store_id: str | None = None) -> Listing | None:
    wanted = [
        x
        for x in listings
        if x.meta.kind == kind and (store_id is None or x.meta.store_id == store_id)
    ]
    return max(wanted, key=lambda x: x.meta.stamp, default=None)


class CerberusSource:
    def __init__(self, chain: Chain, host: str = CERBERUS_HOST):
        self.chain, self.host = chain, host

    def _connect(self) -> FTP_TLS:
        ftp = FTP_TLS(self.host, timeout=TIMEOUT_S)
        # The server answers PASV with its real public address, which differs from the DNS name's
        # (same setting as il-supermarket-scraper). Without it the data connection hangs.
        ftp.trust_server_pasv_ipv4_address = True
        ftp.login(self.chain.ftp_user, "")
        ftp.prot_p()
        return ftp

    def list(self, kind: str, store_id: str | None = None) -> list[Listing]:
        ftp = self._connect()
        try:
            names = ftp.nlst()
        finally:
            ftp.quit()
        out = []
        for n in names:
            meta = parse_file_name(n)
            if meta and meta.kind == kind and (store_id is None or meta.store_id == store_id):
                out.append(Listing(n, meta, n))
        return out

    def download(self, listing: Listing) -> bytes:
        ftp = self._connect()
        try:
            chunks: list[bytes] = []
            ftp.retrbinary(f"RETR {listing.locator}", chunks.append)
            return b"".join(chunks)
        finally:
            ftp.quit()


_HREF = re.compile(r'href="(https://[^"]+)"', re.IGNORECASE)


def parse_shufersal_listing(page: str) -> list[Listing]:
    out = []
    for raw in _HREF.findall(page):
        url = html.unescape(raw)
        meta = parse_file_name(urllib.parse.urlparse(url).path)
        if meta:
            out.append(Listing(urllib.parse.urlparse(url).path.rsplit("/", 1)[-1], meta, url))
    return out


class ShufersalSource:
    def __init__(self, chain: Chain):
        self.chain = chain

    def list(self, kind: str, store_id: str | None = None) -> list[Listing]:
        params = {"catID": _SHUFERSAL_CAT[kind]}
        if store_id:
            params["storeId"] = store_id
        out, page = [], 1
        while page <= 30:  # the full Stores/PriceFull listing is a few pages
            query = urllib.parse.urlencode({**params, "page": page})
            text = _get(f"{SHUFERSAL_URL}?{query}").decode("utf-8", "replace")
            found = [x for x in parse_shufersal_listing(text) if x.meta.kind == kind]
            if not found:
                break
            out.extend(found)
            if store_id:
                break  # one branch fits on the first page
            page += 1
        return out

    def download(self, listing: Listing) -> bytes:
        return _get(listing.locator)


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return resp.read()


def source_for(chain: Chain):
    return CerberusSource(chain) if chain.portal == "cerberus" else ShufersalSource(chain)
