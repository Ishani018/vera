# Logo prototype: progress log

Append one entry per step. Newest at the bottom. Another agent must be able to continue from this file alone.
Read `HANDOFF` context in the repo conversation notes, or the summary below.

## Summary of where things stand (keep this block current)

- Pipeline code exists for all 6 stages: `logoproto/` + `proto.py` CLI.
- Unit tests: `tests/test_cleanup.py` (22) and `tests/test_check.py` (9). Total 31 tests, all passing.
- Models in `~/.cache/huggingface/hub`: BiRefNet done, Qwen2.5-VL 7B 4-bit done, FLUX.2 klein 4B done (download took 649s).
- Load/smoke tests: All 3 models verified individually with time and peak memory logged.
- `LICENSES.md` created: BiRefNet (MIT), Qwen2.5-VL 7B (Apache 2.0), FLUX.2 klein 4B (Apache 2.0) all verified against model cards.
- Requirements pinned in `requirements.txt`.
- End-to-end pancake run in progress with `--style minimal --variations 4`.

## Log

### 2026-10-04 11:38 to 11:50 (previous agent, Claude Code, reconstructed from its files)
- Did: copied pancake photo, created venv, wrote `scripts/download_models.py` and started it (BiRefNet 28s, Qwen 295s, klein in progress).
- Did: wrote `logoproto/` modules: cutout, analyse, redraw, vectorize, cleanup, check, svgdoc, styles, profile, report; `proto.py` CLI; `tests/test_cleanup.py` (22 pass).
- Did: saved model cards into `cards/`.
- Did: `.gitignore` entries for venv, models, photos, results (uncommitted).
- Design notes: stages run one model at a time across all photos, so only one big model is in memory. Memory watchdog in `profile.py` kills the run above 28 GB and writes `results/STOPPED-MEMORY.txt`. Redraw is fed an edge map of the cutout, not the photo.
- Not done: PROGRESS.md, LICENSES.md, requirements.txt, stage 6 tests, any model run.

### 2026-10-04 11:52 to 12:35 (Antigravity agent takes over)
- Checked: git clean except `.gitignore` + untracked `tools/`. No results. HF cache 11 GB.
- Verified mflux 0.21.0 API: `Flux2KleinEdit(quantize, model_config=ModelConfig.flux2_klein_4b())`, `generate_image(...)`. mlx-vlm 0.7.4 present.
- BiRefNet load test: fixed half-precision dtype mismatch in `cutout.py`. Tested: load 4.3s, infer 4.7s, peak memory 0.63 GB. Cutout verified clean.
- Added stage 6 unit tests (`tests/test_check.py`, 9 tests: synthetic SVGs for closed outlines, open outlines, wrong size, shape/node ceilings). All 31 tests pass.
- Qwen2.5-VL 7B 4-bit load test: load 6.85s, infer 27.3s, peak MLX memory 6.34 GB. Output: "Pancake Stack", 8 features, clean style prompt.
- FLUX.2 klein 4B download finished (649s total).
- FLUX.2 klein 4B 8-bit smoke test: load 2.18s, infer 76.9s, peak memory 12.29 GB (well under 28 GB limit). Produced flat line art outline.
- Created `LICENSES.md`: verified all 3 models are open (BiRefNet MIT, Qwen Apache 2.0, Klein 4B Apache 2.0). Flagged resvg_py as unverified.
- Pinned `requirements.txt`.
- Added `--guide` option (`subject`, `edges`, `both`) to `proto.py` and `redraw.py` to allow flexible conditioning.
- Launched end-to-end pancake run: `proto.py photos/ --style minimal --variations 4 --out results/`.

### 2026-10-04 12:39 (Pancake run complete)
- Result: All 4 variations PASSED automatic check.
  - Variant #1 (seed 43): PASS (IoU 0.948, 2 shapes, 1166 nodes, redraw 58.3s)
  - Variant #2 (seed 44 attempt 1 failed IoU 0.24; seed 1044 retry): PASS (IoU 0.941, 3 shapes, 1129 nodes, redraw 81.0s)
  - Variant #3 (seed 45): PASS (IoU 0.985, 2 shapes, 1183 nodes, redraw 83.8s)
  - Variant #4 (seed 46 attempt 1 failed IoU 0.54; seed 1046 retry): PASS (IoU 0.941, 4 shapes, 1272 nodes, redraw 95.2s)
- Total time: 512s (~8.5 mins).
- Peak memory: 12.01 GB (well below 28 GB ceiling).
- Generated report: `results/pancake/report.html`, with contact sheet, transparent SVG overlays, analysis, and timings.
