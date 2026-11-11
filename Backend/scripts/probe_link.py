"""Check, from any machine, what the import API would read for a link.

    python Backend/scripts/probe_link.py URL [URL ...]          # no model call
    python Backend/scripts/probe_link.py --model URL [URL ...]  # full import (needs OPENAI_API_KEY)
    python Backend/scripts/probe_link.py --phone URL            # as if the phone fetched the page

Prints the caption lookup result and the exact text the model would get, so
Instagram and TikTok handling can be tested against live posts without a
deploy. Uses the same code as the Lambda.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

env = ROOT.parent / ".env"
if env.exists():
    for line in env.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())
if os.environ.get("OPENAI_API_KEY"):
    os.environ.setdefault("LLM_API_KEY", os.environ["OPENAI_API_KEY"])

import requests  # noqa: E402

from foodfolio import service, social  # noqa: E402
from foodfolio.errors import ApiError  # noqa: E402
from foodfolio.schemas import HtmlImport, UrlImport  # noqa: E402

PHONE_UA = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
)


def probe(url: str, *, model: bool, phone: bool) -> None:
    print("=" * 80)
    print(url)
    started = time.monotonic()
    if phone:
        html = requests.get(url, headers={"User-Agent": PHONE_UA}, timeout=15).text
        request = HtmlImport(type="html", url=url, html=html)
    else:
        request = UrlImport(type="url", url=url)
        print("caption lookup:", repr(social.fetch_caption(url)[:300]))
    try:
        text = service._link_text(request, 30_000)
    except ApiError as exc:
        print(f"RESULT: {exc.code} ({exc.message})")
        return
    print(f"model input ({len(text)} chars, {time.monotonic() - started:.1f}s):")
    print(text[:1500])
    if model:
        recipe = service.import_recipe(request)
        print("RECIPE:", json.dumps(recipe.model_dump(), ensure_ascii=False)[:1500])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("urls", nargs="+")
    parser.add_argument("--model", action="store_true", help="also run the model")
    parser.add_argument("--phone", action="store_true", help="fetch like the phone does")
    args = parser.parse_args()
    for url in args.urls:
        try:
            probe(url, model=args.model, phone=args.phone)
        except Exception as exc:  # keep going through the list
            print(f"RESULT: {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
