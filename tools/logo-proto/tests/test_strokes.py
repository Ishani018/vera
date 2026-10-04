"""Stroke normalisation: three weights, no broken outlines, specks gone. No models."""
import numpy as np
import pytest
from scipy import ndimage as ndi

from logoproto.strokes import StrokeParams, drop_loose, measure_widths, normalise, prune_spurs, thin


def lines(widths, length=200, gap=24):
    img = np.zeros((len(widths) * (max(widths) + gap) + 40, length + 60), bool)
    y = 20
    for w in widths:
        img[y : y + w, 30 : 30 + length] = True
        y += w + gap
    return img


def ring(r_out=70, r_in=64, size=200):
    yy, xx = np.mgrid[:size, :size]
    d = np.hypot(yy - size / 2, xx - size / 2)
    return (d <= r_out) & (d >= r_in)


def test_thinning_gives_a_one_pixel_centreline():
    sk = thin(lines([7]))
    ys = np.where(sk.any(1))[0]
    assert ys.max() - ys.min() <= 1  # 7 px tall bar collapses to ~one row
    assert sk.sum() > 150


def test_a_ring_stays_a_closed_ring_after_thinning():
    sk = thin(ring())
    filled = ndi.binary_fill_holes(ndi.binary_dilation(sk, iterations=1))
    assert filled[100, 100]  # still encloses its middle


def test_many_widths_become_at_most_three():
    ink = lines([2, 3, 4, 5, 7, 8, 11, 12, 15])
    out, info = normalise(ink, StrokeParams(ladder=(3, 7, 11), min_stroke_px=10, fill_frac=0.9))
    assert 1 <= len(info.weights_px) <= 3
    # measure each bar after the redraw: every one must sit on a rung (+-1 px)
    lab, n = ndi.label(out)
    found = set()
    for i in range(1, n + 1):
        w = measure_widths(lab == i)
        found.add(round(float(np.median(w))))
    allowed = {round(x) for x in info.weights_px}
    assert len(found) <= 3, found
    assert found <= allowed, (found, allowed)  # exactly on a reported weight, no slack


def test_hierarchy_is_kept_thin_stays_thinner_than_thick():
    ink = lines([2, 2, 14, 14])
    out, _ = normalise(ink, StrokeParams(ladder=(3, 7, 11), min_stroke_px=10, fill_frac=0.9))
    lab, n = ndi.label(out)
    meds = sorted(float(np.median(measure_widths(lab == i))) for i in range(1, n + 1))
    assert meds[0] < meds[-1] - 2


def test_a_closed_outline_is_still_closed():
    out, _ = normalise(ring(), StrokeParams(min_stroke_px=10))
    assert ndi.binary_fill_holes(out)[100, 100] and not out[100, 100]


def test_specks_and_short_ticks_are_dropped_but_long_strokes_kept():
    ink = lines([5], length=200)
    ink[5:8, 5:9] = True                 # a fleck
    ink[150:152, 100:112] = True         # a 12 px tick
    out, info = normalise(ink, StrokeParams(min_stroke_px=30))
    assert not out[5:8, 5:9].any() and not out[150:152, 100:112].any()
    assert out[20:25, 40:220].mean() > 0.9
    assert info.loose_removed >= 1  # the fleck's skeleton can vanish in thinning, so only the tick need be counted


def test_a_short_spur_off_a_long_stroke_is_pruned():
    sk = thin(lines([5], length=200))
    mid = int(np.where(sk.any(1))[0].mean())
    sk[mid - 6 : mid, 120] = True        # a 6 px spur sticking up
    pruned, removed = prune_spurs(sk, min_len=10)
    assert removed >= 1 and not pruned[mid - 5, 120]


def test_drop_loose_keeps_big_components():
    sk = np.zeros((50, 50), bool)
    sk[10, 5:45] = True
    sk[30, 5:9] = True
    out, n = drop_loose(sk, 10)
    assert n == 1 and out[10, 20] and not out[30, 6]


def test_empty_input_is_fine():
    out, info = normalise(np.zeros((40, 40), bool))
    assert not out.any() and info.skeleton_px == 0


def test_solid_fill_is_not_hollowed_into_a_stroke():
    ink = np.zeros((300, 300), bool)
    ink[60:240, 60:240] = True           # a 180 px solid block
    out, _ = normalise(ink, StrokeParams(min_stroke_px=10))
    assert out[150, 150] and out.sum() >= 0.9 * ink.sum()


# ---- local thickness: the unbiased width measure ---------------------------


def test_a_uniform_bar_has_its_width_everywhere_including_the_ends():
    from logoproto.strokes import local_thickness
    bar = np.zeros((60, 200), bool)
    bar[25:32, 20:180] = True  # 7 px tall
    t = local_thickness(bar)
    # a flat-cut end loses a little at its corners, but there is no taper towards a 1 px tip
    assert (t[bar] >= 4).mean() > 0.99
    assert np.median(t[bar]) == pytest.approx(7, abs=0.5)


def test_local_thickness_does_not_taper_at_a_round_stroke_end():
    """An earlier version of this test asserted the Zhang-Suen skeleton tapers at round caps. It does not
    (the skeleton stops where the stroke is still full width), so that claim was wrong and is gone."""
    from logoproto.strokes import local_thickness
    yy, xx = np.mgrid[:60, :160]
    seg = np.where(xx < 30, xx - 30, np.where(xx > 130, xx - 130, 0))
    capsule = np.hypot(seg, yy - 30) <= 5.5  # a round-ended stroke 11 px wide
    thick = local_thickness(capsule)[capsule]
    assert (thick >= 9).mean() > 0.95


def test_rung_share_reports_how_much_ink_is_on_the_weights():
    from logoproto.strokes import rung_share
    ink = lines([5, 7, 11], length=200)
    r = rung_share(ink, [5, 7, 11])
    assert r["on_rung"] > 0.95 and r["thinner"] < 0.02
    off = rung_share(lines([2, 3]), [5, 7, 11])
    assert off["thinner"] > 0.9


def test_local_thickness_of_nothing_is_nothing():
    from logoproto.strokes import local_thickness
    assert not local_thickness(np.zeros((20, 20), bool)).any()


def _band(angle_deg, width, size=260, length=200):
    """A straight stroke of exact perpendicular width at any angle."""
    yy, xx = np.mgrid[:size, :size]
    a = np.radians(angle_deg)
    u = (xx - size / 2) * np.cos(a) + (yy - size / 2) * np.sin(a)    # along the stroke
    v = -(xx - size / 2) * np.sin(a) + (yy - size / 2) * np.cos(a)   # across it
    return (np.abs(v) <= width / 2) & (np.abs(u) <= length / 2)


@pytest.mark.parametrize("angle", [0, 15, 30, 45, 60, 75, 90, 135])
@pytest.mark.parametrize("width", [5, 7, 11])
def test_local_thickness_reads_the_true_width_at_every_angle(angle, width):
    """Regression: a 45 degree band 5.7 px wide read as 3 px, which made on-weight strokes look hairline."""
    from logoproto.strokes import local_thickness
    band = _band(angle, width)
    t = local_thickness(band)[band]
    interior = t[t > 0]
    # the middle of the stroke, away from the flat ends: within 1.5 px of the true width
    mid = local_thickness(band & _band(angle, width, length=120))[_band(angle, width, length=120)]
    assert abs(np.median(mid) - width) <= 1.5, (angle, width, np.median(mid))
    assert (interior >= width - 2).mean() > 0.9, (angle, width, (interior >= width - 2).mean())
