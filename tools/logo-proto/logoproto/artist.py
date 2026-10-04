"""Artist mode: decide what to draw, the way an illustrator does, instead of tracing everything.

The standard path outlines every pixel of ink. This path works in strokes:

  1. split the redraw's ink into centreline strokes (skeleton, cut at junctions, joined across them
     where the line carries straight on) and fit one smooth Bezier path per stroke;
  2. take the OUTLINE from the cutout mask, not from the redraw: one deliberate bold path per piece
     of the subject, specks under ~1% of the area ignored;
  3. score every interior stroke for importance (length, contrast, how well it separates two forms,
     how near the outline it runs);
  4. keep only the strongest, capped per style;
  5. "would removing it hurt?": drop the strokes whose removal changes the picture least, judged on
     renders at 64 and 32 px;
  6. three weights, by role: outline heaviest, major structure medium, detail light;
  7. merge strokes that are the same line drawn twice, but never strokes that are merely close
     together (spokes);
  8. write a transparent SVG of stroked paths, never filled outlines.

Not done, on purpose: "near a feature the vision step named". The vision step names features but
does not say where they are, and finding out would mean another pass of the vision model, which was
ruled out. `feature_boxes` is the hook, tested, and unused until something provides boxes.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

from . import vectorize
from .check import (CheckParams, check, compare_overlay, fidelity, rasterise, size_tests)
from .cleanup import CleanupStats, _rdp_open, depths, signed_area
from .fit import Seg, _unit, fit_open, fit_ring
from .pipeline import Vectorised
from .strokes import StrokeInfo, drop_loose, prune_spurs, rung_share, thin
from .styles import Style, stroke_params
from .svgdoc import parse_svg

#: How many interior strokes each style keeps at most. `detailed` is not a style; it is the second profile.
ARTIST_CAPS = {"minimal": 8, "bold": 6, "cute": 10, "hand-drawn": 30, "elegant": 30, "technical": 30, "detailed": 30}

_RING = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]   # N NE E SE S SW W NW


@dataclass
class ArtistParams:
    min_len_frac: float = 0.035      # strokes shorter than this share of the long edge are marks, not strokes
    near_frac: float = 0.012         # within this share of the long edge of the outline = the outline's own line
    near_share: float = 0.6          # ...and a stroke that lies this much along it is dropped as an outline duplicate
    dup_px: float = 2.0              # two strokes this close along most of their length are one line drawn twice
    dup_share: float = 0.7
    fit_tol: float = 1.2
    outline_tol: float = 1.5
    outline_sigma_frac: float = 0.006
    speck_frac: float = 0.01         # pieces and holes smaller than this share of the subject are ignored
    holes_in_outline: bool = False   # False = the OUTER contour only, as specified. True also outlines big holes (wheel interiors)
    join_cos: float = -0.7           # two branches at a junction continue each other if their directions are this opposite
    w_len: float = 0.25
    w_contrast: float = 0.25
    w_sep: float = 0.30
    w_prox: float = 0.20
    change_stop: float = 0.02        # a stroke whose removal changes the picture by more than this stays
    change_budget: float = 0.15      # ...and the pruned picture may differ from the selected one by at most this
    min_keep: int = 2


@dataclass(eq=False)          # compared by identity: it holds arrays, and two strokes are only ever 'the same' if they are the same object
class Stroke:
    pts: np.ndarray                  # (n, 2) x, y, ordered
    closed: bool = False
    segs: list[Seg] = field(default_factory=list)
    length: float = 0.0
    parts: dict = field(default_factory=dict)   # the four importance components
    score: float = 0.0
    role: str = "detail"
    note: str = ""

    @property
    def nodes(self) -> int:
        return len(self.segs) if self.closed else len(self.segs) + 1


# ------------------------------------------------------------------ 1. strokes


def _crossing(skel: np.ndarray) -> np.ndarray:
    """Crossing number at every pixel: how many separate lines meet there. A staircase corner is 2, a junction 3+."""
    s = np.pad(skel.astype(np.uint8), 1)
    h, w = skel.shape
    ring = [s[1 + dy:1 + dy + h, 1 + dx:1 + dx + w] for dy, dx in _RING]
    a = np.zeros(skel.shape, np.int16)
    for i in range(8):
        a += ((ring[i] == 0) & (ring[(i + 1) % 8] == 1)).astype(np.int16)
    return a


def _walk(pixels: set[tuple[int, int]]) -> tuple[list[tuple[int, int]], bool]:
    """Order the pixels of one chain, end to end. Returns (ordered, closed)."""
    def nbrs(p):
        y, x = p
        return [(y + dy, x + dx) for dy, dx in _RING if (y + dy, x + dx) in pixels]

    ends = [p for p in pixels if len(nbrs(p)) <= 1]
    closed = not ends
    start = ends[0] if ends else next(iter(pixels))
    order, seen, cur, prev_dir = [start], {start}, start, np.zeros(2)
    while True:
        cand = [q for q in nbrs(cur) if q not in seen]
        if not cand:
            break
        # prefer the neighbour that carries straight on, then the nearer one
        cand.sort(key=lambda q: (abs(q[0] - cur[0]) + abs(q[1] - cur[1]) > 1,
                                 -float(np.dot(prev_dir, np.array(q, float) - np.array(cur, float)))))
        nxt = cand[0]
        prev_dir = np.array(nxt, float) - np.array(cur, float)
        order.append(nxt)
        seen.add(nxt)
        cur = nxt
    if closed:
        closed = len(order) >= 8 and np.hypot(order[0][0] - order[-1][0], order[0][1] - order[-1][1]) <= 1.5
    return order, closed


def skeleton_strokes(skel: np.ndarray, join_cos: float = -0.7) -> list[Stroke]:
    """Cut a skeleton at its junctions, then join the pieces that carry straight on through them.

    A pen does not stop at a crossing: the line from the left and the line to the right are one
    stroke. At every junction the branches are paired by how directly they continue each other
    (most opposite first, and only if they are opposite enough); what is left over ends there.
    """
    skel = skel.astype(bool)
    a = _crossing(skel)
    junction = skel & (a >= 3)
    cluster_px = ndi.binary_dilation(junction, structure=np.ones((3, 3), bool)) & skel
    clusters, nc = ndi.label(cluster_px, structure=np.ones((3, 3)))
    centroid = {k: np.array(ndi.center_of_mass(clusters == k))[::-1] for k in range(1, nc + 1)}   # (x, y)
    chains_img, nch = ndi.label(skel & ~cluster_px, structure=np.ones((3, 3)))
    objs = ndi.find_objects(chains_img)

    chains: list[dict] = []
    for k in range(1, nch + 1):
        sl = objs[k - 1]
        ys, xs = np.nonzero(chains_img[sl] == k)
        pix = {(int(y + sl[0].start), int(x + sl[1].start)) for y, x in zip(ys, xs)}
        if len(pix) < 2:
            continue
        order, closed = _walk(pix)
        pts = np.array([(x, y) for y, x in order], float)
        info = {"pts": pts, "closed": closed, "ends": [None, None]}
        for e, idx in ((0, 0), (1, len(order) - 1)):
            y, x = order[idx]
            patch = clusters[max(0, y - 1):y + 2, max(0, x - 1):x + 2]
            hit = patch[patch > 0]
            if hit.size and not closed:
                reach = min(8, len(pts) - 1)
                d = pts[reach] - pts[0] if e == 0 else pts[-1 - reach] - pts[-1]
                info["ends"][e] = (int(hit[0]), _unit(d))
        chains.append(info)

    # pair chain ends inside each cluster
    by_cluster: dict[int, list[tuple[int, int, np.ndarray]]] = {}
    for ci, ch in enumerate(chains):
        for e in (0, 1):
            if ch["ends"][e]:
                c, d = ch["ends"][e]
                by_cluster.setdefault(c, []).append((ci, e, d))
    link: dict[tuple[int, int], tuple[int, int, int]] = {}
    for c, items in by_cluster.items():
        cands = []
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                if items[i][0] == items[j][0]:
                    continue
                cos = float(np.dot(items[i][2], items[j][2]))
                if cos <= join_cos:
                    cands.append((cos, i, j))
        used: set[int] = set()
        for cos, i, j in sorted(cands):
            if i in used or j in used:
                continue
            used |= {i, j}
            (ci, ei, _), (cj, ej, _) = items[i], items[j]
            link[(ci, ei)] = (cj, ej, c)
            link[(cj, ej)] = (ci, ei, c)

    strokes: list[Stroke] = []
    done: set[int] = set()

    def run(start: int, enter_end: int) -> tuple[list[np.ndarray], bool]:
        """Follow joined chains from `start`, entering at `enter_end`; returns the points and whether it came round."""
        parts, ci, e = [], start, enter_end
        while ci not in done:
            done.add(ci)
            pts = chains[ci]["pts"]
            pts = pts if e == 0 else pts[::-1]
            parts.append(pts)
            out_end = 1 - e
            nxt = link.get((ci, out_end))
            if nxt is None:
                tail = chains[ci]["ends"][out_end]
                if tail:                                  # touches a junction it did not continue through: reach it
                    parts.append(centroid[tail[0]][None, :])
                return parts, False
            cj, ej, c = nxt
            parts.append(centroid[c][None, :])
            ci, e = cj, ej
        return parts, True

    def open_ends(ci: int) -> list[int]:
        return [e for e in (0, 1) if (ci, e) not in link and not chains[ci]["closed"]]

    for ci, ch in enumerate(chains):
        if ci in done:
            continue
        if ch["closed"]:
            done.add(ci)
            strokes.append(Stroke(ch["pts"], closed=True))
            continue
        free = open_ends(ci)
        if not free:
            continue                                      # part of a loop of joined chains: handled below
        # begin at a free end so the whole stroke is traced from one side
        start_e = free[0]
        parts, _ = run(ci, start_e)
        head = chains[ci]["ends"][start_e]
        if head and not link.get((ci, start_e)):
            parts.insert(0, centroid[head[0]][None, :])
        strokes.append(Stroke(np.vstack(parts)))
    for ci in range(len(chains)):                         # loops made of joined chains
        if ci in done or chains[ci]["closed"]:
            continue
        parts, came_round = run(ci, 0)
        strokes.append(Stroke(np.vstack(parts), closed=came_round))
    return strokes


def _corner_splits(pts: np.ndarray, deg: float, reach: float) -> list[int]:
    n = len(pts)
    if n < 5:
        return []
    arc = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    out = []
    for i in range(1, n - 1):
        a = np.searchsorted(arc, arc[i] - reach)
        b = np.searchsorted(arc, arc[i] + reach)
        if a >= i or b <= i or b >= n:
            continue
        u, v = pts[a] - pts[i], pts[b] - pts[i]
        c = float(np.dot(u, v) / (np.linalg.norm(u) * np.linalg.norm(v) + 1e-12))
        if 180.0 - np.degrees(np.arccos(np.clip(c, -1, 1))) > deg:
            out.append(i)
    # keep only the sharpest of a cluster of neighbouring candidates
    keep: list[int] = []
    for i in out:
        if keep and i - keep[-1] <= 3:
            continue
        keep.append(i)
    return keep


def fit_stroke(pts: np.ndarray, tol: float, closed: bool = False, corner_deg: float = 60.0) -> tuple[np.ndarray, list[Seg]]:
    """One smooth path through a pixel-traced stroke: smooth the staircase, thin it, split at real corners, fit Beziers."""
    pts = np.asarray(pts, float)
    if len(pts) < 2:
        return pts, []
    if closed and len(pts) >= 8:
        k = 5
        pad = np.vstack([pts[-k:], pts, pts[:k]])
        sm = np.stack([np.convolve(pad[:, d], np.ones(5) / 5, mode="same") for d in (0, 1)], 1)[k:-k]
        ring = sm[:: max(1, 1)]
        from .cleanup import simplify_ring
        ring = simplify_ring(ring, 0.6)
        return sm, fit_ring(ring, tol)
    if len(pts) >= 7:
        padded = np.concatenate([np.repeat(pts[:1], 2, axis=0), pts, np.repeat(pts[-1:], 2, axis=0)])
        sm = np.stack([np.convolve(padded[:, d], np.ones(5) / 5, mode="valid") for d in (0, 1)], 1)
        sm[0], sm[-1] = pts[0], pts[-1]
    else:
        sm = pts
    simple = _rdp_open(sm, 0.6)
    if len(simple) < 2:
        return sm, []
    cuts = [0, *[int(np.argmin(np.linalg.norm(simple - sm[i], axis=1))) for i in _corner_splits(sm, corner_deg, 5.0)], len(simple) - 1]
    cuts = sorted(set(cuts))
    segs: list[Seg] = []
    for a, b in zip(cuts[:-1], cuts[1:]):
        run = simple[a:b + 1]
        if len(run) < 2:
            continue
        k = min(3, len(run) - 1)
        t1 = _unit(run[k] - run[0])
        t2 = _unit(run[-1 - k] - run[-1])
        segs.extend(fit_open(run, t1, t2, tol))
    return sm, segs


# ------------------------------------------------------------------ 2. outline


def _resample_closed(ring: np.ndarray, step: float = 1.0) -> np.ndarray:
    closed = np.vstack([ring, ring[:1]])
    seg = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    arc = np.r_[0.0, np.cumsum(seg)]
    n = max(8, int(arc[-1] / step))
    t = np.linspace(0, arc[-1], n, endpoint=False)
    return np.stack([np.interp(t, arc, closed[:, d]) for d in (0, 1)], 1)


def subject_shape(mask: np.ndarray, speck_frac: float = 0.01, with_holes: bool = False) -> np.ndarray:
    """The cutout as one clean silhouette: pieces and holes under speck_frac of the subject are dropped.

    With `with_holes=True`, holes big enough (a bicycle's wheel interiors) are kept as holes, so the outline also
    follows them. That is NOT the default: on a lattice (a ferris wheel) it outlines every gap between the
    spokes and the result is a heavy clump, so the default is the outer contour only.
    """
    m = np.asarray(mask) > 127
    filled = ndi.binary_fill_holes(m)
    total = max(1, int(filled.sum()))
    lab, n = ndi.label(filled)
    keep = np.zeros_like(filled)
    for k in range(1, n + 1):
        comp = lab == k
        if comp.sum() >= speck_frac * total:
            keep |= comp
    holes = filled & ~m
    hl, hn = ndi.label(holes)
    big = np.zeros_like(filled)
    for k in range(1, hn + 1):
        h = hl == k
        if h.sum() >= speck_frac * total:
            big |= h
    return (keep & ~big) if with_holes else keep


def outline_paths(shape: np.ndarray, long_edge: int, p: ArtistParams) -> list[list[Seg]]:
    """One smooth closed path per boundary of the silhouette: smoothed, then fitted, a deliberate bold shape."""
    if not shape.any():
        return []
    img = Image.fromarray(np.where(shape, 0, 255).astype(np.uint8), "L").convert("RGB")
    doc = parse_svg(vectorize.trace(img, filter_speckle=0, mode="none"))
    out: list[list[Seg]] = []
    from .cleanup import simplify_ring
    for sh in doc.shapes:
        for ring in sh.rings:
            if len(ring) < 8 or abs(signed_area(ring)) < p.speck_frac * shape.sum() * 0.25:
                continue
            even = _resample_closed(ring, 1.0)
            sigma = max(1.5, p.outline_sigma_frac * long_edge)
            smooth = ndi.gaussian_filter1d(even, sigma, axis=0, mode="wrap")
            out.append(fit_ring(simplify_ring(smooth, 0.5), p.outline_tol))
    return out


# ---------------------------------------------------------------- 3. importance


def _rgb2lab(rgb: np.ndarray) -> np.ndarray:
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def resample_open(pts: np.ndarray, step: float = 2.0) -> np.ndarray:
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    arc = np.r_[0.0, np.cumsum(seg)]
    if arc[-1] <= 0:
        return pts[:1]
    t = np.arange(0, arc[-1], step)
    return np.stack([np.interp(t, arc, pts[:, d]) for d in (0, 1)], 1)


def path_length(pts: np.ndarray, closed: bool = False) -> float:
    q = np.vstack([pts, pts[:1]]) if closed else pts
    return float(np.linalg.norm(np.diff(q, axis=0), axis=1).sum())


def _bilinear(img: np.ndarray, xy: np.ndarray) -> np.ndarray:
    x = np.clip(xy[:, 0], 0, img.shape[1] - 1.001)
    y = np.clip(xy[:, 1], 0, img.shape[0] - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[:, None] if img.ndim == 3 else (x - x0), (y - y0)[:, None] if img.ndim == 3 else (y - y0)
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
            + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


def score_strokes(strokes: list[Stroke], subject_rgb: np.ndarray, shape: np.ndarray, long_edge: int,
                  p: ArtistParams, feature_boxes: list[tuple[float, float, float, float]] | None = None) -> None:
    """Fill in each stroke's importance and its four components, each 0..1. Higher means it matters more.

    length    : how far it runs, against 30% of the long edge.
    contrast  : how hard the photograph's own edge is where the stroke lies (gradient of the subject).
    separation: how different the two forms on either side of it are (Lab distance, ~6 px each side).
    proximity : how near the outline it runs, so rim and contour lines outrank a mark in the middle of a form.
                If feature boxes are supplied, being near one counts as being near the outline.
    """
    h, w = shape.shape
    lab = _rgb2lab(subject_rgb)
    lab_blur = np.stack([ndi.gaussian_filter(lab[..., k], 2.5) for k in range(3)], -1)
    grey = lab[..., 0]
    gy, gx = ndi.sobel(ndi.gaussian_filter(grey, 1.2), axis=0), ndi.sobel(ndi.gaussian_filter(grey, 1.2), axis=1)
    grad = ndi.maximum_filter(np.hypot(gx, gy), size=5)
    boundary = shape & ~ndi.binary_erosion(shape)
    dist = ndi.distance_transform_edt(~boundary)
    side = max(4.0, 0.008 * long_edge)

    raw = {"length": [], "contrast": [], "sep": []}
    prox_all = []
    for st in strokes:
        pts = resample_open(st.pts, 2.0)
        if len(pts) < 2:
            for k in raw:
                raw[k].append(0.0)
            prox_all.append(0.0)
            continue
        tang = np.gradient(pts, axis=0)
        nrm = np.stack([-tang[:, 1], tang[:, 0]], 1)
        nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12
        a, b = _bilinear(lab_blur, pts + nrm * side), _bilinear(lab_blur, pts - nrm * side)
        inside = (_bilinear(shape.astype(np.float32), pts + nrm * side) > 0.5) & (_bilinear(shape.astype(np.float32), pts - nrm * side) > 0.5)
        de = np.linalg.norm(a - b, axis=1)
        raw["sep"].append(float(de[inside].mean()) if inside.any() else 0.0)
        raw["contrast"].append(float(_bilinear(grad.astype(np.float32), pts).mean()))
        raw["length"].append(path_length(st.pts, st.closed))
        d_out = float(_bilinear(dist.astype(np.float32), pts).mean())
        prox = float(np.exp(-d_out / (0.10 * long_edge)))
        if feature_boxes:
            dists = []
            for x0, y0, x1, y1 in feature_boxes:
                bx0, bx1, by0, by1 = x0 * w, x1 * w, y0 * h, y1 * h
                dx = np.maximum(np.maximum(bx0 - pts[:, 0], pts[:, 0] - bx1), 0)
                dy = np.maximum(np.maximum(by0 - pts[:, 1], pts[:, 1] - by1), 0)
                dists.append(np.hypot(dx, dy).mean())
            prox = max(prox, float(np.exp(-min(dists) / (0.10 * long_edge))))
        prox_all.append(prox)
    # Rank within this picture's strokes rather than against a fixed scale: on a coloured subject every stroke is
    # "long" and every edge is "high contrast" by any absolute measure, and importance then comes out the same
    # for all of them (the first version of this scored 1.0 for length and separation on nearly every stroke).
    for k in raw:
        v = np.asarray(raw[k], float)
        r = (np.argsort(np.argsort(v)).astype(float) / max(1, len(v) - 1)) if len(v) > 1 else np.ones(len(v))
        for st, x in zip(strokes, r):
            st.parts[k] = float(x)
    for st, prox in zip(strokes, prox_all):
        st.parts["prox"] = prox
        st.score = (p.w_len * st.parts["length"] + p.w_contrast * st.parts["contrast"]
                    + p.w_sep * st.parts["sep"] + p.w_prox * prox)


# ------------------------------------------------------- 4/7. filter and merge


def drop_outline_duplicates(strokes: list[Stroke], shape: np.ndarray, long_edge: int, p: ArtistParams) -> tuple[list[Stroke], int]:
    """A stroke that mostly runs along the cutout's boundary is the outline's own line, and the outline is drawn already."""
    boundary = shape & ~ndi.binary_erosion(shape)
    dist = ndi.distance_transform_edt(~boundary).astype(np.float32)
    near = max(5.0, p.near_frac * long_edge)
    kept, dropped = [], 0
    for st in strokes:
        pts = resample_open(st.pts, 2.0)
        if len(pts) and float((_bilinear(dist, pts) <= near).mean()) >= p.near_share:
            dropped += 1
        else:
            kept.append(st)
    return kept, dropped


def merge_duplicates(strokes: list[Stroke], p: ArtistParams) -> tuple[list[Stroke], int]:
    """One line drawn twice is one line. Lines that are only NEAR each other are not: spokes stay spokes.

    Two strokes are the same line when most of the shorter one lies within dup_px of the longer one. A
    spoke is a few px away from its neighbour at the rim and converging at the hub, so it fails that
    test everywhere except right at the hub, where it is not "most of it".
    """
    order = sorted(strokes, key=lambda s: -path_length(s.pts, s.closed))
    kept: list[Stroke] = []
    trees: list[cKDTree] = []
    dropped = 0
    for st in order:
        pts = resample_open(st.pts, 2.0)
        dup = False
        if len(pts):
            for tr in trees:
                if float((tr.query(pts)[0] <= p.dup_px).mean()) >= p.dup_share:
                    dup = True
                    break
        if dup:
            dropped += 1
            continue
        kept.append(st)
        trees.append(cKDTree(resample_open(st.pts, 2.0)))
    return kept, dropped


# ------------------------------------------------- 5. would removing it hurt?


def segs_d(segs: list[Seg], closed: bool) -> str:
    if not segs:
        return ""
    f = lambda v: f"{v:.2f}".rstrip("0").rstrip(".") or "0"
    d = [f"M{f(segs[0][0][0])},{f(segs[0][0][1])}"]
    for _, c1, c2, p3 in segs:
        d.append(f"C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p3[0])},{f(p3[1])}")
    return " ".join(d) + (" Z" if closed else "")


def _layer(d: str, width: float, w: int, h: int, size: int) -> np.ndarray:
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
           f'<path d="{d}" fill="none" stroke="#000" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/></svg>')
    s = size / max(w, h)
    return rasterise(svg, max(1, round(w * s)), max(1, round(h * s))).astype(np.float32) / 255.0


def _union(layers: list[np.ndarray], shape) -> np.ndarray:
    out = np.ones(shape, np.float32)
    for a in layers:
        out *= 1.0 - a
    return 1.0 - out


def prune_by_removal(strokes: list[Stroke], outline_d: list[str], widths: dict, w: int, h: int, p: ArtistParams,
                     sizes: tuple[int, ...] = (64, 32)) -> tuple[list[Stroke], dict]:
    """Drop the strokes whose absence the picture would miss least, judged at 64 and 32 px.

    Each stroke is rendered once per size and the picture is their union (checked against a full
    render in the tests). Repeatedly: remove each stroke in turn, measure how much the small picture
    changes, and take away the one that changes it least. Stop when that least change is more than
    change_stop of the picture, or when the pruned picture has drifted change_budget from the
    selected one, whichever comes first. `widths` gives the provisional weight each stroke is judged at.
    """
    info = {"selected": len(strokes), "removed": 0, "change": 0.0, "stopped": "nothing to test"}
    if len(strokes) <= p.min_keep:
        info["stopped"] = "at the minimum"
        return strokes, info
    out_layers = {t: _union([_layer(d, widths["outline"], w, h, t) for d in outline_d], _layer("M0,0", 0, w, h, t).shape) for t in sizes} \
        if outline_d else {t: np.zeros(_layer("M0,0", 0, w, h, t).shape, np.float32) for t in sizes}
    lay = [{t: _layer(segs_d(st.segs, st.closed), widths["major"], w, h, t) for t in sizes} for st in strokes]
    keep = list(range(len(strokes)))

    def comp(idx):
        return {t: _union([out_layers[t]] + [lay[i][t] for i in idx], out_layers[t].shape) for t in sizes}

    full = comp(keep)
    norm = sum(float(a.sum()) for a in full.values()) or 1.0
    while len(keep) > p.min_keep:
        cur = comp(keep)
        deltas = {}
        for i in keep:
            rest = comp([j for j in keep if j != i])
            deltas[i] = sum(float(np.abs(cur[t] - rest[t]).sum()) for t in sizes) / norm
        i_min = min(deltas, key=deltas.get)
        info.setdefault("first_deltas", sorted(round(v, 4) for v in deltas.values()))
        trial = comp([j for j in keep if j != i_min])
        drift = sum(float(np.abs(full[t] - trial[t]).sum()) for t in sizes) / norm
        if deltas[i_min] > p.change_stop:
            info["stopped"] = f"every remaining stroke changes the picture by more than {p.change_stop:.0%}"
            break
        if drift > p.change_budget:
            info["stopped"] = f"the picture would drift more than {p.change_budget:.0%} from the selected one"
            break
        keep.remove(i_min)
        info["removed"] += 1
        info["change"] = drift
    else:
        info["stopped"] = "at the minimum"
    return [strokes[i] for i in keep], info


# ------------------------------------------------------- 6/8. weights and SVG


def assign_roles(strokes: list[Stroke]) -> None:
    """Outline is heaviest (set elsewhere). Of the interior strokes, the strongest third is major structure, the rest detail."""
    ranked = sorted(strokes, key=lambda s: -s.score)
    n_major = max(1, int(np.ceil(len(ranked) / 3))) if ranked else 0
    for i, st in enumerate(ranked):
        st.role = "major" if i < n_major else "detail"


def build_svg(outline_d: list[str], strokes: list[Stroke], w: int, h: int, widths: dict) -> str:
    """A transparent SVG of stroked paths. Nothing is filled, nothing is an outlined shape, and there is no background."""
    attrs = 'fill="none" stroke="#000000" stroke-linecap="round" stroke-linejoin="round"'
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">']
    out.append(f'<g {attrs} stroke-width="{widths["outline"]:g}" data-role="outline">')
    out += [f'<path d="{d}"/>' for d in outline_d]
    out.append("</g>")
    for role in ("major", "detail"):
        group = [s for s in strokes if s.role == role and s.segs]
        if group:
            out.append(f'<g {attrs} stroke-width="{widths[role]:g}" data-role="{role}">')
            out += [f'<path d="{segs_d(s.segs, s.closed)}"/>' for s in group]
            out.append("</g>")
    out.append("</svg>")
    return "\n".join(out)


# ----------------------------------------------------------------- the pipeline


@dataclass
class Prep:
    """Everything that does not depend on the cap, so the same redraw can be composed at several caps."""
    w: int
    h: int
    long_edge: int
    ink: np.ndarray
    shape: np.ndarray
    outline_segs: list[list[Seg]]
    strokes: list[Stroke]
    counts: dict
    seconds: dict


def prepare(raw: Image.Image, mask: np.ndarray, subject: Image.Image, p: ArtistParams | None = None,
            feature_boxes=None) -> Prep:
    p = p or ArtistParams()
    t0 = time.perf_counter()
    grey = np.array(raw.convert("L"))
    ink = grey < 140
    h, w = ink.shape
    le = max(h, w)
    skel = thin(ink)
    skel, spurs = prune_spurs(skel, max(3, int(0.012 * le)))
    min_len = p.min_len_frac * le
    skel, loose = drop_loose(skel, max(8, int(min_len * 0.6)))
    raw_strokes = skeleton_strokes(skel, p.join_cos)
    t_split = time.perf_counter() - t0

    t0 = time.perf_counter()
    cands, n_short = [], 0
    for st in raw_strokes:
        if path_length(st.pts, st.closed) < min_len:
            n_short += 1
            continue
        st.pts, st.segs = fit_stroke(st.pts, p.fit_tol, st.closed)
        if st.segs:
            st.length = path_length(st.pts, st.closed)
            cands.append(st)
    shape = subject_shape(mask, p.speck_frac, p.holes_in_outline)
    cands, n_outline_dup = drop_outline_duplicates(cands, shape, le, p)
    cands, n_merged = merge_duplicates(cands, p)
    sub = subject.convert("RGBA").resize((w, h), Image.LANCZOS)
    white = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    rgb = np.asarray(Image.alpha_composite(white, sub).convert("RGB"), np.float32)
    score_strokes(cands, rgb, shape, le, p, feature_boxes)
    t_score = time.perf_counter() - t0

    t0 = time.perf_counter()
    outline = outline_paths(shape, le, p)
    t_outline = time.perf_counter() - t0
    counts = {"skeleton_px": int(skel.sum()), "spurs_removed": spurs, "loose_removed": loose, "raw_strokes": len(raw_strokes),
              "too_short": n_short, "outline_duplicates": n_outline_dup, "merged_duplicates": n_merged,
              "candidates": len(cands), "outline_paths": len(outline)}
    return Prep(w, h, le, ink, shape, outline, cands, counts,
                {"strokes": t_split, "score": t_score, "outline": t_outline})


@dataclass
class ArtistVectorised(Vectorised):
    counts: dict = field(default_factory=dict)
    prune: dict = field(default_factory=dict)
    table: list = field(default_factory=list)
    stroke_count: int = 0
    node_count: int = 0
    cap: int = 0


def compose(prep: Prep, style: Style, mask: np.ndarray, params: CheckParams, cap: int | None = None,
            p: ArtistParams | None = None) -> ArtistVectorised:
    p = p or ArtistParams()
    cap = ARTIST_CAPS.get(style.name, 8) if cap is None else cap
    ladder = stroke_params(style, prep.long_edge).ladder
    widths = {"detail": float(ladder[0]), "major": float(ladder[1]), "outline": float(ladder[2])}
    t0 = time.perf_counter()
    ranked = sorted(prep.strokes, key=lambda s: -s.score)[:cap]
    outline_d = [segs_d(s, True) for s in prep.outline_segs]
    kept, prune = prune_by_removal([_copy(s) for s in ranked], outline_d, widths, prep.w, prep.h, p)
    assign_roles(kept)
    svg = build_svg(outline_d, kept, prep.w, prep.h, widths)
    t_prune = time.perf_counter() - t0

    t0 = time.perf_counter()
    n_strokes = len(kept) + len(prep.outline_segs)
    n_nodes = sum(s.nodes for s in kept) + sum(len(s) for s in prep.outline_segs)
    res = check(svg, n_strokes, n_nodes, mask, params)
    weights = [widths["detail"], widths["major"], widths["outline"]]
    sizes = size_tests(svg, mask, weights)
    fid = fidelity(svg, prep.ink)
    overlay = compare_overlay(svg, prep.ink)
    rungs = rung_share(rasterise(svg, prep.w, prep.h) > 127, weights)
    t_check = time.perf_counter() - t0
    cs = CleanupStats(start_shapes=prep.counts["raw_strokes"], start_nodes=prep.counts["skeleton_px"], end_shapes=n_strokes,
                      end_nodes=n_nodes, dropped_small=prep.counts["too_short"], merged_duplicates=prep.counts["merged_duplicates"],
                      simplify_eps_used=p.fit_tol)
    table = [{"role": s.role, "score": round(s.score, 3), "nodes": s.nodes, "length": round(s.length),
              **{k: round(v, 2) for k, v in s.parts.items()}} for s in sorted(kept, key=lambda s: -s.score)]
    seconds = {**prep.seconds, "prune": t_prune, "check": t_check}
    return ArtistVectorised(svg, res, cs, StrokeInfo(weights_px=weights, skeleton_px=prep.counts["skeleton_px"]), sizes, fid,
                            overlay, rungs, seconds, counts=prep.counts, prune=prune, table=table,
                            stroke_count=n_strokes, node_count=n_nodes, cap=cap)


def _copy(s: Stroke) -> Stroke:
    return Stroke(s.pts, s.closed, list(s.segs), s.length, dict(s.parts), s.score, s.role, s.note)


def vectorise_artist(raw: Image.Image, style: Style, mask: np.ndarray, params: CheckParams, subject: Image.Image,
                     cap: int | None = None, p: ArtistParams | None = None, feature_boxes=None) -> ArtistVectorised:
    """Same shape of answer as pipeline.vectorise, so everything downstream treats it alike."""
    prep = prepare(raw, mask, subject, p, feature_boxes)
    return compose(prep, style, mask, params, cap, p)
