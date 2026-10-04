#!/usr/bin/env python3
"""Logo prototype CLI.

    python proto.py photos/ --style minimal --variations 4 --out results/

Stages are run across all photos one model at a time (cutout, then analyse, then
redraw) so only one big model is in memory at once. Everything is local.
"""
from __future__ import annotations

import argparse
import gc
import json
import os
import shutil
import sys
import time
from pathlib import Path

from PIL import Image, ImageOps

from logoproto import cleanup as cu
from logoproto import vectorize
from logoproto.check import CheckParams, check
from logoproto.profile import Profile
from logoproto.report import write_report
from logoproto.styles import get_style, STYLES, ALIASES
from logoproto.svgdoc import parse_svg, write_svg

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


def args_parser() -> argparse.ArgumentParser:
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("photos", type=Path, help="folder of photos (or one image)")
    a.add_argument("--style", default="minimal", help="; ".join([*STYLES, "(alias: bold-logo)"]))
    a.add_argument("--variations", type=int, default=4)
    a.add_argument("--out", type=Path, default=Path("results"))
    a.add_argument("--seed", type=int, default=42)
    a.add_argument("--quantize", type=int, default=8, choices=[3, 4, 5, 6, 8], help="mflux quantisation bits")
    a.add_argument("--steps", type=int, default=4)
    a.add_argument("--long-edge", type=int, default=768)
    a.add_argument("--guide", default="subject", choices=["subject", "edges", "both"],
                   help="reference image(s) for the redraw: cutout on white, edge map, or both")
    a.add_argument("--strength", type=float, default=None,
                   help="mflux image_strength (unset = model default)")
    a.add_argument("--min-iou", type=float, default=CheckParams.min_iou)
    a.add_argument("--max-shapes", type=int, default=CheckParams.max_shapes)
    a.add_argument("--max-nodes", type=int, default=CheckParams.max_nodes)
    a.add_argument("--memory-limit-gb", type=float, default=28.0)
    a.add_argument("--only", help="only photos whose name contains this")
    return a


def find_photos(root: Path, only: str | None) -> list[Path]:
    files = [root] if root.is_file() else sorted(p for p in root.iterdir() if p.suffix.lower() in EXTS)
    return [p for p in files if not only or only.lower() in p.stem.lower()]


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def main() -> int:
    args = args_parser().parse_args()
    style = get_style(args.style)
    photos = find_photos(args.photos, args.only)
    if not photos:
        print(f"no photos found in {args.photos}. Put images in it and run again.", file=sys.stderr)
        return 2
    args.out.mkdir(parents=True, exist_ok=True)

    def exceed(stage: str, gb: float) -> None:
        msg = (f"STOPPED: memory reached {gb:.1f} GB during '{stage}', over the {args.memory_limit_gb:.0f} GB "
               "limit. Nothing further was run. Partial results are on disk.")
        print("\n" + msg, flush=True)
        (args.out / "STOPPED-MEMORY.txt").write_text(msg + "\n")
        os._exit(3)

    prof = Profile(limit_gb=args.memory_limit_gb, on_exceed=exceed)
    params = CheckParams(min_iou=args.min_iou, max_shapes=args.max_shapes, max_nodes=args.max_nodes)
    names = [p.stem for p in photos]
    dirs = {n: args.out / n for n in names}
    for d in dirs.values():
        d.mkdir(parents=True, exist_ok=True)
    cut: dict[str, tuple[Image.Image, Image.Image]] = {}
    analyses: dict[str, dict] = {}
    t_start = time.perf_counter()

    # ---------------------------------------------------------------- 1 cutout
    log(f"cutout: loading BiRefNet for {len(photos)} photo(s)")
    from logoproto.cutout import Cutter, subject_on_transparent

    with prof.stage("load BiRefNet"):
        cutter = Cutter()
    for p in photos:
        d = dirs[p.stem]
        with prof.stage(f"{p.stem}: cutout") as rec:
            img = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
            mask = cutter.mask(img)
            subject, cmask = subject_on_transparent(img, mask)
            rec.note = f"{img.width}x{img.height} -> {subject.width}x{subject.height}"
        small = img.copy()
        small.thumbnail((1200, 1200))
        small.save(d / "original.jpg", quality=92)
        subject.save(d / "cutout.png")
        cmask.save(d / "mask.png")
        white = Image.new("RGBA", subject.size, (255, 255, 255, 255))
        Image.alpha_composite(white, subject).convert("RGB").save(d / "subject-white.png")
        cut[p.stem] = (subject, cmask)
        log(f"cutout {p.stem}: {rec.seconds:.1f}s")
    cutter.close()
    del cutter
    gc.collect()

    # --------------------------------------------------------------- 2 analyse
    log("analyse: loading Qwen2.5-VL 7B 4-bit")
    from logoproto.analyse import Analyser

    with prof.stage("load Qwen2.5-VL"):
        analyser = Analyser()
    for p in photos:
        d = dirs[p.stem]
        with prof.stage(f"{p.stem}: analyse") as rec:
            a = analyser.run(str(d / "subject-white.png"))
            rec.note = f"attempts {a.get('attempts')}" + ("; FAILED" if a.get("error") else "")
        analyses[p.stem] = a
        (d / "analysis.json").write_text(json.dumps(a, indent=2))
        log(f"analyse {p.stem}: {rec.seconds:.1f}s -> {a.get('subject') or a.get('error')}")
    analyser.close()
    del analyser
    gc.collect()

    # ------------------------------------------------- 3-6 redraw .. check
    log(f"redraw: loading FLUX.2 klein 4B ({args.quantize}-bit)")
    from logoproto.redraw import Redrawer, build_prompt, edge_guide, fit_size

    with prof.stage("load FLUX.2 klein"):
        redrawer = Redrawer(quantize=args.quantize)

    summary = []
    for p in photos:
        name, d = p.stem, dirs[p.stem]
        subject, cmask = cut[name]
        size = fit_size(subject.width, subject.height, args.long_edge)
        guide = edge_guide(subject, cmask, size)
        guide_path = d / "guide.png"
        guide.save(guide_path)
        subj_path = d / "subject-guide.png"
        white = Image.new("RGBA", subject.size, (255, 255, 255, 255))
        Image.alpha_composite(white, subject.convert("RGBA")).convert("RGB").resize(size, Image.LANCZOS).save(subj_path)
        refs = {"subject": [str(subj_path)], "edges": [str(guide_path)],
                "both": [str(subj_path), str(guide_path)]}[args.guide]
        prompt = build_prompt(style, analyses[name])
        mask_arr = cmask.resize(size, Image.BILINEAR)
        import numpy as np

        mask_np = np.asarray(mask_arr)
        variants = []

        def attempt(n: int, seed: int, tag: str):
            with prof.stage(f"{name}: redraw #{n}{tag}", note=f"seed {seed}") as r_redraw:
                raw = redrawer.run(refs, prompt, seed, size, args.steps, args.strength)
            t0 = time.perf_counter()
            with prof.stage(f"{name}: trace #{n}{tag}"):
                svg_raw = vectorize.trace(raw, filter_speckle=style.speckle, corner_threshold=style.corner)
            with prof.stage(f"{name}: cleanup #{n}{tag}") as r_clean:
                doc = parse_svg(svg_raw)
                doc, st = cu.cleanup(doc, style.cleanup)
                svg = write_svg(doc, smooth=True)
                r_clean.note = (f"{st.start_shapes}->{st.end_shapes} shapes, {st.start_nodes}->{st.end_nodes} nodes, "
                                f"dropped {st.dropped_small}, merged {st.merged_duplicates}, weights {st.weights_px}")
            with prof.stage(f"{name}: check #{n}{tag}") as r_check:
                res = check(svg, st.end_shapes, st.end_nodes, mask_np, params)
                r_check.note = "PASS" if res.passed else "FAIL: " + "; ".join(res.reasons)
            vec_s = time.perf_counter() - t0
            return raw, svg, res, st, r_redraw.seconds, vec_s

        for n in range(1, args.variations + 1):
            seed = args.seed + n
            raw, svg, res, st, rs, vs = attempt(n, seed, "")
            first = None
            if not res.passed:
                log(f"{name} #{n}: FAIL ({'; '.join(res.reasons)}). Retrying once with another seed")
                raw.save(d / f"raw-{n}-attempt1.png")
                (d / f"{style.name}-{n}-attempt1.svg").write_text(svg)
                first = {"seed": seed, "check": res.as_dict()}
                seed += 1000
                raw, svg, res, st, rs, vs = attempt(n, seed, " (retry)")
            raw.save(d / f"raw-{n}.png")
            (d / f"{style.name}-{n}.svg").write_text(svg)
            log(f"{name} #{n}: {'PASS' if res.passed else 'FAIL'} IoU {res.iou:.3f}, {res.shapes} shapes, "
                f"{res.nodes} nodes, redraw {rs:.1f}s")
            variants.append({
                "n": n, "seed": seed, "original": "original.jpg", "cutout": "cutout.png",
                "raw": f"raw-{n}.png", "svg": f"{style.name}-{n}.svg", "check": res.as_dict(),
                "redraw_s": rs, "vector_s": vs, "attempt1": first,
            })
        summary.append((name, variants))
        rows = [r.row() for r in prof.records if r.name.startswith(f"{name}:") or r.name.startswith("load ")]
        totals = {"seconds": time.perf_counter() - t_start, "peak_gb": prof.peak_gb(), "quant": args.quantize}
        write_report(d / "report.html", name, style.name, analyses[name], variants, rows, totals)
        (d / "timings.json").write_text(json.dumps({"stages": [r.row() for r in prof.records],
                                                    "peak_gb": prof.peak_gb(), "args": {k: str(v) for k, v in vars(args).items()}}, indent=2))
    redrawer.close()

    log(f"done in {time.perf_counter() - t_start:.0f}s, peak {prof.peak_gb():.1f} GB")
    for name, vs in summary:
        log(f"{name}: " + ", ".join(f"#{v['n']} {'PASS' if v['check']['passed'] else 'FAIL'}" for v in vs)
            + f"  -> {dirs[name] / 'report.html'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
