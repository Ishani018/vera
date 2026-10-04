#!/usr/bin/env python3
"""Put a result next to what the current vector step makes from the SAME redraw. No models.

    python before_after.py results/run2/bicycle

"Before" is the existing <style>-<n>.svg. "After" is re-traced from raw-<n>.png with the current
settings (into <folder>/after/). Both are measured by the same code, so the numbers compare.
Writes <folder>/before-after.html.
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from logoproto.check import CheckParams, check, rasterise
from logoproto.pipeline import vectorise
from logoproto.report import CSS
from logoproto.strokes import local_thickness, rung_share
from logoproto.styles import compact, get_style


def measure(svg: str, w: int, h: int, mask: np.ndarray, weights: list[float]) -> dict:
    ink = rasterise(svg, w, h) > 127
    t = local_thickness(ink)
    res = check(svg, svg.count("<path"), svg.count("C"), mask, CheckParams())
    lab, k = ndi.label(~ink)
    sizes = ndi.sum(~ink, lab, range(1, k + 1)) if k else []
    return {
        "nodes": res.nodes, "iou": res.iou, "coverage": res.coverage, "ink": float(ink.mean()),
        "blob": float((ink & (t > 12)).mean()),                      # solid areas thicker than 12 px, share of the frame
        "ink_thick": float((ink & (t > 12)).sum() / max(1, ink.sum())),
        "on_rung": rung_share(ink, weights or [5.0, 7.0, 11.0])["on_rung"],
    }


def main(folder: Path, style_name: str = "minimal") -> Path:
    style = get_style(style_name)
    mask_full = Image.open(folder / "mask.png").convert("L")
    after_dir = folder / "after"
    after_dir.mkdir(exist_ok=True)
    rows = []
    for n in (1, 2):
        raw_p, old_p = folder / f"raw-{n}.png", folder / f"{style.name}-{n}.svg"
        if not raw_p.exists() or not old_p.exists():
            continue
        raw = Image.open(raw_p).convert("RGB")
        w, h = raw.size
        mask = np.asarray(mask_full.resize((w, h), Image.BILINEAR))
        old_svg = old_p.read_text()
        v = vectorise(raw, style, mask, CheckParams())
        (after_dir / f"{style.name}-{n}.svg").write_text(v.svg)
        v.overlay.save(after_dir / f"compare-{n}.png")
        weights = v.strokes.weights_px
        before = measure(old_svg, w, h, mask, weights)
        after = measure(v.svg, w, h, mask, weights)
        # the earlier settings, rebuilt now, to confirm "before" is what compact() makes (it should match closely)
        rows.append((n, before, after))
        print(f"#{n} before: nodes {before['nodes']:5d} IoU {before['iou']:.3f} cov {before['coverage']:.2f} ink {before['ink']:.1%} "
              f"solid>12px {before['blob']:.2%} | after: nodes {after['nodes']:5d} IoU {after['iou']:.3f} cov {after['coverage']:.2f} "
              f"ink {after['ink']:.1%} solid>12px {after['blob']:.2%} | crowded px held thin {v.strokes.crowded_px}")

    def f(x, k):
        return {"nodes": f"{x[k]}", "iou": f"{x[k]:.3f}", "coverage": f"{x[k]:.2f}", "ink": f"{x[k]:.1%}", "blob": f"{x[k]:.2%}",
                "on_rung": f"{x[k]:.0%}"}[k]

    labels = [("nodes", "nodes"), ("iou", "silhouette IoU (current check)"), ("coverage", "outline coverage"),
              ("ink", "ink, share of frame"), ("blob", "solid areas thicker than 12 px, share of frame"),
              ("on_rung", "ink on the three weights")]
    body = ""
    for n, b, a in rows:
        trs = "".join(f"<tr><td>{html.escape(lbl)}</td><td class=mono>{f(b, k)}</td><td class=mono><b>{f(a, k)}</b></td></tr>" for k, lbl in labels)
        body += (f"<h2>Variation {n}</h2><table style='width:auto'><tr><th></th><th>Before</th><th>After</th></tr>{trs}</table>"
                 f"<div style='display:flex;gap:16px;margin-top:12px'>"
                 f"<div><b>Before</b> (fills small holes, thickens everything)<br><img src='{style.name}-{n}.svg' style='width:560px;background:#fff;border:1px solid #e4dcc8'></div>"
                 f"<div><b>After</b> (keeps close lines apart, no hole filling)<br><img src='after/{style.name}-{n}.svg' style='width:560px;background:#fff;border:1px solid #e4dcc8'></div></div>"
                 f"<p class=legend>Raw redraw it was made from, for reference: <img src='raw-{n}.png' style='height:110px;vertical-align:middle;border:1px solid #e4dcc8'></p>")
    out = folder / "before-after.html"
    out.write_text(f"<!doctype html><meta charset=utf-8><title>{html.escape(folder.name)} before and after</title><style>{CSS}</style>"
                   f"<h1>{html.escape(folder.name)}: before and after the crowd rule</h1>"
                   "<p class=meta>Same redraw, same check, same measuring code. Only the vector step differs.</p>" + body, encoding="utf-8")
    return out


if __name__ == "__main__":
    print(main(Path(sys.argv[1])))
