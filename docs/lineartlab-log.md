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
