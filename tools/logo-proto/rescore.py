#!/usr/bin/env python3
"""Score an existing run again with the current check. No models, nothing is re-traced.

    python rescore.py results/run2

Reads each <photo>/variants.json and its SVGs, writes <photo>/variants-rescored.json
and <root>/report-rescored.html, and prints old vs new per variation. The old results
are left exactly as they were. For a variation that was retried, the first attempt is
scored too, so it shows how many retries the old check caused for nothing.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from logoproto.check import CheckParams, check, size_tests
from logoproto.combined import build
from logoproto.diagnose import diagnose


def svg_size(svg: str) -> tuple[int, int]:
    m = re.search(r'width="([\d.]+)"\s+height="([\d.]+)"', svg)
    return int(float(m.group(1))), int(float(m.group(2)))


def score(svg_path: Path, mask_full: Image.Image, weights: list[float], params: CheckParams) -> tuple[dict, list[dict]]:
    svg = svg_path.read_text()
    w, h = svg_size(svg)
    mask = np.asarray(mask_full.resize((w, h), Image.BILINEAR))
    nodes = svg.count("C")                      # a node is a curve segment, as written by the fitter
    shapes = svg.count("<path")
    res = check(svg, shapes, nodes, mask, params)
    sizes = [{**s.as_dict()} for s in size_tests(svg, mask, weights)]
    return res.as_dict(), sizes


def main(root: Path, style: str = "minimal") -> None:
    params = CheckParams()
    names = []
    print(f"{'photo':16}{'#':>2}  {'old IoU':>8} {'new IoU':>8} {'coverage':>9} {'gap px':>7} {'stray':>6}  old->new   first attempt (old -> new)")
    for d in sorted(p for p in root.iterdir() if p.is_dir() and (p / "variants.json").exists()):
        v = json.loads((d / "variants.json").read_text())
        mask_full = Image.open(d / "mask.png").convert("L")
        for x in v["variants"]:
            weights = (x.get("stats") or {}).get("weights") or [5.0]
            old = x["check"]
            new, sizes = score(d / x["svg"], mask_full, weights, params)
            line = (f"{d.name:16}{x['n']:>2}  {old['iou']:>8.3f} {new['iou']:>8.3f} {new['coverage']:>9.2f} "
                    f"{str(new['gap_px']):>7} {new['stray']:>6.2f}  "
                    f"{'PASS' if old['passed'] else 'FAIL'}->{'PASS' if new['passed'] else 'FAIL'}")
            x["check_old"] = old
            x["check"] = {**old, **new, "nodes": old["nodes"], "shapes": old["shapes"]}
            x["sizes"] = [{**s, "png": next((o.get("png") for o in x["sizes"] if o["size"] == s["size"]), None)} for s in sizes]
            if x.get("attempt1"):
                a1 = d / f"minimal-{x['n']}-attempt1.svg"
                if a1.exists():
                    n1, _ = score(a1, mask_full, weights, params)
                    x["attempt1"]["check_old"] = x["attempt1"]["check"]
                    x["attempt1"]["check"] = {**x["attempt1"]["check"], **n1}
                    line += f"   {x['attempt1']['check_old']['iou']:.2f} -> {n1['iou']:.2f} {'PASS' if n1['passed'] else 'FAIL'}"
            print(line)
        v["diagnosis"] = diagnose(v["facts"], v["analysis"], v["variants"])
        (d / "variants-rescored.json").write_text(json.dumps(v, indent=2))
        names.append(d.name)
    path = build(root, style, variants_file="variants-rescored.json", out_name="report-rescored.html",
                 title_note="Scored with the edge-coverage + gap-tolerant check. The drawings are unchanged.")
    print("\n" + str(path))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
