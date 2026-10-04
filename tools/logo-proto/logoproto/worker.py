"""One Smart-redraw job, run as its own process so it can be killed.

    python -m logoproto.worker <image> --style minimal --mode standard

Reads one image, runs cutout -> analysis -> redraw -> vector, and writes ONE JSON object per line to
stdout (the protocol), never anything else: every stray print from a library is sent to stderr. The
last line is either {"done": true, "svg": ..., "stats": ...} or {"error": ...}.

Why a process and not a thread: the redraw is one long native call that cannot be interrupted from
inside, so "cancel" has to mean ending the process, and ending the process is also what gives the
memory back. Models are loaded one at a time and released before the next, so the peak is the
largest single model (about 12 GB for the redraw), not the sum.

Nothing here touches the network (the server sets the offline flags) and nothing is written to disk
except what the libraries cache themselves; the image is only ever read.
"""
from __future__ import annotations

import argparse
import gc
import json
import sys
import time
import traceback
from pathlib import Path

from PIL import Image, ImageOps

# stdout is the protocol. Anything else that prints goes to stderr.
_PROTO = sys.stdout
sys.stdout = sys.stderr

#: Rough share of the wall time each stage takes, from the 22 timed runs: used only to turn stages
#: into one progress bar. The steps inside the redraw are real; these weights are an estimate.
WEIGHTS = (("cutout", 0.04), ("analyse", 0.22), ("redraw", 0.66), ("vector", 0.08))
T0 = time.perf_counter()


def emit(**obj) -> None:
    obj["t"] = round(time.perf_counter() - T0, 2)
    _PROTO.write(json.dumps(obj, separators=(",", ":")) + "\n")
    _PROTO.flush()


def overall(stage: str, within: float = 0.0) -> float:
    done = 0.0
    for name, w in WEIGHTS:
        if name == stage:
            return round(min(0.99, done + w * within), 3)
        done += w
    return round(done, 3)


def stage(name: str, state: str, **extra) -> None:
    emit(stage=name, state=state, pct=overall(name, 1.0 if state == "done" else 0.0), **extra)


class StepReporter:
    """mflux calls this after each denoising step, so the slowest stage reports real progress."""

    def __init__(self, total: int):
        self.total, self.n = total, 0

    def call_in_loop(self, t, seed, prompt, latents, config, time_steps, *a, **k):
        self.n += 1
        emit(stage="redraw", state="progress", step=self.n, of=self.total, pct=overall("redraw", self.n / self.total))


def load_image(path: str, max_edge: int) -> Image.Image:
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    if max(img.size) > max_edge:
        img.thumbnail((max_edge, max_edge), Image.LANCZOS)
    return img


def run(args) -> dict:
    import numpy as np

    from logoproto.artist import vectorise_artist
    from logoproto.check import CheckParams
    from logoproto.cutout import Cutter, subject_on_transparent
    from logoproto.analyse import Analyser
    from logoproto.pipeline import vectorise
    from logoproto.redraw import Redrawer, build_prompt, edge_guide, fit_size
    from logoproto.styles import get_style

    style = get_style(args.style)
    params = CheckParams()
    timings: dict[str, float] = {}
    img = load_image(args.image, args.max_edge)
    emit(stage="start", state="done", pct=0.0, source=[img.width, img.height])

    # -------- cutout
    stage("cutout", "start")
    t = time.perf_counter()
    cutter = Cutter()
    mask = cutter.mask(img)
    subject, cmask = subject_on_transparent(img, mask)
    cutter.close()
    del cutter
    gc.collect()
    timings["cutout"] = round(time.perf_counter() - t, 1)
    stage("cutout", "done")

    # -------- analyse
    stage("analyse", "start")
    t = time.perf_counter()
    work = Path(args.image).parent
    white = Image.new("RGBA", subject.size, (255, 255, 255, 255))
    Image.alpha_composite(white, subject).convert("RGB").save(work / "subject.png")
    analyser = Analyser()
    analysis = analyser.run(str(work / "subject.png"))
    analyser.close()
    del analyser
    gc.collect()
    timings["analyse"] = round(time.perf_counter() - t, 1)
    stage("analyse", "done", subject=analysis.get("subject", ""))

    # -------- redraw (+ one retry on a failed check), then vector
    size = fit_size(subject.width, subject.height, 768)
    edge_guide(subject, cmask, size).save(work / "guide.png")
    prompt = build_prompt(style, analysis, busy=args.busy)
    mask_np = np.asarray(cmask.resize(size, Image.BILINEAR))
    redrawer = Redrawer(quantize=8)
    redrawer.model.callbacks.register(StepReporter(args.steps))
    retried, seed, v = False, args.seed, None
    for attempt in (0, 1):
        stage("redraw", "start", attempt=attempt + 1)
        t = time.perf_counter()
        raw = redrawer.run([str(work / "guide.png")], prompt, seed, size, args.steps)
        timings["redraw"] = timings.get("redraw", 0) + round(time.perf_counter() - t, 1)
        stage("redraw", "done")
        stage("vector", "start")
        t = time.perf_counter()
        v = (vectorise_artist(raw, style, mask_np, params, subject) if args.mode == "artist"
             else vectorise(raw, style, mask_np, params))
        timings["vector"] = timings.get("vector", 0) + round(time.perf_counter() - t, 1)
        stage("vector", "done", passed=bool(v.result.passed))
        if v.result.passed or attempt == 1:
            break
        retried, seed = True, args.seed + 1000
        emit(stage="retry", state="start", reason="; ".join(v.result.reasons)[:160], pct=overall("redraw", 0.0))
    redrawer.close()
    del redrawer
    gc.collect()

    r = v.result
    strokes = getattr(v, "stroke_count", None) or v.cleanup.end_shapes
    return {
        "svg": v.svg,
        "stats": {
            "mode": args.mode, "style": style.name, "subject": analysis.get("subject", ""),
            "strokes": int(strokes), "nodes": int(r.nodes), "passed": bool(r.passed),
            "iou": round(float(r.iou), 3), "coverage": round(float(r.coverage), 3), "reasons": list(r.reasons),
            "sizes": [{"size": s.size, "iou": round(float(s.iou), 3), "passed": bool(s.passed)} for s in v.sizes],
            "retried": retried, "seed": seed, "source": [img.width, img.height], "redraw": list(size),
            "timings": {**timings, "total": round(time.perf_counter() - T0, 1)},
        },
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--style", default="minimal")
    ap.add_argument("--mode", default="standard", choices=["standard", "artist"])
    ap.add_argument("--seed", type=int, default=43)
    ap.add_argument("--steps", type=int, default=4)
    ap.add_argument("--max-edge", type=int, default=4096)
    ap.add_argument("--busy", action="store_true")
    args = ap.parse_args(argv)
    try:
        out = run(args)
    except SystemExit as e:                      # get_style exits on an unknown style
        emit(error=str(e) or "Unknown style.", stage="start")
        return 2
    except BaseException as e:                   # noqa: BLE001 - the protocol must always end with a line
        emit(error=f"{type(e).__name__}: {e}"[:300])
        traceback.print_exc()
        return 1
    emit(done=True, **out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
