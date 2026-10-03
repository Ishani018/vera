# Line Art Lab + Logo Mode — working log

Rollback point: branch **`pre-lineartlab`** at `ecdb47f` (and `pre-video` at
the same commit, for the Reel Maker brief). To go back:

```sh
git fetch origin && git reset --hard origin/pre-lineartlab
```

## Change of direction, recorded

The brief originally allowed pretrained models (Informative Drawings, in ONNX,
behind a licence check). It no longer does: **no models, no weights, no
downloads, no AI**. Everything is our own code implementing published
algorithms, so there is no third-party licence in the picture at all.

Nothing had to be torn out. The neural work was Stage 2 and had not been
started, so there was never an `onnxruntime-web` dependency, a model registry, a
`models:fetch` script, a stand-in model or an "AI-styled" card in the tree —
only a plan and a page of research. What changed:

- `docs/MODELS.md` is gone, replaced by `docs/ALGORITHMS.md`, which lists each
  algorithm with its published reference and states that all code is original
  and no third-party model or weight is included.
- The licence investigation that gated the old Stage 2 is no longer load
  bearing. It is kept below only because it is a useful record.
- The one line in `lib/lineart/xdog.ts` that referred to neural looks as an
  extra is rewritten. The classic engine itself is unchanged and stays.
- In the interface the line is *"Made with algorithms, no AI model."* and
  nothing more; no claims are made about anybody's disclosure rules.

The old research, for the record: Informative Drawings, Anime2Sketch and VTracer
are all MIT as *code* (sha256 of each LICENSE file was recorded), Potrace is
GPL-2.0 and was never going to be used, and the Informative Drawings *weights*
had no stated licence I could find or verify — which is the finding that makes
this change of direction the easy call rather than a sacrifice.

## What to look at first

1. `lib/lineart/xdog.ts` and `tests/xdog.test.mjs` — the classic engine, and the
   four real faults that measuring it turned up.
2. `docs/ALGORITHMS.md` — who each algorithm is after.

## Sandbox limits, recorded up front

| host | result |
| --- | --- |
| `github.com`, `raw.githubusercontent.com` | reachable |
| `registry.npmjs.org` | reachable |
| `huggingface.co`, `arxiv.org`, dataset pages | **403 at CONNECT — organisation egress policy** |

No longer load bearing for the work itself, since nothing is downloaded any
more, but it does mean the citations in `docs/ALGORITHMS.md` are given from
knowledge rather than fetched and are worth a second's checking before they go
anywhere public.

Two limits carried over from the Press Proof work, both of which change what a
screenshot here is worth:

- **Webfonts do not load in this sandbox's browser** (`ERR_CERT_AUTHORITY_INVALID`:
  the image's NSS store predates this session's proxy CA and there is no
  `certutil`). The checks serve the real woff2 files from a curl-fetched cache
  instead, so screenshots show the real faces. TLS verification is untouched.
- **This headless Chromium reports `(hover: none)` and `(pointer: none)`**, and
  Tailwind gates hover utilities behind `@media (hover: hover)`. The harness
  re-applies the app's own rules with that gate removed in order to see hover
  states at all.

## Dependencies added

None, in any stage so far.

---

## Stage 1 — the classic engine

`lib/lineart/xdog.ts`. Pure TypeScript, no model, no network, no clock and no
random number — there is a test that reads the source and fails if any of those
four appear. The same picture gives the same bytes on every machine, and four
pixel-hash fixtures pin that down.

Four looks, as the brief names them: **Ink pen**, **Fine**, **Bold**, **Sketch**.
Four sliders: thickness, detail, threshold softness, clean-up. The first three
use flow-based XDoG; Sketch uses the isotropic kind, because loose and grainy is
what Sketch is for.

### Measured, not guessed

Every range in `resolveClassic` was set by measuring the engine's own response
on two pictures — a synthetic test card and a synthetic photograph with grain,
smooth shading and hard edges — and the numbers are written into the comments so
the next person to move one knows what they are moving. Four things only showed
up because of that, and all four were real:

**The parameters were being scaled to the picture, and the scaling ate them.**
Following `pipeline.ts`, every pixel measurement was multiplied by the picture
size over a reference edge. But `sigma` sets the finest thing that can survive
and cannot usefully go below about half a pixel, so on a 700-pixel picture every
one of the four looks clamped to the same 0.35 and came out identical. Reversed:
the engine now works at one fixed size (`CLASSIC_WORKING_EDGE`, 1400) and the
picture is resampled to it, down and never up. The same scene uploaded at 1500
and 2200 pixels now gives 10.46% and 10.33% of the page in ink.

A consequence worth knowing for Stage 3: running the engine on a small picture
is **not** the same as running it big and shrinking the answer — 20.1% ink at
240 pixels against 13.0% at 960. The look cards must reduce the result, never
the input.

**The threshold did not transfer between pictures.** A difference of Gaussians
with `tau` below 1 does not answer zero on flat ground: a region of brightness
`v` comes back as `v(1 - tau)`, so the level meaning "paper" moves with how
bright the picture is. On identical settings the test card put 2.91% of its
pixels below the cut and the photograph put 0.63% — a drawing and a nearly blank
page, for reasons nothing to do with either picture's content. The response is
now divided by the local brightness with the flat-ground term taken off, so it
is zero on flat ground in any picture. Both now track each other across the
whole slider.

**The morphology was binary and erased the softness slider.** `dilate` and
`despeckle` in `pipeline.ts` are built for the colouring-book pipeline, whose
output is two values, and they test `=== INK`. Handed a soft-threshold result,
every half-tone failed that test and came out as paper: all four looks measured
exactly zero midtones. `thicken` (a minimum filter) and `deSpeckle` (binarised
to decide, applied to the grey) replace them here. Sketch now carries about 1%
of the page in genuine half-tone; it carried none.

**Transparent pictures came out as a black rectangle.** "Transparent" and
"black" are the same three bytes and only the fourth tells them apart, so a
cut-out PNG read as grey is a solid black page with no edges in it. Flattened
onto white first, like the existing pipeline does.

Two smaller ones: `phi` was first written with a range of 1.2 to 320 against a
response a few thousandths wide, so the soft end never reached its limit and
Sketch produced **no ink at all**; and the finer looks drew the film grain
across the whole sky until `preBlur` got a floor, for the same reason
`edgeBlurRadius` has one.

### Timings (this sandbox, Node, single-threaded)

| picture | Ink pen | Fine | Bold | Sketch |
| --- | --- | --- | --- | --- |
| 640x480 photo | 424 ms | 324 ms | 537 ms | 82 ms |
| 1500x1080 down to 1400 | 1766 ms | — | — | — |

The flow path costs roughly five times the isotropic one, and a full-size run is
most of two seconds. That is the argument for the worker in Stage 3, and for the
look cards being computed once at low resolution.

### Checked

797 tests pass (24 new). PDF digests `e3e2a36e0ac60ce1` and `d4eeeb9e99cb1bfe`
unchanged. `golden:screen` **0 pixels changed on both boards**. Build clean,
first-load JS still 103 kB — nothing here is imported by any page yet. The
fixed-picture export is byte-identical under both palettes.

**What could only be checked in the sandbox:** the drawings themselves, by
rendering PNGs in Node and looking at them. There is no browser path to the
engine yet, so there is nothing to drive at 1280 and 800 until Stage 3.

## Stage 2 — cleaner input

`lib/lineart/smooth.ts`. Edge-preserving smoothing in front of every look, with
one **Smoothing** slider, and local contrast normalisation tied to the same
slider because they are two halves of one intention: make the picture say the
same thing about a line in the shade as about a line in the sun.

Two filters, because they fail differently and the looks want different things.
**Bilateral** for Ink pen, Fine and Sketch — it averages a neighbourhood but
weights each neighbour by how similar it is as well as how close, so flat areas
go smooth and edges stay put. **Anisotropic Kuwahara** for Bold — it takes each
pixel's answer from the most uniform sector of an ellipse oriented along the
local tangent, which does not merely preserve detail but pushes the picture
towards flat shapes with crisp boundaries. That is the input a heavy pen wants,
and it is visible in the result: Bold's sphere was a broken crescent before this
stage and is a complete circle after it.

Both are original implementations written from the published mathematics.

### What it does, measured

On the grainy test photograph, with everything else held still, smoothing at
the preset level takes the ground from dense stipple to a sparse scatter and
removes the noise from the sky entirely. End to end the test asserts the
narrower claim: a grainy picture puts less than three quarters as much ink on
the page with smoothing on.

### Honesty about the approximations

Two things here are approximations, and both say so in the code rather than
being passed off:

- The **bilateral filter is separable here**, which it is not in truth: its
  weights depend on the centre pixel, so a horizontal pass then a vertical one
  is not the same operation. It is a well-behaved approximation that turns a
  cost growing with the square of the radius into one growing linearly, which
  is the difference between a filter that can sit behind a live slider and one
  that cannot.
- The **fast blur is three box passes**, used only for statistics — the
  structure tensor's components, and a local mean and variance. Measured
  against the exact kernel its mean error is under 0.005 on a 0-to-1 field,
  about one grey level in 255, and its worst error reaches 0.05 on a sinusoid
  near the blur's own scale. That is immaterial for a mean and fatal for a
  difference of two Gaussians, which is a few percent all told — so `gaussian`
  is still used there, and there is a test that reads the source and fails if
  anybody swaps it.

### Performance, because it nearly sank the stage

The first working version took **7.9 seconds** for Bold at the working size,
which is not a thing you can put behind a slider. Profiling rather than guessing
found the cost was spread, not concentrated, and two changes fixed it:

| | before | after |
| --- | --- | --- |
| Ink pen, full working size | 3632 ms | 2056 ms |
| Fine | 3309 ms | 2079 ms |
| Bold | 7898 ms | 3150 ms |
| Sketch | 2180 ms | 830 ms |

The first change: the eight sectors of the Kuwahara filter are eight equal
sectors of a turn, which **are** the octants, so an `atan2` per sample — 119
million of them at the working size — becomes a sign test and a magnitude test.
There is a test that checks the two agree, because "identical" is a claim.

The second, and much the larger: `gaussian` is exact and costs its radius per
pixel, which put 655 ms into the flow field and 861 ms into the contrast
normalisation. Neither of those is differencing anything, so both moved to the
box approximation above and fell to roughly a fifth.

A first attempt at tuning — reducing the Kuwahara radius — moved the total by
84 ms and was the wrong tree entirely. It is recorded because the profile is
the point: three guesses would not have found this.

### Checked

812 tests pass (15 new, and 24 XDoG fixtures re-recorded **on purpose**, once,
because this stage puts smoothing in front of every look; the reason is written
beside them). PDF digests `e3e2a36e0ac60ce1` and `d4eeeb9e99cb1bfe` unchanged.
`golden:screen` **0 pixels changed on both boards**. Build clean, first-load JS
still 103 kB — nothing here reaches a page yet. No dependencies added.

**What could only be checked in the sandbox:** the drawings, by rendering PNGs
in Node and looking at them, and the timings, which are single-threaded Node on
this machine rather than a browser worker on yours. There is still no browser
path to the engine, so there is nothing to drive at 1280 and 800 until Stage 5.

## Stage 3 — colouring page mode

`lib/lineart/colouring.ts`. A different question from the pen looks: not "where
is this darker than its surroundings" but "what are the areas". Colours reduced
by k-means in Lab, the picture cut into connected regions, slivers absorbed, and
the outline is whatever separates one region from the next. Three controls:
**Complexity** (4 to 24 colours), **Minimum region size**, **Line thickness**.

### Closed outlines, by construction rather than by care

This is the thing the mode rests on: one gap and a tap of the fill tool turns
the whole sheet pink. It is not approached by drawing carefully. A pixel is
outline when the pixel to its right or the pixel below it has a different region
label, and that definition alone forces the guarantee — along any four-connected
path of non-outline pixels the label cannot change, because each of the four
ways a neighbour can sit is a case where one of the two pixels would have been
marked. The proof is four lines and it is written at the top of the file.

The right and bottom edges of the picture are marked too. Without them a fill in
a region touching the edge escapes round the outside of the page and into
everything else that touches it.

The test does not take the proof's word for it: it fills every white area of a
finished page exactly the way a bucket tool would, four-connected and knowing
nothing about regions, and asserts each area lies inside a single region. Run at
three complexities and at four line thicknesses, because thickening is a
minimum filter and could in principle have been the thing that broke it.

### Decisions worth knowing

- **Lab, not RGB.** The question being asked is "are these the same colour to a
  person", which is what Lab is for and what RGB is not.
- **Deterministic seeding.** k-means++ picks its starting centres with a
  weighted draw, which is the part that makes it good and the part that makes it
  unrepeatable. The weighting is kept and the draw comes from a fixed xorshift,
  so the centres are still spread across the picture and the answer is still the
  same on every machine.
- **Fitted on a sample, applied to every pixel.** A dozen rounds over 1.5
  million points is slow and the centres a 20,000-point sample finds are
  indistinguishable. The sample is a fixed stride, so it is repeatable too.
- **Merging repeats until nothing moves.** One pass leaves a tide line: a sliver
  whose only neighbours are also slivers has nowhere to go until they become
  something. There is a test built from a row of ever-smaller slivers that fails
  on a single-pass implementation.
- **Ties go to the bigger neighbour.** Otherwise a sliver sitting between two
  equally-close colours joins whichever one a `Set` happened to iterate first,
  and the output stops being deterministic in a way nothing would catch.
- **The three Lab planes are smoothed separately.** They are three independent
  pictures to an edge-preserving filter; one that mixed them would move colours
  rather than clean them. Each goes in and out on its own scale, since lightness
  runs 0 to 100 and the colour axes run either side of zero.

### Timings and output

640×480 photograph, all three complexities: **679, 691, 685 ms**. Ink on the
page 7.1%, 9.4%, 13.4% as complexity rises from 15 to 80. Noticeably cheaper
than the pen looks, because there is no flow field and no per-pixel sampling
along it.

### Checked

827 tests pass (15 new). PDF digests `e3e2a36e0ac60ce1` and `d4eeeb9e99cb1bfe`
unchanged. `golden:screen` **0 pixels changed on both boards**. Build clean,
first-load JS still 103 kB. No dependencies added.

**What could only be checked in the sandbox:** the pages themselves, rendered to
PNG in Node. The hand-off into the existing colouring tools is Stage 7 and is
not wired up yet, so there is still nothing to drive in a browser.
