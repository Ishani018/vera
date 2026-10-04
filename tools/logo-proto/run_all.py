#!/usr/bin/env python3
"""Run every photo through proto.py ONE AT A TIME, logging each result as it finishes.

    python run_all.py photos/ --out results/run2 --style minimal --variations 2

One process per photo: peak memory is then that photo's own, and a crash costs one
photo, not the run. After each photo it appends an entry to PROGRESS.md and
rebuilds <out>/report.html. Exit code 3 from proto.py (memory over the limit) stops
the whole run immediately.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

from logoproto.combined import build

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


def entry(name: str, out: Path, code: int, secs: float, tail: str) -> str:
    d = out / name
    head = f"\n### {time.strftime('%Y-%m-%d %H:%M')} full run: {name} ({secs / 60:.1f} min wall)\n"
    if (d / "FAILED.json").exists():
        f = json.loads((d / "FAILED.json").read_text())
        return head + f"- **FAILED at {f['stage']}**: {f['error']}\n- No variations were produced for this photo.\n"
    if not (d / "variants.json").exists():
        return head + f"- **No result written** (exit code {code}). Last output:\n```\n{tail[-900:]}\n```\n"
    v = json.loads((d / "variants.json").read_text())
    lines = [head + f"- Subject: {v['analysis'].get('subject') or '(analysis failed)'}; source {v['facts']['source_px'][0]}x{v['facts']['source_px'][1]}, "
             f"cutout {v['facts']['mask_fraction']:.0%} of the picture, {v['facts']['objects']} object(s). Peak memory {v['totals']['peak_gb']:.1f} GB."]
    for x in v["variants"]:
        c, st = x["check"], x.get("stats") or {}
        r = (st.get("rungs") or {}).get("on_rung")
        sz = ", ".join(f"{s['size']}px IoU {s['iou']:.2f} {'ok' if s['passed'] else 'FAIL'}" for s in x.get("sizes", []))
        lines.append(f"- #{x['n']} seed {x['seed']}: **{'PASS' if c['passed'] else 'FAIL'}**{' (retried)' if x.get('attempt1') else ''}, "
                     f"IoU {c['iou']:.3f}, {c['nodes']} nodes ({'OVER' if c['nodes'] > (st.get('budget') or 10**9) else 'within'} target {st.get('budget')}), "
                     f"{c['shapes']} shape(s), "
                     + (f"{r:.0%} of ink on the weights, " if r is not None else "") + f"{sz}. Redraw {x.get('redraw_s', 0):.0f}s.")
    if v.get("diagnosis"):
        lines.append("- Flags: " + " | ".join(v["diagnosis"]))
    return "\n".join(lines) + "\n"


def main() -> int:
    a = argparse.ArgumentParser()
    a.add_argument("photos", type=Path)
    a.add_argument("--out", type=Path, default=Path("results/run2"))
    a.add_argument("--style", default="minimal")
    a.add_argument("--variations", type=int, default=2)
    a.add_argument("--progress", type=Path, default=Path("PROGRESS.md"))
    a.add_argument("--first", default="pancake", help="run this one first")
    args = a.parse_args()

    files = sorted(p for p in args.photos.iterdir() if p.suffix.lower() in EXTS)
    files.sort(key=lambda p: (args.first not in p.stem, p.name))
    args.out.mkdir(parents=True, exist_ok=True)
    names = [p.stem for p in files]
    with args.progress.open("a") as f:
        f.write(f"\n### {time.strftime('%Y-%m-%d %H:%M')} full run started: {len(files)} photos, style {args.style}, "
                f"{args.variations} variations, one at a time, output {args.out}/ (the earlier pancake results in results/pancake are untouched)\n")
    for i, p in enumerate(files, 1):
        print(f"\n===== [{i}/{len(files)}] {p.name} =====", flush=True)
        t0 = time.perf_counter()
        cmd = [sys.executable, "proto.py", str(p), "--style", args.style, "--variations", str(args.variations),
               "--out", str(args.out)]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        sys.stdout.write(proc.stdout[-3000:])
        if proc.returncode not in (0, 1):
            sys.stdout.write(proc.stderr[-1500:])
        secs = time.perf_counter() - t0
        with args.progress.open("a") as f:
            f.write(entry(p.stem, args.out, proc.returncode, secs, proc.stdout + proc.stderr))
        build(args.out, args.style, expected=names)
        if proc.returncode == 3:
            msg = f"\n**RUN STOPPED: memory went over the limit during {p.name}. Remaining photos were NOT run.**\n"
            with args.progress.open("a") as f:
                f.write(msg)
            print(msg)
            return 3
    with args.progress.open("a") as f:
        f.write(f"\n### {time.strftime('%Y-%m-%d %H:%M')} full run finished. Combined report: {args.out}/report.html\n")
    print(f"\nall done: {args.out}/report.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
