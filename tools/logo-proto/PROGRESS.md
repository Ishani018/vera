# Logo prototype: progress log

Append one entry per step. Newest at the bottom. Another agent must be able to continue from this file alone.
Read `HANDOFF` context in the repo conversation notes, or the summary below.

## Summary of where things stand (keep this block current)

- Pipeline code exists for all 6 stages: `logoproto/` + `proto.py` CLI.
- Unit tests: `tests/test_cleanup.py` (22) and `tests/test_check.py` (9). Total 31 tests, all passing.
- Models in `~/.cache/huggingface/hub`: BiRefNet done, Qwen2.5-VL 7B 4-bit done, FLUX.2 klein 4B done (download took 649s).
- Load/smoke tests: All 3 models verified individually with time and peak memory logged.
- `LICENSES.md`: all three models marked "READ" (not "verified"): BiRefNet and Qwen cards state a licence tag and nothing else; the FLUX klein card has an unresolved caveat about BFL usage policies. Read it before shipping commercially.
- Requirements pinned in `requirements.txt`.
- Pancake run done (4/4 PASS, 512 s, peak 12.0 GB). Vector step then reworked (see 2026-10-04 15:00 below). Tests: 180 pass.
- `HANDOFF.md` does not exist; this file is the only handoff.
- Full 11-photo run DONE (results/run2/, one photo at a time, 22 variations, peak 12.2 GB, limit never hit). Re-scored with the current check; see the 2026-10-04 16:30 entry.
- `HANDOFF.md`: the owner asked for an attached file to be saved here; nothing was attached and none exists on the Mac for this project (two others exist, for an unrelated project, `kavach`). NOT created.

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

### 2026-10-04 15:00 (Claude Code: vector-step fixes, pancake only, no model re-run)
Re-traced the pancake's EXISTING redraws (`revector.py`, outputs in `results/pancake/v2/`, nothing overwritten); only the Qwen analysis was re-run (`reanalyse.py`).

What was wrong and what changed, in the order it was found:
- **"2 shapes" and the old weight snapping were meaningless.** The redraw's ink is one connected component (99% of it), so a per-shape width had one value. Replaced with a raster stroke step (`logoproto/strokes.py`): Zhang-Suen skeleton, spur and loose-stroke pruning, local width, 3 clusters, redraw each at a ladder weight. Old per-shape snap kept (`snap_vector`) and tested but off.
- **Node budget crushed the drawing.** It pushed Douglas-Peucker to 12 px on 3-7 px strokes (IoU fell to 0.42-0.83). Cap is now 2 px and over-budget is reported, not hidden.
- **Nodes were the wrong unit.** Flattening VTracer's Beziers then re-curving every vertex gave 1,000+ nodes. Added Schneider 1990 curve fitting (`logoproto/fit.py`); node = Bezier segment. 1,000+ -> ~450 at the time.
- **Fitter bug: runaway handles** (1,000-9,667 px on 4-51 px segments) drew hairlines across the picture. Guarded; regression test fails 22/24 without the guard, 0/24 with it.
- **My thickness measure was wrong, twice.** Skeleton width at the tips was a false hypothesis (ZS skeleton does not taper at round caps). `local_thickness` first mis-read diagonal bands (45 degrees, 5.7 px read as 3) because radii stepped in whole pixels and the centre set is a dotted line on a diagonal. Fixed with quarter-pixel radii and an r+0.5 cover; 24 angle/width regression cases.
- **VTracer was thinning strokes.** With a trustworthy measure: stroke step 86-89% of ink on the three weights; after VTracer spline/polygon only 65-78%, and speckle/corner/length/splice/precision made no difference. VTracer `mode="none"` (exact pixel outline) keeps 86-89%. So VTracer now only gives the exact outline and our own fitter does all smoothing.
- **Hole filling** reaches ~300 nodes only by turning gaps into solid black lumps (picture-checked), so it stops at 0.2% of the picture.
- Weights are 0.6/1.0/1.4% of the long edge (5/7/11 px at 768). The thin ladder (3/5/7) broke the outline as soon as detail was removed.

Pancake v2 result (4 variations): 538-606 nodes, silhouette IoU 0.978-0.984, 77-86% of ink area on the three weights (6-20% thinner, 1-2% thicker), 98% of final line length lies on the redraw's lines and 98% of the redraw's line length is kept. 64 px IoU 0.95, 32 px IoU 0.87-0.91 (silhouette only: thin lines fade to ~0.2 px, ink alpha ~0.3).
- **Node target NOT met.** Asked 150-300; got 538-606 (about 2x). The drawing has ~60 enclosed loops and every stroke is an outline (two sides), so nodes follow detail. Hitting 300 needs a simpler redraw, centreline-stroke output (not VTracer), or solid fills.
- Analysis: background no longer listed; colour/texture words stripped (7B model ignores the instruction, so this is a tested filter); a style sentence asking for colour falls back to a plain one. "crumbly bottom" shrank to a vague "bottom". The v2 analysis does NOT feed the existing raws: they were made with the old analysis.
- Not touched: Next.js app, goldens, existing tests. No file deleted.

### 2026-10-04 15:01 full run started: 11 photos, style minimal, 2 variations, one at a time, output results/run2/ (the earlier pancake results in results/pancake are untouched)

### 2026-10-04 15:04 full run: pancake (3.5 min wall)
- Subject: pancake stack; source 1829x2560, cutout 69% of the picture, 1 object(s). Peak memory 12.0 GB.
- #1 seed 43: **PASS**, IoU 0.990, 592 nodes (OVER target 300), 12 shape(s), 83% of ink on the weights, 64px IoU 0.96 ok, 32px IoU 0.91 ok. Redraw 64s.
- #2 seed 44: **PASS**, IoU 0.990, 645 nodes (OVER target 300), 15 shape(s), 77% of ink on the weights, 64px IoU 0.96 ok, 32px IoU 0.90 ok. Redraw 94s.

### 2026-10-04 15:11 full run: bicycle (6.5 min wall)
- Subject: Bicycle; source 474x644, cutout 25% of the picture, 1 object(s). Peak memory 12.0 GB.
- #1 seed 1043: **FAIL** (retried), IoU 0.596, 768 nodes (OVER target 300), 2 shape(s), 60% of ink on the weights, 64px IoU 0.52 FAIL, 32px IoU 0.49 FAIL. Redraw 88s.
- #2 seed 1044: **FAIL** (retried), IoU 0.595, 1078 nodes (OVER target 300), 4 shape(s), 70% of ink on the weights, 64px IoU 0.51 FAIL, 32px IoU 0.48 FAIL. Redraw 101s.
- Flags: The source is small (474x644) and the redraw is generated at 768 px on the long edge, so the edge guide was enlarged 1.2x and any detail beyond what the photo holds was invented by the model. | Variation 1 FAILED: silhouette IoU 0.60 is below 0.80. | Variation 1 does not hold up at 64 px (silhouette IoU 0.52). | Variation 1 does not hold up at 32 px (silhouette IoU 0.49). | Variation 2 FAILED: silhouette IoU 0.59 is below 0.80. | Variation 2 does not hold up at 64 px (silhouette IoU 0.51). | Variation 2 does not hold up at 32 px (silhouette IoU 0.48).

### 2026-10-04 15:16 full run: burger (5.3 min wall)
- Subject: Double Cheeseburger; source 1392x2088, cutout 69% of the picture, 1 object(s). Peak memory 12.1 GB.
- #1 seed 43: **PASS**, IoU 0.941, 613 nodes (OVER target 300), 13 shape(s), 70% of ink on the weights, 64px IoU 0.94 ok, 32px IoU 0.62 FAIL. Redraw 73s.
- #2 seed 1044: **FAIL** (retried), IoU 0.141, 645 nodes (OVER target 300), 12 shape(s), 80% of ink on the weights, 64px IoU 0.92 ok, 32px IoU 0.62 FAIL. Redraw 96s.
- Flags: Variation 1 does not hold up at 32 px (silhouette IoU 0.62). | Variation 2 FAILED: silhouette IoU 0.14 is below 0.80. | Variation 2 does not hold up at 32 px (silhouette IoU 0.62).

### 2026-10-04 15:23 full run: cats (6.6 min wall)
- Subject: Two Cats; source 1600x1054, cutout 52% of the picture, 1 object(s). Peak memory 12.0 GB.
- #1 seed 1043: **FAIL** (retried), IoU 0.126, 518 nodes (OVER target 300), 14 shape(s), 72% of ink on the weights, 64px IoU 0.28 FAIL, 32px IoU 0.36 FAIL. Redraw 94s.
- #2 seed 1044: **FAIL** (retried), IoU 0.136, 583 nodes (OVER target 300), 12 shape(s), 73% of ink on the weights, 64px IoU 0.32 FAIL, 32px IoU 0.37 FAIL. Redraw 103s.
- Flags: Variation 1 FAILED: silhouette IoU 0.13 is below 0.80. | Variation 1 does not hold up at 64 px (silhouette IoU 0.28). | Variation 1 does not hold up at 32 px (silhouette IoU 0.36). | Variation 2 FAILED: silhouette IoU 0.14 is below 0.80. | Variation 2 does not hold up at 64 px (silhouette IoU 0.32). | Variation 2 does not hold up at 32 px (silhouette IoU 0.37).

### 2026-10-04 15:26 full run: coffee (3.0 min wall)
- Subject: Coffee cup; source 1100x738, cutout 59% of the picture, 1 object(s). Peak memory 11.9 GB.
- #1 seed 43: **PASS**, IoU 0.948, 299 nodes (within target 300), 4 shape(s), 82% of ink on the weights, 64px IoU 0.92 ok, 32px IoU 0.89 ok. Redraw 58s.
- #2 seed 44: **PASS**, IoU 0.952, 315 nodes (OVER target 300), 7 shape(s), 75% of ink on the weights, 64px IoU 0.92 ok, 32px IoU 0.89 ok. Redraw 88s.

### 2026-10-04 15:30 full run: cupcake (4.3 min wall)
- Subject: cupcake; source 1200x1800, cutout 56% of the picture, 1 object(s). Peak memory 12.0 GB.
- #1 seed 1043: **FAIL** (retried), IoU 0.640, 357 nodes (OVER target 300), 11 shape(s), 83% of ink on the weights, 64px IoU 0.68 FAIL, 32px IoU 0.68 FAIL. Redraw 78s.
- #2 seed 44: **PASS**, IoU 0.980, 320 nodes (OVER target 300), 8 shape(s), 75% of ink on the weights, 64px IoU 0.68 FAIL, 32px IoU 0.60 FAIL. Redraw 94s.
- Flags: Variation 1 FAILED: silhouette IoU 0.64 is below 0.80. | Variation 1 does not hold up at 64 px (silhouette IoU 0.68). | Variation 1 does not hold up at 32 px (silhouette IoU 0.68). | Variation 2 does not hold up at 64 px (silhouette IoU 0.68). | Variation 2 does not hold up at 32 px (silhouette IoU 0.60).

### 2026-10-04 15:38 full run: flowerbouquet (8.1 min wall)
- Subject: Flower Bouquet; source 3000x3000, cutout 47% of the picture, 1 object(s). Peak memory 12.2 GB.
- #1 seed 1043: **PASS** (retried), IoU 0.952, 1421 nodes (OVER target 300), 8 shape(s), 68% of ink on the weights, 64px IoU 0.78 ok, 32px IoU 0.74 FAIL. Redraw 90s.
- #2 seed 1044: **PASS** (retried), IoU 0.964, 1257 nodes (OVER target 300), 5 shape(s), 52% of ink on the weights, 64px IoU 0.74 FAIL, 32px IoU 0.73 FAIL. Redraw 97s.
- Flags: Variation 1 needed a retry (first seed 43: silhouette IoU 0.72 is below 0.80). | Variation 1 does not hold up at 32 px (silhouette IoU 0.74). | Variation 2 needed a retry (first seed 44: silhouette IoU 0.71 is below 0.80). | Variation 2 does not hold up at 64 px (silhouette IoU 0.74). | Variation 2 does not hold up at 32 px (silhouette IoU 0.73).

### 2026-10-04 15:43 full run: kitten (5.1 min wall)
- Subject: cat; source 700x350, cutout 63% of the picture, 1 object(s). Peak memory 12.2 GB.
- #1 seed 43: **PASS**, IoU 0.979, 1441 nodes (OVER target 300), 29 shape(s), 70% of ink on the weights, 64px IoU 0.94 ok, 32px IoU 0.92 ok. Redraw 76s.
- #2 seed 1044: **FAIL** (retried), IoU 0.139, 776 nodes (OVER target 300), 33 shape(s), 79% of ink on the weights, 64px IoU 0.38 FAIL, 32px IoU 0.92 ok. Redraw 101s.
- Flags: The source is small (700x350) and the redraw is generated at 768 px on the long edge, so the edge guide was enlarged 1.1x and any detail beyond what the photo holds was invented by the model. | Variation 2 FAILED: silhouette IoU 0.14 is below 0.80. | Variation 2 does not hold up at 64 px (silhouette IoU 0.38).

### 2026-10-04 15:51 full run: london_eye (7.5 min wall)
- Subject: Ferris Wheel; source 2000x1334, cutout 19% of the picture, 1 object(s). Peak memory 12.1 GB.
- #1 seed 1043: **FAIL** (retried), IoU 0.303, 1236 nodes (OVER target 300), 2 shape(s), 56% of ink on the weights, 64px IoU 0.24 FAIL, 32px IoU 0.22 FAIL. Redraw 105s.
- #2 seed 1044: **FAIL** (retried), IoU 0.247, 1025 nodes (OVER target 300), 2 shape(s), 60% of ink on the weights, 64px IoU 0.24 FAIL, 32px IoU 0.22 FAIL. Redraw 103s.
- Flags: Variation 1 FAILED: silhouette IoU 0.30 is below 0.80. | Variation 1 does not hold up at 64 px (silhouette IoU 0.24). | Variation 1 does not hold up at 32 px (silhouette IoU 0.22). | Variation 2 FAILED: silhouette IoU 0.25 is below 0.80. | Variation 2 does not hold up at 64 px (silhouette IoU 0.24). | Variation 2 does not hold up at 32 px (silhouette IoU 0.22).

### 2026-10-04 15:54 full run: puppy (3.0 min wall)
- Subject: Siberian Husky Puppy; source 405x720, cutout 64% of the picture, 1 object(s). Peak memory 12.0 GB.
- #1 seed 43: **PASS**, IoU 0.981, 657 nodes (OVER target 300), 13 shape(s), 69% of ink on the weights, 64px IoU 0.94 ok, 32px IoU 0.88 ok. Redraw 54s.
- #2 seed 44: **PASS**, IoU 0.986, 558 nodes (OVER target 300), 20 shape(s), 68% of ink on the weights, 64px IoU 0.94 ok, 32px IoU 0.41 FAIL. Redraw 98s.
- Flags: The source is small (405x720) and the redraw is generated at 768 px on the long edge, so the edge guide was enlarged 1.1x and any detail beyond what the photo holds was invented by the model. | Variation 2 does not hold up at 32 px (silhouette IoU 0.41).

### 2026-10-04 15:59 full run: vishansoudha (4.7 min wall)
- Subject: Government Building; source 736x981, cutout 53% of the picture, 1 object(s). Peak memory 12.0 GB.
- #1 seed 43: **PASS**, IoU 0.971, 844 nodes (OVER target 300), 4 shape(s), 63% of ink on the weights, 64px IoU 0.77 ok, 32px IoU 0.81 ok. Redraw 57s.
- #2 seed 1044: **FAIL** (retried), IoU 0.687, 899 nodes (OVER target 300), 6 shape(s), 64% of ink on the weights, 64px IoU 0.78 ok, 32px IoU 0.81 ok. Redraw 94s.
- Flags: Variation 2 FAILED: silhouette IoU 0.69 is below 0.80.

### 2026-10-04 15:59 full run finished. Combined report: results/run2/report.html

### 2026-10-04 16:30 (Claude Code: full run reviewed; check replaced; crowd rule; busy prompt)
**Full run (results/run2/, original check, original vector settings).** 11 photos, 22 variations, one process per photo, 57 min pipeline time, peak 12.2 GB. Old check: 12 pass / 10 fail. Nodes 299-1441, median 657; 21 of 22 OVER the 300 target (coffee #1, 299, is the one that is not). Nothing outright failed at cutout/analyse/redraw.

**Why burger #1 scored 0.94 and burger #2 scored 0.14 (drawings that look alike).** The old check filled the SVG's enclosed areas and compared that to the cutout. Burger #2's outline has a small break (about 16 px by the gap estimate); the fill leaked out of it, so the filled shape was 10% of the frame instead of 67%. Outline coverage was the same for both (85%). At 8 px of closing, #2 scored 0.928. It was a cliff, not a measurement of how alike they are.

**The old check was wrong three ways, found by looking at the pictures and not the numbers:**
1. Gap cliff, above.
2. A cutout with holes (bicycle wheels): a FILLED drawing was compared to a mask with the holes still in it. IoU 0.59 against the cutout, 0.95 against its outer shape.
3. A subject cropped by the photo's edge (both cats run off the bottom): no outline there, the fill leaks. IoU 0.25.
**Replacement** (`logoproto/check.py`): PASS needs outline coverage >= 80% (share of the cutout's boundary, holes included, with ink within ~0.6% of the long edge) AND gap-tolerant filled IoU >= 0.80 against the cutout's OUTER shape, with the frame treated as a wall where the cutout touches it. Also reported: the widest outline gap in px, stray ink, and the old number. The 64/32 px tests had the same two bugs and got the same fixes.
**Result:** 22/22 variations pass; every one of the 12 retries was unnecessary (the first attempt passes), about 19 minutes of FLUX time. 44/44 size tests pass (7 failed before; all artefacts).
**Negative control** (do not skip this): scored each photo's drawing against every OTHER photo's cutout, 110 wrong pairings. Full check accepts 0. IoU alone would accept 14; coverage alone accepts 0. Coverage does the discriminating, IoU adds "the outline encloses the shape". Caveat: all drawings were guided by their own cutout's edges, so matching outlines is expected; the check is not evidence of a GOOD logo, only of a faithful silhouette.

**Hard photos, honestly.**
- cats: both variations FAILED under the old check (IoU 0.13). Cause: the photo crops both cats at the bottom, so the fill leaked. Not a drawing failure. Passes now (IoU 0.93). Not what you might assume: BiRefNet merged the two cats into ONE connected cutout (1 object), so the "several objects" flag did not fire. Both cats are drawn. Whether a two-cat mark is wanted is a design call.
- vishansoudha #2: FAIL (0.69) under the old check, pass now (0.915): holes in the building's cutout.
- kitten #2: FAIL (0.14) old check; a 6 px outline gap; passes now (0.97). Kitten #1 is dense: 1,441 nodes and 29 shapes. Source is 700x350.
- puppy: both pass; source 405x720 (enlarged ~1.1x, so some detail is the model's invention).
- bicycle and london_eye: failed under the old check because of the wheel holes. Both pass now. They are the densest drawings and the ones with the fused black wedges.

**Vector step: lines closer than ~2 stroke widths are no longer thickened** (`strokes.py`, `crowd_factor=2.0`). First attempt compared skeleton branches and exempted junction neighbourhoods; a hatched patch is a mesh of junctions, so nearly everything was exempt and nothing changed (bicycle blob area 2.5% -> 2.2%). Replaced with white-space clearance: a stroke may grow only to spacing/2, never below 3 px, and the curve-fit tolerance is now capped at 40% of the thinnest stroke (a fixed 2 px deleted the thin strokes and dropped bicycle IoU to 0.49). The other source of blobs was the pancake-tuned hole filling (small white cells between spokes become solid black); `minimal` now has `hole_frac=0`.
Bicycle before -> after (same redraw, same code measuring both): solid areas thicker than 12 px 2.46% -> 0.00% and 2.56% -> 0.00%; outline coverage 0.91 -> 0.99 and 0.96 -> 1.00; IoU 0.949 -> 0.951 and 0.940 -> 0.947. **Cost: nodes 768 -> 1,825 and 1,078 -> 1,867.** Across all 12 finished results: blobs 0.80% -> 0.06%, nodes 561 -> 1,187 mean (about 2.1x), share of ink on the three weights lower (crowded strokes are held thin on purpose). `--compact` restores the old settings exactly. Which default to keep is the owner's call; the new one is the default because fused lines were reported as the defect.
Page: `results/run2/bicycle/before-after.html`.

**Busy-subject prompt** (`--busy`, and `--sparse-guide`). Burger, interior strokes drawn inside the outline (target about 10): normal prompt 108 / 89; `--busy` 101 / 96 (the model copies the guide's lines and ignores the words); `--busy --sparse-guide` (guide keeps the top 3% of interior edges, not 12%) 46 / 39, interior ink 14% -> 5%, nodes 698 / 573. Still about 4x the target and it loses some layering. Not tried: a sparser guide still, or an explicit stroke budget. The measure is `diagnose.busyness`.

**Decisions waiting on the owner:** (1) keep the new vector default (no fusing, ~2x nodes) or `--compact`; (2) is `--busy --sparse-guide` worth making the default for busy subjects; (3) the 300-node target is still unmet on 21 of 22 results. (1) and (2) were answered; see the next entry.

### 2026-10-04 17:15 (Claude Code: owner's decisions, and all 11 photos re-vectorised)
**Decisions (owner):** keep the new vector default (no fused lines) and keep `--compact` available. `--busy --sparse-guide` stays an OPTION for busy subjects only, never the default (nothing was changed in code for this: it already is an option). `HANDOFF.md` ignored for now; the owner will ask when needed.

**What was run:** `revec_all.py results/run2 results/run2-revec`: all 22 variations re-vectorised from the existing redraws with the current default. No model, 306 s. `results/run2` was not touched (nothing in it is newer than the new folder; the script refuses to write into a folder that exists). Combined report with old next to new: `results/run2-revec/report.html`. Old and new are scored by the same current check and the same measuring code. The bicycle rows reproduce the earlier before/after exactly (1,825 / 1,867 nodes), which is the consistency check on the driver.

**Result, mean over 22 variations (old -> new):**
- nodes 766 -> **1,803** (median 651 -> 1,402); **up in 22 of 22**; within the 300 target: 1 -> **0**
- solid areas thicker than 12 px, share of frame: 1.38% -> **0.13%**
- outline coverage 0.972 -> 0.993; silhouette IoU 0.962 -> 0.965
- ink on the three weights 70% -> **56%** (worse, on purpose: crowded strokes are held thin)
- passes the check **22 -> 21 of 22**; passes both size tests **22 -> 21 of 22**

**The two things that got worse, not hidden:**
- london_eye #1 now FAILS, and only on the 5,000-node safety ceiling (5,328 nodes). It is not a quality failure and the ceiling was not changed. london_eye #2 is at 4,036, flowerbouquet at 2,846 / 3,039, vishansoudha 2,513 / 2,410.
- vishansoudha #2 fails the 32 px size test (IoU 0.75; it passed before).

**Where fusing remains** (new, over 0.4% of the frame): flowerbouquet #2 0.87% (was 3.98%), puppy #2 0.61%, cupcake #1 0.53%. The rule removed most of it, not all.

**Recommendation not acted on:** the node cost falls hardest on the thin-structure subjects (ferris wheel, bouquet, building). If the 5,000 ceiling should scale with detail, or a node cap per style is wanted, that is a separate decision.

### 2026-10-04 18:30 (Claude Code: artist mode)
**Added** `--mode artist` (standard stays the default; nothing in the standard path changed) and `--artist-cap`. Code: `logoproto/artist.py`, driver `artist_all.py`, 26 new tests in `tests/test_artist.py` (no existing test touched; 206 pass). Ran on all 11 photos from the existing redraws, no model: `results/run3-artist/` (old `run2-revec` untouched), report with old next to artist minimal (cap 8) and artist detailed (cap 30): `results/run3-artist/report.html`. My by-eye verdict for every photo is in the report.

**What it does:** skeleton -> strokes joined straight through junctions -> one Bezier path per stroke; outline from the cutout mask (one bold smoothed path, pieces under 1% ignored); each interior stroke scored on length, contrast, form-separation (Lab difference across it) and nearness to the outline, each RANKED among that picture's strokes; top N by cap; then a removal test at 64 and 32 px (drop the stroke whose absence changes the picture least; stop when the least change exceeds 2% or the picture would drift 15%); three weights by role (outline 11, major 7, detail 5 px at 768); duplicates merged only when most of a stroke lies within 2 px of another (spokes survive); transparent stroked-path SVG.

**Not done, on purpose:** "near a feature the vision step named". The analysis names features but has no locations; locating them needs another Qwen pass, ruled out. `feature_boxes` is the hook (tested, unused).
**Decision I made against my own first draft:** the spec says OUTER contour. I first also outlined holes of at least 1%, which passes the bicycle but outlines every gap in a ferris wheel as a heavy clump. Hole size cannot separate the cases (London Eye's holes are 29.6/13.4/12.8% of the subject, the bicycle's wheels 8.3/6.7%). Default is the spec; `ArtistParams.holes_in_outline=True` gives the other.
**Bugs found on the way, not hidden:** first scores were saturated (length and separation 1.0 on nearly every stroke, so it chose by length) -> rank-normalised; the removal test removed nothing at first and was calibrated from the delta distribution (2% / 15% are choices, not measurements); a shadowed variable (`holes`), an array-comparison on a dataclass (`eq=False`).

**Result (22 variations, mean):** nodes 1,803 (current default) -> 117 (minimal) / 160 (detailed); strokes 13 -> 6 / 13. Passes the check 21 -> 18 / 18: bicycle and london_eye fail on outline coverage (0.19-0.34) because wheel interiors are not drawn. The 64/32 px test passes 22/22 but passes by construction (the outline comes from the cutout), so it is not evidence of anything.
**By eye, and this is the finding:** BETTER on coffee, puppy, cats (simple, contour-defined subjects: the logo-like result the mode is for); MIXED on cupcake, kitten, vishansoudha; WORSE on bicycle, burger (reads as a loaf), flowerbouquet (flowers gone), london_eye (reads as a gear), pancake at 8 strokes (bun with a seam; the 30-stroke profile recovers layers and syrup, still not the butter). Artist mode did NOT win overall. It wins where the identity is in the contour, and loses where it is in many repeated or fine structures, which a stroke cap cannot keep.

## Smart redraw in the Lab (2026-10-04)

The pipeline is now an optional Lab look, "Smart redraw", through a local helper.

- **Mode:** standard is the default. Artist mode did not win the comparison overall (it wins on simple, contour-driven subjects), so it is offered as an optional "Simplified" choice next to "Detailed".
- **Helper:** `server.py`, 127.0.0.1 only, CORS and Host allow-list, 25 MB / 60 MP cap, one job at a time, one child process per job (`logoproto/worker.py`) so Cancel really kills it. No copies kept, temp dir deleted per job, models load offline. 19 tests in `tests/test_server.py` with a fake worker.
- **App:** `lib/lab/smart.ts` (client; imports nothing, so no model in the bundle), `components/lab/SmartProgress.tsx`, edits to `Lab.tsx`/`LookCard.tsx`. Shown only when `/health` answers. Failure, no helper or timeout falls back to the built-in Hand-inked look with a plain notice; Cancel does not fall back.
- **Download SVG fix:** every pixel look can now export SVG, traced on demand (`lib/lab/trace.ts`).
- **Licence guard:** flag `NEXT_PUBLIC_SMART_REDRAW`, off by default in production. Model licence note: `docs/SMART-REDRAW.md`.
- **Real run through the helper (pancake, minimal, standard):** 120 s total (cutout 7.6, analyse 27.3, redraw 71.7 for 4 steps, vector 9.6), 13 strokes, 1340 nodes, check passed (IoU 0.991, coverage 1.0). Real per-step progress works. No worker process or temp dir left behind.
- **Tests:** app 919 pass (37 new: `tests/trace.test.mjs`, `tests/smart.test.mjs`), goldens and screen goldens match, none re-recorded, no existing test changed. Browser checks (Chrome, 1280 and 390 wide, default and Night) used a paced fake worker.
- **Known limits:** the tracer rounds hard corners (harmless on thin strokes); the "1 Issue" badge in the dev screenshots is Next's dev overlay, not a console error; not run in Safari/Firefox.

## Browser spike (2026-10-04, `browser-spike/`, nothing else touched)

Question: can a small image-to-line-art model run in the browser? Full numbers and caveats in `browser-spike/REPORT.md`.

- Built a plain U-Net at three sizes (4.9 / 19.7 / 51 MB at fp16), "trained" 300 steps on the 22 run2 pairs. It only proves the pipeline: dice loss stayed about 0.70, partly because the teacher SVGs are in the subject-crop frame and the photos were not cropped to match. Real training must fix that.
- Exported to ONNX (fp32, fp16, int8 QDQ; outputs match PyTorch) and ran them in Chrome 154 with ONNX Runtime Web 1.30 on an M1 Max.
- One 512 px picture: WebGPU 0.04 / 0.09-0.12 / 0.33-0.40 s (S / M / L); WASM 4 threads 0.24 / 0.91 / 2.3 s; WASM single thread 0.94 / 3.6 / 9.2 s. Extra browser RAM 0.4-1 GB.
- int8 saved download (L: 102 -> 25 MB) but not time on WASM. U2-Netp and Silueta fail on WebGPU (MaxPool ceil_mode not implemented); they work on WASM.
- Cutout candidates under about 40 MB: U2-Netp 4.6 MB (0.33 s WASM), MODNet 6.6-26 MB (0.04 s WebGPU, portrait only). RMBG-1.4 quantised (44 MB) is NON-COMMERCIAL. Licences recorded in LICENSES.md (READ, thin; upstream licences UNVERIFIED).
- Under 10 s is achievable for the network on this machine by a wide margin. Quality of a model this small is the unproven part. Aim: about 20 MB fp16, ONNX Runtime Web, WebGPU first with 4-thread WASM fallback.
- Only one machine tested; no Safari/Firefox.
