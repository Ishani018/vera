"""Raw redraw -> final SVG, plus every measurement about it. No models in here.

Shared by proto.py (fresh runs) and revector.py (re-do just this step on redraws
that already exist, so tuning it never costs another 60-90 s of FLUX per picture).
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

from . import cleanup as cu
from . import vectorize
from .check import CheckParams, CheckResult, SizeTest, check, compare_overlay, fidelity, rasterise, size_tests
from .strokes import StrokeInfo, normalise, rung_share
from .styles import Style, stroke_params
from .svgdoc import parse_svg, write_svg


@dataclass
class Vectorised:
    svg: str
    result: CheckResult
    cleanup: cu.CleanupStats
    strokes: StrokeInfo
    sizes: list[SizeTest]
    fidelity: dict
    overlay: Image.Image
    rungs: dict
    seconds: dict = field(default_factory=dict)


def vectorise(raw: Image.Image, style: Style, mask: np.ndarray, params: CheckParams,
              binarise_at: int = 140) -> Vectorised:
    """`mask` is the cutout mask resized to the raw image's size."""
    t = {}
    t0 = time.perf_counter()
    grey = np.array(raw.convert("L"))
    ink = grey < binarise_at
    long_edge = max(ink.shape)
    sp = stroke_params(style, long_edge)
    clean_ink, sinfo = normalise(ink, sp)
    t["strokes"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    img = Image.fromarray(np.where(clean_ink, 0, 255).astype(np.uint8), "L").convert("RGB")
    svg_raw = vectorize.trace(img, filter_speckle=style.speckle, corner_threshold=style.corner)
    t["trace"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    doc, st = cu.cleanup(parse_svg(svg_raw), style.cleanup)
    svg = write_svg(doc, smooth=True)
    t["cleanup"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    res = check(svg, st.end_shapes, st.end_nodes, mask, params)
    sizes = size_tests(svg, mask, sinfo.weights_px)
    fid = fidelity(svg, ink)
    overlay = compare_overlay(svg, ink)
    h, w = ink.shape
    rungs = rung_share(rasterise(svg, w, h) > 127, sinfo.weights_px)
    t["check"] = time.perf_counter() - t0
    return Vectorised(svg, res, st, sinfo, sizes, fid, overlay, rungs, t)
