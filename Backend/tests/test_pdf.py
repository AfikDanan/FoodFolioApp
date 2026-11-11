import base64
import json
from pathlib import Path

import pytest
from test_service import model_recipe

from foodfolio import handler, pdf, service
from foodfolio.errors import ApiError
from foodfolio.schemas import PdfImport

FIXTURES = Path(__file__).parent / "fixtures"
# book.pdf is the app's own recipe book (util/recipeBook.js) printed by Chromium,
# the engine expo-print uses on Android. other.pdf is a plain recipe PDF.


def b64(name: str) -> str:
    return base64.b64encode((FIXTURES / name).read_bytes()).decode()


def block(data) -> str:
    raw = json.dumps(data, ensure_ascii=False).encode()
    return f"#FFREC1#\n{base64.b64encode(raw).decode()}\n#FFEND#"


def test_foodfolio_book_comes_back_exactly_without_the_model(monkeypatch):
    monkeypatch.setattr(service.llm, "extract_recipe", lambda **kw: pytest.fail("no model call"))
    recipes = service.import_pdf(PdfImport(pdf=b64("book.pdf"), categories=["קינוחים"]))
    assert [r.title for r in recipes] == [
        "שקשוקה ירוקה",
        'עוגת גזר "של סבתא" <מיוחדת>',
        "סלט עדשים 🥗",
    ]
    first = recipes[0]
    assert first.total_time == "25 דקות" and first.total_minutes == 25
    assert first.source_url == "https://www.instagram.com/reel/C1abc/"
    assert [i.name for i in first.ingredients] == ["ביצים", "תרד", "שמנת מתוקה"]
    assert first.ingredients[2].quantity == 0.5 and first.ingredients[2].optional
    assert first.steps[1] == "מוסיפים תרד ומבשלים 5 דקות."
    assert recipes[1].suggested_category == "קינוחים"
    assert recipes[0].suggested_category is None  # "ארוחות בוקר" is not a user category


def test_other_pdf_text_goes_to_the_model(monkeypatch):
    seen = {}

    def fake_extract(*, text, image_b64, categories):
        seen["text"] = text
        return model_recipe()

    monkeypatch.setattr(service.llm, "extract_recipe", fake_extract)
    recipes = service.import_pdf(PdfImport(pdf=b64("other.pdf")))
    assert len(recipes) == 1 and "Banana bread" in seen["text"]


def test_embedded_data_is_cleaned():
    text = "\n".join(
        [
            block(
                {
                    "title": "  מרק  ",
                    "servings": 500,
                    "ingredients": [
                        {"name": "גזר", "quantity": -3, "unit": "furlong", "department": "חלל"},
                        {"name": " ", "quantity": 1},
                        "junk",
                    ],
                    "steps": ["  לבשל ", ""],
                    "fridge_days": 99,
                    "source_url": "javascript:alert(1)",
                }
            ),
            block({"title": "no steps", "ingredients": [{"name": "x"}], "steps": []}),
            "#FFREC1#not-base64!#FFEND#",
            block(["not", "a", "dict"]),
        ]
    )
    [recipe] = pdf.embedded_recipes(text, [])
    assert recipe["title"] == "מרק" and recipe["servings"] == 4
    assert recipe["ingredients"] == [
        {
            "name": "גזר",
            "quantity": 1.0,
            "unit": "יחידה",
            "department": "אחר",
            "estimated": False,
            "optional": False,
        }
    ]
    assert recipe["steps"] == ["לבשל"]
    assert recipe["fridge_days"] is None and recipe["source_url"] is None


def test_wrapped_block_is_read():
    data = {"title": "t", "ingredients": [{"name": "x", "unit": 'ק"ג'}], "steps": ["s"]}
    raw = base64.b64encode(json.dumps(data).encode()).decode()
    text = f"#FFREC1#\n{raw[:10]}\n{raw[10:]}\n#FFEND#"
    [recipe] = pdf.embedded_recipes(text, [])
    assert recipe["ingredients"][0]["unit"] == 'ק"ג'


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ("not base64!!" * 20, "base64"),
        (base64.b64encode(b"hello world" * 20).decode(), "not a PDF"),
    ],
)
def test_bad_files_are_rejected(payload, message):
    with pytest.raises(ApiError) as err:
        service.import_pdf(PdfImport(pdf=payload))
    assert err.value.status == 400 and message in err.value.message


def test_route_returns_a_list(monkeypatch):
    monkeypatch.setattr(handler, "enforce_limits", lambda **kw: None)
    event = {
        "requestContext": {
            "http": {"method": "POST", "path": "/import-pdf", "sourceIp": "1.2.3.4"}
        },
        "headers": {"X-Install-Id": "abcdef123456"},
        "body": json.dumps({"pdf": b64("book.pdf")}),
    }
    res = handler.lambda_handler(event, None)
    body = json.loads(res["body"])
    assert res["statusCode"] == 200 and len(body["recipes"]) == 3
