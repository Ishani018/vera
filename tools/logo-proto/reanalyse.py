#!/usr/bin/env python3
"""Re-run only the Qwen analysis for an existing result folder. Writes <folder>/v2/analysis.json.

    python reanalyse.py results/pancake
"""
import json
import sys
from pathlib import Path

from logoproto.analyse import Analyser

folder = Path(sys.argv[1])
out = folder / "v2"
out.mkdir(exist_ok=True)
a = Analyser()
res = a.run(str(folder / "subject-white.png"))
(out / "analysis.json").write_text(json.dumps(res, indent=2))
print(json.dumps({k: res[k] for k in ("subject", "features", "style_prompt", "attempts") if k in res}, indent=2))
if res.get("error"):
    print("ERROR:", res["error"])
a.close()
