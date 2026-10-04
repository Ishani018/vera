"""Stroke-level cleanup on the raster, before tracing. Pure numpy/scipy, no models.

Why this exists: a redraw's ink is usually ONE connected shape (the pancake's is
99% a single component). Anything that works per vector shape then sees one
width and cannot snap anything. So strokes are normalised here instead:

  1. skeletonise the ink (Zhang-Suen thinning)
  2. prune spurs and drop short loose strokes: the "minimal" in minimal
  3. measure local stroke width along the skeleton (distance transform)
  4. cluster the widths into three weights, and re-draw every stroke at exactly
     its cluster's weight with round caps
  5. leave genuinely solid areas alone (they are fills, not strokes)

Weights come from the style's ladder, assigned by rank: the thinnest measured
class gets the thinnest rung, the thickest the thickest. That keeps the
hierarchy the redraw had (an outline heavier than inner lines) while forcing the
weights to a size that survives being small. Measured widths alone would just
reproduce the 1-3 px hairlines the model drew.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy import ndimage as ndi

from .cleanup import _kmeans_1d

_N8 = np.ones((3, 3), bool)


def thin(ink: np.ndarray, max_iter: int = 200) -> np.ndarray:
    """Zhang-Suen thinning, vectorised. Returns a 1-px-wide 8-connected skeleton."""
    img = np.pad(ink.astype(np.uint8), 1)
    for _ in range(max_iter):
        changed = False
        for step in (0, 1):
            p = img
            P2, P3, P4, P5 = p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:], p[2:, 2:]
            P6, P7, P8, P9 = p[2:, 1:-1], p[2:, :-2], p[1:-1, :-2], p[:-2, :-2]
            c = p[1:-1, 1:-1]
            seq = [P2, P3, P4, P5, P6, P7, P8, P9, P2]
            B = sum(x.astype(np.int16) for x in seq[:8])
            A = sum(((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.int16) for i in range(8))
            if step == 0:
                cond = (P2 * P4 * P6 == 0) & (P4 * P6 * P8 == 0)
            else:
                cond = (P2 * P4 * P8 == 0) & (P2 * P6 * P8 == 0)
            kill = (c == 1) & (B >= 2) & (B <= 6) & (A == 1) & cond
            if kill.any():
                img[1:-1, 1:-1][kill] = 0
                changed = True
        if not changed:
            break
    return img[1:-1, 1:-1].astype(bool)


def _neighbours(skel: np.ndarray) -> np.ndarray:
    return ndi.convolve(skel.astype(np.uint8), _N8.astype(np.uint8), mode="constant") - skel.astype(np.uint8)


def prune_spurs(skel: np.ndarray, min_len: int, rounds: int = 2) -> tuple[np.ndarray, int]:
    """Delete dead-end branches shorter than min_len px (they end at a junction)."""
    skel = skel.copy()
    removed = 0
    for _ in range(rounds):
        nb = _neighbours(skel) * skel
        ends = np.argwhere(skel & (nb == 1))
        cut_any = False
        for y, x in ends:
            path = [(y, x)]
            prev, cur = None, (y, x)
            hit_junction = False
            while len(path) <= min_len:
                cy, cx = cur
                nxts = [
                    (cy + dy, cx + dx)
                    for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                    if (dy or dx) and 0 <= cy + dy < skel.shape[0] and 0 <= cx + dx < skel.shape[1]
                    and skel[cy + dy, cx + dx] and (cy + dy, cx + dx) != prev and (cy + dy, cx + dx) not in path
                ]
                if not nxts:
                    break  # an isolated stroke: not a spur, leave it for the loose-stroke filter
                if len(nxts) > 1 or nb[nxts[0]] >= 3:
                    hit_junction = True
                    break
                prev, cur = cur, nxts[0]
                path.append(cur)
            if hit_junction and len(path) < min_len:
                for q in path:
                    skel[q] = False
                removed += 1
                cut_any = True
        if not cut_any:
            break
    return skel, removed


def drop_loose(skel: np.ndarray, min_px: int) -> tuple[np.ndarray, int]:
    """Remove whole skeleton components shorter than min_px: stray flecks and hatch ticks."""
    lab, n = ndi.label(skel, structure=_N8)
    if not n:
        return skel, 0
    size = ndi.sum(skel, lab, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = size >= min_px
    return keep[lab], int((~keep[1:]).sum())


def fill_small_holes(ink: np.ndarray, max_area: int) -> tuple[np.ndarray, int]:
    """Fill enclosed white regions smaller than max_area px. The outside (anything
    touching the border) is never filled, so an open background stays open."""
    white, n = ndi.label(~ink, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]]))
    if not n:
        return ink, 0
    area = ndi.sum(np.ones_like(white), white, range(1, n + 1))
    edge = np.unique(np.concatenate([white[0], white[-1], white[:, 0], white[:, -1]]))
    small = np.zeros(n + 1, bool)
    small[1:] = area <= max_area
    small[edge] = False
    return ink | small[white], int(small.sum())


@dataclass
class StrokeParams:
    ladder: tuple[float, float, float] = (3.0, 5.0, 7.0)  # odd px weights, thin to heavy, at the working size
    min_spur_px: int = 8
    min_stroke_px: int = 20
    fill_frac: float = 0.06
    smooth_px: int = 9
    hole_frac: float = 0.0   # enclosed white areas under this share of the picture are filled: tiny loops are detail, not shape
    crowd_factor: float = 2.0  # lines closer than this many stroke widths are NOT thickened (0 = always thicken)
    crowd_min_radius: int = 1  # ...but never drawn thinner than 2*this+1 px: a 1 px line does not survive curve fitting


@dataclass
class StrokeInfo:
    measured_px: list[float] = field(default_factory=list)
    weights_px: list[float] = field(default_factory=list)
    spurs_removed: int = 0
    loose_removed: int = 0
    skeleton_px: int = 0
    holes_filled: int = 0
    crowded_px: int = 0          # skeleton pixels held thin because another line was too close
    thinnest_px: float = 0.0     # the thinnest stroke actually drawn; the curve fit's tolerance has to stay under about 40% of it


def normalise(ink: np.ndarray, p: StrokeParams | None = None) -> tuple[np.ndarray, StrokeInfo]:
    """Redraw `ink` (bool) with every stroke at one of at most three weights."""
    p = p or StrokeParams()
    info = StrokeInfo()
    ink = ink.astype(bool)
    if not ink.any():
        return ink, info
    h, w = ink.shape
    if p.hole_frac > 0:
        ink, info.holes_filled = fill_small_holes(ink, int(p.hole_frac * h * w))
    dt = ndi.distance_transform_edt(ink)
    skel = thin(ink)
    skel, info.spurs_removed = prune_spurs(skel, p.min_spur_px)
    skel, info.loose_removed = drop_loose(skel, p.min_stroke_px)
    info.skeleton_px = int(skel.sum())

    # solid areas are fills, not strokes: leave them as drawn
    fill_px = p.fill_frac * min(h, w)
    core = dt > fill_px / 2
    fills = ndi.binary_dilation(core, iterations=int(fill_px / 2)) & ink if core.any() else np.zeros_like(ink)
    stroke_skel = skel & ~fills
    if not stroke_skel.any():
        return fills | (ink if not skel.any() else np.zeros_like(ink)), info

    width = np.maximum(2 * dt - 1, 1.0)
    k = np.ones((p.smooth_px, p.smooth_px))
    num = ndi.convolve(np.where(stroke_skel, width, 0.0), k, mode="constant")
    den = ndi.convolve(stroke_skel.astype(float), k, mode="constant")
    local = np.where(stroke_skel, num / np.maximum(den, 1e-9), 0.0)
    vals = local[stroke_skel]

    centres = _kmeans_1d(vals, 3)
    info.measured_px = [round(float(c), 2) for c in centres]
    cls = np.abs(local[..., None] - centres[None, None, :]).argmin(-1)
    # rank -> ladder rung, spread across the ladder when fewer than 3 classes exist
    rungs = np.linspace(0, len(p.ladder) - 1, len(centres)).round().astype(int)
    targets = [p.ladder[r] for r in rungs]
    info.weights_px = [round(float(t), 2) for t in targets]

    # A disk of radius r drawn on a 1-px centreline is 2*floor(r)+1 px wide, so
    # only odd widths exist. Use r = (target-1)/2 so an odd target lands exactly,
    # and report the width actually drawn rather than the one asked for.
    radius = np.zeros(ink.shape, np.float32)
    drawn = []
    for c, target in enumerate(targets):
        r = max(0.0, (target - 1) / 2.0)
        drawn.append(float(2 * np.floor(r) + 1))
        radius[stroke_skel & (cls == c)] = r

    # Where another line is closer than crowd_factor stroke widths, do not thicken it to the weight.
    # Centre-to-centre spacing is about (this stroke's width + the white gap beside it); a stroke may
    # grow to spacing / crowd_factor, never narrower than the width it already has.
    if p.crowd_factor > 0:
        gap = clearance(ink, stroke_skel, reach=max(3, int(max(targets) / 2) - 1))
        spacing = np.where(np.isfinite(gap), local + gap, np.inf)
        w_allowed = np.maximum(spacing / p.crowd_factor, np.maximum(local, 1.0))
        allowed = np.where(np.isfinite(w_allowed), np.floor((w_allowed - 1) / 2.0), np.inf)
        # smooth along the line so the width does not flicker: the smallest allowance in the neighbourhood wins
        cap = np.where(stroke_skel, np.minimum(allowed, 1e6), 1e6)
        cap = ndi.minimum_filter(cap, size=5)
        cap = np.maximum(cap, float(p.crowd_min_radius))
        capped = stroke_skel & (cap < radius)
        info.crowded_px = int(capped.sum())
        radius = np.where(capped, np.minimum(radius, cap), radius)

    info.thinnest_px = float(2 * np.floor(radius[stroke_skel].min()) + 1) if stroke_skel.any() else 0.0
    out = fills.copy()
    for r in np.unique(radius[stroke_skel]):
        layer = stroke_skel & (radius == r)
        out |= ndi.distance_transform_edt(~layer) <= float(r) + 1e-6
    info.weights_px = [round(d, 2) for d in drawn]
    return out, info


def clearance(ink: np.ndarray, skel: np.ndarray, reach: int = 4, max_r: int = 24) -> np.ndarray:
    """The white space beside each skeleton pixel: the narrowest white gap within `reach` px of it (inf if none).

    This is what decides whether a stroke can be thickened. Two lines whose white gap is c fuse when
    each is grown by about c/2 on the side facing the other. An earlier version compared different
    skeleton BRANCHES and exempted the area around junctions, but a hatched patch (the shading
    between a wheel's spokes) is a dense mesh of junctions, so almost all of it was exempt and the
    rule did nothing. Measuring the gap directly has no such blind spot.
    """
    white = local_thickness(~ink, max_r=max_r)
    beside = np.where(ink, np.inf, np.where(white > 0, white, np.inf)).astype(np.float32)
    near = ndi.minimum_filter(beside, size=2 * reach + 1)
    return np.where(skel, near, np.inf).astype(np.float32)


def measure_widths(ink: np.ndarray, p: StrokeParams | None = None) -> np.ndarray:
    """Local stroke width at every skeleton pixel of `ink`, for tests and the report."""
    ink = ink.astype(bool)
    if not ink.any():
        return np.array([])
    dt = ndi.distance_transform_edt(ink)
    skel = thin(ink)
    return np.maximum(2 * dt[skel] - 1, 1.0)


def local_thickness(ink: np.ndarray, max_r: int = 40) -> np.ndarray:
    """Per-pixel local thickness: the diameter of the largest disk inside the ink that covers the pixel.

    This is the honest way to ask "how wide is this stroke". Measuring width at
    skeleton pixels is biased low: a skeleton runs to the very tip of a round
    stroke end and through every junction, where the width tapers toward 1 px
    whatever the stroke weight was. A pixel's local thickness does not taper at
    a cap, because the disk that covers the cap is the stroke's own.
    """
    ink = ink.astype(bool)
    out = np.zeros(ink.shape, np.float32)
    if not ink.any():
        return out
    dt = ndi.distance_transform_edt(ink)
    top = min(float(max_r), float(dt.max()))
    # Fractional radii, in quarter pixels. Whole-pixel steps floor a diagonal
    # stroke's true half-width (2.83 for a 5 px band at 45 degrees) down to 2
    # and read it as 3 px wide.
    r = top
    while r >= 1.0:
        centres = dt >= r
        if centres.any():
            # The pixels with dt >= r are only a sparse dotted line along a diagonal
            # stroke (a distance transform on a grid is not smooth), so covering them
            # with a disk of exactly r leaves gaps that then read as thin. r + 0.5
            # closes those gaps without reaching past the stroke.
            covered = ndi.distance_transform_edt(~centres) <= r + 0.5
            out[covered & ink & (out == 0)] = 2 * r - 1
        r -= 0.25
    out[ink & (out == 0)] = 1.0  # sub-pixel slivers
    return out


def rung_share(ink: np.ndarray, rungs: list[float], slack: float = 1.0) -> dict:
    """Share of ink AREA whose local thickness is within `slack` px of a rung, and the share thinner than the thinnest."""
    t = local_thickness(ink)
    live = t[t > 0]
    if not live.size:
        return {"on_rung": 0.0, "thinner": 0.0, "thicker": 0.0}
    near = np.min(np.abs(live[:, None] - np.array(rungs)[None, :]), axis=1) <= slack
    return {
        "on_rung": float(near.mean()),
        "thinner": float((live < min(rungs) - slack).mean()),
        "thicker": float((live > max(rungs) + slack).mean()),
    }
