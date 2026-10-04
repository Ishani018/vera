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
    min_iou: float = 0.80
    max_shapes: int = 250
    max_nodes: int = 5000
    close_px: int = 2


@dataclass
class CheckResult:
    passed: bool
    iou: float
    shapes: int
    nodes: int
    ink_fraction: float
    reasons: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "passed": self.passed,
            "iou": round(self.iou, 4),
            "shapes": self.shapes,
            "nodes": self.nodes,
            "ink_fraction": round(self.ink_fraction, 4),
            "reasons": self.reasons,
        }


def rasterise(svg: str, width: int, height: int) -> np.ndarray:
    """Alpha channel of the SVG at the given size, 0..255."""
    png = resvg_py.svg_to_bytes(svg_string=svg, width=width, height=height)
    return np.array(Image.open(io.BytesIO(bytes(png))).convert("RGBA"))[:, :, 3]


def silhouette(alpha: np.ndarray, close_px: int = 2) -> np.ndarray:
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


def check(svg: str, shapes: int, nodes: int, mask: np.ndarray, p: CheckParams | None = None) -> CheckResult:
    """`mask` is the cutout mask (any dtype, >127 = subject) at the SVG's pixel size."""
    p = p or CheckParams()
    h, w = mask.shape
    alpha = rasterise(svg, w, h) if shapes else np.zeros((h, w), np.uint8)
    sil = silhouette(alpha, p.close_px)
    score = iou(sil, mask > 127)
    reasons = []
    if shapes == 0:
        reasons.append("no shapes survived")
    if score < p.min_iou:
        reasons.append(f"silhouette IoU {score:.2f} is below {p.min_iou:.2f}")
    if shapes > p.max_shapes:
        reasons.append(f"{shapes} shapes is over the ceiling of {p.max_shapes}")
    if nodes > p.max_nodes:
        reasons.append(f"{nodes} nodes is over the ceiling of {p.max_nodes}")
    return CheckResult(not reasons, score, shapes, nodes, float((alpha > 127).mean()), reasons)


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
    out = []
    for size in sizes:
        s = size / max(h, w)
        tw, th = max(1, round(w * s)), max(1, round(h * s))
        png = bytes(resvg_py.svg_to_bytes(svg_string=svg, width=tw, height=th))
        alpha = np.array(Image.open(io.BytesIO(png)).convert("RGBA"))[:, :, 3].astype(float) / 255.0
        # resvg rounds its own height, so the mask is sized to the render, not to my arithmetic
        small_mask = np.array(Image.fromarray((mask > 127).astype(np.uint8) * 255)
                              .resize((alpha.shape[1], alpha.shape[0]), Image.BOX)) > 127
        sil = ndi.binary_fill_holes(ndi.binary_closing(alpha > alpha_floor, iterations=1))
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
