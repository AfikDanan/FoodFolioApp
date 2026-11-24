"""Command line: ingest price files into small static JSON, and price a list against them.

    python -m pricedata ingest --out dist --chain ramilevy --chain yohananof --chain shufersal \
        [--stores ramilevy=1,2 --stores shufersal=1] [--report dist/report.json]
    python -m pricedata quote --data dist --list list.json --branch ramilevy/1 --branch shufersal/1

`ingest` writes:
  dist/stores.json                      every branch of every chain (id, name, city, address)
  dist/<chain>/<store>.json.gz          one branch's products, as compact rows
  dist/report.json                      what worked and what failed, per chain (reachability)
A failing chain is recorded in the report and does not stop the others.
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
import time
from dataclasses import asdict
from pathlib import Path

from .compare import Branch, compare
from .formats import iter_items, parse_stores, unpack, xml_store_id
from .sources import CHAINS, latest, source_for


def _store_filter(values: list[str]) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for v in values or []:
        chain, _, ids = v.partition("=")
        out.setdefault(chain, set()).update(str(int(i)) for i in ids.split(",") if i)
    return out


def ingest(out: Path, chains: list[str], stores_wanted: dict[str, set[str]], max_stores: int):
    out.mkdir(parents=True, exist_ok=True)
    report, all_stores = {}, []
    for key in chains:
        chain = CHAINS[key]
        src = source_for(chain)
        entry = report[key] = {"ok": False, "stores": 0, "branches": [], "errors": []}
        started = time.monotonic()
        try:
            st = latest(src.list("stores"), "stores")
            if st is None:
                raise RuntimeError("no Stores file listed")
            stores = parse_stores(src.download(st))
            entry["stores"] = len(stores)
            entry["stores_file"] = st.name
            for s in stores:
                all_stores.append({"chain": key, "chain_name": chain.name, **asdict(s)})
            names = {s.store_id: s.name for s in stores}
            wanted = stores_wanted.get(key)
            if not wanted:  # the first branches that actually publish a PriceFull
                listed = src.list("pricefull")
                publishing = {x.meta.store_id for x in listed}
                entry["publishing_branches"] = len(publishing)
                entry["sample_files"] = sorted(x.name for x in listed)[:4]
                wanted = {s.store_id for s in stores if s.store_id in publishing}
                wanted = set(sorted(wanted, key=int)[:max_stores])
            for store_id in sorted(wanted, key=int):
                try:
                    pf = latest(src.list("pricefull", store_id), "pricefull", store_id)
                    if pf is None:
                        raise RuntimeError("no PriceFull file listed")
                    raw = src.download(pf)
                    xml = unpack(raw)
                    declared = xml_store_id(xml)
                    if declared and declared != store_id:
                        raise RuntimeError(f"{pf.name} declares StoreId {declared}")
                    items = list(iter_items(xml))
                    path = out / key / f"{store_id}.json.gz"
                    path.parent.mkdir(parents=True, exist_ok=True)
                    doc = {
                        "chain": key,
                        "chain_name": chain.name,
                        "store_id": store_id,
                        "store_name": names.get(store_id, ""),
                        "updated": pf.meta.stamp,
                        "items": [
                            [i.code, i.name, i.price, i.qty, i.unit, int(i.weighted)] for i in items
                        ],
                    }
                    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
                    path.write_bytes(gzip.compress(body.encode(), mtime=0))
                    entry["branches"].append(
                        {
                            "store_id": store_id,
                            "file": pf.name,
                            "raw_bytes": len(raw),
                            "items": len(items),
                            "out_bytes": path.stat().st_size,
                        }
                    )
                except Exception as exc:  # noqa: BLE001 - recorded in the report
                    entry["errors"].append(f"store {store_id}: {type(exc).__name__}: {exc}")
            entry["ok"] = bool(entry["branches"])
        except Exception as exc:  # noqa: BLE001
            entry["errors"].append(f"{type(exc).__name__}: {exc}")
        entry["seconds"] = round(time.monotonic() - started, 1)
        print(f"{key}: {json.dumps(entry, ensure_ascii=False)}", file=sys.stderr)
    (out / "stores.json").write_text(json.dumps(all_stores, ensure_ascii=False), "utf-8")
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), "utf-8")
    return report


def probe(out: Path) -> dict:
    """Record what each portal answers from here, raw, so format changes are visible."""
    import socket
    import urllib.request

    from .sources import (
        CERBERUS_HOST,
        SHUFERSAL_URL,
        USER_AGENT,
        CerberusSource,
        parse_shufersal_listing,
    )

    out.mkdir(parents=True, exist_ok=True)
    result: dict = {}

    def http(name, url):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read()
            (out / f"probe-{name}.html").write_bytes(body)
            text = body.decode("utf-8", "replace")
            links = [x.locator for x in parse_shufersal_listing(text)]
            hrefs = re.findall(r'href="([^"]{0,160})', text)
            result[name] = {
                "status": r.status,
                "bytes": len(body),
                "price_links": len(links),
                "sample_links": [u.split("?")[0] for u in links[:2]],
                "sample_hrefs": hrefs[:8],
            }
        except Exception as exc:  # noqa: BLE001
            result[name] = {"error": f"{type(exc).__name__}: {exc}"}

    def tcp(name, host, port):
        try:
            with socket.create_connection((host, port), timeout=20) as s:
                banner = s.recv(200).decode("latin-1", "replace").strip()
            result[name] = {"connected": True, "banner": banner}
        except Exception as exc:  # noqa: BLE001
            result[name] = {"error": f"{type(exc).__name__}: {exc}"}

    tcp("cerberus_ftp_21", CERBERUS_HOST, 21)
    for key in ("ramilevy",):
        try:
            names = CerberusSource(CHAINS[key]).list("stores")
            result[f"cerberus_list_{key}"] = {"files": [x.name for x in names][:3]}
        except Exception as exc:  # noqa: BLE001
            result[f"cerberus_list_{key}"] = {"error": f"{type(exc).__name__}: {exc}"}
    http("cerberus_https", f"https://{CERBERUS_HOST}/")
    http("publishedprices_https_login", "https://url.publishedprices.co.il/login")
    http("shufersal_pricefull_p1", f"{SHUFERSAL_URL}?catID=2&page=1")
    http("shufersal_pricefull_store1", f"{SHUFERSAL_URL}?catID=2&storeId=1")
    (out / "probe.json").write_text(json.dumps(result, indent=1), "utf-8")
    print(json.dumps(result, indent=1), file=sys.stderr)
    return result


def load_branch(data: Path, ref: str) -> Branch:
    chain, store = ref.split("/")
    raw = gzip.decompress((data / chain / f"{int(store)}.json.gz").read_bytes())
    return Branch.from_json(json.loads(raw))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="pricedata")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("ingest")
    a.add_argument("--out", type=Path, required=True)
    a.add_argument("--chain", action="append", choices=sorted(CHAINS), required=True)
    a.add_argument("--stores", action="append", help="chain=id,id (default: first N)")
    a.add_argument("--max-stores", type=int, default=3)
    p = sub.add_parser("probe", help="record raw portal answers (reachability check)")
    p.add_argument("--out", type=Path, required=True)
    q = sub.add_parser("quote")
    q.add_argument("--data", type=Path, required=True)
    q.add_argument("--list", type=Path, required=True, help="JSON [{name, quantity, unit}]")
    q.add_argument("--branch", action="append", required=True, help="chain/store_id")
    args = ap.parse_args(argv)

    if args.cmd == "probe":
        probe(args.out)
        return 0
    if args.cmd == "ingest":
        report = ingest(args.out, args.chain, _store_filter(args.stores), args.max_stores)
        return 0 if any(r["ok"] for r in report.values()) else 1
    shopping = json.loads(args.list.read_text("utf-8"))
    result = compare([load_branch(args.data, b) for b in args.branch], shopping)
    print(json.dumps(result, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
