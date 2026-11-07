import base64

import pytest

from foodfolio import service
from foodfolio.errors import ApiError
from foodfolio.schemas import (
    HtmlImport,
    ImageImport,
    ModelIngredient,
    ModelRecipe,
    TextImport,
    UrlImport,
)


def ingredient(**kw):
    base = dict(
        name="קמח",
        quantity=2.0,
        unit="כוס",
        department="יבשים ואפייה",
        estimated=False,
        optional=False,
    )
    return ModelIngredient(**{**base, **kw})


def model_recipe(**kw):
    base = dict(
        is_recipe=True,
        title="עוגה",
        servings=8,
        total_minutes=60,
        ingredients=[ingredient()],
        steps=["לערבב", "לאפות"],
        tags=["קינוח"],
        fridge_days=3,
        suggested_category="קינוחים",
    )
    return ModelRecipe(**{**base, **kw})


def test_clean_recipe_happy_path():
    recipe = service.clean_recipe(model_recipe(), ["קינוחים", "סלטים"])
    assert recipe.title == "עוגה"
    assert recipe.suggested_category == "קינוחים"
    assert recipe.total_minutes == 60


@pytest.mark.parametrize(
    "overrides",
    [
        dict(is_recipe=False),
        dict(title="  "),
        dict(ingredients=[]),
        dict(ingredients=[ingredient(name=" ")]),
        dict(steps=[" "]),
    ],
)
def test_clean_recipe_rejects_non_recipes(overrides):
    with pytest.raises(ApiError) as err:
        service.clean_recipe(model_recipe(**overrides), [])
    assert err.value.code == "not_a_recipe"


def test_clean_recipe_enforces_bounds():
    raw = model_recipe(
        servings=500,
        total_minutes=999_999,
        fridge_days=400,
        suggested_category="not in the list",
        tags=["א", "א", "ב", "ג", "ד", "ה", "ו"],
        ingredients=[ingredient(quantity=0), ingredient(name="ח" * 300, quantity=1.23456)],
    )
    recipe = service.clean_recipe(raw, ["קינוחים"])
    assert recipe.servings == 100
    assert recipe.total_minutes is None
    assert recipe.fridge_days is None
    assert recipe.suggested_category is None
    assert recipe.tags == ["א", "ב", "ג", "ד", "ה"]
    assert recipe.ingredients[0].quantity == 1.0 and recipe.ingredients[0].estimated
    assert len(recipe.ingredients[1].name) == 80 and recipe.ingredients[1].quantity == 1.23


def test_url_import_sends_compact_text_to_model(monkeypatch):
    seen = {}
    monkeypatch.setattr(service, "fetch_html", lambda url, **kw: "<h1>עוגה</h1><p>קמח</p>")

    def fake_extract(*, text, image_b64, categories):
        seen.update(text=text, image=image_b64, categories=categories)
        return model_recipe()

    monkeypatch.setattr(service.llm, "extract_recipe", fake_extract)
    service.import_recipe(
        UrlImport(type="url", url="https://example.com/r", categories=["קינוחים"])
    )
    assert "קמח" in seen["text"] and seen["image"] is None and seen["categories"] == ["קינוחים"]


def test_empty_page_is_not_a_recipe(monkeypatch):
    monkeypatch.setattr(service, "fetch_html", lambda url, **kw: "<script>x</script>")
    with pytest.raises(ApiError) as err:
        service.import_recipe(UrlImport(type="url", url="https://example.com/r"))
    assert err.value.code == "not_a_recipe"


def test_image_must_be_valid_and_small(monkeypatch):
    good = base64.b64encode(b"\xff\xd8" + b"0" * 200).decode()
    assert service._checked_image(ImageImport(type="image", image=good)) == good
    with pytest.raises(ApiError):
        service._checked_image(ImageImport(type="image", image="!" * 200))
    big = base64.b64encode(b"0" * 5_000_000).decode()
    with pytest.raises(ApiError):
        service._checked_image(ImageImport(type="image", image=big))


def test_source_host_never_leaks_the_query():
    req = UrlImport(type="url", url="https://example.com/r?token=secret")
    assert service.source_host(req) == "example.com"


def _subs(*options):
    from foodfolio.schemas import ModelSubstitute, ModelSubstitutes

    return ModelSubstitutes(
        options=[ModelSubstitute(name=n, quantity=q, unit="כף", note=" הערה ") for n, q in options]
    )


def test_substitute_cleans_dedupes_and_limits(monkeypatch):
    from foodfolio.schemas import SubstituteRequest

    raw = _subs(
        ("ביצים", 1),
        ("רסק תפוחים", 0.256),
        ("רסק תפוחים", 2),
        ("פשתן", 0),
        ("טחינה", 1),
        ("אבוקדו", 1),
        ("יוגורט", 1),
    )
    monkeypatch.setattr(service.llm, "suggest_substitutes", lambda request: raw)
    out = service.substitute(SubstituteRequest(ingredient="ביצים", quantity=2, unit="יחידה"))
    assert [o.name for o in out] == ["רסק תפוחים", "טחינה", "אבוקדו"]
    assert out[0].quantity == 0.26 and out[0].note == "הערה"


def test_clean_recipe_strips_step_numbers_and_hashtags():
    raw = model_recipe(
        steps=["1. לערבב", "2) לאפות", "- להגיש", "  "], tags=["#מהיר", " צמחוני ", "#"]
    )
    recipe = service.clean_recipe(raw, [])
    assert recipe.steps == ["לערבב", "לאפות", "להגיש"]
    assert recipe.tags == ["מהיר", "צמחוני"]


def test_same_ingredient_in_several_groups_becomes_one_line():
    raw = model_recipe(
        ingredients=[
            ingredient(name="קמח", quantity=2.0),
            ingredient(name="שום", quantity=2.0, unit="שן"),
            ingredient(name="קמח", quantity=0.5),
            ingredient(name="קמח", quantity=1.0, unit="גרם"),
            ingredient(name="פטרוזיליה", optional=True),
        ]
    )
    recipe = service.clean_recipe(raw, [])
    flour = [i for i in recipe.ingredients if i.name == "קמח"]
    assert [(i.quantity, i.unit) for i in flour] == [(2.5, "כוס"), (1.0, "גרם")]
    assert recipe.ingredients[1].unit == "שן"
    assert recipe.ingredients[-1].optional is True


def test_metric_units_come_back_as_the_abbreviations_the_app_stores():
    raw = model_recipe(
        ingredients=[
            ingredient(name="חלב", unit="מיליליטר"),
            ingredient(name="בשר", unit="קילוגרם"),
            ingredient(name="מלח", unit="מיליגרם"),
        ]
    )
    recipe = service.clean_recipe(raw, [])
    assert [i.unit for i in recipe.ingredients] == ['מ"ל', 'ק"ג', 'מ"ג']


def test_page_sent_by_the_phone_is_read_without_fetching(monkeypatch):
    def never(*a, **kw):
        raise AssertionError("the server must not fetch when the phone sent the page")

    seen = {}

    def fake_extract(*, text, image_b64, categories):
        seen["text"] = text
        return model_recipe()

    monkeypatch.setattr(service, "fetch_html", never)
    monkeypatch.setattr(service.llm, "extract_recipe", fake_extract)
    html = "<html><body><h1>עוגת שוקולד</h1><p>" + "קמח וסוכר " * 20 + "</p></body></html>"
    service.import_recipe(HtmlImport(type="html", url="https://example.com/r", html=html))
    assert "עוגת שוקולד" in seen["text"]


def test_pasted_text_goes_straight_to_the_model(monkeypatch):
    seen = {}

    def fake_extract(*, text, image_b64, categories):
        seen.update(text=text, image=image_b64)
        return model_recipe()

    monkeypatch.setattr(service.llm, "extract_recipe", fake_extract)
    service.import_recipe(TextImport(type="text", text="מרכיבים: 2 כוסות קמח. מערבבים ואופים."))
    assert seen["text"].startswith("מרכיבים") and seen["image"] is None
