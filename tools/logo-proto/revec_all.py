#!/usr/bin/env python3
"""Re-vectorise a finished run with the CURRENT vector settings. No models, nothing in the source run is touched.

    python revec_all.py results/run2 results/run2-revec

Reads  <src>/<photo>/{raw-<n>.png, mask.png, variants-rescored.json}   (read only)
Writes <dst>/<photo>/{minimal-<n>.svg, minimal-<n>-<64|32>.png, compare-<n>.png, variants.json}
       <dst>/report.html   the old result next to the new one, same check and same measuring code for both.
It refuses to write into a folder that already exists, so nothing can be overwritten.
"""
from __future__ import annotations

import html
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

from logoproto.check import CheckParams, check, rasterise
from logoproto.pipeline import vectorise
from logoproto.report import CSS
from logoproto.strokes import local_thickness, rung_share
from logoproto.styles import get_style


def solid(svg: str, w: int, h: int) -> float:
    ink = rasterise(svg, w, h) > 127
    return float((ink & (local_thickness(ink) > 12)).mean())


def main(src: Path, dst: Path, style_name: str = "minimal") -> Path:
    if dst.exists():
        raise SystemExit(f"{dst} already exists; refusing to write into it. Choose a new folder.")
    style, params = get_style(style_name), CheckParams()
    dst.mkdir(parents=True)
    photos, t0 = [], time.perf_counter()
    for d in sorted(p for p in src.iterdir() if p.is_dir() and (p / "variants-rescored.json").exists()):
        old = json.loads((d / "variants-rescored.json").read_text())
        mask_full = Image.open(d / "mask.png").convert("L")
        out = dst / d.name
        out.mkdir()
        rows = []
        for x in old["variants"]:
            n = x["n"]
            raw = Image.open(d / f"raw-{n}.png").convert("RGB")
            w, h = raw.size
            mask = np.asarray(mask_full.resize((w, h), Image.BILINEAR))
            v = vectorise(raw, style, mask, params)
            (out / f"{style.name}-{n}.svg").write_text(v.svg)
            v.overlay.save(out / f"compare-{n}.png")
            sizes = []
            for s in v.sizes:
                (out / f"{style.name}-{n}-{s.size}.png").write_bytes(s.png)
                sizes.append({**s.as_dict(), "png": f"{style.name}-{n}-{s.size}.png"})
            old_svg = (d / x["svg"]).read_text()
            ow, oh = (int(float(t)) for t in __import__("re").search(r'width="([\d.]+)"\s+height="([\d.]+)"', old_svg).groups())
            old_ink = rasterise(old_svg, ow, oh) > 127
            new = {"check": v.result.as_dict(), "sizes": sizes, "on_rung": v.rungs["on_rung"], "solid": solid(v.svg, w, h),
                   "ink": float((rasterise(v.svg, w, h) > 127).mean()), "crowded_px": v.strokes.crowded_px,
                   "svg": f"{style.name}-{n}.svg"}
            oldm = {"check": x["check"], "sizes": x["sizes"], "on_rung": rung_share(old_ink, v.strokes.weights_px)["on_rung"],
                    "solid": solid(old_svg, ow, oh), "ink": float(old_ink.mean()), "svg": x["svg"]}
            rows.append({"n": n, "seed": x["seed"], "retried": bool(x.get("attempt1")), "old": oldm, "new": new})
            print(f"{d.name:14} #{n}: nodes {oldm['check']['nodes']:5d} -> {new['check']['nodes']:5d}  IoU {oldm['check']['iou']:.3f} -> {new['check']['iou']:.3f}  "
                  f"coverage {oldm['check']['coverage']:.2f} -> {new['check']['coverage']:.2f}  solid {oldm['solid']:.2%} -> {new['solid']:.2%}", flush=True)
        (out / "variants.json").write_text(json.dumps({"name": d.name, "variants": rows, "facts": old["facts"],
                                                       "analysis": old.get("analysis", {})}, indent=2))
        photos.append((d.name, old["facts"], old.get("analysis", {}), rows))
    return report(dst, photos, time.perf_counter() - t0, style.name)


def report(dst: Path, photos: list, secs: float, style: str) -> Path:
    allr = [r for _, _, _, rows in photos for r in rows]
    mean = lambda f: float(np.mean([f(r) for r in allr]))
    n_old_pass = sum(r["old"]["check"]["passed"] for r in allr)
    n_new_pass = sum(r["new"]["check"]["passed"] for r in allr)
    worse_nodes = sum(r["new"]["check"]["nodes"] > r["old"]["check"]["nodes"] for r in allr)
    sz_old = sum(all(s["passed"] for s in r["old"]["sizes"]) for r in allr)
    sz_new = sum(all(s["passed"] for s in r["new"]["sizes"]) for r in allr)

    def line(label, o, n, fmt, better):
        arrow = "better" if better(o, n) else ("same" if abs(o - n) < 1e-9 else "worse")
        cls = {"better": "pass", "worse": "fail", "same": "small"}[arrow]
        return (f"<tr><td>{label}</td><td class=mono>{fmt(o)}</td><td class=mono><b>{fmt(n)}</b></td>"
                f"<td><span class='{cls}' style='padding:1px 8px;border-radius:3px'>{arrow}</span></td></tr>")

    summary = (
        "<table style='width:auto'><tr><th>Mean over all variations</th><th>Old</th><th>New</th><th></th></tr>"
        + line("nodes", mean(lambda r: r["old"]["check"]["nodes"]), mean(lambda r: r["new"]["check"]["nodes"]), lambda v: f"{v:.0f}", lambda o, n: n < o)
        + line("solid areas thicker than 12 px (share of frame)", mean(lambda r: r["old"]["solid"]), mean(lambda r: r["new"]["solid"]), lambda v: f"{v:.2%}", lambda o, n: n < o)
        + line("outline coverage", mean(lambda r: r["old"]["check"]["coverage"]), mean(lambda r: r["new"]["check"]["coverage"]), lambda v: f"{v:.3f}", lambda o, n: n > o)
        + line("silhouette IoU", mean(lambda r: r["old"]["check"]["iou"]), mean(lambda r: r["new"]["check"]["iou"]), lambda v: f"{v:.3f}", lambda o, n: n > o)
        + line("ink on the three weights", mean(lambda r: r["old"]["on_rung"]), mean(lambda r: r["new"]["on_rung"]), lambda v: f"{v:.0%}", lambda o, n: n > o)
        + line("passes the check", n_old_pass, n_new_pass, lambda v: f"{v:.0f} of {len(allr)}", lambda o, n: n > o)
        + line("passes both size tests", sz_old, sz_new, lambda v: f"{v:.0f} of {len(allr)}", lambda o, n: n > o)
        + "</table>"
        f"<p>Nodes went <b>up</b> in {worse_nodes} of {len(allr)} variations. That is the cost of not fusing close lines. "
        f"Both columns are scored by the same current check and the same measuring code; only the vector step differs. "
        f"Re-vectorising took {secs:.0f} s and loaded no model.</p>")

    def cell(r, which, folder):
        d = r[which]
        c = d["check"]
        sz = " ".join(f"{s['size']}px {'ok' if s['passed'] else 'FAIL'}" for s in d["sizes"])
        return (f"<td class='cell chequer'><img class=svg src='{folder}/{d['svg']}'></td>"
                f"<td class=mono><b>{c['nodes']} nodes</b><br>{'PASS' if c['passed'] else 'FAIL'} IoU {c['iou']:.3f}<br>coverage {c['coverage']:.2f}"
                f"<br>solid &gt;12px {d['solid']:.2%}<br>{d['on_rung']:.0%} on weights<br>{sz}</td>")

    body = ""
    for name, facts, analysis, rows in photos:
        for r in rows:
            o, nw = r["old"]["check"], r["new"]["check"]
            d_nodes = nw["nodes"] - o["nodes"]
            body += (f"<tr><td><b>{html.escape(name)}</b> #{r['n']}<br><span class=mono>{html.escape(str(analysis.get('subject', '')))}</span></td>"
                     f"<td class=cell><img src='../run2/{name}/original.jpg'></td><td class=cell><img src='../run2/{name}/raw-{r['n']}.png'></td>"
                     f"{cell(r, 'old', '../run2/' + name)}{cell(r, 'new', name)}"
                     f"<td class=mono>{'+' if d_nodes >= 0 else ''}{d_nodes} nodes<br>solid {r['old']['solid']:.2%} &rarr; {r['new']['solid']:.2%}<br>"
                     f"cov {o['coverage']:.2f} &rarr; {nw['coverage']:.2f}</td></tr>")
    path = dst / "report.html"
    path.write_text(
        f"<!doctype html><meta charset=utf-8><title>old vs new vector step</title><style>{CSS}"
        ".cell{width:170px}.cell img{width:170px;max-height:170px}</style>"
        f"<h1>Old vector step next to the new one, all photos</h1>"
        "<p class=meta>The redraws are the original run's (no model was run). Old = <code>results/run2</code> (earlier vector settings), "
        f"new = this folder (current default: crowded lines kept apart, no hole filling), style {html.escape(style)}.</p>{summary}"
        "<h2>Every variation</h2><table><tr><th>Photo</th><th>Original</th><th>Raw redraw</th><th>Old SVG</th><th>Old</th>"
        f"<th>New SVG</th><th>New</th><th>Change</th></tr>{body}</table>", encoding="utf-8")
    return path


if __name__ == "__main__":
    print(main(Path(sys.argv[1]), Path(sys.argv[2])))
