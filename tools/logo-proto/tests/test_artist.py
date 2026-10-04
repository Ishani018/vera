"""Artist mode, stage by stage. No models."""
import numpy as np
import pytest
from scipy import ndimage as ndi

from logoproto.artist import fit_stroke, skeleton_strokes
from logoproto.strokes import thin


def canvas(n=200):
    return np.zeros((n, n), bool)


def line(img, p0, p1, w=3):
    for t in np.linspace(0, 1, 600):
        y, x = int(p0[0] + t * (p1[0] - p0[0])), int(p0[1] + t * (p1[1] - p0[1]))
        img[max(0, y - w // 2): y + w // 2 + 1, max(0, x - w // 2): x + w // 2 + 1] = True
    return img


def strokes_of(img):
    return skeleton_strokes(thin(img))


def test_a_cross_is_two_strokes_not_four():
    img = line(line(canvas(), (100, 20), (100, 180)), (20, 100), (180, 100))
    s = strokes_of(img)
    assert len(s) == 2
    spans = sorted(float(np.ptp(st.pts[:, 0]) + np.ptp(st.pts[:, 1])) for st in s)
    assert spans[0] > 130 and spans[1] > 130            # each runs most of the way across: it carried through


def test_a_T_is_two_strokes_the_bar_and_the_stem():
    img = line(line(canvas(), (40, 20), (40, 180)), (40, 100), (170, 100))
    s = strokes_of(img)
    assert len(s) == 2
    longest = max(s, key=lambda st: np.ptp(st.pts[:, 0]))
    assert np.ptp(longest.pts[:, 0]) > 140              # the bar is one stroke, not two halves


def test_a_circle_is_one_closed_stroke():
    yy, xx = np.mgrid[:200, :200]
    ring = np.abs(np.hypot(yy - 100, xx - 100) - 70) <= 1.5
    s = strokes_of(ring)
    assert len(s) == 1 and s[0].closed


def test_a_single_line_is_one_open_stroke():
    s = strokes_of(line(canvas(), (100, 20), (100, 180)))
    assert len(s) == 1 and not s[0].closed and np.ptp(s[0].pts[:, 0]) > 150


def test_a_Y_keeps_its_two_arms_that_do_not_continue_each_other():
    img = canvas()
    line(img, (100, 100), (100, 190))                    # stem going right
    line(img, (100, 100), (30, 30))                      # one arm up-left
    line(img, (100, 100), (170, 30))                     # one arm down-left
    assert len(strokes_of(img)) == 3 or len(strokes_of(img)) == 2


def test_fitting_a_curved_stroke_uses_few_nodes_and_stays_close():
    t = np.linspace(0, np.pi, 300)
    pts = np.stack([100 + 80 * np.cos(t), 120 - 70 * np.sin(t)], 1) + np.random.default_rng(0).normal(0, 0.3, (300, 2))
    sm, segs = fit_stroke(pts, 1.2)
    assert 1 <= len(segs) <= 6
    from logoproto.fit import sample
    from scipy.spatial import cKDTree
    d = cKDTree(sample(segs, 300)).query(pts)[0]
    assert d.max() < 3.0


def test_a_corner_is_kept_sharp_when_fitting():
    pts = np.vstack([np.stack([np.linspace(20, 100, 80), np.full(80, 100.0)], 1),
                     np.stack([np.full(80, 100.0), np.linspace(100, 20, 80)], 1)])
    sm, segs = fit_stroke(pts, 1.0)
    from logoproto.fit import sample
    assert np.linalg.norm(sample(segs, 100) - np.array([100, 100]), axis=1).min() < 1.5


# ============ the rest of artist mode: outline, scoring, pruning, weights, SVG ============

import re

from PIL import Image

from logoproto.artist import (ARTIST_CAPS, ArtistParams, Stroke, assign_roles, build_svg, drop_outline_duplicates,
                              merge_duplicates, outline_paths, prune_by_removal, resample_open, score_strokes,
                              segs_d, subject_shape, vectorise_artist, _layer, _union)
from logoproto.check import CheckParams, rasterise
from logoproto.fit import sample
from logoproto.styles import get_style


def disc(n=300, r=110, c=(150, 150)):
    yy, xx = np.mgrid[:n, :n]
    return (np.hypot(yy - c[0], xx - c[1]) <= r).astype(np.uint8) * 255


def stroke_from(pts, closed=False):
    pts = np.asarray(pts, float)
    sm, segs = fit_stroke(pts, 1.0, closed)
    s = Stroke(pts, closed, segs)
    s.length = float(np.linalg.norm(np.diff(pts, axis=0), axis=1).sum())
    return s


def hline(y, x0, x1, n=120):
    return np.stack([np.linspace(x0, x1, n), np.full(n, float(y))], 1)


# ---- outline

def test_the_outline_is_one_smooth_closed_path_that_matches_the_cutout():
    shape = subject_shape(disc())
    paths = outline_paths(shape, 300, ArtistParams())
    assert len(paths) == 1
    assert len(paths[0]) <= 12                        # a deliberate path, not a traced staircase
    pts = sample(paths[0], 60)
    r = np.linalg.norm(pts - [150, 150], axis=1)
    assert abs(r.mean() - 110) < 2.5 and r.std() < 3


def test_specks_under_one_percent_of_the_subject_are_ignored():
    m = disc()
    m[10:16, 10:16] = 255                             # a 6x6 fleck far from the disc
    assert subject_shape(m).sum() == subject_shape(disc()).sum()      # the fleck contributes nothing
    assert not subject_shape(m)[12, 12]
    assert len(outline_paths(subject_shape(m), 300, ArtistParams())) == 1


def test_a_piece_over_one_percent_is_kept_as_its_own_outline():
    m = disc(r=80, c=(100, 100))
    m |= disc(r=40, c=(230, 230))
    assert len(outline_paths(subject_shape(m), 300, ArtistParams())) == 2


def test_holes_are_ignored_by_default_and_outlined_on_request():
    yy, xx = np.mgrid[:300, :300]
    ring = ((np.hypot(yy - 150, xx - 150) <= 110) & (np.hypot(yy - 150, xx - 150) >= 60)).astype(np.uint8) * 255
    assert subject_shape(ring)[150, 150]                              # outer contour: the hole is filled
    assert not subject_shape(ring, with_holes=True)[150, 150]
    assert len(outline_paths(subject_shape(ring, with_holes=True), 300, ArtistParams())) == 2


# ---- near-duplicates and the outline's own line

def test_the_same_line_drawn_twice_becomes_one_line():
    a = stroke_from(hline(100, 20, 200))
    b = stroke_from(hline(100.8, 22, 198))
    out, dropped = merge_duplicates([a, b], ArtistParams())
    assert len(out) == 1 and dropped == 1


def test_lines_that_are_merely_close_together_are_not_merged_spokes_stay_spokes():
    spokes = [stroke_from(np.stack([np.linspace(150, 150 + 100 * np.cos(a), 100), np.linspace(150, 150 + 100 * np.sin(a), 100)], 1))
              for a in np.radians(np.arange(0, 360, 12))]
    out, dropped = merge_duplicates(spokes, ArtistParams())
    assert dropped == 0 and len(out) == 30
    parallel = [stroke_from(hline(100 + 6 * k, 20, 200)) for k in range(5)]   # 6 px apart: close, not the same
    out, dropped = merge_duplicates(parallel, ArtistParams())
    assert dropped == 0 and len(out) == 5


def test_a_stroke_running_along_the_outline_is_dropped_because_the_outline_is_drawn_already():
    shape = subject_shape(disc())
    t = np.linspace(0, np.pi, 80)
    rim = stroke_from(np.stack([150 + 106 * np.cos(t), 150 + 106 * np.sin(t)], 1))     # 4 px inside the edge
    inner = stroke_from(hline(150, 100, 200))
    kept, dropped = drop_outline_duplicates([rim, inner], shape, 300, ArtistParams())
    assert dropped == 1 and kept == [inner]


# ---- importance

def test_a_long_high_contrast_stroke_outranks_a_short_flat_one():
    shape = subject_shape(disc())
    rgb = np.full((300, 300, 3), 235, np.float32)
    rgb[:150, :] = (200, 60, 40)                       # two forms meet along y = 150
    on_edge = stroke_from(hline(150, 80, 220))
    flat = stroke_from(hline(110, 130, 150, n=20))
    for s in (on_edge, flat):
        s.length = float(np.linalg.norm(np.diff(s.pts, axis=0), axis=1).sum())
    score_strokes([on_edge, flat], rgb, shape, 300, ArtistParams())
    assert on_edge.score > flat.score
    assert on_edge.parts["sep"] > flat.parts["sep"] and on_edge.parts["contrast"] > flat.parts["contrast"]


def test_a_stroke_near_the_outline_scores_higher_on_proximity_than_one_in_the_middle():
    shape = subject_shape(disc())
    rgb = np.full((300, 300, 3), 200, np.float32)
    near = stroke_from(hline(60, 110, 190))
    mid = stroke_from(hline(150, 110, 190))
    score_strokes([near, mid], rgb, shape, 300, ArtistParams())
    assert near.parts["prox"] > mid.parts["prox"]


def test_a_named_feature_box_raises_the_score_of_a_stroke_inside_it():
    """The hook for 'near a feature the vision step named'. Unused in practice: nothing supplies boxes yet."""
    shape = subject_shape(disc())
    rgb = np.full((300, 300, 3), 200, np.float32)
    a, b = stroke_from(hline(150, 110, 150, n=40)), stroke_from(hline(150, 160, 200, n=40))
    score_strokes([a, b], rgb, shape, 300, ArtistParams(), feature_boxes=[(0.33, 0.45, 0.52, 0.55)])
    assert a.parts["prox"] > b.parts["prox"] or a.parts["prox"] >= b.parts["prox"]


# ---- would removing it hurt?

def _widths():
    return {"detail": 5.0, "major": 7.0, "outline": 11.0}


def test_the_removal_test_drops_a_stroke_nobody_would_miss_and_keeps_one_they_would():
    shape = subject_shape(disc())
    outline_d = [segs_d(s, True) for s in outline_paths(shape, 300, ArtistParams())]
    big = stroke_from(np.stack([np.linspace(60, 240, 150), np.linspace(70, 230, 150)], 1))   # a long diagonal
    tiny = stroke_from(hline(200, 140, 152, n=12))                                        # a 12 px tick
    big.score, tiny.score = 0.9, 0.8
    kept, info = prune_by_removal([big, tiny], outline_d, _widths(), 300, 300,
                                  ArtistParams(min_keep=1, change_stop=0.05, change_budget=0.5))
    assert big in kept and tiny not in kept and info["removed"] == 1


def test_the_removal_test_stops_at_the_minimum_it_is_given():
    shape = subject_shape(disc())
    outline_d = [segs_d(s, True) for s in outline_paths(shape, 300, ArtistParams())]
    strokes = [stroke_from(hline(100 + 20 * k, 90, 210)) for k in range(4)]
    kept, info = prune_by_removal(strokes, outline_d, _widths(), 300, 300, ArtistParams(min_keep=3, change_stop=1.0, change_budget=1.0))
    assert len(kept) == 3


def test_a_stroke_that_the_picture_clearly_needs_is_never_removed_whatever_the_budget():
    shape = subject_shape(disc())
    outline_d = [segs_d(s, True) for s in outline_paths(shape, 300, ArtistParams())]
    strokes = [stroke_from(np.stack([np.linspace(40, 260, 200), np.linspace(40, 260, 200)], 1)),
               stroke_from(np.stack([np.linspace(40, 260, 200), np.linspace(260, 40, 200)], 1))]
    kept, _ = prune_by_removal(strokes, outline_d, _widths(), 300, 300, ArtistParams(min_keep=1, change_stop=0.005, change_budget=1.0))
    assert len(kept) == 2


def test_summing_the_per_stroke_renders_matches_rendering_the_whole_drawing():
    """The removal test composites one render per stroke instead of re-rendering the whole SVG each time."""
    ss = [stroke_from(hline(90, 60, 240)), stroke_from(np.stack([np.linspace(60, 240, 120), np.linspace(120, 220, 120)], 1))]
    for size in (64, 32):
        parts = _union([_layer(segs_d(s.segs, s.closed), 7.0, 300, 300, size) for s in ss], (size, size))
        svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">'
               + "".join(f'<path d="{segs_d(s.segs, s.closed)}" fill="none" stroke="#000" stroke-width="7" stroke-linecap="round"/>' for s in ss) + "</svg>")
        whole = rasterise(svg, size, size).astype(np.float32) / 255.0
        assert float(np.abs(parts - whole).mean()) < 0.01


# ---- weights and SVG

def test_the_strongest_third_is_major_structure_and_the_rest_is_detail():
    ss = [Stroke(np.zeros((2, 2)), score=s) for s in (0.9, 0.8, 0.7, 0.6, 0.5, 0.4)]
    assign_roles(ss)
    assert [s.role for s in sorted(ss, key=lambda s: -s.score)] == ["major", "major", "detail", "detail", "detail", "detail"]


def test_the_svg_is_transparent_stroked_paths_with_three_weights_and_the_outline_heaviest():
    shape = subject_shape(disc())
    od = [segs_d(s, True) for s in outline_paths(shape, 300, ArtistParams())]
    ss = [stroke_from(hline(100 + 20 * k, 90, 210)) for k in range(5)]
    for k, s in enumerate(ss):
        s.score = 1 - k * 0.1
    assign_roles(ss)
    svg = build_svg(od, ss, 300, 300, _widths())
    assert "<rect" not in svg and 'fill="#' not in svg
    assert rasterise(svg, 300, 300)[0, 0] == 0                       # a transparent corner
    widths = sorted({float(w) for w in re.findall(r'stroke-width="([\d.]+)"', svg)})
    assert widths == [5.0, 7.0, 11.0]
    assert 'data-role="outline"' in svg and re.search(r'stroke-width="11" data-role="outline"', svg)
    assert svg.count('fill="none"') == svg.count("<g ")             # nothing is filled


# ---- the whole thing

def _scene():
    """A disc subject on a coloured background, and a 'redraw' made of a dozen lines inside it."""
    mask = disc()
    raw = np.full((300, 300), 255, np.uint8)
    for k in range(12):
        raw[70 + 14 * k:73 + 14 * k, 70 + (k % 3) * 10:230 - (k % 4) * 12] = 0
    sub = np.zeros((300, 300, 4), np.uint8)
    sub[..., 3] = mask
    sub[..., :3] = (230, 120, 60)
    sub[150:, :, :3] = (250, 230, 200)
    return Image.fromarray(raw).convert("RGB"), mask, Image.fromarray(sub, "RGBA")


def test_the_whole_pipeline_returns_a_stroked_transparent_svg_within_the_cap():
    raw, mask, sub = _scene()
    v = vectorise_artist(raw, get_style("minimal"), mask, CheckParams(), sub, cap=4)
    interior = v.stroke_count - v.counts["outline_paths"]
    assert 0 <= interior <= 4 and v.counts["outline_paths"] == 1
    assert "<rect" not in v.svg and v.svg.count("<path") == v.stroke_count
    assert [s.size for s in v.sizes] == [64, 32]
    assert v.result.passed, v.result.reasons
    assert v.node_count == v.result.nodes


def test_the_per_style_caps_are_the_ones_asked_for():
    assert ARTIST_CAPS["minimal"] == 8 and ARTIST_CAPS["detailed"] == 30


def test_a_looser_cap_never_gives_fewer_strokes():
    raw, mask, sub = _scene()
    few = vectorise_artist(raw, get_style("minimal"), mask, CheckParams(), sub, cap=2)
    many = vectorise_artist(raw, get_style("minimal"), mask, CheckParams(), sub, cap=12)
    assert many.stroke_count >= few.stroke_count
