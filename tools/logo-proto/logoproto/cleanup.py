"""Clean a traced SVG so it reads as deliberate line art. Pure geometry: no models.

Order matters and is fixed: drop specks, merge duplicates, simplify nodes, snap
stroke widths to three weights. Every step reports what it did, so the report can
say "dropped 41 specks" rather than just "cleaned".

About "snap strokes to 3 weights": VTracer returns filled outlines, not strokes,
so a stroke's width is estimated from its outline as 2 x area / perimeter (exact
for a uniform ribbon) and the outline is then moved along its vertex normals to
the nearest of three widths. That is an approximation. It is good for ribbons and
bad where strokes cross or taper hard; the check stage is what catches a result
it has damaged.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .svgdoc import Doc, Shape


@dataclass
class CleanupParams:
    min_area_frac: float = 0.0002   # of the picture's area; smaller shapes are specks
    min_extent_px: float = 4.0      # a shape whose longest side is below this is a speck
    simplify_eps: float = 0.8       # px, Douglas-Peucker tolerance
    weights: int = 3
    fill_frac: float = 0.06         # width above this share of the short side is a solid fill, not a stroke
    dup_iou: float = 0.9
    dup_centroid_px: float = 2.0
    dup_area_ratio: float = 0.08


@dataclass
class CleanupStats:
    start_shapes: int = 0
    start_nodes: int = 0
    dropped_small: int = 0
    merged_duplicates: int = 0
    nodes_after_simplify: int = 0
    weights_px: list[float] = field(default_factory=list)
    snapped: int = 0
    end_shapes: int = 0
    end_nodes: int = 0


# ------------------------------------------------------------------ geometry


def signed_area(ring: np.ndarray) -> float:
    x, y = ring[:, 0], ring[:, 1]
    return 0.5 * float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def perimeter(ring: np.ndarray) -> float:
    return float(np.linalg.norm(np.roll(ring, -1, axis=0) - ring, axis=1).sum())


def _contains(ring: np.ndarray, p: np.ndarray) -> bool:
    x, y = p
    xs, ys = ring[:, 0], ring[:, 1]
    xs2, ys2 = np.roll(xs, -1), np.roll(ys, -1)
    cond = (ys > y) != (ys2 > y)
    with np.errstate(divide="ignore", invalid="ignore"):
        xint = xs + (y - ys) * (xs2 - xs) / (ys2 - ys)
    return bool(np.count_nonzero(cond & (x < xint)) % 2)


def depths(shape: Shape) -> list[int]:
    """How many other rings of this shape contain each ring: even = ink inside, odd = hole."""
    out = []
    for i, r in enumerate(shape.rings):
        out.append(sum(1 for j, o in enumerate(shape.rings) if j != i and _contains(o, r[0])))
    return out


def ink_area(shape: Shape) -> float:
    ds = depths(shape)
    return max(0.0, sum(abs(signed_area(r)) * (1 if d % 2 == 0 else -1) for r, d in zip(shape.rings, ds)))


def total_perimeter(shape: Shape) -> float:
    return sum(perimeter(r) for r in shape.rings)


def bbox(shape: Shape) -> tuple[float, float, float, float]:
    pts = np.vstack(shape.rings)
    return float(pts[:, 0].min()), float(pts[:, 1].min()), float(pts[:, 0].max()), float(pts[:, 1].max())


def stroke_width(shape: Shape) -> float:
    p = total_perimeter(shape)
    return 2.0 * ink_area(shape) / p if p > 0 else 0.0


# --------------------------------------------------------------------- steps


def drop_small(doc: Doc, p: CleanupParams) -> int:
    floor = p.min_area_frac * doc.width * doc.height
    kept = []
    for s in doc.shapes:
        x0, y0, x1, y1 = bbox(s)
        if ink_area(s) < floor or max(x1 - x0, y1 - y0) < p.min_extent_px:
            continue
        kept.append(s)
    dropped = len(doc.shapes) - len(kept)
    doc.shapes = kept
    return dropped


def _bbox_iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def merge_duplicates(doc: Doc, p: CleanupParams) -> int:
    """Two shapes that sit on top of each other and cover the same ink are one shape."""
    info = []
    for s in doc.shapes:
        pts = np.vstack(s.rings)
        info.append((bbox(s), pts.mean(axis=0), ink_area(s)))
    drop: set[int] = set()
    for i in range(len(doc.shapes)):
        if i in drop:
            continue
        for j in range(i + 1, len(doc.shapes)):
            if j in drop:
                continue
            (bi, ci, ai), (bj, cj, aj) = info[i], info[j]
            if (
                _bbox_iou(bi, bj) >= p.dup_iou
                and np.linalg.norm(ci - cj) <= p.dup_centroid_px
                and abs(ai - aj) <= p.dup_area_ratio * max(ai, aj, 1e-9)
            ):
                drop.add(j)
    doc.shapes = [s for k, s in enumerate(doc.shapes) if k not in drop]
    return len(drop)


def _rdp_open(pts: np.ndarray, eps: float) -> np.ndarray:
    n = len(pts)
    if n < 3:
        return pts
    keep = np.zeros(n, bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        seg = pts[b] - pts[a]
        norm = np.linalg.norm(seg)
        mid = pts[a + 1 : b]
        if norm < 1e-12:
            dist = np.linalg.norm(mid - pts[a], axis=1)
        else:
            dist = np.abs(seg[0] * (mid[:, 1] - pts[a][1]) - seg[1] * (mid[:, 0] - pts[a][0])) / norm
        k = int(dist.argmax())
        if dist[k] > eps:
            idx = a + 1 + k
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return pts[keep]


def simplify_ring(ring: np.ndarray, eps: float) -> np.ndarray:
    if len(ring) <= 4:
        return ring
    far = int(np.linalg.norm(ring - ring[0], axis=1).argmax())
    a = _rdp_open(ring[: far + 1], eps)
    b = _rdp_open(np.vstack([ring[far:], ring[:1]]), eps)
    out = np.vstack([a[:-1], b[:-1]])
    return out if len(out) >= 3 else ring


def simplify(doc: Doc, p: CleanupParams) -> None:
    for s in doc.shapes:
        s.rings = [simplify_ring(r, p.simplify_eps) for r in s.rings]


def _kmeans_1d(values: np.ndarray, k: int) -> np.ndarray:
    """Deterministic: start at evenly spaced quantiles, iterate to convergence."""
    k = max(1, min(k, len(np.unique(np.round(values, 3)))))
    centres = np.quantile(values, np.linspace(0.15, 0.85, k)) if k > 1 else np.array([values.mean()])
    for _ in range(50):
        assign = np.abs(values[:, None] - centres[None, :]).argmin(1)
        new = np.array([values[assign == c].mean() if np.any(assign == c) else centres[c] for c in range(k)])
        if np.allclose(new, centres, atol=1e-4):
            break
        centres = new
    return np.sort(centres)


def _offset_ring(ring: np.ndarray, d: float, grow_outward: bool) -> np.ndarray:
    """Move every edge `d` px along its outward normal, joining at mitred corners.

    A vertex normal is not enough: at a 90 degree corner it points along the
    diagonal, so moving it `d` moves each adjoining edge only d/sqrt(2). The miter
    vector (n1 + n2) / (1 + n1.n2) moves both edges exactly `d`. It is capped,
    so a very sharp spike cannot shoot off across the picture.
    """
    prev, nxt = np.roll(ring, 1, axis=0), np.roll(ring, -1, axis=0)
    sign = 1.0 if signed_area(ring) > 0 else -1.0

    def edge_normal(a, b):
        e = b - a
        n = np.stack([e[:, 1], -e[:, 0]], axis=1) * sign  # outward for this ring
        return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-12)

    n1, n2 = edge_normal(prev, ring), edge_normal(ring, nxt)
    denom = np.maximum(1.0 + (n1 * n2).sum(1, keepdims=True), 0.25)  # miter limit 4x
    return ring + (n1 + n2) / denom * d * (1.0 if grow_outward else -1.0)


def snap_weights(doc: Doc, p: CleanupParams, stats: CleanupStats) -> None:
    limit = p.fill_frac * min(doc.width, doc.height)
    widths = [(i, stroke_width(s)) for i, s in enumerate(doc.shapes)]
    strokes = [(i, w) for i, w in widths if 0 < w <= limit]
    if not strokes:
        return
    centres = _kmeans_1d(np.array([w for _, w in strokes]), p.weights)
    stats.weights_px = [round(float(c), 2) for c in centres]
    for i, w in strokes:
        target = float(centres[np.abs(centres - w).argmin()])
        s = doc.shapes[i]
        ds = depths(s)
        moved = False
        # The 2A/P estimate is slightly low for a finite ribbon, so one offset
        # lands near the target rather than on it. Re-measure and nudge again;
        # it converges in two or three passes.
        for _ in range(4):
            w_now = stroke_width(s)
            d = (target - w_now) / 2.0
            d = max(d, -0.45 * w_now)  # never eat through the stroke
            if abs(d) < 0.03:
                break
            s.rings = [_offset_ring(r, d, grow_outward=(dep % 2 == 0)) for r, dep in zip(s.rings, ds)]
            moved = True
        stats.snapped += int(moved)


def cleanup(doc: Doc, params: CleanupParams | None = None) -> tuple[Doc, CleanupStats]:
    p = params or CleanupParams()
    st = CleanupStats(start_shapes=len(doc.shapes), start_nodes=doc.nodes)
    st.dropped_small = drop_small(doc, p)
    st.merged_duplicates = merge_duplicates(doc, p)
    simplify(doc, p)
    st.nodes_after_simplify = doc.nodes
    snap_weights(doc, p, st)
    st.end_shapes = len(doc.shapes)
    st.end_nodes = doc.nodes
    return doc, st
