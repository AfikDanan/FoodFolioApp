# Supermarket prices (prototype)

Price a FoodFolio shopping list at Rami Levy, Yochananof and Shufersal branches, using the price
files Israeli chains must publish by law (Food Act price transparency, 2015).

```
GitHub Actions (daily cron, free)
  └─ python -m pricedata ingest ──▶ portals (FTPS / HTTPS)
        └─ stores.json + <chain>-<store>.json.gz ──▶ "prices-latest" release assets (GitHub CDN)
                                                        │
app: picks 1-3 branches, downloads their files ◀────────┘, prices the list on the phone
```

## Findings

**The data.** Each chain publishes, per branch, `PriceFull` (every product, nightly), `Price`
(hourly changes), `PromoFull`/`Promo` (deals) and one `Stores` file for the chain. Same fields
everywhere (`ItemCode`, `ItemName`, `ItemPrice`, `Quantity`, `UnitQty`, `bIsWeighted`, …), but:

- `.gz` is usually gzip, sometimes a zip under a `.gz` name; some files are UTF-16.
- Tag case drifts (`StoreId` / `StoreID` / `STOREID`) and `Stores` comes in two layouts.
- `Stores` has address and city, **no GPS**. "Nearest branch" needs geocoding or a city picker.
- `ItemCode` is the barcode (GTIN) for packaged goods, so the same product lines up across chains.
  Loose produce (`bIsWeighted=1`) has chain-internal codes and a price per kg.

**The portals.**

| Chain | Portal | Access |
|---|---|---|
| Rami Levy | Cerberus `url.retail.publishedprices.co.il` | FTPS, user `RamiLevi`, empty password |
| Yochananof | same Cerberus server | FTPS, user `yohananof` |
| Shufersal | `prices.shufersal.co.il` | HTML listing → time-limited Azure blob links |

Hosts, user names and chain ids come from the MIT-licensed `il-supermarket-scraper` (35+ chains),
which is kept up to date against the live portals. **Not yet verified from our side**: the dev
sandbox could not reach the portals. The workflow's run on this branch is the live check; its
summary shows a per-chain report (reachable, branch count, file sizes, item counts).

**The hard part is matching, not fetching.** A list says "קמח, 500 גרם"; a file says
"קמח לבן מנופה סוגת 1 ק"ג". `compare.py` matches by words, prefers names that start with the
ingredient ("חלב" picks milk, not "שוקולד חלב"), covers the amount with whole packs (or exact
weight for produce), reuses one chain's barcode at the others, and ranks branches only on the
items every branch carries. Cups and spoons are converted as ml, one onion is guessed at 150 g,
and "a pinch" is assumed to be at home; those rows are marked `estimated`. Good enough to rank
stores; not good enough to promise a total to the shekel.

## Options: cost and speed

| Option | Running cost | Time to working | Notes |
|---|---|---|---|
| **GitHub Actions cron + release assets** (this PR) | $0 (public repo: unlimited minutes; private: ~5 min/day of the 2,000 free) | Done once merged | Runners are in the US: if a portal blocks foreign IPs, that chain fails (the report shows it) |
| Lambda + EventBridge + S3 in `il-central-1` | Cents a month | ~1 day: the backend is not deployed yet | Israeli IP avoids geo-blocks; same code (stdlib only, 15 min limit is plenty for a few chains) |
| Scrape on the phone | $0 | Slow, fragile | Multi-MB files per branch, no FTPS in React Native, every user hits the portals. Not recommended |
| Third-party aggregator API | Unknown | — | I found no official free API; consumer comparison sites have no open API and scraping them breaks their terms |

**Recommendation:** ship the GitHub Actions path first (it costs nothing and is already built), and
price the list on the phone from the 1-3 branch files the user picked (port `compare.py` to JS,
about 150 lines). Move ingest to Lambda in Tel Aviv only for chains the report shows as blocked.
Add a Lambda `/prices/quote` endpoint only if matching needs the model (see below).

## Decisions for you

1. **Where the price is calculated:** on the phone from downloaded files (free, works offline,
   recommended) or on the Lambda (one place to improve matching, costs a little, needs deploy).
2. **How the user picks branches:** a city + branch picker from `stores.json` (free, recommended
   now), or "near me" which needs geocoding every branch address once.
3. **Matching quality:** keep word matching, let the user fix a wrong product once (stored barcode
   per ingredient), and/or a one-time model call per new ingredient name that picks the product,
   cached for everyone (cents a month).

## Later: sending the cart to a retailer

No chain offers a public cart API. Rami Levy, Shufersal and Yochananof online shops each use a
private web API behind a customer login. Filling a cart would mean either a partnership/affiliate
agreement with the chain, or driving their private API with the user's own login (fragile and
likely against their terms). The barcodes from this prototype are what any of those paths would
send. Realistic first step: export the list per chain (product names and barcodes) for the user
to search in the chain's app.

## Run it

```bash
cd Backend/prices
python -m pytest -q
python -m pricedata ingest --out dist --chain ramilevy --chain shufersal --stores ramilevy=1
python -m pricedata quote --data dist --list list.json --branch ramilevy/1 --branch shufersal/1
```

`list.json` is the app's shopping list shape: `[{"name": "קמח", "quantity": 1, "unit": "ק\"ג"}]`.
