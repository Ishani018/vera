"""Size tests, fidelity and the node budget. No models."""
import numpy as np
import pytest

from logoproto.check import compare_overlay, fidelity, size_tests
from logoproto.cleanup import CleanupParams, cleanup, simplify_to_budget
from logoproto.svgdoc import Doc, Shape


def ring_svg(width=400, stroke=14):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{width}" viewBox="0 0 {width} {width}">'
            f'<circle cx="{width/2}" cy="{width/2}" r="{width*0.4}" fill="none" stroke="#000" stroke-width="{stroke}"/></svg>')


def disc_mask(n=400):
    yy, xx = np.mgrid[:n, :n]
    return (np.hypot(yy - n / 2, xx - n / 2) <= n * 0.4).astype(np.uint8) * 255


def test_a_bold_closed_ring_survives_at_64_and_32():
    t64, t32 = size_tests(ring_svg(stroke=24), disc_mask(), [24.0])
    assert t64.size == 64 and t32.size == 32
    assert t64.passed and t32.passed
    assert t32.iou > 0.8


def test_a_hairline_ring_is_reported_as_faded_at_small_sizes():
    t64, t32 = size_tests(ring_svg(stroke=1), disc_mask(), [1.0])
    assert t32.thinnest_px < 0.1          # 1 px at 400 is 0.08 px at 32: a haze, and it says so
    assert t32.ink_alpha < 0.5


def test_a_ring_with_a_gap_fails_the_size_test():
    gap = ring_svg(stroke=24).replace('/>', ' stroke-dasharray="500 70" stroke-dashoffset="0"/>')
    t = size_tests(gap, disc_mask(), [24.0])[1]
    # a dashed ring has gaps that let the interior leak at small size
    assert t.iou <= size_tests(ring_svg(stroke=24), disc_mask(), [24.0])[1].iou


def test_size_test_returns_png_bytes_of_the_right_size():
    from io import BytesIO
    from PIL import Image
    t = size_tests(ring_svg(), disc_mask(), [8.0], sizes=(64,))[0]
    assert Image.open(BytesIO(t.png)).size == (64, 64)


def test_fidelity_of_a_drawing_against_itself_is_one():
    svg = ring_svg(stroke=10)
    from logoproto.check import rasterise
    ink = rasterise(svg, 400, 400) > 127
    f = fidelity(svg, ink)
    assert f["on_redraw"] > 0.95 and f["kept"] > 0.95


def test_fidelity_catches_an_invented_line():
    from logoproto.check import rasterise
    base = rasterise(ring_svg(stroke=10), 400, 400) > 127
    invented = ring_svg(stroke=10).replace("</svg>", '<path d="M40,60 L360,60" stroke="#000" stroke-width="10"/></svg>')
    f = fidelity(invented, base)
    assert f["on_redraw"] < 0.95 and f["kept"] > 0.95


def test_overlay_marks_the_difference_in_colour():
    from logoproto.check import rasterise
    ink = rasterise(ring_svg(stroke=10), 400, 400) > 127
    img = np.array(compare_overlay(ring_svg(stroke=10), ink))
    assert (img.reshape(-1, 3) == (40, 40, 40)).all(1).any()  # agreement drawn dark


def _wiggly(n=900):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    r = 100 + 3 * np.sin(11 * t)
    return np.stack([200 + r * np.cos(t), 200 + r * np.sin(t)], 1)


def test_node_budget_is_met_by_simplifying_harder():
    doc = Doc(400, 400, [Shape([_wiggly()])])
    eps, over = simplify_to_budget(doc, CleanupParams(node_budget=60, simplify_eps=0.3, fit_curves=False, simplify_eps_max=12.0))
    assert not over and doc.nodes <= 60 and eps > 0.3  # the polyline path


def test_node_budget_is_a_ceiling_not_a_target_loose_shapes_stay_as_they_are():
    doc = Doc(400, 400, [Shape([np.array([[10, 10], [200, 10], [200, 200], [10, 200]], float)])])
    eps, over = simplify_to_budget(doc, CleanupParams(node_budget=300, simplify_eps=1.0, fit_curves=False))
    assert not over and eps == 1.0 and doc.nodes == 4


def test_an_impossible_budget_is_reported_not_hidden():
    doc = Doc(400, 400, [Shape([_wiggly()]) for _ in range(40)])
    _, over = simplify_to_budget(doc, CleanupParams(node_budget=20, simplify_eps=0.3, simplify_eps_max=2.0, fit_curves=False))
    assert over


def test_cleanup_reports_the_tolerance_it_needed():
    doc = Doc(400, 400, [Shape([_wiggly()])])
    _, st = cleanup(doc, CleanupParams(node_budget=80, simplify_eps=0.3, snap_vector=False, min_area_frac=0,
                                       fit_curves=False, simplify_eps_max=12.0))
    assert st.end_nodes <= 80 and st.simplify_eps_used > 0.3 and not st.over_budget


# ---- the curve-fitting path: a node is one Bezier segment -------------------


def test_fitting_counts_segments_not_vertices():
    doc = Doc(400, 400, [Shape([_wiggly()])])
    _, st = cleanup(doc, CleanupParams(simplify_eps=0.5, snap_vector=False, min_area_frac=0))
    assert st.start_nodes == 900 and st.end_nodes < 40


def test_a_budget_tighter_than_the_tightest_fit_raises_the_tolerance():
    doc = Doc(400, 400, [Shape([_wiggly()])])
    _, st = cleanup(doc, CleanupParams(node_budget=25, simplify_eps=0.15, snap_vector=False, min_area_frac=0))
    assert st.end_nodes <= 25 and st.simplify_eps_used > 0.15 and not st.over_budget


def test_the_tolerance_is_capped_so_the_budget_cannot_wreck_the_drawing():
    doc = Doc(400, 400, [Shape([_wiggly()]) for _ in range(30)])
    _, st = cleanup(doc, CleanupParams(node_budget=10, simplify_eps=0.3, simplify_eps_max=1.0,
                                       snap_vector=False, min_area_frac=0))
    assert st.over_budget and st.simplify_eps_used == 1.0  # it stopped at the cap and said so


def test_fitted_svg_is_still_ink_on_transparent_and_renders():
    from logoproto.check import rasterise
    from logoproto.svgdoc import write_svg
    doc, _ = cleanup(Doc(400, 400, [Shape([_wiggly(), _wiggly() * 0.6 + 80])]),
                     CleanupParams(snap_vector=False, min_area_frac=0))
    svg = write_svg(doc)
    assert "<rect" not in svg and " C" in svg
    a = rasterise(svg, 400, 400)
    assert a[0, 0] == 0 and (a > 127).any()


def test_awkward_aspect_ratios_do_not_break_the_size_test():
    # 27 vs 28 rows was a real crash: resvg rounds its own height
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="768" height="656" viewBox="0 0 768 656">'
           '<rect x="60" y="60" width="640" height="540" fill="none" stroke="#000" stroke-width="20"/></svg>')
    m = np.zeros((656, 768), np.uint8)
    m[60:600, 60:700] = 255
    for t in size_tests(svg, m, [20.0], sizes=(64, 32, 31, 17)):
        assert 0.0 <= t.iou <= 1.0


# ---- VTracer must not thin strokes -----------------------------------------


def test_the_trace_keeps_a_thin_stroke_as_thick_as_it_was_drawn():
    """Regression: VTracer's spline/polygon modes shaved 10-20% of the ink off thin strokes."""
    from PIL import Image
    from logoproto import vectorize
    from logoproto.check import rasterise
    from logoproto.strokes import rung_share
    yy, xx = np.mgrid[:300, :300]
    rings = (np.abs(np.hypot(yy - 150, xx - 150) - 90) <= 2.5) | (np.abs(np.hypot(yy - 150, xx - 150) - 60) <= 3.5)
    img = Image.fromarray(np.where(rings, 0, 255).astype(np.uint8), "L").convert("RGB")
    svg = vectorize.trace(img)
    after = rasterise(svg, 300, 300) > 127
    before = rung_share(rings, [5, 7])
    now = rung_share(after, [5, 7])
    assert now["on_rung"] >= before["on_rung"] - 0.05, (before, now)
    assert abs(int(after.sum()) - int(rings.sum())) / rings.sum() < 0.03  # ink area preserved to 3%


def test_the_overlay_does_not_call_a_thickened_but_faithful_drawing_invented():
    """Regression: comparing raw pixels painted a deliberately thickened result almost all blue."""
    from logoproto.check import rasterise
    thin_ = ring_svg(stroke=2)
    thick = ring_svg(stroke=10)
    raw = rasterise(thin_, 400, 400) > 127
    img = np.array(compare_overlay(thick, raw)).reshape(-1, 3)
    blue = (img == (40, 90, 200)).all(1).sum()
    dark = (img == (40, 40, 40)).all(1).sum()
    assert dark > 5 * blue, (dark, blue)   # same line, just thicker: agreement, not invention
