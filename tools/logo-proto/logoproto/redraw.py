"""Stage 3: redraw as flat black line art, guided by the subject's own edges.

The reference handed to FLUX.2 klein is not the photo. It is an edge map of the
cutout (black lines on white): a photo drags colour, texture and lighting into the
result, while an edge map carries only the silhouette and the main inner contours,
which is what has to be kept. The model is told in words to keep that outline.
There is no hard guarantee it does; the check stage measures whether it did.
"""
from __future__ import annotations

import gc

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from .styles import Style


def fit_size(w: int, h: int, long_edge: int = 768, mult: int = 16) -> tuple[int, int]:
    s = long_edge / max(w, h)
    return max(mult, round(w * s / mult) * mult), max(mult, round(h * s / mult) * mult)


def edge_guide(subject: Image.Image, mask: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Black contour lines on white: the outline plus the strongest inner edges."""
    rgba = subject.convert("RGBA").resize(size, Image.LANCZOS)
    m = np.asarray(mask.resize(size, Image.BILINEAR)) > 127
    white = Image.new("RGBA", size, (255, 255, 255, 255))
    grey = np.asarray(Image.alpha_composite(white, rgba).convert("L"), np.float32)
    grey = ndi.gaussian_filter(grey, 1.2)
    gx, gy = ndi.sobel(grey, axis=1), ndi.sobel(grey, axis=0)
    mag = np.hypot(gx, gy)
    inner = ndi.binary_erosion(m, iterations=6)
    cut = np.percentile(mag[inner], 88) if inner.any() else mag.max()
    edges = (mag > cut) & inner
    outline = m & ~ndi.binary_erosion(m, iterations=2)
    lines = ndi.binary_dilation(edges | outline, iterations=1)
    return Image.fromarray(np.where(lines, 0, 255).astype(np.uint8), "L").convert("RGB")


def build_prompt(style: Style, analysis: dict) -> str:
    bits = [style.prompt]
    if analysis.get("subject"):
        bits.append(f"The subject is: {analysis['subject']}.")
    if analysis.get("features"):
        bits.append("Keep these recognisable: " + "; ".join(analysis["features"]) + ".")
    if analysis.get("style_prompt"):
        bits.append(analysis["style_prompt"])
    return " ".join(bits)


class Redrawer:
    def __init__(self, quantize: int = 8):
        from mflux.models.common.config import ModelConfig
        from mflux.models.flux2.variants import Flux2KleinEdit

        self.quantize = quantize
        self.model = Flux2KleinEdit(quantize=quantize, model_config=ModelConfig.flux2_klein_4b())

    def run(self, refs: str | list[str], prompt: str, seed: int, size: tuple[int, int], steps: int = 4,
            strength: float | None = None) -> Image.Image:
        w, h = size
        paths = [refs] if isinstance(refs, str) else list(refs)
        kw = {} if strength is None else {"image_strength": strength}
        out = self.model.generate_image(seed=seed, prompt=prompt, image_paths=paths,
                                        num_inference_steps=steps, height=h, width=w, **kw)
        return out.image.convert("RGB")

    def close(self) -> None:
        del self.model
        gc.collect()
        try:
            import mlx.core as mx

            mx.clear_cache()
        except Exception:
            pass
