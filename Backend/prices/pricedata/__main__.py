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
import sys
import time
from dataclasses import asdict
from pathlib import Path

from .compare import Branch, compare
from .formats import iter_items, parse_stores, unpack
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
            wanted = stores_wanted.get(key) or {s.store_id for s in stores[:max_stores]}
            for store_id in sorted(wanted, key=int):
                try:
                    pf = latest(src.list("pricefull", store_id), "pricefull", store_id)
                    if pf is None:
                        raise RuntimeError("no PriceFull file listed")
                    raw = src.download(pf)
                    items = list(iter_items(unpack(raw)))
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
    q = sub.add_parser("quote")
    q.add_argument("--data", type=Path, required=True)
    q.add_argument("--list", type=Path, required=True, help="JSON [{name, quantity, unit}]")
    q.add_argument("--branch", action="append", required=True, help="chain/store_id")
    args = ap.parse_args(argv)

    if args.cmd == "ingest":
        report = ingest(args.out, args.chain, _store_filter(args.stores), args.max_stores)
        return 0 if any(r["ok"] for r in report.values()) else 1
    shopping = json.loads(args.list.read_text("utf-8"))
    result = compare([load_branch(args.data, b) for b in args.branch], shopping)
    print(json.dumps(result, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
