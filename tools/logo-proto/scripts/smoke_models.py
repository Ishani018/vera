"""One-line load test per model, with time and peak memory.

    python scripts/load_test.py birefnet|qwen|klein [photo]

Each model is tested in its own process so peak memory is per model.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image  # noqa: E402

from logoproto.profile import Profile  # noqa: E402

which = sys.argv[1]
photo = Path(sys.argv[2] if len(sys.argv) > 2 else "photos/pancake.jpg")
out = Path("results/_loadtest")
out.mkdir(parents=True, exist_ok=True)
import os  # noqa: E402


def _stop(stage: str, gb: float) -> None:
    print(f"STOPPED: {gb:.1f} GB during {stage}, over 28 GB", flush=True)
    os._exit(3)


prof = Profile(limit_gb=28.0, on_exceed=_stop)
result: dict = {"model": which}

if which == "birefnet":
    from logoproto.cutout import Cutter, subject_on_transparent

    with prof.stage("load"):
        c = Cutter()
    with prof.stage("infer"):
        img = Image.open(photo).convert("RGB")
        m = c.mask(img)
        subj, cm = subject_on_transparent(img, m)
    subj.save(out / "cutout.png")
    white = Image.new("RGBA", subj.size, (255, 255, 255, 255))
    Image.alpha_composite(white, subj).convert("RGB").save(out / "subject-white.png")
    result["device"] = c.device
    result["cutout_size"] = subj.size
elif which == "qwen":
    from logoproto.analyse import Analyser

    with prof.stage("load"):
        a = Analyser()
    with prof.stage("infer"):
        result["analysis"] = a.run(str(out / "subject-white.png"))
elif which == "klein":
    from logoproto.redraw import Redrawer

    q = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    with prof.stage("load"):
        r = Redrawer(quantize=q)
    with prof.stage("infer"):
        img = r.run(str(out / "subject-white.png"),
                    "Redraw this as flat black line art on a pure white background.", 1, (512, 512), 4)
    img.save(out / f"klein-q{q}.png")
    result["quantize"] = q
else:
    raise SystemExit("usage: load_test.py birefnet|qwen|klein [photo] [quant]")

result["stages"] = [r.row() for r in prof.records]
result["peak_gb"] = round(prof.peak_gb(), 2)
print(json.dumps(result, indent=2, default=str))
