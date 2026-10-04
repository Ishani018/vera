"""Pairs for the spike: each photo and the line art the real pipeline made from it (results/run2, minimal, both variations = 22 pairs)."""
import glob, os, sys
import numpy as np
from PIL import Image
import resvg_py, io

SIZE = 512
root = os.path.join(os.path.dirname(__file__), "..", "results", "run2")
xs, ys, names = [], [], []
for folder in sorted(glob.glob(os.path.join(root, "*", ""))):
    photo = os.path.join(folder, "original.jpg")
    if not os.path.exists(photo):
        continue
    for n in (1, 2):
        svg = os.path.join(folder, f"minimal-{n}.svg")
        if not os.path.exists(svg):
            continue
        img = Image.open(photo).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
        png = resvg_py.svg_to_bytes(svg_string=open(svg).read(), width=SIZE * 2, background="white")
        line = Image.open(io.BytesIO(bytes(png))).convert("L").resize((SIZE, SIZE), Image.LANCZOS)
        xs.append(np.asarray(img, dtype=np.uint8))
        ys.append(255 - np.asarray(line, dtype=np.uint8))  # ink = bright
        names.append(f"{os.path.basename(os.path.dirname(folder))}-{n}")
os.makedirs(os.path.join(os.path.dirname(__file__), "data"), exist_ok=True)
np.savez_compressed(os.path.join(os.path.dirname(__file__), "data", "pairs.npz"), x=np.stack(xs), y=np.stack(ys), names=np.array(names))
print(len(xs), "pairs", np.stack(ys).mean() / 255, "mean ink")
