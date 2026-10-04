import json
from pathlib import Path

from logoproto.combined import build


def variant(n, passed=True, nodes=550, retry=False):
    return {"n": n, "seed": 40 + n, "svg": f"minimal-{n}.svg",
            "check": {"passed": passed, "iou": 0.97 if passed else 0.3, "shapes": 2, "nodes": nodes, "ink_fraction": 0.1,
                      "reasons": [] if passed else ["silhouette IoU 0.30 is below 0.80"]},
            "sizes": [{"size": 64, "passed": True, "iou": 0.9}, {"size": 32, "passed": passed, "iou": 0.8}],
            "stats": {"budget": 300, "rungs": {"on_rung": 0.8, "thinner": 0.1, "thicker": 0.0}},
            "attempt1": {"seed": 1, "check": {"reasons": ["x"]}} if retry else None}


def make(root: Path, name, variants, diagnosis=(), objects=1):
    d = root / name
    d.mkdir()
    (d / "variants.json").write_text(json.dumps({
        "name": name, "facts": {"source_px": [800, 600], "objects": objects, "mask_fraction": 0.4},
        "analysis": {"subject": "thing"}, "variants": variants, "diagnosis": list(diagnosis),
        "stages": [{"seconds": 60.0}], "totals": {"peak_gb": 12.0}}))


def test_every_photo_appears_and_every_row_is_flagged_over_the_node_target(tmp_path):
    make(tmp_path, "pancake", [variant(1), variant(2)])
    make(tmp_path, "bicycle", [variant(1, nodes=700)])
    html = build(tmp_path).read_text()
    assert "pancake" in html and "bicycle" in html
    assert html.count("OVER 300") == 3                      # one per variation, none skipped
    assert "3 of 3</b> are OVER" in html


def test_a_photo_that_failed_outright_is_a_card_not_a_gap(tmp_path):
    make(tmp_path, "pancake", [variant(1)])
    bad = tmp_path / "kitten"
    bad.mkdir()
    (bad / "FAILED.json").write_text(json.dumps({"photo": "kitten", "stage": "cutout",
                                                 "error": "RuntimeError: BiRefNet found no subject"}))
    html = build(tmp_path).read_text()
    assert "kitten" in html and "FAILED" in html and "found no subject" in html
    assert "1</b> failed outright" in html


def test_failed_variations_and_retries_are_counted_not_hidden(tmp_path):
    make(tmp_path, "cats", [variant(1, passed=False), variant(2, retry=True)],
         diagnosis=["The cutout contains 3 separate objects"], objects=3)
    html = build(tmp_path).read_text()
    assert "1</b> FAIL" in html and "1</b> needed a retry" in html
    assert "3 separate objects" in html and "3 object(s)" in html


def test_the_hard_photos_get_their_section_with_the_reasons(tmp_path):
    make(tmp_path, "puppy", [variant(1)], diagnosis=["The source is small (405x720)"])
    make(tmp_path, "burger", [variant(1)])
    html = build(tmp_path).read_text()
    assert "The hard ones" in html and "405x720" in html


def test_a_clean_hard_photo_says_so_rather_than_staying_silent(tmp_path):
    make(tmp_path, "kitten", [variant(1)])
    assert "found nothing wrong" in build(tmp_path).read_text()


def test_photos_that_never_ran_are_listed_as_not_run(tmp_path):
    make(tmp_path, "pancake", [variant(1)])
    assert "not run (burger)" in build(tmp_path, expected=["pancake", "burger"]).read_text()
