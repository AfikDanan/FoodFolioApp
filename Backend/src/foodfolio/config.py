"""Runtime settings, read once from environment variables."""

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    # Model / provider. `llm_base_url` lets the same OpenAI-compatible client
    # talk to OpenAI directly or to another endpoint (e.g. Bedrock's).
    llm_model: str
    llm_base_url: str | None
    llm_reasoning_effort: str
    llm_service_tier: str | None
    llm_api_key_param: str | None  # SSM parameter holding the API key
    llm_api_key: str | None  # local development only

    # Abuse and cost guards (all per UTC day).
    rate_table: str | None
    limit_per_install: int
    limit_per_ip: int
    limit_global: int

    # Input limits.
    max_image_bytes: int
    max_page_chars: int
    fetch_timeout_s: float
    fetch_max_bytes: int


def _int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        llm_model=os.environ.get("LLM_MODEL", "gpt-6-luna"),
        llm_base_url=os.environ.get("LLM_BASE_URL") or None,
        llm_reasoning_effort=os.environ.get("LLM_REASONING_EFFORT", "low"),
        llm_service_tier=os.environ.get("LLM_SERVICE_TIER") or None,
        llm_api_key_param=os.environ.get("LLM_API_KEY_PARAM") or None,
        llm_api_key=os.environ.get("LLM_API_KEY") or None,
        rate_table=os.environ.get("RATE_TABLE") or None,
        limit_per_install=_int("LIMIT_PER_INSTALL", 15),
        limit_per_ip=_int("LIMIT_PER_IP", 40),
        limit_global=_int("LIMIT_GLOBAL", 1500),
        max_image_bytes=_int("MAX_IMAGE_BYTES", 4_000_000),
        max_page_chars=_int("MAX_PAGE_CHARS", 30_000),
        fetch_timeout_s=float(os.environ.get("FETCH_TIMEOUT_S", 8)),
        fetch_max_bytes=_int("FETCH_MAX_BYTES", 3_000_000),
    )


@lru_cache(maxsize=1)
def get_api_key() -> str:
    """API key from the environment (dev) or SSM Parameter Store (deployed)."""
    settings = get_settings()
    if settings.llm_api_key:
        return settings.llm_api_key
    if not settings.llm_api_key_param:
        raise RuntimeError("Set LLM_API_KEY or LLM_API_KEY_PARAM")
    import boto3  # imported lazily: only needed (and always present) on Lambda

    ssm = boto3.client("ssm")
    return ssm.get_parameter(Name=settings.llm_api_key_param, WithDecryption=True)["Parameter"][
        "Value"
    ]
