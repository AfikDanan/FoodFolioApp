"""Daily usage caps, enforced before any paid model call.

Three independent counters per UTC day:
  * per install id  - stops one app instance from looping;
  * per source IP   - the real brake, because an install id is trivially forged;
  * global          - a hard ceiling on daily spend whatever an attacker does.

Each check is one atomic DynamoDB update, so there is no read-then-write race.
"""

import time
from datetime import UTC, datetime

from .config import get_settings
from .errors import rate_limited

_TTL_SECONDS = 2 * 24 * 3600


def _table():
    import boto3  # lazy: tests inject a fake instead

    return boto3.resource("dynamodb").Table(get_settings().rate_table)


def _consume(table, key: str, limit: int) -> None:
    """Add one to `key`'s counter unless it already reached `limit`."""
    from botocore.exceptions import ClientError

    try:
        table.update_item(
            Key={"pk": key},
            UpdateExpression="ADD #n :one SET #ttl = :ttl",
            ConditionExpression="attribute_not_exists(#n) OR #n < :limit",
            ExpressionAttributeNames={"#n": "n", "#ttl": "ttl"},
            ExpressionAttributeValues={
                ":one": 1,
                ":limit": limit,
                ":ttl": int(time.time()) + _TTL_SECONDS,
            },
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise rate_limited() from exc
        raise


def enforce_limits(*, install_id: str, source_ip: str, table=None) -> None:
    """Raise `rate_limited` if any daily cap is exhausted. No-op without a table (local dev)."""
    settings = get_settings()
    if not settings.rate_table and table is None:
        return
    table = table or _table()
    day = datetime.now(UTC).strftime("%Y-%m-%d")
    _consume(table, f"ip#{source_ip}#{day}", settings.limit_per_ip)
    _consume(table, f"install#{install_id}#{day}", settings.limit_per_install)
    _consume(table, f"global#{day}", settings.limit_global)
