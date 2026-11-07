"""The single place that talks to the language model."""

import logging
from functools import lru_cache

from openai import APIError, OpenAI
from pydantic import BaseModel

from .config import get_api_key, get_settings
from .errors import upstream_error
from .prompts import (
    SUBSTITUTE_PROMPT,
    SYSTEM_PROMPT,
    build_substitute_text,
    build_user_text,
)
from .schemas import ModelRecipe, ModelSubstitutes, SubstituteRequest

log = logging.getLogger(__name__)

MAX_OUTPUT_TOKENS = 4000  # a long recipe is ~1.5k; this caps runaway cost
SUBSTITUTE_MAX_OUTPUT_TOKENS = 800


@lru_cache(maxsize=1)
def _client() -> OpenAI:
    settings = get_settings()
    # One retry keeps worst-case latency inside API Gateway's 30 s limit.
    return OpenAI(
        api_key=get_api_key(),
        base_url=settings.llm_base_url,
        timeout=18.0,
        max_retries=1,
    )


def _parse(*, instructions: str, content: list, schema: type[BaseModel], max_tokens: int):
    """One structured-output call; any provider failure becomes an `upstream_error`."""
    settings = get_settings()
    options = {}
    if settings.llm_service_tier:
        options["service_tier"] = settings.llm_service_tier
    try:
        response = _client().responses.parse(
            model=settings.llm_model,
            instructions=instructions,
            input=[{"role": "user", "content": content}],
            text_format=schema,
            reasoning={"effort": settings.llm_reasoning_effort},
            max_output_tokens=max_tokens,
            store=False,  # do not retain user content at the provider
            **options,
        )
    except APIError as exc:
        log.warning("model call failed: %s %s", type(exc).__name__, getattr(exc, "message", ""))
        raise upstream_error() from exc

    usage = response.usage
    if usage:
        log.info("tokens in=%s out=%s", usage.input_tokens, usage.output_tokens)
    if response.output_parsed is None:  # refusal or truncated output
        raise upstream_error()
    return response.output_parsed


def extract_recipe(
    *, text: str | None, image_b64: str | None, categories: list[str]
) -> ModelRecipe:
    """Ask the model for a structured recipe from page text or a photo."""
    content = [{"type": "input_text", "text": build_user_text(content=text, categories=categories)}]
    if image_b64:
        content.append(
            {
                "type": "input_image",
                "image_url": f"data:image/jpeg;base64,{image_b64}",
                "detail": "high",
            }
        )
    return _parse(
        instructions=SYSTEM_PROMPT,
        content=content,
        schema=ModelRecipe,
        max_tokens=MAX_OUTPUT_TOKENS,
    )


def suggest_substitutes(request: SubstituteRequest) -> ModelSubstitutes:
    """Up to three substitutes for one ingredient, sized for this recipe."""
    return _parse(
        instructions=SUBSTITUTE_PROMPT,
        content=[{"type": "input_text", "text": build_substitute_text(request)}],
        schema=ModelSubstitutes,
        max_tokens=SUBSTITUTE_MAX_OUTPUT_TOKENS,
    )
