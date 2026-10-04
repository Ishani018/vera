"""Rasterise the SVG and judge it against the cutout. PASS or FAIL, with reasons.

The cutout mask is a solid silhouette, and line art is an outline, so comparing
them pixel for pixel would always fail. The SVG's ink is therefore closed (a
small dilation) and its enclosed areas filled, which turns a closed outline into
the shape it encloses; that silhouette is what IoU is measured against.

A line drawing with a gap in its outline does not enclose anything, fills to
almost nothing, and fails. That is intended: an open outline is not a logo shape.
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field

import numpy as np
import resvg_py
from PIL import Image
from scipy import ndimage as ndi


@dataclass
class CheckParams:
    min_iou: float = 0.80        # silhouette IoU, with the gap-tolerant fill below
    min_coverage: float = 0.80   # share of the cutout's outline that has ink near it
    max_shapes: int = 250
    max_nodes: int = 5000
    gap_frac: float = 0.015      # outline gaps up to ~2x this share of the long edge are sealed by the fill
    tol_frac: float = 0.006      # "near the outline" means within this share of the long edge (>= 3 px)


@dataclass
class CheckResult:
    passed: bool
    iou: float                   # gap-tolerant silhouette IoU: the one that gates
    shapes: int
    nodes: int
    ink_fraction: float
    reasons: list[str] = field(default_factory=list)
    coverage: float = 0.0        # share of the cutout outline with ink within tol px
    legacy_iou: float = 0.0      # the old 2 px-closing IoU, kept so old and new can be compared
    gap_px: float | None = None  # the widest gap left in the outline, estimated; None = never sealed
    stray: float = 0.0           # share of the ink that is nowhere near the cutout

    def as_dict(self) -> dict:
        return {
            "passed": self.passed,
            "iou": round(self.iou, 4),
            "shapes": self.shapes,
            "nodes": self.nodes,
            "ink_fraction": round(self.ink_fraction, 4),
            "reasons": self.reasons,
            "coverage": round(self.coverage, 4),
            "legacy_iou": round(self.legacy_iou, 4),
            "gap_px": None if self.gap_px is None else round(self.gap_px, 1),
            "stray": round(self.stray, 4),
        }


def rasterise(svg: str, width: int, height: int) -> np.ndarray:
    """Alpha channel of the SVG at the given size, 0..255."""
    png = resvg_py.svg_to_bytes(svg_string=svg, width=width, height=height)
    return np.array(Image.open(io.BytesIO(png)).convert("RGBA"))[:, :, 3]


def silhouette(alpha: np.ndarray, close_px: int = 2) -> np.ndarray:
    """The shape the ink encloses. `close_px` is the gap tolerance: the ink is thickened by it,
    the enclosed areas are filled, then it is thinned back. A gap narrower than 2*close_px is sealed."""
    ink = alpha > 127
    if close_px:
        ink = ndi.binary_dilation(ink, iterations=close_px)
    filled = ndi.binary_fill_holes(ink)
    if close_px:
        filled = ndi.binary_erosion(filled, iterations=close_px)
    return filled


def iou(a: np.ndarray, b: np.ndarray) -> float:
    a, b = a.astype(bool), b.astype(bool)
    union = np.count_nonzero(a | b)
    return float(np.count_nonzero(a & b) / union) if union else 0.0


def outer_silhouette(mask: np.ndarray) -> np.ndarray:
    """The cutout with its holes filled: the outer shape.

    A bicycle's cutout has its wheels' insides cut away, and a drawing's enclosed
    area is filled, so comparing the two measured the wheel interiors (IoU 0.59 for a
    drawing that matches at 0.95). Outlines of the holes are still demanded, by coverage.
    """
    return ndi.binary_fill_holes(mask > 127)


def frame_wall(mask: np.ndarray, thickness: int = 3) -> np.ndarray:
    """Ink to add along the picture's own border wherever the cutout touches it.

    A subject cut off by the edge of the photo has no outline there, so a fill cannot
    stop and leaks out (both cats were cropped by the bottom edge). The frame is
    treated as a wall for the fill only, along the stretch where the cutout meets it.
    """
    m = mask > 127
    wall = np.zeros_like(m)
    t = thickness
    wall[:t, :] = m[:t, :].any(axis=0)
    wall[-t:, :] = m[-t:, :].any(axis=0)
    wall[:, :t] |= m[:, :t].any(axis=1)[:, None]
    wall[:, -t:] |= m[:, -t:].any(axis=1)[:, None]
    # only the stretch the cutout actually touches, not the whole edge
    touch = np.zeros_like(m)
    touch[:t, :] = m[t:2 * t, :].any(axis=0)
    touch[-t:, :] = m[-2 * t:-t, :].any(axis=0)
    touch[:, :t] |= m[:, t:2 * t].any(axis=1)[:, None]
    touch[:, -t:] |= m[:, -2 * t:-t].any(axis=1)[:, None]
    edge_only = np.zeros_like(m)
    edge_only[:t, :] = edge_only[-t:, :] = True
    edge_only[:, :t] = edge_only[:, -t:] = True
    return ndi.binary_dilation(touch & edge_only, iterations=2) & edge_only


def boundary_coverage(ink: np.ndarray, mask: np.ndarray, tol_px: int) -> float:
    """Share of the cutout's outline that has ink within tol_px.

    A band two pixels wide along the mask's edge. Where the cutout runs along the
    picture's own border there is no outline to draw, so those pixels are left out.
    Unlike a filled-area score, one small gap in the outline costs a few percent
    here, not most of the score.
    """
    m = mask > 127
    band = m & ~ndi.binary_erosion(m, iterations=2)
    inner = np.zeros_like(band)
    inner[3:-3, 3:-3] = True
    band &= inner
    if not band.any():
        return 0.0
    near = ndi.distance_transform_edt(~ink) <= tol_px
    return float(np.count_nonzero(band & near) / np.count_nonzero(band))


_GAPS = (0, 1, 2, 3, 4, 6, 8, 11, 16, 24)


def gap_estimate(alpha: np.ndarray, mask: np.ndarray, floor: float = 0.8) -> float | None:  # alpha already walled
    """The widest gap in the outline, in px: the smallest sealing tolerance (x2) at which the
    filled shape first matches the cutout (IoU >= floor). None if no tolerance in range does."""
    m = outer_silhouette(mask)
    for g in _GAPS:
        if iou(silhouette(alpha, g), m) >= floor:
            return float(2 * g)
    return None


def stray_ink(ink: np.ndarray, mask: np.ndarray, tol_px: int) -> float:
    """Share of the ink more than 2*tol_px from the cutout: lines the model drew where there is no subject."""
    if not ink.any():
        return 0.0
    far = ndi.distance_transform_edt(~outer_silhouette(mask)) > 2 * tol_px
    return float(np.count_nonzero(ink & far) / np.count_nonzero(ink))


def check(svg: str, shapes: int, nodes: int, mask: np.ndarray, p: CheckParams | None = None) -> CheckResult:
    """`mask` is the cutout mask (any dtype, >127 = subject) at the SVG's pixel size.

    Replaces a single filled-silhouette IoU. That score was a cliff: burger #1 and #2
    drew nearly the same picture, but #2's outline had a gap of a few pixels, the fill
    leaked out of it, and the score fell from 0.94 to 0.14. It now needs BOTH the outline
    to be there (coverage) and the shape it encloses to match (gap-tolerant IoU), and it
    reports the legacy number and the size of the gap so a low score explains itself.
    """
    p = p or CheckParams()
    h, w = mask.shape
    long_edge = max(h, w)
    gap = max(2, round(p.gap_frac * long_edge))
    tol = max(3, round(p.tol_frac * long_edge))
    alpha = rasterise(svg, w, h) if shapes else np.zeros((h, w), np.uint8)
    ink = alpha > 127
    m = outer_silhouette(mask)
    walled = np.where(frame_wall(mask), 255, alpha).astype(np.uint8)   # the frame closes a cropped subject
    score = iou(silhouette(walled, gap), m)
    legacy = iou(silhouette(alpha, 2), mask > 127)                    # exactly what the old check computed
    cov = boundary_coverage(ink, mask, tol)
    gap_px = gap_estimate(walled, mask)
    stray = stray_ink(ink, mask, tol)
    reasons = []
    if shapes == 0:
        reasons.append("no shapes survived")
    if cov < p.min_coverage:
        reasons.append(f"only {cov:.0%} of the cutout outline has a line near it (needs {p.min_coverage:.0%})")
    if score < p.min_iou:
        why = (f"; the outline has gaps the fill cannot seal (up to {gap * 2} px tolerated)"
               if cov >= p.min_coverage else "")
        reasons.append(f"silhouette IoU {score:.2f} is below {p.min_iou:.2f}{why}")
    if shapes > p.max_shapes:
        reasons.append(f"{shapes} shapes is over the ceiling of {p.max_shapes}")
    if nodes > p.max_nodes:
        reasons.append(f"{nodes} nodes is over the ceiling of {p.max_nodes}")
    return CheckResult(not reasons, score, shapes, nodes, float(ink.mean()), reasons, cov, legacy, gap_px, stray)


# --------------------------------------------------------------- size tests


@dataclass
class SizeTest:
    size: int           # long edge in px
    iou: float          # silhouette of the tiny render vs the cutout shrunk to the same size
    thinnest_px: float  # the thinnest stroke weight at this size; under ~1 px it is a grey haze, not a line
    ink_alpha: float    # mean alpha of the ink pixels: 1.0 is crisp black, low is a faint smudge
    passed: bool
    png: bytes = b""

    def as_dict(self) -> dict:
        return {"size": self.size, "iou": round(self.iou, 3), "thinnest_px": round(self.thinnest_px, 2),
                "ink_alpha": round(self.ink_alpha, 2), "passed": self.passed}


def size_tests(svg: str, mask: np.ndarray, weights_px: list[float], sizes=(64, 32), min_iou: float = 0.75,
               alpha_floor: float = 0.1) -> list[SizeTest]:
    """Does the mark survive being small? Rendered by resvg at 64 and 32 px on the long edge.

    Measures silhouette survival: a closed outline still encloses the subject at
    this size, so the filled shape still matches the cutout. It does NOT measure
    whether inner detail is legible, and fine interior lines will not be. The
    thinnest-stroke and ink-alpha columns say how much of the drawing has faded.
    """
    h, w = mask.shape
    outer = outer_silhouette(mask)          # the same two fixes as check(): holes filled, and the frame is a wall
    out = []
    for size in sizes:
        s = size / max(h, w)
        tw, th = max(1, round(w * s)), max(1, round(h * s))
        png = bytes(resvg_py.svg_to_bytes(svg_string=svg, width=tw, height=th))
        alpha = np.array(Image.open(io.BytesIO(png)).convert("RGBA"))[:, :, 3].astype(float) / 255.0
        # resvg rounds its own height, so the mask is sized to the render, not to my arithmetic
        small_mask = np.array(Image.fromarray(outer.astype(np.uint8) * 255)
                              .resize((alpha.shape[1], alpha.shape[0]), Image.BOX)) > 127
        wall = frame_wall(small_mask.astype(np.uint8) * 255, thickness=1)
        g = max(1, round(0.015 * size))
        binary = ((alpha > alpha_floor) | wall).astype(np.uint8) * 255
        sil = silhouette(binary, g)
        score = iou(sil, small_mask)
        inked = alpha > alpha_floor
        out.append(SizeTest(
            size, score, min(weights_px or [0.0]) * s, float(alpha[inked].mean()) if inked.any() else 0.0,
            score >= min_iou, png,
        ))
    return out


# ----------------------------------------------------------------- fidelity


def fidelity(svg: str, raw_ink: np.ndarray, tol_px: int = 3) -> dict:
    """How faithful is the final SVG to the raw redraw, on skeletons so thickness cannot skew it.

    on_redraw: share of the final SVG's line length that lies on a line the model drew
               (low means the clean-up invented lines).
    kept:      share of the redraw's line length that survived (low means a lot was
               dropped, which is intended for minimal but should be seen).
    """
    from .strokes import thin

    h, w = raw_ink.shape
    final = rasterise(svg, w, h) > 127
    a, b = thin(final), thin(raw_ink)
    near_raw = ndi.distance_transform_edt(~raw_ink) <= tol_px
    near_final = ndi.distance_transform_edt(~final) <= tol_px
    return {
        "on_redraw": float((a & near_raw).sum() / max(1, a.sum())),
        "kept": float((b & near_final).sum() / max(1, b.sum())),
    }


def compare_overlay(svg: str, raw_ink: np.ndarray, tol_px: int = 3) -> Image.Image:
    """Where the final SVG's lines run vs where the redraw's did, drawn on centrelines.

    Strokes are deliberately made thicker than the redraw's hairlines, so comparing
    raw pixels would paint everything blue and make a faithful result look invented.
    Centrelines are compared instead: dark where both have a line (within tol_px),
    red where only the redraw has one (dropped), blue where only the SVG has one.
    """
    from .strokes import thin

    h, w = raw_ink.shape
    final = rasterise(svg, w, h) > 127
    a, b = thin(raw_ink), thin(final)
    near_final = ndi.distance_transform_edt(~final) <= tol_px
    near_raw = ndi.distance_transform_edt(~raw_ink) <= tol_px
    img = np.full((h, w, 3), 255, np.uint8)
    raw_only, svg_only, both = a & ~near_final, b & ~near_raw, (a & near_final) | (b & near_raw)
    grow = lambda m: ndi.binary_dilation(m, iterations=1)
    img[grow(both)] = (40, 40, 40)
    img[grow(raw_only)] = (214, 69, 48)
    img[grow(svg_only)] = (40, 90, 200)
    return Image.fromarray(img, "RGB")
