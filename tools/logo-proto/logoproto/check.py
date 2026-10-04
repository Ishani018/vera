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
