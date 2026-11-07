from foodfolio.prompts import SUBSTITUTE_PROMPT, SYSTEM_PROMPT
from foodfolio.schemas import DEPARTMENTS, UNITS


def test_extraction_prompt_lists_every_unit_and_department_the_app_knows():
    for value in (*UNITS, *DEPARTMENTS):
        assert value in SYSTEM_PROMPT


def test_extraction_prompt_guards_against_injection_and_handles_non_hebrew_sources():
    assert "untrusted" in SYSTEM_PROMPT
    assert "translate" in SYSTEM_PROMPT


def test_substitute_prompt_keeps_dishes_kosher_and_lists_units():
    assert "kosher" in SUBSTITUTE_PROMPT
    assert all(unit in SUBSTITUTE_PROMPT for unit in UNITS)


def test_dry_goods_and_oils_have_their_own_aisles_in_the_prompt():
    assert "יבשים ואפייה" in SYSTEM_PROMPT and "שמנים ורטבים" in SYSTEM_PROMPT
    flour_rule = next(part for part in SYSTEM_PROMPT.split(";") if "flour" in part)
    assert "יבשים ואפייה" in flour_rule


def test_names_stay_clean_for_shopping_list_merging():
    assert "never put quantities" in SYSTEM_PROMPT.lower()
