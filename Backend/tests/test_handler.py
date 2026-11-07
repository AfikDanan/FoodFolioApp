import json

import pytest

from foodfolio import handler
from foodfolio.errors import ApiError, rate_limited
from foodfolio.schemas import Ingredient, Recipe

RECIPE = Recipe(
    title="עוגה",
    servings=4,
    total_minutes=30,
    ingredients=[Ingredient(name="קמח", quantity=1.0, unit="כוס", department="אחר")],
    steps=["לאפות"],
    tags=[],
    fridge_days=None,
    suggested_category=None,
)


def event(body, *, method="POST", path="/import", install="abcdef123456", ip="1.2.3.4"):
    return {
        "requestContext": {"http": {"method": method, "path": path, "sourceIp": ip}},
        "headers": {"X-Install-Id": install} if install else {},
        "body": body if isinstance(body, str) else json.dumps(body),
    }


@pytest.fixture(autouse=True)
def stubs(monkeypatch):
    calls = []
    monkeypatch.setattr(handler, "enforce_limits", lambda **kw: calls.append(kw))
    monkeypatch.setattr(handler, "import_recipe", lambda request: RECIPE)
    return calls


def call(ev):
    res = handler.lambda_handler(ev, None)
    return res["statusCode"], json.loads(res["body"])


def test_success_returns_recipe(stubs):
    status, body = call(event({"type": "url", "url": "https://example.com/r"}))
    assert status == 200 and body["recipe"]["title"] == "עוגה"
    assert stubs == [{"install_id": "abcdef123456", "source_ip": "1.2.3.4"}]


def test_hebrew_is_not_escaped():
    res = handler.lambda_handler(event({"type": "url", "url": "https://example.com/r"}), None)
    assert "עוגה" in res["body"]


@pytest.mark.parametrize(
    "ev",
    [
        event("not json"),
        event({"type": "carrier-pigeon"}),
        event({"type": "url"}),
        event({"type": "url", "url": "https://example.com/r"}, install=None),
        event({"type": "url", "url": "https://example.com/r"}, install="short"),
    ],
)
def test_bad_requests_are_400(ev):
    status, body = call(ev)
    assert status == 400 and body["error"]["code"] == "bad_request"


def test_unknown_route_is_404():
    assert call(event({}, path="/other"))[0] == 404
    assert call(event({}, method="GET"))[0] == 404


def test_rate_limit_is_checked_before_the_model(monkeypatch):
    def deny(**kw):
        raise rate_limited()

    monkeypatch.setattr(handler, "enforce_limits", deny)
    monkeypatch.setattr(handler, "import_recipe", lambda r: pytest.fail("model must not be called"))
    status, body = call(event({"type": "url", "url": "https://example.com/r"}))
    assert status == 429 and body["error"]["code"] == "rate_limited"


def test_api_errors_map_to_their_status(monkeypatch):
    def fail(request):
        raise ApiError(422, "not_a_recipe", "nope")

    monkeypatch.setattr(handler, "import_recipe", fail)
    assert call(event({"type": "url", "url": "https://example.com/r"}))[0] == 422


def test_unexpected_errors_do_not_leak_details(monkeypatch):
    def boom(request):
        raise RuntimeError("secret internals")

    monkeypatch.setattr(handler, "import_recipe", boom)
    status, body = call(event({"type": "url", "url": "https://example.com/r"}))
    assert status == 500 and "secret" not in json.dumps(body)


def test_oversized_body_is_rejected(monkeypatch):
    monkeypatch.setattr(handler, "MAX_BODY_BYTES", 50)
    assert call(event({"type": "url", "url": "https://example.com/" + "a" * 100}))[0] == 413


def test_substitute_route(monkeypatch):
    from foodfolio.schemas import Substitute

    opts = [Substitute(name="טחינה", quantity=2.0, unit="כף", note="עם מים")]
    monkeypatch.setattr(handler, "substitute", lambda request: opts)
    status, body = call(
        event(
            {"ingredient": "שמן", "quantity": 3, "unit": "כף", "recipe_title": "עוגה"},
            path="/substitute",
        )
    )
    assert status == 200
    assert body == {"options": [{"name": "טחינה", "quantity": 2.0, "unit": "כף", "note": "עם מים"}]}


@pytest.mark.parametrize(
    "payload",
    [
        {"ingredient": "שמן", "quantity": 0, "unit": "כף"},
        {"ingredient": "", "quantity": 1, "unit": "כף"},
        {"quantity": 1, "unit": "כף"},
    ],
)
def test_substitute_validates_input(payload):
    status, body = call(event(payload, path="/substitute"))
    assert status == 400 and body["error"]["code"] == "bad_request"
