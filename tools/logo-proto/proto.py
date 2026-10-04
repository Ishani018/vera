#!/usr/bin/env python3
"""Logo prototype CLI.

    python proto.py photos/ --style minimal --variations 2 --out results/

Stages run across all photos one model at a time (cutout, then analyse, then
redraw), so only one big model is in memory at once. Everything is local.

A photo that fails at any stage is recorded in <out>/<name>/FAILED.json with the
stage and the error, the rest carry on, and the report says what happened. A
failure is never swallowed and never dressed up.
"""
from __future__ import annotations

import argparse
import gc
import json
import os
import sys
import time
import traceback
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

from logoproto.check import CheckParams
from logoproto.diagnose import diagnose, mask_facts
from logoproto.pipeline import vectorise
from logoproto.profile import Profile
from logoproto.report import write_report
from logoproto.styles import ALIASES, STYLES, compact, get_style

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
    a.add_argument("--guide", default="edges", choices=["subject", "edges", "both"],
                   help="reference image(s) for the redraw: cutout on white, edge map, or both. "
                        "Default edges: that is what every result so far was made with.")
    a.add_argument("--strength", type=float, default=None, help="mflux image_strength (unset = model default)")
    a.add_argument("--min-iou", type=float, default=CheckParams.min_iou)
    a.add_argument("--max-shapes", type=int, default=CheckParams.max_shapes)
    a.add_argument("--max-nodes", type=int, default=CheckParams.max_nodes)
    a.add_argument("--busy", action="store_true",
                   help="for busy subjects: ask for few bold shapes, no texture lines, ~10 interior lines at most")
    a.add_argument("--sparse-guide", action="store_true",
                   help="keep only the strongest interior edges in the guide image (top 3%% instead of top 12%%)")
    a.add_argument("--compact", action="store_true",
                   help="the earlier vector settings: fill small holes and thicken everything (about half the nodes, but fuses dense lines)")
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
    if args.compact:
        style = compact(style)
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
    dirs = {p.stem: args.out / p.stem for p in photos}
    for d in dirs.values():
        d.mkdir(parents=True, exist_ok=True)
    cut: dict[str, tuple[Image.Image, Image.Image]] = {}
    facts: dict[str, dict] = {}
    analyses: dict[str, dict] = {}
    failed: dict[str, dict] = {}
    results: dict[str, list[dict]] = {}
    t_start = time.perf_counter()

    def fail(name: str, stage: str, err: BaseException) -> None:
        info = {"photo": name, "stage": stage, "error": f"{type(err).__name__}: {err}",
                "trace": traceback.format_exc()[-1500:]}
        failed[name] = info
        (dirs[name] / "FAILED.json").write_text(json.dumps(info, indent=2))
        log(f"{name}: FAILED at {stage}: {info['error']}")

    # ---------------------------------------------------------------- 1 cutout
    log(f"cutout: loading BiRefNet for {len(photos)} photo(s)")
    from logoproto.cutout import Cutter, subject_on_transparent

    with prof.stage("load BiRefNet"):
        cutter = Cutter()
    for p in photos:
        d = dirs[p.stem]
        try:
            with prof.stage(f"{p.stem}: cutout") as rec:
                img = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
                mask = cutter.mask(img)
                subject, cmask = subject_on_transparent(img, mask)
                rec.note = f"{img.width}x{img.height} -> {subject.width}x{subject.height}"
        except Exception as e:
            fail(p.stem, "cutout", e)
            continue
        small = img.copy()
        small.thumbnail((1200, 1200))
        small.save(d / "original.jpg", quality=92)
        subject.save(d / "cutout.png")
        cmask.save(d / "mask.png")
        white = Image.new("RGBA", subject.size, (255, 255, 255, 255))
        Image.alpha_composite(white, subject).convert("RGB").save(d / "subject-white.png")
        cut[p.stem] = (subject, cmask)
        facts[p.stem] = mask_facts(np.asarray(cmask), img.size)
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
        if p.stem in failed:
            continue
        d = dirs[p.stem]
        try:
            with prof.stage(f"{p.stem}: analyse") as rec:
                a = analyser.run(str(d / "subject-white.png"))
                rec.note = f"attempts {a.get('attempts')}" + ("; FAILED" if a.get("error") else "")
        except Exception as e:
            fail(p.stem, "analyse", e)
            continue
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

    def one_photo(p: Path) -> None:
        name, d = p.stem, dirs[p.stem]
        subject, cmask = cut[name]
        size = fit_size(subject.width, subject.height, args.long_edge)
        guide_path, subj_path = d / "guide.png", d / "subject-guide.png"
        edge_guide(subject, cmask, size, 97.0 if args.sparse_guide else 88.0).save(guide_path)
        white = Image.new("RGBA", subject.size, (255, 255, 255, 255))
        Image.alpha_composite(white, subject.convert("RGBA")).convert("RGB").resize(size, Image.LANCZOS).save(subj_path)
        refs = {"subject": [str(subj_path)], "edges": [str(guide_path)],
                "both": [str(subj_path), str(guide_path)]}[args.guide]
        prompt = build_prompt(style, analyses[name], busy=args.busy)
        mask_np = np.asarray(cmask.resize(size, Image.BILINEAR))

        def attempt(n: int, seed: int, tag: str):
            with prof.stage(f"{name}: redraw #{n}{tag}", note=f"seed {seed}") as r_redraw:
                raw = redrawer.run(refs, prompt, seed, size, args.steps, args.strength)
            with prof.stage(f"{name}: vectorise #{n}{tag}") as r_vec:
                v = vectorise(raw, style, mask_np, params)
                r_vec.note = (f"{v.cleanup.start_shapes}->{v.cleanup.end_shapes} shapes, "
                              f"{v.cleanup.start_nodes}->{v.cleanup.end_nodes} nodes, weights {v.strokes.weights_px}, "
                              + ("PASS" if v.result.passed else "FAIL: " + "; ".join(v.result.reasons)))
            return raw, v, r_redraw.seconds, r_vec.seconds

        variants: list[dict] = []
        for n in range(1, args.variations + 1):
            seed = args.seed + n
            raw, v, rs, vs = attempt(n, seed, "")
            first = None
            if not v.result.passed:
                log(f"{name} #{n}: FAIL ({'; '.join(v.result.reasons)}). Retrying once with another seed")
                raw.save(d / f"raw-{n}-attempt1.png")
                (d / f"{style.name}-{n}-attempt1.svg").write_text(v.svg)
                first = {"seed": seed, "check": v.result.as_dict()}
                seed += 1000
                raw, v, rs, vs = attempt(n, seed, " (retry)")
            stem = f"{style.name}-{n}"
            raw.save(d / f"raw-{n}.png")
            (d / f"{stem}.svg").write_text(v.svg)
            v.overlay.save(d / f"compare-{n}.png")
            sizes = []
            for sz in v.sizes:
                (d / f"{stem}-{sz.size}.png").write_bytes(sz.png)
                sizes.append({**sz.as_dict(), "png": f"{stem}-{sz.size}.png"})
            res = v.result
            log(f"{name} #{n}: {'PASS' if res.passed else 'FAIL'} IoU {res.iou:.3f}, {res.shapes} shapes, "
                f"{res.nodes} nodes, 32px {'ok' if v.sizes[-1].passed else 'FAIL'}, redraw {rs:.1f}s")
            variants.append({
                "n": n, "seed": seed, "original": "original.jpg", "cutout": "cutout.png",
                "raw": f"raw-{n}.png", "compare": f"compare-{n}.png", "svg": f"{stem}.svg",
                "check": res.as_dict(), "sizes": sizes, "fidelity": v.fidelity,
                "stats": {"weights": v.strokes.weights_px, "eps": v.cleanup.simplify_eps_used,
                          "over_budget": v.cleanup.over_budget, "rungs": v.rungs,
                          "budget": style.cleanup.node_budget},
                "redraw_s": rs, "vector_s": vs, "attempt1": first,
            })
        results[name] = variants
        rows = [r.row() for r in prof.records if r.name.startswith(f"{name}:") or r.name.startswith("load ")]
        totals = {"seconds": time.perf_counter() - t_start, "peak_gb": prof.peak_gb(), "quant": args.quantize}
        why = diagnose(facts[name], analyses[name], variants, args.long_edge)
        write_report(d / "report.html", name, style.name, analyses[name], variants, rows, totals, diagnosis=why)
        (d / "variants.json").write_text(json.dumps({
            "name": name, "style": style.name, "facts": facts[name], "analysis": analyses[name],
            "variants": variants, "diagnosis": why, "stages": rows, "totals": totals}, indent=2))

    for p in photos:
        if p.stem in failed:
            continue
        try:
            one_photo(p)
        except Exception as e:
            fail(p.stem, "redraw/vectorise", e)
    redrawer.close()

    (args.out / f"timings-{int(time.time())}.json").write_text(json.dumps({
        "stages": [r.row() for r in prof.records], "peak_gb": prof.peak_gb(),
        "args": {k: str(v) for k, v in vars(args).items()}}, indent=2))
    log(f"done in {time.perf_counter() - t_start:.0f}s, peak {prof.peak_gb():.1f} GB, "
        f"{len(results)} ok, {len(failed)} failed")
    for name, vs in results.items():
        log(f"{name}: " + ", ".join(f"#{v['n']} {'PASS' if v['check']['passed'] else 'FAIL'}" for v in vs)
            + f"  -> {dirs[name] / 'report.html'}")
    for name, f in failed.items():
        log(f"{name}: FAILED at {f['stage']}: {f['error']}")
    return 1 if failed and not results else 0


if __name__ == "__main__":
    raise SystemExit(main())
