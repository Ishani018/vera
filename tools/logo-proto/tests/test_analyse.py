import pytest

from logoproto.analyse import clean_features, drop_colour_sentences, parse_json, validate

# exactly what the model listed for the pancake photo
PANCAKE = ["Stacked pancakes", "Golden syrup", "Butter on top", "White background", "Round pancakes",
           "Golden syrup dripping", "Butter melting", "Stacked neatly"]


def test_the_background_is_never_a_feature():
    out = clean_features(PANCAKE)
    assert not any("background" in f.lower() for f in out)


def test_a_shorter_wording_of_another_feature_is_dropped():
    out = clean_features(PANCAKE)
    # "Golden syrup" and "Golden syrup dripping" become "syrup" and "syrup dripping" once the colour
    # word goes, and the shorter one is then just a wording of the longer
    assert "syrup" not in out and "syrup dripping" in out


def test_real_distinct_features_are_kept():
    out = clean_features(PANCAKE)
    for keep in ("Stacked pancakes", "Butter on top", "Butter melting", "Round pancakes", "syrup dripping"):
        assert keep in out


@pytest.mark.parametrize("bad", ["Plain backdrop", "Blurry surroundings", "Wooden table scenery", "BACKGROUND"])
def test_other_ways_of_saying_background_are_caught(bad):
    assert clean_features(["Round wheels", bad]) == ["Round wheels"]


def test_identical_features_collapse_to_one():
    assert clean_features(["Tall roof", "tall roof", "Tall door"]) == ["Tall roof", "Tall door"]


def test_a_colour_word_is_stripped_but_the_thing_it_described_is_kept():
    assert clean_features(["Red roof", "Blue door"]) == ["roof", "door"]


def test_a_feature_that_is_only_colour_or_texture_is_dropped_entirely():
    assert clean_features(["golden brown", "fluffy texture", "Round wheels"]) == ["Round wheels"]


def test_validate_counts_features_after_cleaning():
    d = {"subject": "Pancakes", "features": PANCAKE, "style_prompt": "Redraw as line art."}
    ok = validate(d)
    assert 4 <= len(ok["features"]) <= 8 and "White background" not in ok["features"]
    # three real features plus background chatter is NOT four features
    with pytest.raises(ValueError):
        validate({"subject": "x", "features": ["a b", "c d", "e f", "White background", "Plain backdrop"],
                  "style_prompt": "s"})


def test_parse_json_survives_fences():
    assert parse_json('```json\n{"subject": "a"}\n```')["subject"] == "a"


def test_the_prompt_asks_for_shape_not_colour_texture_or_background():
    from logoproto.analyse import PROMPT
    low = PROMPT.lower()
    for word in ("shape", "colours", "textures", "background"):
        assert word in low


QWEN = ["stacked pancakes", "golden brown", "butter on top", "dripping syrup", "round edges",
        "fluffy texture", "crumbly bottom", "syrup pools"]  # what the model actually replied


def test_colours_and_textures_are_not_features_a_pen_can_keep():
    out = clean_features(QWEN)
    for gone in ("golden brown", "fluffy texture", "crumbly bottom"):
        assert gone not in out
    assert "bottom" in out  # "crumbly bottom": the texture goes, the bottom stays
    for kept in ("stacked pancakes", "butter on top", "dripping syrup", "round edges"):
        assert kept in out


def test_a_style_sentence_that_asks_for_colour_is_dropped():
    s = "Redraw as a stack with round edges, golden brown color. Use clean black line art."
    out = drop_colour_sentences(s)
    assert "golden" not in out and "line art" in out


def test_validate_cleans_the_style_sentence_too():
    d = {"subject": "pancakes", "features": QWEN, "style_prompt": "Make it golden brown. Use clean line art."}
    assert "golden" not in validate(d)["style_prompt"]


def test_a_reply_that_is_all_colour_is_rejected_not_passed_through():
    with pytest.raises(ValueError):
        validate({"subject": "x", "features": ["red", "blue", "golden", "soft", "shiny"], "style_prompt": "s"})
