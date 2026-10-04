"""The replacement check: edge coverage + gap-tolerant fill. Built around the burger #1/#2 case."""
import numpy as np
import pytest

from logoproto.check import (CheckParams, boundary_coverage, check, gap_estimate, rasterise, silhouette,
                             stray_ink)

N = 400


def ring_svg(gap_deg=0.0, r=150, w=8, cx=200, cy=200):
    """A circular outline with an optional gap, as an SVG."""
    import math
    if gap_deg <= 0:
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{N}" height="{N}"><circle cx="{cx}" cy="{cy}" r="{r}" '
                f'fill="none" stroke="#000" stroke-width="{w}"/></svg>')
    a0, a1 = math.radians(gap_deg / 2), math.radians(360 - gap_deg / 2)
    p0 = (cx + r * math.cos(a0), cy + r * math.sin(a0))
    p1 = (cx + r * math.cos(a1), cy + r * math.sin(a1))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{N}" height="{N}"><path d="M{p0[0]:.2f},{p0[1]:.2f} '
            f'A{r},{r} 0 1 1 {p1[0]:.2f},{p1[1]:.2f}" fill="none" stroke="#000" stroke-width="{w}"/></svg>')


def disc_mask(r=150):
    yy, xx = np.mgrid[:N, :N]
    return (np.hypot(yy - N / 2, xx - N / 2) <= r).astype(np.uint8) * 255


def gap_px(deg, r=150):
    return 2 * r * np.sin(np.radians(deg / 2))


def test_a_few_pixel_gap_no_longer_swings_the_score_by_most_of_it():
    """The burger case: nearly the same drawing, one with a small break in its outline."""
    closed = check(ring_svg(0), 1, 40, disc_mask())
    small_gap = check(ring_svg(2.0), 1, 40, disc_mask())          # about 5 px
    assert gap_px(2.0) < 8
    assert small_gap.legacy_iou < 0.4                              # the old score collapsed...
    assert small_gap.iou > 0.9                                     # ...the new one does not
    assert abs(closed.iou - small_gap.iou) < 0.1
    assert closed.passed and small_gap.passed


def test_the_old_score_really_was_a_cliff():
    assert check(ring_svg(0), 1, 40, disc_mask()).legacy_iou > 0.9
    assert check(ring_svg(2.0), 1, 40, disc_mask()).legacy_iou < 0.4


def test_a_gap_too_wide_to_seal_still_fails_and_says_why():
    r = check(ring_svg(40), 1, 40, disc_mask())                    # about 100 px
    assert gap_px(40) > 90
    assert not r.passed
    assert any("IoU" in x and "gaps the fill cannot seal" in x for x in r.reasons), r.reasons


def test_coverage_falls_in_proportion_to_the_missing_outline():
    full = check(ring_svg(0), 1, 40, disc_mask()).coverage
    half = check(ring_svg(180), 1, 40, disc_mask()).coverage
    assert full > 0.97 and 0.4 < half < 0.6


def test_an_outline_that_is_half_missing_fails_on_coverage():
    r = check(ring_svg(180), 1, 40, disc_mask())
    assert not r.passed and any("of the cutout outline has a line near it" in x for x in r.reasons)


def test_the_gap_is_estimated_so_a_low_score_explains_itself():
    a = rasterise(ring_svg(0), N, N)
    assert gap_estimate(a, disc_mask()) == 0.0
    sealed = gap_estimate(rasterise(ring_svg(2.0), N, N), disc_mask())
    assert sealed is not None and 4 <= sealed <= 12                 # about the gap we drew (5 px)
    assert gap_estimate(rasterise(ring_svg(40), N, N), disc_mask()) is None


def test_ink_drawn_where_there_is_no_subject_is_reported_as_stray():
    svg = ring_svg(0).replace("</svg>", '<path d="M10,380 L390,380" stroke="#000" stroke-width="6"/></svg>')
    r = check(svg, 2, 50, disc_mask())
    assert r.stray > 0.1
    assert check(ring_svg(0), 1, 40, disc_mask()).stray < 0.01


def test_outline_along_the_picture_border_is_not_counted_against_coverage():
    m = np.zeros((N, N), np.uint8)
    m[:, 100:] = 255                       # the subject runs off the right-hand edge
    ink = np.zeros((N, N), bool)
    ink[:, 98:102] = True                  # a line down its only real edge
    assert boundary_coverage(ink, m, 4) > 0.95


def test_stray_ink_of_nothing_is_zero():
    assert stray_ink(np.zeros((20, 20), bool), np.zeros((20, 20), np.uint8), 3) == 0.0


def test_gap_tolerance_scales_with_the_picture():
    # same drawing at twice the size: the same relative gap must be sealed
    big = 800
    svg = ring_svg(2.0).replace(f'width="{N}" height="{N}"', f'width="{big}" height="{big}" viewBox="0 0 {N} {N}"')
    m = np.zeros((big, big), np.uint8)
    yy, xx = np.mgrid[:big, :big]
    m[np.hypot(yy - big / 2, xx - big / 2) <= 300] = 255
    assert check(svg, 1, 40, m).passed


def test_a_threshold_is_a_parameter_not_a_constant():
    r = check(ring_svg(0), 1, 40, disc_mask(), CheckParams(min_coverage=1.01))
    assert not r.passed


# ---- two more ways the first version of this check was wrong ---------------


def annulus_mask(r_out=150, r_in=100):
    yy, xx = np.mgrid[:N, :N]
    d = np.hypot(yy - N / 2, xx - N / 2)
    return ((d <= r_out) & (d >= r_in)).astype(np.uint8) * 255


def wheel_svg():
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{N}" height="{N}">'
            '<circle cx="200" cy="200" r="150" fill="none" stroke="#000" stroke-width="8"/>'
            '<circle cx="200" cy="200" r="100" fill="none" stroke="#000" stroke-width="8"/></svg>')


def test_a_cutout_with_a_hole_is_not_marked_down_for_its_hole():
    """Regression: a bicycle drawing scored 0.59 against its cutout and 0.95 against its outer shape."""
    r = check(wheel_svg(), 2, 80, annulus_mask())
    assert r.iou > 0.9 and r.passed, r              # 0.9496 on this synthetic: exact enough, coverage is 1.0
    assert r.legacy_iou < 0.7                      # what the old check said about the same drawing


def test_the_hole_still_has_to_be_outlined():
    one_ring = ring_svg(0, r=150)                   # outer circle only: the hole's outline is missing
    r = check(one_ring, 1, 40, annulus_mask())
    assert r.coverage < 0.8 and not r.passed


def cropped_mask():
    m = np.zeros((N, N), np.uint8)
    m[120:, 80:320] = 255                          # runs off the bottom edge, like the two cats
    return m


def cropped_svg(bottom=False):
    pts = "M80,120 L320,120 L320,400 L80,400 Z" if bottom else "M80,400 L80,120 L320,120 L320,400"
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{N}" height="{N}"><path d="{pts}" fill="none" stroke="#000" stroke-width="8"/></svg>'


def test_a_subject_cut_off_by_the_frame_is_closed_by_the_frame():
    """Regression: both cats ran off the bottom of the photo, the fill leaked, and IoU read 0.25."""
    r = check(cropped_svg(bottom=False), 1, 4, cropped_mask())
    assert r.iou > 0.9 and r.passed, r
    assert r.legacy_iou < 0.2                       # the old score on the same open-bottomed drawing


def test_the_frame_only_closes_where_the_cutout_actually_touches_it():
    m = np.zeros((N, N), np.uint8)
    m[100:300, 100:300] = 255                       # a floating subject, not touching any edge
    open_top = ('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><path d="M100,100 L100,300 '
                'L300,300 L300,100" fill="none" stroke="#000" stroke-width="8"/></svg>')   # no top side
    assert not check(open_top, 1, 4, m).passed


# ---- the small-size tests had the same two bugs as the main check ---------------


def test_the_size_test_does_not_mark_a_wheel_down_for_its_hole():
    from logoproto.check import size_tests
    for t in size_tests(wheel_svg(), annulus_mask(), [8.0]):
        assert t.iou > 0.8, (t.size, t.iou)


def test_the_size_test_treats_the_frame_as_a_wall_for_a_cropped_subject():
    from logoproto.check import size_tests
    for t in size_tests(cropped_svg(bottom=False), cropped_mask(), [8.0]):
        assert t.iou > 0.8, (t.size, t.iou)
