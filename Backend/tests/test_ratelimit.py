import pytest
from botocore.exceptions import ClientError

from foodfolio import ratelimit
from foodfolio.errors import ApiError


class FakeTable:
    """Mimics the conditional ADD used by `_consume`."""

    def __init__(self):
        self.counts = {}

    def update_item(self, Key, ExpressionAttributeValues, **kwargs):
        key = Key["pk"]
        limit = ExpressionAttributeValues[":limit"]
        if self.counts.get(key, 0) >= limit:
            raise ClientError({"Error": {"Code": "ConditionalCheckFailedException"}}, "UpdateItem")
        self.counts[key] = self.counts.get(key, 0) + 1


@pytest.fixture(autouse=True)
def small_limits(monkeypatch):
    monkeypatch.setenv("LIMIT_PER_INSTALL", "2")
    monkeypatch.setenv("LIMIT_PER_IP", "3")
    monkeypatch.setenv("LIMIT_GLOBAL", "100")
    ratelimit.get_settings.cache_clear()
    yield
    ratelimit.get_settings.cache_clear()


def test_install_limit_blocks_third_call():
    table = FakeTable()
    for _ in range(2):
        ratelimit.enforce_limits(install_id="a" * 10, source_ip="1.1.1.1", table=table)
    with pytest.raises(ApiError) as err:
        ratelimit.enforce_limits(install_id="a" * 10, source_ip="1.1.1.1", table=table)
    assert err.value.status == 429


def test_rotating_install_ids_does_not_escape_the_ip_limit():
    table = FakeTable()
    for i in range(3):
        ratelimit.enforce_limits(install_id=f"install-{i:04d}", source_ip="9.9.9.9", table=table)
    with pytest.raises(ApiError):
        ratelimit.enforce_limits(install_id="install-9999", source_ip="9.9.9.9", table=table)


def test_global_ceiling(monkeypatch):
    monkeypatch.setenv("LIMIT_GLOBAL", "2")
    ratelimit.get_settings.cache_clear()
    table = FakeTable()
    ratelimit.enforce_limits(install_id="install-0001", source_ip="1.1.1.1", table=table)
    ratelimit.enforce_limits(install_id="install-0002", source_ip="2.2.2.2", table=table)
    with pytest.raises(ApiError):
        ratelimit.enforce_limits(install_id="install-0003", source_ip="3.3.3.3", table=table)


def test_no_table_means_no_limit_for_local_dev(monkeypatch):
    monkeypatch.delenv("RATE_TABLE", raising=False)
    ratelimit.get_settings.cache_clear()
    ratelimit.enforce_limits(install_id="install-0001", source_ip="1.1.1.1")
