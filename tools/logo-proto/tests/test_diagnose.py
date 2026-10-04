import numpy as np
from logoproto.diagnose import diagnose, mask_facts


def blob(n=200, spots=((60, 60, 30),)):
    m = np.zeros((n, n), np.uint8)
    yy, xx = np.mgrid[:n, :n]
    for y, x, r in spots:
        m[np.hypot(yy - y, xx - x) <= r] = 255
    return m


def ok_variant(n=1):
    return {"n": n, "check": {"passed": True, "reasons": []}, "attempt1": None, "sizes": [], "stats": {}}


def test_a_clean_single_subject_gets_no_complaints():
    f = mask_facts(blob(spots=((100, 100, 60),)), (2000, 1500))
    assert diagnose(f, {"features": list("abcd")}, [ok_variant()]) == []


def test_several_separate_subjects_are_called_out():
    f = mask_facts(blob(spots=((50, 50, 30), (150, 150, 30), (50, 150, 28))), (1600, 1054))
    assert f["objects"] == 3
    assert any("3 separate objects" in s for s in diagnose(f, {"features": list("abcd")}, [ok_variant()]))


def test_a_small_source_is_called_out_with_the_enlargement():
    f = mask_facts(blob(spots=((100, 100, 60),)), (405, 720))
    out = diagnose(f, {"features": list("abcd")}, [ok_variant()])
    assert any("405x720" in s and "invented" in s for s in out)


def test_a_failed_variation_is_never_hidden():
    bad = {"n": 2, "check": {"passed": False, "reasons": ["silhouette IoU 0.31 is below 0.80"]},
           "attempt1": None, "sizes": [], "stats": {}}
    f = mask_facts(blob(spots=((100, 100, 60),)), (2000, 1500))
    assert any("Variation 2 FAILED" in s and "0.31" in s for s in diagnose(f, {"features": list("abcd")}, [ok_variant(), bad]))


def test_a_retry_that_rescued_a_variation_is_still_reported():
    v = ok_variant()
    v["attempt1"] = {"seed": 44, "check": {"reasons": ["silhouette IoU 0.24 is below 0.80"]}}
    f = mask_facts(blob(spots=((100, 100, 60),)), (2000, 1500))
    assert any("needed a retry" in s for s in diagnose(f, {"features": list("abcd")}, [v]))


def test_a_tiny_or_whole_picture_cutout_is_called_out():
    tiny = mask_facts(blob(spots=((100, 100, 5),)), (2000, 1500))
    assert any("very small subject" in s for s in diagnose(tiny, {"features": list("abcd")}, [ok_variant()]))
    whole = mask_facts(np.full((100, 100), 255, np.uint8), (2000, 1500))
    assert any("almost everything" in s for s in diagnose(whole, {"features": list("abcd")}, [ok_variant()]))


def test_a_small_size_failure_and_loose_weights_are_reported():
    v = ok_variant()
    v["sizes"] = [{"size": 32, "passed": False, "iou": 0.5}]
    v["stats"] = {"rungs": {"thinner": 0.4, "thicker": 0.0, "on_rung": 0.5}}
    f = mask_facts(blob(spots=((100, 100, 60),)), (2000, 1500))
    out = diagnose(f, {"features": list("abcd")}, [v])
    assert any("32 px" in s for s in out) and any("thinner than the thinnest" in s for s in out)


# ---- busyness: how many strokes are drawn inside the outline -----------------


def _circle_outline(n=300, r=120):
    yy, xx = np.mgrid[:n, :n]
    d = np.hypot(yy - n / 2, xx - n / 2)
    return (np.abs(d - r) <= 1.5), (d <= r + 1.5).astype(np.uint8) * 255


def test_a_bare_outline_has_no_interior_strokes():
    from logoproto.diagnose import busyness
    ink, mask = _circle_outline()
    assert busyness(ink, mask)["interior_strokes"] == 0


def test_ten_separate_interior_lines_are_counted_as_ten():
    from logoproto.diagnose import busyness
    ink, mask = _circle_outline()
    for k in range(10):
        ink[80 + k * 14, 100:200] = True            # ten separate horizontal lines inside the circle
    assert busyness(ink, mask)["interior_strokes"] == 10


def test_texture_scores_far_higher_than_a_few_lines():
    from logoproto.diagnose import busyness
    ink, mask = _circle_outline()
    rng = np.random.default_rng(1)
    for _ in range(120):                              # 120 short scratches: seeds, fur, hatching
        y, x = rng.integers(60, 240, 2)
        ink[y, x:x + 20] = True
    assert busyness(ink, mask)["interior_strokes"] > 60


def test_short_flecks_are_not_strokes():
    from logoproto.diagnose import busyness
    ink, mask = _circle_outline()
    for k in range(20):
        ink[100 + k * 5, 150:156] = True            # 6 px flecks
    assert busyness(ink, mask)["interior_strokes"] == 0


def test_a_retry_the_current_check_would_not_have_made_says_so_instead_of_printing_nothing():
    v = ok_variant()
    v["attempt1"] = {"seed": 43, "check": {"passed": True, "reasons": []}}
    f = mask_facts(blob(spots=((100, 100, 60),)), (2000, 1500))
    out = diagnose(f, {"features": list("abcd")}, [v])
    assert any("retry was not needed" in s for s in out) and not any(s.endswith("first seed 43: ).") for s in out)
