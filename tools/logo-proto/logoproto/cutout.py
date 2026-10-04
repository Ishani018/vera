"""Stage 1: subject cutout with BiRefNet (MIT). Saves the mask and the subject on transparent."""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageOps

REPO = "ZhengPeng7/BiRefNet"
SIZE = 1024
MEAN, STD = np.array([0.485, 0.456, 0.406], np.float32), np.array([0.229, 0.224, 0.225], np.float32)


class Cutter:
    def __init__(self, device: str | None = None):
        import torch
        from transformers import AutoModelForImageSegmentation

        self.torch = torch
        self.device = device or ("mps" if torch.backends.mps.is_available() else "cpu")
        self.model = AutoModelForImageSegmentation.from_pretrained(REPO, trust_remote_code=True)
        self.model.to(self.device).eval()

    def mask(self, img: Image.Image) -> Image.Image:
        torch = self.torch
        rgb = ImageOps.exif_transpose(img).convert("RGB")
        small = np.asarray(rgb.resize((SIZE, SIZE), Image.BILINEAR), np.float32) / 255.0
        dtype = next(self.model.parameters()).dtype  # the checkpoint loads as float16
        x = torch.from_numpy(((small - MEAN) / STD).transpose(2, 0, 1)[None]).to(self.device, dtype)
        with torch.no_grad():
            pred = self.model(x)[-1].sigmoid().float().cpu()[0, 0].numpy()
        m = Image.fromarray((pred * 255).clip(0, 255).astype(np.uint8), "L")
        return m.resize(rgb.size, Image.BILINEAR)

    def close(self) -> None:
        del self.model
        import gc

        gc.collect()
        try:
            self.torch.mps.empty_cache()
        except Exception:
            pass


def subject_on_transparent(img: Image.Image, mask: Image.Image, pad: float = 0.06):
    """Crop to the subject (plus padding) and return (RGBA subject, L mask), both the same size."""
    rgb = ImageOps.exif_transpose(img).convert("RGB")
    m = np.asarray(mask) > 127
    if not m.any():
        raise RuntimeError("BiRefNet found no subject in this picture")
    ys, xs = np.where(m)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    px, py = int((x1 - x0) * pad), int((y1 - y0) * pad)
    box = (max(0, x0 - px), max(0, y0 - py), min(rgb.width, x1 + px), min(rgb.height, y1 + py))
    rgba = rgb.convert("RGBA")
    rgba.putalpha(mask)
    return rgba.crop(box), mask.crop(box)
