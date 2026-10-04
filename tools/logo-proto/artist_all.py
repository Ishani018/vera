#!/usr/bin/env python3
"""Run artist mode on a finished run's existing redraws. No model.

    python artist_all.py results/run2 results/run2-revec results/run3-artist
    python artist_all.py --report-only results/run3-artist results/run2-revec      (rebuild the report; reads notes.json)

Reads  <src>/<photo>/{raw-<n>.png, mask.png, cutout.png, variants-rescored.json}   (read only)
       <old>/<photo>/{minimal-<n>.svg, variants.json}                              (read only: the result to compare against)
Writes <dst>/<photo>/{artist-<n>.svg, detailed-<n>.svg, *-<64|32>.png, variants.json} and <dst>/report.html
Refuses to write into a folder that already exists. Two profiles per variation: minimal (cap 8) and detailed (cap 30).
"""
from __future__ import annotations

import html
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

from logoproto.artist import ARTIST_CAPS, compose, prepare
from logoproto.check import CheckParams
from logoproto.report import CSS
from logoproto.styles import get_style

PROFILES = (("artist", "minimal"), ("detailed", "detailed"))


def run(src: Path, old: Path, dst: Path) -> None:
    if dst.exists():
        raise SystemExit(f"{dst} already exists; refusing to write into it.")
    dst.mkdir(parents=True)
    style, params = get_style("minimal"), CheckParams()
    t0 = time.perf_counter()
    for d in sorted(p for p in src.iterdir() if p.is_dir() and (p / "variants-rescored.json").exists()):
        meta = json.loads((d / "variants-rescored.json").read_text())
        mask_full = Image.open(d / "mask.png").convert("L")
        subject = Image.open(d / "cutout.png")
        out = dst / d.name
        out.mkdir()
        rows = []
        for x in meta["variants"]:
            n = x["n"]
            raw = Image.open(d / f"raw-{n}.png").convert("RGB")
            w, h = raw.size
            mask = np.asarray(mask_full.resize((w, h), Image.BILINEAR))
            prep = prepare(raw, mask, subject)
            row = {"n": n, "counts": prep.counts}
            for key, profile in PROFILES:
                v = compose(prep, style, mask, params, cap=ARTIST_CAPS[profile])
                (out / f"{key}-{n}.svg").write_text(v.svg)
                sizes = []
                for s in v.sizes:
                    (out / f"{key}-{n}-{s.size}.png").write_bytes(s.png)
                    sizes.append({**s.as_dict(), "png": f"{key}-{n}-{s.size}.png"})
                row[key] = {"svg": f"{key}-{n}.svg", "check": v.result.as_dict(), "sizes": sizes, "strokes": v.stroke_count,
                            "nodes": v.node_count, "cap": v.cap, "prune": {k: v2 for k, v2 in v.prune.items() if k != "first_deltas"},
                            "table": v.table, "on_rung": v.rungs["on_rung"]}
                print(f"{d.name:14} #{n} {key:9}: {v.stroke_count:2d} strokes {v.node_count:4d} nodes | {'PASS' if v.result.passed else 'FAIL'} "
                      f"IoU {v.result.iou:.3f} cov {v.result.coverage:.2f} | 64px {v.sizes[0].iou:.2f} 32px {v.sizes[1].iou:.2f}", flush=True)
            rows.append(row)
        (out / "variants.json").write_text(json.dumps({"name": d.name, "variants": rows, "facts": meta["facts"],
                                                       "analysis": meta.get("analysis", {})}, indent=2))
    print(f"done in {time.perf_counter() - t0:.0f}s")
    report(dst, old)


def report(dst: Path, old: Path) -> Path:
    notes = json.loads((dst / "notes.json").read_text()) if (dst / "notes.json").exists() else {}
    photos = []
    for d in sorted(p for p in dst.iterdir() if p.is_dir() and (p / "variants.json").exists()):
        v = json.loads((d / "variants.json").read_text())
        ov = {r["n"]: r["new"] for r in json.loads((old / d.name / "variants.json").read_text())["variants"]}
        photos.append((d.name, v, ov))
    allv = [(n, r, ov[r["n"]]) for n, v, ov in photos for r in v["variants"]]
    mean = lambda f: float(np.mean([f(*t) for t in allv]))
    med = lambda f: float(np.median([f(*t) for t in allv]))
    def count(f):
        return sum(1 for t in allv if f(*t))

    cols = [("old (run2-revec)", lambda n, r, o: o["check"]["nodes"], None),
            ("artist, minimal", lambda n, r, o: r["artist"]["nodes"], "artist"),
            ("artist, detailed", lambda n, r, o: r["detailed"]["nodes"], "detailed")]
    def get(which, k):
        def f(n, r, o):
            if which is None:
                return {"nodes": o["check"]["nodes"], "strokes": o["check"]["shapes"], "iou": o["check"]["iou"],
                        "cov": o["check"]["coverage"], "pass": o["check"]["passed"], "s64": o["sizes"][0]["passed"],
                        "s32": o["sizes"][1]["passed"], "both": all(s["passed"] for s in o["sizes"])}[k]
            d = r[which]
            return {"nodes": d["nodes"], "strokes": d["strokes"], "iou": d["check"]["iou"], "cov": d["check"]["coverage"],
                    "pass": d["check"]["passed"], "s64": d["sizes"][0]["passed"], "s32": d["sizes"][1]["passed"],
                    "both": all(s["passed"] for s in d["sizes"])}[k]
        return f
    rows = ""
    for label, key in (("nodes, mean", "nodes"), ("nodes, median", "nodes"), ("shapes or strokes, mean", "strokes"),
                       ("outline coverage, mean", "cov"), ("silhouette IoU, mean", "iou"),
                       ("passes the check (of %d)" % len(allv), "pass"), ("passes both 64 and 32 px (of %d)" % len(allv), "both")):
        cells = ""
        for _, _, which in cols:
            f = get(which, key)
            if label.endswith("median"):
                val = f"{med(f):.0f}"
            elif key in ("pass", "both"):
                val = f"{count(f)}"
            elif key in ("cov", "iou"):
                val = f"{mean(f):.3f}"
            else:
                val = f"{mean(f):.0f}"
            cells += f"<td class=mono>{val}</td>"
        rows += f"<tr><td>{label}</td>{cells}</tr>"
    summary = ("<table style='width:auto'><tr><th></th>" + "".join(f"<th>{c[0]}</th>" for c in cols) + f"</tr>{rows}</table>")

    def cell(d, folder, key, which):
        if which is None:
            c, sz = d["check"], d["sizes"]
            head = f"{c['shapes']} shapes, <b>{c['nodes']} nodes</b>"
        else:
            c, sz = d["check"], d["sizes"]
            head = f"{d['strokes']} strokes, <b>{d['nodes']} nodes</b>"
        sizes = " &middot; ".join(f"{s['size']}px {'ok' if s['passed'] else 'FAIL'} ({s['iou']:.2f})" for s in sz)
        return (f"<td class='cell chequer'><img class=svg src='{folder}/{d['svg']}'></td>"
                f"<td class=mono>{head}<br>{'PASS' if c['passed'] else 'FAIL'} IoU {c['iou']:.3f}<br>cov {c['coverage']:.2f}<br>{sizes}</td>")
    body = ""
    for name, v, ov in photos:
        note = notes.get(name, "")
        for r in v["variants"]:
            o = ov[r["n"]]
            pr = r["artist"]["prune"]
            body += (f"<tr><td><b>{html.escape(name)}</b> #{r['n']}</td>"
                     f"<td class=cell><img src='../run2/{name}/original.jpg'></td><td class=cell><img src='../run2/{name}/raw-{r['n']}.png'></td>"
                     f"{cell(o, '../run2-revec/' + name, 'svg', None)}{cell(r['artist'], name, 'svg', 'artist')}{cell(r['detailed'], name, 'svg', 'detailed')}"
                     f"<td class=mono>{r['counts']['candidates']} candidates<br>minimal kept {r['artist']['strokes'] - r['counts']['outline_paths']} interior "
                     f"(removed {pr.get('removed', 0)} by the test)<br>detailed kept {r['detailed']['strokes'] - r['counts']['outline_paths']}</td></tr>")
        if note:
            body += f"<tr><td colspan=9 style='background:#fdf3f0'><b>{html.escape(name)}, by eye:</b> {html.escape(note)}</td></tr>"
    path = dst / "report.html"
    path.write_text(
        f"<!doctype html><meta charset=utf-8><title>artist mode</title><style>{CSS}.cell{{width:150px}}.cell img{{width:150px;max-height:150px}}</style>"
        "<h1>Artist mode next to the current default, all photos</h1>"
        "<p class=meta>The redraws are the original run's; no model was run. Old = <code>results/run2-revec</code> (outlined shapes, current default). "
        "Artist = stroked paths: a bold outline from the cutout mask plus the strongest interior strokes, three weights by role. "
        "All three are scored by the same current check.</p>" + summary +
        "<p class=meta><b>Read the 64/32 px row with care.</b> That test measures whether the silhouette survives, and the artist outline is taken from the cutout, "
        "so it passes by construction. It says nothing about whether the interior drawing still reads; the by-eye notes below do. "
        "Outline coverage is lower for artist mode on purpose: it draws the outer contour only, so thin parts of the cutout (spokes, lattice) are not covered.</p>" +
        "<h2>Every variation</h2><table><tr><th>Photo</th><th>Original</th><th>Raw redraw</th><th>Old SVG</th><th>Old</th>"
        "<th>Artist minimal</th><th></th><th>Artist detailed</th><th></th><th>Selection</th></tr>" + body.replace("<td class=cell><img src='../run2/", "<td class=cell><img src='../run2/") + "</table>",
        encoding="utf-8")
    return path


if __name__ == "__main__":
    if sys.argv[1] == "--report-only":
        print(report(Path(sys.argv[2]), Path(sys.argv[3])))
    else:
        run(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
