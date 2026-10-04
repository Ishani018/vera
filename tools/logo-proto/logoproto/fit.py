"""Fit cubic Beziers to a closed polyline: P. J. Schneider, "An Algorithm for
Automatically Fitting Digitized Curves", Graphics Gems (1990).

Written from the paper: chord-length parameterisation, least-squares control
handles, Newton-Raphson reparameterisation, and a split at the point of worst
error with a shared tangent when a single curve will not do. Corners are found
first and never smoothed across.

Nodes are curve segments, which is what an editor shows and what a logo's
complexity actually is. A smooth stretch that took forty polyline vertices is
often one segment.
"""
from __future__ import annotations

import numpy as np

Seg = tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]


def _unit(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else np.zeros_like(v)


def _bez(t: np.ndarray, p: Seg) -> np.ndarray:
    t = t[:, None]
    return ((1 - t) ** 3) * p[0] + 3 * ((1 - t) ** 2) * t * p[1] + 3 * (1 - t) * t * t * p[2] + t**3 * p[3]


def _d1(t, p):
    t = t[:, None]
    return 3 * ((1 - t) ** 2) * (p[1] - p[0]) + 6 * (1 - t) * t * (p[2] - p[1]) + 3 * t * t * (p[3] - p[2])


def _d2(t, p):
    t = t[:, None]
    return 6 * (1 - t) * (p[2] - 2 * p[1] + p[0]) + 6 * t * (p[3] - 2 * p[2] + p[1])


def _chord(pts: np.ndarray) -> np.ndarray:
    d = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    return d / d[-1] if d[-1] > 0 else np.linspace(0, 1, len(pts))


def _generate(pts, u, t1, t2) -> Seg:
    p0, p3 = pts[0], pts[-1]
    a1 = t1[None, :] * (3 * (1 - u) ** 2 * u)[:, None]
    a2 = t2[None, :] * (3 * (1 - u) * u**2)[:, None]
    c = np.array([[np.sum(a1 * a1), np.sum(a1 * a2)], [np.sum(a1 * a2), np.sum(a2 * a2)]])
    tmp = pts - (p0 * ((1 - u) ** 3 + 3 * (1 - u) ** 2 * u)[:, None] + p3 * (3 * (1 - u) * u**2 + u**3)[:, None])
    x = np.array([np.sum(a1 * tmp), np.sum(a2 * tmp)])
    det = c[0, 0] * c[1, 1] - c[0, 1] * c[1, 0]
    seg_len = np.linalg.norm(p3 - p0)
    if abs(det) > 1e-12:
        al, ar = (x[0] * c[1, 1] - x[1] * c[0, 1]) / det, (c[0, 0] * x[1] - c[1, 0] * x[0]) / det
    else:
        al = ar = 0.0
    eps = 1e-6 * seg_len
    arc = float(np.linalg.norm(np.diff(pts, axis=0), axis=1).sum())
    # A handle longer than the stretch of curve it controls is the least squares
    # blowing up on a near-singular system. Left alone it draws a hairline a
    # thousand pixels long (it did: handles of 1,000-9,000 px on 4-50 px
    # segments). Fall back to the heuristic; the error check then splits the run.
    if al < eps or ar < eps or al > arc or ar > arc:
        al = ar = seg_len / 3.0
    return p0, p0 + t1 * al, p3 + t2 * ar, p3


def _reparam(pts, u, p: Seg) -> np.ndarray:
    d = _bez(u, p) - pts
    d1, d2 = _d1(u, p), _d2(u, p)
    num = (d * d1).sum(1)
    den = (d1 * d1).sum(1) + (d * d2).sum(1)
    with np.errstate(divide="ignore", invalid="ignore"):
        nu = np.where(np.abs(den) > 1e-12, u - num / den, u)
    return np.clip(nu, 0.0, 1.0)


def _max_err(pts, u, p: Seg) -> tuple[float, int]:
    d = np.linalg.norm(_bez(u, p) - pts, axis=1)
    k = int(d[1:-1].argmax()) + 1 if len(d) > 2 else 0
    return float(d[k]), k


def fit_open(pts: np.ndarray, t1: np.ndarray, t2: np.ndarray, tol: float, depth: int = 0) -> list[Seg]:
    if len(pts) == 2:
        dist = np.linalg.norm(pts[1] - pts[0]) / 3.0
        return [(pts[0], pts[0] + t1 * dist, pts[1] + t2 * dist, pts[1])]
    u = _chord(pts)
    p = _generate(pts, u, t1, t2)
    err, split = _max_err(pts, u, p)
    if err < tol:
        return [p]
    if err < tol * tol * 4 + tol:  # close enough that refining the parameters may be enough
        for _ in range(20):
            u = _reparam(pts, u, p)
            p = _generate(pts, u, t1, t2)
            err, split = _max_err(pts, u, p)
            if err < tol:
                return [p]
    if depth > 24 or len(pts) < 4:
        return [p]
    split = min(max(split, 1), len(pts) - 2)
    tc = _unit(pts[split - 1] - pts[split + 1])
    return fit_open(pts[: split + 1], t1, tc, tol, depth + 1) + fit_open(pts[split:], -tc, t2, tol, depth + 1)


def _corners(ring: np.ndarray, angle_deg: float, reach: float) -> list[int]:
    """Indices where the outline turns sharply, judged over `reach` px each side so pixel noise is ignored."""
    n = len(ring)
    seg = np.linalg.norm(np.roll(ring, -1, axis=0) - ring, axis=1)
    arc = np.r_[0.0, np.cumsum(seg)]
    total = arc[-1]
    if total <= 0:
        return []
    idx = np.arange(n)

    def at(offset: float) -> np.ndarray:
        s = (arc[:-1] + offset) % total
        j = np.searchsorted(arc, s, side="right") - 1
        j = np.clip(j, 0, n - 1)
        f = (s - arc[j]) / np.maximum(seg[j], 1e-9)
        return ring[j] + (ring[(j + 1) % n] - ring[j]) * f[:, None]

    a, b = at(-reach) - ring, at(reach) - ring
    cos = (a * b).sum(1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1) + 1e-12)
    turn = 180.0 - np.degrees(np.arccos(np.clip(cos, -1, 1)))
    out = []
    for i in idx[turn > angle_deg]:
        win = [(i + k) % n for k in range(-3, 4)]
        if turn[i] >= turn[win].max():
            out.append(int(i))
    return out


def fit_ring(ring: np.ndarray, tol: float, corner_deg: float = 50.0, reach: float = 4.0) -> list[Seg]:
    """Closed ring -> cubic segments. A closed path with no corner is split in two and joined smoothly."""
    n = len(ring)
    if n < 4:
        return [(ring[i], ring[i], ring[(i + 1) % n], ring[(i + 1) % n]) for i in range(n)]
    cs = _corners(ring, corner_deg, reach)
    smooth_join: set[int] = set()
    if len(cs) < 2:
        far = int(np.linalg.norm(ring - ring[0], axis=1).argmax())
        cs = sorted(set(cs) | {0, far}) if len(cs) == 0 else sorted({cs[0], (cs[0] + n // 2) % n})
        smooth_join = set(cs)
    segs: list[Seg] = []
    for k, a in enumerate(cs):
        b = cs[(k + 1) % len(cs)]
        idx = np.r_[np.arange(a, b + 1)] if b > a else np.r_[np.arange(a, n), np.arange(0, b + 1)]
        run = ring[idx % n]
        if len(run) < 2:
            continue

        def tangent(i: int, sign: int) -> np.ndarray:
            look = 3
            if i in smooth_join:
                return _unit(ring[(i + sign * look) % n] - ring[(i - sign * look) % n]) * sign * -1 * -1
            j = (i + sign * look) % n
            return _unit(ring[j] - ring[i])

        t1 = _unit(ring[(a + 3) % n] - ring[a]) if a not in smooth_join else _unit(ring[(a + 3) % n] - ring[(a - 3) % n])
        t2 = _unit(ring[(b - 3) % n] - ring[b]) if b not in smooth_join else _unit(ring[(b - 3) % n] - ring[(b + 3) % n])
        segs.extend(fit_open(run, t1, t2, tol))
    return segs


def sample(segs: list[Seg], per: int = 24) -> np.ndarray:
    t = np.linspace(0, 1, per, endpoint=False)
    return np.vstack([_bez(t, s) for s in segs])
