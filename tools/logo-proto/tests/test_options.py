import dataclasses

from logoproto.redraw import BUSY, build_prompt
from logoproto.styles import STYLES, compact, stroke_params

ANALYSIS = {"subject": "burger", "features": ["sesame seeds", "ruffled lettuce", "tall bun"], "style_prompt": "Redraw as line art."}


def test_the_busy_option_asks_for_few_shapes_and_names_no_textures():
    p = build_prompt(STYLES["minimal"], ANALYSIS, busy=True)
    assert BUSY in p and "about 10 interior lines at most" in p
    assert "sesame" not in p and "lettuce" not in p       # the feature list names the textures the model then draws


def test_without_the_busy_option_the_prompt_is_what_it_was():
    p = build_prompt(STYLES["minimal"], ANALYSIS)
    assert BUSY not in p and "sesame seeds" in p


def test_the_default_style_keeps_close_lines_apart_and_does_not_fill_holes():
    sp = stroke_params(STYLES["minimal"], 768)
    assert sp.crowd_factor == 2.0 and sp.hole_frac == 0.0


def test_compact_restores_the_earlier_settings_exactly():
    sp = stroke_params(compact(STYLES["minimal"]), 768)
    assert sp.crowd_factor == 0.0 and sp.hole_frac == 0.002
    assert compact(STYLES["minimal"]).cleanup == STYLES["minimal"].cleanup   # only the stroke step differs
