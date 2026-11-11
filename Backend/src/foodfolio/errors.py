"""Errors that map 1:1 to an HTTP response."""


class ApiError(Exception):
    """An expected failure the client should see (4xx, or a known 5xx)."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def bad_request(message: str) -> ApiError:
    return ApiError(400, "bad_request", message)


def not_a_recipe() -> ApiError:
    return ApiError(422, "not_a_recipe", "No recipe could be found in the input.")


def caption_needed() -> ApiError:
    """A social post whose caption we could not read: the person can paste it."""
    return ApiError(422, "caption_needed", "The post could not be read; paste its caption.")


def fetch_failed(message: str) -> ApiError:
    return ApiError(502, "fetch_failed", message)


def rate_limited() -> ApiError:
    return ApiError(429, "rate_limited", "Daily import limit reached.")


def upstream_error() -> ApiError:
    return ApiError(502, "upstream_error", "The recipe model is unavailable, try again.")
