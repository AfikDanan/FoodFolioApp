import json

from foodfolio.extract import find_jsonld_recipe, page_to_model_input, visible_text

RECIPE = {
    "@type": "Recipe",
    "name": "שקשוקה",
    "recipeIngredient": ["4 ביצים", "2 עגבניות"],
    "recipeInstructions": [{"@type": "HowToStep", "text": "מבשלים"}],
    "aggregateRating": {"ratingValue": 5},
}


def page(*blocks, body="<p>hi</p>"):
    scripts = "".join(f'<script type="application/ld+json">{b}</script>' for b in blocks)
    return f"<html><head>{scripts}</head><body>{body}</body></html>"


def test_finds_recipe_inside_graph():
    html = page(json.dumps({"@graph": [{"@type": "WebSite"}, RECIPE]}))
    assert find_jsonld_recipe(html)["name"] == "שקשוקה"


def test_finds_recipe_with_list_type_and_skips_bad_json():
    html = page("{not json", json.dumps({**RECIPE, "@type": ["Recipe", "Thing"]}))
    assert find_jsonld_recipe(html) is not None


def test_structured_data_is_slimmed():
    out = page_to_model_input(page(json.dumps(RECIPE)), 10_000)
    assert "aggregateRating" not in out
    assert "שקשוקה" in out


def test_falls_back_to_visible_text_without_ingredients():
    html = page(json.dumps({"@type": "Recipe", "name": "x"}), body="<h1>עוגה</h1><p>קמח וסוכר</p>")
    out = page_to_model_input(html, 10_000)
    assert "קמח וסוכר" in out


def test_visible_text_drops_scripts_navigation_and_collapses_space():
    html = (
        "<nav>menu</nav><script>alert(1)</script><style>p{}</style>"
        "<h1>כותרת</h1><p>שורה   אחת</p><footer>ft</footer>"
    )
    assert visible_text(html, 1000) == "כותרת\nשורה אחת"


def test_text_is_truncated():
    assert len(visible_text("<p>" + "א" * 500 + "</p>", 100)) == 100


TIKTOK = (
    '<html><head><meta property="og:description" content="Pasta &amp; cheese"></head><body>'
    '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">'
    + json.dumps(
        {
            "__DEFAULT_SCOPE__": {
                "x": {"itemInfo": {"itemStruct": {"desc": "פסטה: 200 גרם פסטה #מתכון"}}}
            }
        },
        ensure_ascii=False,
    )
    + "</script></body></html>"
)


def test_caption_is_read_from_meta_and_embedded_state():
    from foodfolio.extract import page_caption

    out = page_caption(TIKTOK)
    assert "Pasta & cheese" in out
    assert "200 גרם פסטה" in out


def test_caption_is_part_of_model_input_for_script_only_pages():
    assert "200 גרם פסטה" in page_to_model_input(TIKTOK, 10_000)


def test_page_without_caption_gives_empty_caption():
    from foodfolio.extract import page_caption

    assert page_caption("<html><title>Instagram</title><body></body></html>") == ""
