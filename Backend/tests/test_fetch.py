import socket

import pytest

from foodfolio import fetch
from foodfolio.errors import ApiError


def resolves_to(monkeypatch, *ips):
    monkeypatch.setattr(
        fetch.socket,
        "getaddrinfo",
        lambda host, port: [(socket.AF_INET, 0, 0, "", (ip, port)) for ip in ips],
    )


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.com/x",
        "http://user:pw@example.com/",
        "https://example.com:8443/",
        "http:///nohost",
    ],
)
def test_rejects_unsafe_urls(url, monkeypatch):
    resolves_to(monkeypatch, "93.184.216.34")
    with pytest.raises(ApiError) as err:
        fetch.check_public_url(url)
    assert err.value.status == 400


@pytest.mark.parametrize(
    "ip",
    ["127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "::1", "172.16.0.9", "100.64.0.1"],
)
def test_rejects_non_public_addresses(ip, monkeypatch):
    resolves_to(monkeypatch, ip)
    with pytest.raises(ApiError):
        fetch.check_public_url("https://evil.example/")


def test_rejects_when_any_address_is_private(monkeypatch):
    resolves_to(monkeypatch, "93.184.216.34", "10.0.0.1")  # DNS rebinding style mix
    with pytest.raises(ApiError):
        fetch.check_public_url("https://evil.example/")


def test_accepts_public_address(monkeypatch):
    resolves_to(monkeypatch, "93.184.216.34")
    fetch.check_public_url("https://example.com/recipe")


def test_unresolvable_host_is_a_fetch_error(monkeypatch):
    def boom(host, port):
        raise socket.gaierror

    monkeypatch.setattr(fetch.socket, "getaddrinfo", boom)
    with pytest.raises(ApiError) as err:
        fetch.check_public_url("https://nope.invalid/")
    assert err.value.code == "fetch_failed"


class FakeResponse:
    def __init__(self, status=200, headers=None, body=b"<html>ok</html>"):
        self.status_code = status
        self.headers = headers or {"Content-Type": "text/html; charset=utf-8"}
        self.encoding = "utf-8"
        self._body = body

    @property
    def is_redirect(self):
        return self.status_code in (301, 302) and "Location" in self.headers

    def iter_content(self, chunk_size):
        yield self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def fake_session(monkeypatch, responses):
    calls = []

    class Session:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url, **kwargs):
            calls.append((url, kwargs))
            return responses.pop(0)

    monkeypatch.setattr(fetch.requests, "Session", Session)
    return calls


def test_follows_redirect_and_revalidates_each_hop(monkeypatch):
    resolves_to(monkeypatch, "93.184.216.34")
    calls = fake_session(
        monkeypatch, [FakeResponse(302, {"Location": "/final"}), FakeResponse(body="שלום".encode())]
    )
    assert fetch.fetch_html("https://example.com/a", timeout=5, max_bytes=1000) == "שלום"
    assert [c[0] for c in calls] == ["https://example.com/a", "https://example.com/final"]
    assert all(c[1]["allow_redirects"] is False for c in calls)


def test_redirect_to_private_address_is_blocked(monkeypatch):
    answers = iter([["93.184.216.34"], ["127.0.0.1"]])
    monkeypatch.setattr(
        fetch.socket,
        "getaddrinfo",
        lambda h, p: [(socket.AF_INET, 0, 0, "", (next(answers)[0], p))],
    )
    fake_session(monkeypatch, [FakeResponse(302, {"Location": "http://localhost/admin"})])
    with pytest.raises(ApiError) as err:
        fetch.fetch_html("https://example.com/a", timeout=5, max_bytes=1000)
    assert err.value.status == 400


def test_rejects_non_html_and_oversize(monkeypatch):
    resolves_to(monkeypatch, "93.184.216.34")
    fake_session(monkeypatch, [FakeResponse(headers={"Content-Type": "application/pdf"})])
    with pytest.raises(ApiError):
        fetch.fetch_html("https://example.com/a", timeout=5, max_bytes=1000)
    fake_session(monkeypatch, [FakeResponse(body=b"x" * 2000)])
    with pytest.raises(ApiError) as err:
        fetch.fetch_html("https://example.com/a", timeout=5, max_bytes=1000)
    assert err.value.code == "fetch_failed"


def test_http_error_status(monkeypatch):
    resolves_to(monkeypatch, "93.184.216.34")
    fake_session(monkeypatch, [FakeResponse(status=404)])
    with pytest.raises(ApiError) as err:
        fetch.fetch_html("https://example.com/a", timeout=5, max_bytes=1000)
    assert err.value.code == "fetch_failed"
