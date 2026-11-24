"""Tests on hand-written XML shaped like the published files (field names and layouts follow the
open-source il-supermarket-parsers; no real price file is checked in)."""

import gzip
import io
import json
import zipfile

import pytest

from pricedata import __main__ as cli
from pricedata.compare import Branch, compare, quote
from pricedata.formats import iter_items, parse_file_name, parse_stores, unpack
from pricedata.sources import Listing, latest, parse_shufersal_listing

PRICES = """<?xml version="1.0" encoding="utf-8"?>
<Root><ChainId>7290058140886</ChainId><SubChainId>001</SubChainId><StoreId>1</StoreId>
<Items Count="5">
 <Item><ItemCode>7290000000011</ItemCode><ItemName>קמח לבן 1 ק"ג</ItemName>
  <ManufacturerName>סוגת</ManufacturerName><UnitQty>ק"ג</UnitQty><Quantity>1</Quantity>
  <bIsWeighted>0</bIsWeighted><ItemPrice>4.90</ItemPrice></Item>
 <Item><ItemCode>7290000000028</ItemCode><ItemName>חלב 3% 1 ליטר</ItemName>
  <UnitQty>ליטר</UnitQty><Quantity>1.00</Quantity><bIsWeighted>0</bIsWeighted>
  <ItemPrice>6.50</ItemPrice></Item>
 <Item><ItemCode>7290000000035</ItemCode><ItemName>שוקולד חלב</ItemName>
  <UnitQty>גרם</UnitQty><Quantity>100</Quantity><bIsWeighted>0</bIsWeighted>
  <ItemPrice>3.00</ItemPrice></Item>
 <Item><ItemCode>2000001</ItemCode><ItemName>בצל יבש</ItemName>
  <UnitQty>ק"ג</UnitQty><Quantity>1</Quantity><bIsWeighted>1</bIsWeighted>
  <ItemPrice>5.00</ItemPrice></Item>
 <Item><ItemCode>7290000000042</ItemCode><ItemName>ביצים L 12 יח'</ItemName>
  <UnitQty>יחידה</UnitQty><Quantity>1</Quantity><bIsWeighted>0</bIsWeighted>
  <ItemPrice>13.90</ItemPrice></Item>
 <Item><ItemCode>bad</ItemCode><ItemName>מחיר אפס</ItemName><ItemPrice>0</ItemPrice></Item>
</Items></Root>"""

STORES_SUBCHAINS = """<?xml version="1.0" encoding="utf-8"?>
<Root><ChainId>7290058140886</ChainId><ChainName>רמי לוי</ChainName>
<SubChains><SubChain><SubChainId>001</SubChainId><SubChainName>רמי לוי</SubChainName>
<Stores>
 <Store><StoreId>001</StoreId><StoreName>תלפיות</StoreName><Address>האומן 1</Address>
  <City>ירושלים</City></Store>
 <Store><StoreId>039</StoreId><StoreName>מודיעין</StoreName><City>מודיעין</City></Store>
</Stores></SubChain></SubChains></Root>"""

STORES_FLAT_UPPER = """<?xml version="1.0" encoding="utf-16"?>
<ASX><CHAINID>7290027600007</CHAINID><STORES>
 <STORE><STOREID>1</STOREID><STORENAME>שלי ת"א</STORENAME><CITY>תל אביב</CITY></STORE>
</STORES></ASX>"""


def test_file_names():
    a = parse_file_name("PriceFull7290058140886-001-202611200010.gz")
    assert (a.kind, a.chain_id, a.store_id, a.stamp) == (
        "pricefull",
        "7290058140886",
        "1",
        "202611200010",
    )
    b = parse_file_name("Stores7290027600007-000-20261124-020.gz")  # seen live, Shufersal
    assert b.kind == "stores" and b.store_id is None and b.stamp == "20261124020"
    c = parse_file_name(
        "https://pricesprodpublic.blob.core.windows.net/pricefull/"
        "PriceFull7290027600007-413-202611200300.gz?sv=2014&sig=x"
    )
    assert c.store_id == "413"
    assert parse_file_name("readme.txt") is None
    # Live names (Nov 2026): sub-chain + store, split timestamp, lower case.
    d = parse_file_name("PriceFull7290058140886-001-732-20261124-161131.gz")
    assert (d.store_id, d.stamp) == ("732", "20261124161131")
    assert parse_file_name("pricefull7290058140886-039-202611240517.gz").store_id == "39"
    assert parse_file_name("PriceFull7290027600007-001-001-20261124-033838.gz").store_id == "1"


def test_unpack_gzip_zip_plain():
    raw = PRICES.encode()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("x.xml", raw)
    assert unpack(gzip.compress(raw)) == raw
    assert unpack(buf.getvalue()) == raw  # a zip served under a .gz name
    assert unpack(raw) == raw


def test_items():
    from pricedata.formats import xml_store_id

    assert xml_store_id(PRICES.encode()) == "1"
    items = {i.code: i for i in iter_items(gzip.compress(PRICES.encode()))}
    assert "bad" not in items
    assert (items["7290000000011"].qty, items["7290000000011"].unit) == (1000, "g")
    assert (items["7290000000028"].qty, items["7290000000028"].unit) == (1000, "ml")
    onion = items["2000001"]
    assert onion.weighted and onion.price == 5.0 and onion.qty == 1000
    assert items["7290000000042"].unit == "unit"
    assert items["7290000000042"].qty == 12  # Quantity says 1, the name says 12 (seen live)


def test_stores_both_layouts_and_utf16():
    s = parse_stores(STORES_SUBCHAINS.encode())
    assert [(x.store_id, x.city, x.sub_chain) for x in s] == [
        ("1", "ירושלים", "רמי לוי"),
        ("39", "מודיעין", "רמי לוי"),
    ]
    flat = parse_stores(b"\xff\xfe" + STORES_FLAT_UPPER.encode("utf-16-le"))
    assert [(x.chain_id, x.store_id, x.name) for x in flat] == [("7290027600007", "1", 'שלי ת"א')]


def test_shufersal_listing():
    page = """<table><tr><td><a href="https://pricesprodpublic.blob.core.windows.net/price
full/PriceFull7290027600007-001-202611200300.gz?sv=2014-02-14&amp;sr=b&amp;sig=abc">x</a></td>
<td><a href="https://pricesprodpublic.blob.core.windows.net/pricefull/PriceFull7290027600007-001-202611200400.gz?sig=d">y</a></td></tr></table>"""  # noqa: E501
    found = parse_shufersal_listing(page.replace("price\nfull", "pricefull"))
    assert len(found) == 2 and "&amp;" not in found[0].locator
    assert latest(found, "pricefull", "1").meta.stamp == "202611200400"


def _branch(chain, store, rows):
    return Branch.from_json(
        {"chain": chain, "store_id": store, "items": rows, "updated": "202611200000"}
    )


def _rows(xml):
    return [[i.code, i.name, i.price, i.qty, i.unit, int(i.weighted)] for i in iter_items(xml)]


def test_prefers_same_dimension_and_exact_name():
    rows = [
        ["1", "סוכר וניל 10 יח", 3.8, 10, "unit", 0],
        ["2", "סוכר לבן 1 קג", 5.9, 1000, "g", 0],
        ["3", "עגבניות מרוסקות 800 גרם", 7.9, 800, "g", 0],
        ["4", "עגבניות", 6.9, 1000, "g", 1],
    ]
    q = quote(
        _branch("x", "1", rows),
        [
            {"name": "סוכר", "quantity": 200, "unit": "גרם"},
            {"name": "עגבניות", "quantity": 500, "unit": "גרם"},
        ],
    )
    sugar, tomatoes = q.lines
    assert sugar.code == "2" and not sugar.estimated
    assert tomatoes.code == "4" and tomatoes.cost == 3.45


def test_counted_produce_prefers_weighed_item_over_other_unit_items():
    rows = [["1", "בצל ירוק", 11.8, 1, "unit", 0], ["2", "בצל יבש", 3.9, 1000, "g", 1]]
    (line,) = quote(
        _branch("x", "1", rows), [{"name": "בצל", "quantity": 2, "unit": "יחידה"}]
    ).lines
    assert line.code == "2" and line.estimated  # 2 × 150 g guessed


SHOPPING = [
    {"name": "קמח", "quantity": 1.5, "unit": 'ק"ג'},
    {"name": "חלב", "quantity": 1, "unit": "כוס"},
    {"name": "בצל", "quantity": 2, "unit": "יחידה"},
    {"name": "ביצים", "quantity": 3, "unit": "יחידה"},
    {"name": "מלח", "quantity": 1, "unit": "קורט"},
    {"name": "זעפרן", "quantity": 1, "unit": "גרם"},
]


def test_quote_lines():
    q = quote(_branch("ramilevy", "1", _rows(PRICES.encode())), SHOPPING)
    lines = {x.name: x for x in q.lines}
    assert lines["קמח"].packs == 2 and lines["קמח"].cost == 9.80  # 1.5 kg → two 1 kg bags
    assert lines["חלב"].product.startswith("חלב 3%")  # not "שוקולד חלב"
    assert lines["בצל"].estimated and lines["בצל"].cost == 1.5  # 2 × 150 g at 5 ₪/kg
    assert lines["ביצים"].packs == 1 and lines["ביצים"].cost == 13.9
    assert lines["מלח"].status == "pantry" and lines["זעפרן"].status == "missing"
    assert q.total == round(9.8 + 6.5 + 1.5 + 13.9, 2) and q.missing == 1


def test_compare_ranks_on_common_items():
    rows = _rows(PRICES.encode())
    cheap = [[*r[:2], round(r[2] * 0.9, 2), *r[3:]] for r in rows if r[1] != "בצל יבש"]
    result = compare([_branch("a", "1", rows), _branch("b", "7", cheap)], SHOPPING)
    assert "בצל" not in result["common_items"]  # b has no onions, so onions are not compared
    first, second = result["branches"]
    assert first["chain"] == "b" and first["comparable_total"] < second["comparable_total"]


def test_ingest_end_to_end(tmp_path, monkeypatch):
    class Fake:
        def __init__(self, chain):
            self.chain = chain

        def list(self, kind, store_id=None):
            if kind == "stores":
                meta = parse_file_name("Stores7290058140886-000-202611200000.gz")
                return [Listing("s", meta, "s")]
            ids = [store_id] if store_id else ["1", "39"]
            names = [f"PriceFull7290058140886-{int(i):03d}-202611200010.gz" for i in ids]
            return [Listing(n, parse_file_name(n), n) for n in names]

        def download(self, listing):
            if listing.locator == "s":
                return gzip.compress(STORES_SUBCHAINS.encode())
            if "-039-" in listing.locator:
                raise ConnectionError("portal timed out")
            return gzip.compress(PRICES.encode())

    monkeypatch.setattr(cli, "source_for", Fake)
    report = cli.ingest(tmp_path, ["ramilevy"], {}, max_stores=5)
    r = report["ramilevy"]
    assert r["ok"] and r["stores"] == 2 and r["branches"][0]["items"] == 5
    assert "store 39" in r["errors"][0]  # one bad branch does not stop the chain
    stores = json.loads((tmp_path / "stores.json").read_text("utf-8"))
    assert {s["store_id"] for s in stores} == {"1", "39"}

    lst = tmp_path / "list.json"
    lst.write_text(json.dumps(SHOPPING, ensure_ascii=False), "utf-8")
    assert (
        cli.main(["quote", "--data", str(tmp_path), "--list", str(lst), "--branch", "ramilevy/1"])
        == 0
    )


@pytest.mark.parametrize(
    "unit,expected", [('ק"ג', "kg"), ("ק״ג", "kg"), ("גרם", "g"), ("ליטר", "l"), ("יח'", "unit")]
)
def test_units(unit, expected):
    from pricedata.formats import normalize_unit

    assert normalize_unit(unit) == expected
