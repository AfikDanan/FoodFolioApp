import pytest
from test_service import model_recipe

from foodfolio import service, social
from foodfolio.errors import ApiError, fetch_failed
from foodfolio.extract import meta_text, page_to_model_input
from foodfolio.schemas import HtmlImport, UrlImport

EMBED = """
<html><body>
<div class="Embed">
  <div class="Caption">
    <a class="CaptionUsername" href="#">chef.dana</a>
    עוגת גזר<br>2 כוסות קמח<br>3 גזרים<br>מערבבים ואופים 40 דקות
    <div class="CaptionComments"><div>תגובה: נראה מעולה</div></div>
  </div>
  <div class="Footer">View more on Instagram</div>
</div>
</body></html>
"""


@pytest.mark.parametrize(
    ("url", "kind"),
    [
        ("https://www.instagram.com/reel/C1abc_-9/?igsh=xyz", "instagram"),
        ("https://instagram.com/p/C1abc/", "instagram"),
        ("https://vm.tiktok.com/ZMabc/", "tiktok"),
        ("https://www.tiktok.com/@chef/video/123", "tiktok"),
        ("https://www.example.com/instagram.com/p/x", None),
        ("https://notinstagram.com/p/x", None),
    ],
)
def test_platform(url, kind):
    assert social.platform(url) == kind


@pytest.mark.parametrize(
    "url",
    [
        "https://www.instagram.com/reel/C1abc_-9/?igsh=xyz",
        "https://www.instagram.com/reels/C1abc_-9/",
        "https://www.instagram.com/chef.dana/p/C1abc_-9/",
        "https://www.instagram.com/p/C1abc_-9",
    ],
)
def test_instagram_embed_url(url):
    assert (
        social.instagram_embed_url(url) == "https://www.instagram.com/p/C1abc_-9/embed/captioned/"
    )


def test_instagram_profile_link_has_no_embed():
    assert social.instagram_embed_url("https://www.instagram.com/chef.dana/") is None


def test_caption_from_embed_keeps_lines_and_drops_comments():
    caption = social.caption_from_embed(EMBED)
    assert "2 כוסות קמח\n3 גזרים" in caption
    assert "תגובה" not in caption and "View more" not in caption


def test_instagram_caption_uses_the_embed_page(monkeypatch):
    seen = []
    monkeypatch.setattr(social, "fetch_html", lambda url, **kw: seen.append(url) or EMBED)
    caption = social.fetch_caption("https://www.instagram.com/reel/C1abc/?igsh=1")
    assert seen == ["https://www.instagram.com/p/C1abc/embed/captioned/"]
    assert "3 גזרים" in caption


def test_tiktok_short_link_is_resolved_then_read_through_oembed(monkeypatch):
    seen = []
    monkeypatch.setattr(
        social, "resolve_url", lambda url, **kw: "https://www.tiktok.com/@chef/video/42?is_from=x"
    )
    monkeypatch.setattr(
        social, "fetch_json", lambda url, **kw: seen.append(url) or {"title": "פסטה ברוטב עגבניות"}
    )
    assert social.fetch_caption("https://vm.tiktok.com/ZMabc/") == "פסטה ברוטב עגבניות"
    assert seen == [
        "https://www.tiktok.com/oembed?url=https%3A%2F%2Fwww.tiktok.com%2F%40chef%2Fvideo%2F42"
    ]


def test_caption_lookup_failure_is_empty_not_an_error(monkeypatch):
    def boom(url, **kw):
        raise fetch_failed("blocked")

    monkeypatch.setattr(social, "fetch_json", boom)
    assert social.fetch_caption("https://www.tiktok.com/@chef/video/42") == ""


def test_meta_text_reads_preview_tags_once():
    html = (
        '<head><meta property="og:title" content="Dana on Instagram">'
        '<meta property="og:description" content="עוגת גזר: 2 כוסות קמח">'
        '<meta name="description" content="עוגת גזר: 2 כוסות קמח"></head><body></body>'
    )
    assert meta_text(html) == "Dana on Instagram\nעוגת גזר: 2 כוסות קמח"


def test_page_text_includes_preview_tags():
    html = '<head><meta name="description" content="תיאור"></head><body><p>גוף</p></body>'
    assert page_to_model_input(html, 1000) == "תיאור\n\nגוף"


@pytest.fixture
def model(monkeypatch):
    seen = {}

    def fake_extract(*, text, image_b64, categories):
        seen["text"] = text
        return model_recipe()

    monkeypatch.setattr(service.llm, "extract_recipe", fake_extract)
    return seen


def never(*a, **kw):
    raise AssertionError("must not be called")


def test_social_link_uses_shared_text_and_caption_without_fetching_the_page(monkeypatch, model):
    monkeypatch.setattr(service, "fetch_caption", lambda url: "קפטן: 2 כוסות קמח")
    monkeypatch.setattr(service, "fetch_html", never)
    url = "https://www.instagram.com/reel/C1abc/"
    service.import_recipe(UrlImport(type="url", url=url, text=f"עוגה טעימה {url}"))
    assert model["text"] == "Shared text:\nעוגה טעימה\n\nPost caption:\nקפטן: 2 כוסות קמח"


def test_social_link_with_nothing_readable_asks_for_the_caption(monkeypatch, model):
    monkeypatch.setattr(service, "fetch_caption", lambda url: "")
    monkeypatch.setattr(service, "fetch_html", lambda url, **kw: "<html><body></body></html>")
    with pytest.raises(ApiError) as err:
        service.import_recipe(UrlImport(type="url", url="https://www.tiktok.com/@a/video/1"))
    assert err.value.code == "caption_needed"


def test_social_link_falls_back_to_page_preview(monkeypatch, model):
    monkeypatch.setattr(service, "fetch_caption", lambda url: "")
    monkeypatch.setattr(
        service,
        "fetch_html",
        lambda url, **kw: '<meta property="og:description" content="מתכון: קמח"><p>Log in</p>',
    )
    service.import_recipe(UrlImport(type="url", url="https://www.instagram.com/p/C1abc/"))
    assert model["text"] == "מתכון: קמח"


def test_blocked_site_still_imports_from_shared_text(monkeypatch, model):
    def blocked(url, **kw):
        raise fetch_failed("403")

    monkeypatch.setattr(service, "fetch_html", blocked)
    service.import_recipe(
        UrlImport(type="url", url="https://blog.example/r", text="עוגה: 2 כוסות קמח ואופים")
    )
    assert "2 כוסות קמח" in model["text"]


def test_blocked_site_without_text_lets_the_phone_fetch(monkeypatch, model):
    def blocked(url, **kw):
        raise fetch_failed("403")

    monkeypatch.setattr(service, "fetch_html", blocked)
    with pytest.raises(ApiError) as err:
        service.import_recipe(UrlImport(type="url", url="https://blog.example/r"))
    assert err.value.code == "fetch_failed"


def test_phone_page_is_combined_with_shared_text(monkeypatch, model):
    monkeypatch.setattr(service, "fetch_caption", never)
    html = "<html><body><h1>עוגה</h1>" + "<p>מילוי</p>" * 20 + "</body></html>"
    service.import_recipe(
        HtmlImport(type="html", url="https://www.instagram.com/p/x/", html=html, text="קפשן")
    )
    assert model["text"].startswith("Shared text:\nקפשן\n\nPage:\nעוגה")
