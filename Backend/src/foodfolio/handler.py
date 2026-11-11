"""AWS Lambda entry point for the HTTP API (payload format 2.0).

POST /import      {"type": "url", "url": "...", "text"?: "<shared caption>"}
                  | {"type": "html", "url", "html", "text"?} | {"type": "text", "text"}
                  | {"type": "image", "image": "<base64>"}
                  optional "categories": [str]  (the user's category names)
              ->  200 {"recipe": {...}}
POST /substitute  {"ingredient", "quantity", "unit", "recipe_title", "other_ingredients"}
              ->  200 {"options": [{"name", "quantity", "unit", "note"}]}

Failures are 4xx/5xx {"error": {"code", "message"}}.
"""

import base64
import json
import logging
import re
import time
from typing import NamedTuple

from pydantic import TypeAdapter, ValidationError

from .errors import ApiError, bad_request
from .ratelimit import enforce_limits
from .schemas import ImportRequest, SubstituteRequest
from .service import import_recipe, source_host, substitute

logging.getLogger().setLevel(logging.INFO)
log = logging.getLogger(__name__)

MAX_BODY_BYTES = 6_000_000  # API Gateway allows 10 MB; images are resized by the app
_INSTALL_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


class Route(NamedTuple):
    parse: TypeAdapter
    run: object  # request -> result
    render: object  # result -> JSON-able body


ROUTES = {
    "/import": Route(
        TypeAdapter(ImportRequest),
        lambda request: import_recipe(request),
        lambda recipe: {"recipe": recipe.model_dump()},
    ),
    "/substitute": Route(
        TypeAdapter(SubstituteRequest),
        lambda request: substitute(request),
        lambda options: {"options": [o.model_dump() for o in options]},
    ),
}


def lambda_handler(event, context):
    started = time.monotonic()
    outcome = "ok"
    path = "?"
    request = None
    try:
        http = event.get("requestContext", {}).get("http", {})
        path = http.get("path", "").rstrip("/")
        route = ROUTES.get(path)
        if http.get("method") != "POST" or route is None:
            raise ApiError(404, "not_found", "No such route.")

        request = _parse_request(event, route.parse)
        headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
        install_id = headers.get("x-install-id", "")
        if not _INSTALL_ID.match(install_id):
            raise bad_request("Missing or invalid X-Install-Id header.")

        enforce_limits(install_id=install_id, source_ip=http.get("sourceIp", "unknown"))
        return _response(200, route.render(route.run(request)))
    except ApiError as exc:
        outcome = exc.code
        return _response(exc.status, {"error": {"code": exc.code, "message": exc.message}})
    except Exception:
        outcome = "internal_error"
        log.exception("unhandled error")  # stack trace only; never request content
        return _response(
            500, {"error": {"code": "internal_error", "message": "Something went wrong."}}
        )
    finally:
        log.info(
            "route=%s outcome=%s type=%s host=%s ms=%d",
            path,
            outcome,
            getattr(request, "type", "-"),
            source_host(request) if request else None,
            (time.monotonic() - started) * 1000,
        )


def _parse_request(event, adapter: TypeAdapter):
    body = event.get("body") or ""
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8", errors="replace")
    if len(body) > MAX_BODY_BYTES:
        raise ApiError(413, "too_large", "Request body is too large.")
    try:
        return adapter.validate_json(body)
    except ValidationError as exc:
        fields = ", ".join(".".join(str(p) for p in e["loc"]) for e in exc.errors())
        raise bad_request(f"Invalid request: {fields}") from exc


def _response(status: int, payload: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "body": json.dumps(payload, ensure_ascii=False),
    }
