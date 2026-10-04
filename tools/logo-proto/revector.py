#!/usr/bin/env python3
"""Redo only the vector step on redraws that already exist. No models, no GPU.

    python revector.py results/pancake --style minimal

Reads  results/<name>/{mask.png, cutout.png, original.jpg, raw-<n>.png, analysis.json}
Writes results/<name>/v2/...  and  results/<name>/report-v2.html
Nothing already there is overwritten or deleted.
"""
from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

import numpy as np
from PIL import Image

from logoproto.check import CheckParams
from logoproto.pipeline import vectorise
from logoproto.report import write_report
from logoproto.styles import get_style


def run(folder: Path, style_name: str, params: CheckParams, out_name: str = "v2") -> Path:
    style = get_style(style_name)
    out = folder / out_name
    out.mkdir(exist_ok=True)
    mask_full = Image.open(folder / "mask.png").convert("L")
    a2 = folder / out_name / "analysis.json"
    a1 = folder / "analysis.json"
    analysis = json.loads(a2.read_text()) if a2.exists() else (json.loads(a1.read_text()) if a1.exists() else {})
    old = json.loads((folder / "timings.json").read_text()) if (folder / "timings.json").exists() else {}
    seeds = {}
    vj = folder / "variants.json"
    if vj.exists():                                   # a run made by run_all.py / proto.py keeps its seeds here
        seeds = {x["n"]: str(x["seed"]) for x in json.loads(vj.read_text()).get("variants", [])}
    for r in old.get("stages", []):
        m = re.match(r".*redraw #(\d+)( \(retry\))?$", r["stage"])
        if m:
            seeds[int(m.group(1))] = (r.get("note") or "").replace("seed ", "")
    variants, t_all = [], time.perf_counter()
    for raw_path in sorted(folder.glob("raw-*.png"), key=lambda p: p.name):
        m = re.fullmatch(r"raw-(\d+)\.png", raw_path.name)
        if not m:
            continue  # raw-<n>-attempt1.png is a kept failure, not a variation
        n = int(m.group(1))
        raw = Image.open(raw_path).convert("RGB")
        mask = np.asarray(mask_full.resize(raw.size, Image.BILINEAR))
        v = vectorise(raw, style, mask, params)
        stem = f"{style.name}-{n}"
        (out / f"{stem}.svg").write_text(v.svg)
        v.overlay.save(out / f"compare-{n}.png")
        sizes = []
        for s in v.sizes:
            (out / f"{stem}-{s.size}.png").write_bytes(s.png)
            sizes.append({**s.as_dict(), "png": f"{out_name}/{stem}-{s.size}.png"})
        variants.append({
            "n": n, "seed": seeds.get(n, "?"), "original": "original.jpg", "cutout": "cutout.png",
            "raw": raw_path.name, "compare": f"{out_name}/compare-{n}.png", "svg": f"{out_name}/{stem}.svg",
            "check": v.result.as_dict(), "sizes": sizes, "fidelity": v.fidelity,
            "stats": {"weights": v.strokes.weights_px, "eps": v.cleanup.simplify_eps_used,
                      "over_budget": v.cleanup.over_budget, "rungs": v.rungs,
                      "budget": style.cleanup.node_budget},
            "redraw_s": 0.0, "vector_s": sum(v.seconds.values()), "attempt1": None,
        })
        print(f"#{n}: {'PASS' if v.result.passed else 'FAIL'}  nodes {v.cleanup.start_nodes}->{v.result.nodes}  "
              f"IoU {v.result.iou:.3f}  weights {v.strokes.weights_px}  "
              f"sizes " + ", ".join(f"{s.size}px IoU {s.iou:.2f} {'ok' if s.passed else 'FAIL'}" for s in v.sizes)
              + f"  on-redraw {v.fidelity['on_redraw']:.0%} kept {v.fidelity['kept']:.0%}  "
              f"vector {sum(v.seconds.values()):.1f}s", flush=True)
    rows = [{"stage": f"vector #{v['n']}", "seconds": v["vector_s"], "peak_rss_gb": 0, "peak_mlx_gb": 0,
             "note": "no models loaded"} for v in variants]
    report = folder / f"report-{out_name}.html"
    write_report(report, folder.name, style.name, analysis, variants, rows,
                 {"seconds": time.perf_counter() - t_all, "peak_gb": 0, "quant": 8},
                 note="vector step only: the redraws are the original run's, re-traced")
    return report


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("folder", type=Path)
    a.add_argument("--style", default="minimal")
    a.add_argument("--out-name", default="v2")
    a.add_argument("--min-iou", type=float, default=CheckParams.min_iou)
    a.add_argument("--max-nodes", type=int, default=CheckParams.max_nodes)
    a.add_argument("--max-shapes", type=int, default=CheckParams.max_shapes)
    args = a.parse_args()
    print(run(args.folder, args.style, CheckParams(args.min_iou, args.max_shapes, args.max_nodes), args.out_name))
