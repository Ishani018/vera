"""Cleanup and check are pure geometry, so they are tested with no models at all."""
import numpy as np
import pytest

from logoproto.check import CheckParams, check, iou, rasterise, silhouette
from logoproto.cleanup import (CleanupParams, cleanup, depths, drop_small, ink_area,
                               merge_duplicates, simplify_ring, stroke_width)
from logoproto.svgdoc import Doc, Shape, parse_path, parse_svg, write_svg


def rect(x0, y0, x1, y1):
    return np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], float)


def ribbon(x0, y0, length, width):
    return Shape([rect(x0, y0, x0 + length, y0 + width)])


def circle(cx, cy, r, n=400):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return np.stack([cx + r * np.cos(t), cy + r * np.sin(t)], 1)


# ---------------------------------------------------------------- parsing

VTRACER = (
    '<?xml version="1.0" encoding="UTF-8"?><svg version="1.1" xmlns="http://www.w3.org/2000/svg" '
    'width="100" height="80">'
    '<path d="M0 0 L100 0 L100 80 L0 80 Z " fill="#FFFFFF" transform="translate(0,0)"/>'
    '<path d="M10 10 C 20 10 30 10 40 10 L 40 20 C 30 20 20 20 10 20 Z M15 13 L 20 13 L 20 17 L 15 17 Z" '
    'fill="#000000" transform="translate(5,5)"/></svg>'
)


def test_parse_keeps_ink_and_drops_the_white_background():
    doc = parse_svg(VTRACER)
    assert (doc.width, doc.height) == (100, 80)
    assert len(doc.shapes) == 1
    assert len(doc.shapes[0].rings) == 2


def test_parse_applies_translate():
    ring = parse_svg(VTRACER).shapes[0].rings[0]
    assert ring[:, 0].min() == pytest.approx(15) and ring[:, 1].min() == pytest.approx(15)


def test_parse_path_handles_relative_commands():
    (ring,) = parse_path("m10 10 l20 0 l0 20 l-20 0 z")
    assert ring.min(0).tolist() == [10, 10] and ring.max(0).tolist() == [30, 30]


# ------------------------------------------------------ transparent output


def test_written_svg_is_ink_only_on_transparent():
    svg = write_svg(parse_svg(VTRACER))
    assert "<rect" not in svg
    assert "#FFFFFF" not in svg.upper() and "white" not in svg
    alpha = rasterise(svg, 100, 80)
    assert alpha[0, 0] == 0  # the corner is transparent, not white


# --------------------------------------------------------- small shapes


def test_drops_specks_and_keeps_real_shapes():
    doc = Doc(200, 200, [ribbon(10, 10, 150, 6), Shape([rect(50, 50, 52, 52)])])
    assert drop_small(doc, CleanupParams()) == 1
    assert len(doc.shapes) == 1


def test_drops_a_long_hairline_below_the_extent_floor_only_when_tiny():
    doc = Doc(200, 200, [Shape([rect(10, 10, 13, 13)])])
    assert drop_small(doc, CleanupParams()) == 1


# ------------------------------------------------------------ duplicates


def test_merges_stacked_duplicates():
    a = ribbon(10, 10, 120, 8)
    b = ribbon(10.2, 10.25, 120, 8)  # a near-copy sitting on top, inside the 0.9 bbox-IoU tolerance
    c = ribbon(10, 60, 120, 8)  # a different shape
    doc = Doc(200, 200, [a, b, c])
    assert merge_duplicates(doc, CleanupParams()) == 1
    assert len(doc.shapes) == 2


def test_does_not_merge_shapes_that_merely_overlap():
    doc = Doc(200, 200, [ribbon(10, 10, 120, 8), ribbon(10, 14, 120, 8)])
    assert merge_duplicates(doc, CleanupParams()) == 0


# ------------------------------------------------------------ simplify


def test_simplify_cuts_nodes_but_keeps_the_shape():
    ring = circle(100, 100, 50, n=800)
    out = simplify_ring(ring, 0.8)
    assert len(out) < 80 < len(ring)
    # every original point is within tolerance-ish of the simplified polygon's radius
    r = np.linalg.norm(out - [100, 100], axis=1)
    assert r.min() > 50 - 1.5


def test_simplify_never_collapses_a_ring_below_a_triangle():
    assert len(simplify_ring(rect(0, 0, 10, 10), 100.0)) >= 3


# ------------------------------------------------------- stroke weights


def test_stroke_width_of_a_uniform_ribbon_is_its_thickness():
    assert stroke_width(ribbon(0, 0, 200, 5)) == pytest.approx(5, abs=0.2)


def test_holes_are_counted_out_of_the_ink():
    outer, hole = rect(0, 0, 100, 100), rect(25, 25, 75, 75)
    s = Shape([outer, hole])
    assert depths(s) == [0, 1]
    assert ink_area(s) == pytest.approx(10000 - 2500)


def test_snaps_to_at_most_three_weights():
    rng = np.random.default_rng(0)
    widths = rng.uniform(2.0, 12.0, 24)
    shapes = [ribbon(10, 10 + i * 18, 300, w) for i, w in enumerate(widths)]
    doc, st = cleanup(Doc(400, 600, shapes), CleanupParams(min_area_frac=0, simplify_eps=0.1))
    after = [stroke_width(s) for s in doc.shapes]
    assert 1 <= len(st.weights_px) <= 3
    # every stroke now sits within 0.15 px of one of the (at most three) weights
    for w in after:
        assert min(abs(w - c) for c in st.weights_px) < 0.15, (w, st.weights_px)
    # and they really moved: 24 different widths became three
    assert max(after) - min(after) < max(widths) - min(widths)
    assert len({round(c, 1) for c in st.weights_px}) == len(st.weights_px)


def test_snapping_never_inverts_a_thin_stroke():
    shapes = [ribbon(10, 10, 300, 1.2), ribbon(10, 40, 300, 12), ribbon(10, 80, 300, 6)]
    doc, _ = cleanup(Doc(400, 200, shapes), CleanupParams(min_area_frac=0, simplify_eps=0.05))
    assert all(stroke_width(s) > 0.5 for s in doc.shapes)


def test_a_solid_fill_is_left_alone_not_forced_to_a_stroke_weight():
    blob = Shape([rect(50, 50, 250, 250)])
    doc, st = cleanup(Doc(300, 300, [blob, ribbon(10, 10, 200, 4)]), CleanupParams(min_area_frac=0))
    assert ink_area(doc.shapes[0]) == pytest.approx(200 * 200)


def test_cleanup_reports_what_it_did():
    shapes = [ribbon(10, 10, 150, 6), Shape([rect(50, 50, 52, 52)]), ribbon(10, 10, 150, 6)]
    _, st = cleanup(Doc(200, 200, shapes))
    assert st.dropped_small == 1 and st.merged_duplicates == 1
    assert st.start_shapes == 3 and st.end_shapes == 1


# ----------------------------------------------------------------- check


def outline_svg(closed=True):
    gap = "" if closed else ' M0 0'
    d = "M20 20 L180 20 L180 180 L20 180 Z M26 26 L26 174 L174 174 L174 26 Z"
    if not closed:
        d = "M20 20 L180 20 L180 90 L174 90 L174 26 L26 26 L26 174 L174 174 L174 110 L180 110 L180 180 L20 180 Z"
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><path d="{d}" fill="#000" fill-rule="evenodd"/></svg>'


def square_mask():
    m = np.zeros((200, 200), np.uint8)
    m[20:180, 20:180] = 255
    return m


def test_iou_basics():
    a = square_mask() > 0
    assert iou(a, a) == 1.0
    assert iou(a, ~a) == 0.0


def test_a_closed_outline_matches_its_cutout():
    r = check(outline_svg(True), shapes=1, nodes=8, mask=square_mask())
    assert r.passed and r.iou > 0.95, r


def test_an_outline_with_a_gap_fails_on_iou():
    r = check(outline_svg(False), shapes=1, nodes=12, mask=square_mask(), p=CheckParams(close_px=1))
    assert not r.passed and any("IoU" in x for x in r.reasons), r


def test_ceilings_fail_a_result_that_matches_but_is_too_busy():
    r = check(outline_svg(True), shapes=900, nodes=90000, mask=square_mask())
    assert not r.passed
    assert any("shapes" in x for x in r.reasons) and any("nodes" in x for x in r.reasons)


def test_an_empty_svg_fails():
    r = check("<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'/>", 0, 0, square_mask())
    assert not r.passed and "no shapes survived" in r.reasons


def test_silhouette_fills_a_closed_ring_only():
    ring = np.zeros((60, 60), np.uint8)
    ring[10:50, 10:50] = 255
    ring[14:46, 14:46] = 0
    assert silhouette(ring, close_px=1)[30, 30]
    ring[10:50, 30] = 0  # cut the ring
    ring[30, 10:14] = 0
    ring[10:14, 30] = 0
    assert not silhouette(ring, close_px=0)[30, 30]
