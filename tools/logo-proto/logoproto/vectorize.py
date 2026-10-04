"""VTracer (MIT) on a thresholded raw redraw. Potrace is GPL and is not used."""
from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
import vtracer
from PIL import Image


def binarise(img: Image.Image, threshold: int = 140) -> Image.Image:
    """Black ink on white, no greys: VTracer's binary mode wants exactly that."""
    g = np.array(img.convert("L"))
    return Image.fromarray(np.where(g < threshold, 0, 255).astype(np.uint8), "L").convert("RGB")


def trace(img: Image.Image, filter_speckle: int = 4, corner_threshold: int = 60,
          length_threshold: float = 4.0, splice_threshold: int = 45, path_precision: int = 2,
          mode: str = "none") -> str:
    """VTracer in `none` mode: the exact pixel outline, with no smoothing of its own.

    This is deliberate and measured. VTracer's `spline` and `polygon` modes both
    simplify the outline, and on thin strokes that shaves ink: after the stroke
    step had put 86-89% of the ink area on the three weights, the spline mode
    left 65-78% on them and no other VTracer parameter (speckle, corner, length,
    splice, precision) changed that. `none` leaves it untouched (86-89%), and all
    smoothing is then done by our own curve fit, which has a tolerance we control.
    """
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp, "in.png"), Path(tmp, "out.svg")
        binarise(img).save(src)
        vtracer.convert_image_to_svg_py(
            str(src), str(dst),
            colormode="binary", hierarchical="stacked", mode=mode,
            filter_speckle=filter_speckle, corner_threshold=corner_threshold,
            length_threshold=length_threshold, splice_threshold=splice_threshold,
            path_precision=path_precision,
        )
        return dst.read_text()
