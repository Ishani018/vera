# Sticker Studio, branch `stickerstudio-2`

A running log of the eleven stages. Each entry says what was built, what was
checked and how, what could only be checked in this sandbox, and what to look
at first on a Mac.

Branch: `stickerstudio-2`, from `stickerstudio`. Not merged into `main`,
`safety` or `stickerstudio`.

**Standing rules kept throughout.** `lib/render/coverHtml.ts`, the export
routes, the storage keys and the database names are untouched. The PDF strict
digests stay `e3e2a36e0ac60ce1` and `d4eeeb9e99cb1bfe`. `golden:screen` shows
0 pixels changed against a production build. No golden has been re-recorded.
No database version bump. No generative AI: every pixel here comes from
arithmetic that gives the same answer twice. No new dependencies.

## How the checks were run

`npm test`, then `npm run build`, then a production server, then
`npm run golden` and `npm run golden:screen` against it — in that order,
because the build wipes `.next` under a running server and the goldens need a
production build, not `next dev`.

Browser checks drive a real Chromium (Chrome for Testing 141.0.7390.37) against
`next start` on port 3000, and read pixels back out of the canvases and the
preview image rather than taking anyone's word for it.

---

## Stage 1 — Touch-up brush for background removal

**Commit:** `STAGE1HASH`

Automatic background removal is a guess, and on a real photograph it is wrong
in a few places every time: a shadow under an edge it keeps, a pale patch
inside the subject it takes. Stage 1 is the correction.

- **Restore** paints pixels back, **Remove** takes more away, and **Automatic**
  rubs out a correction and lets the removal decide again.
- **Size and softness.** Softness is the fraction of the brush radius that
  fades, with a smoothstep falloff rather than a linear one — a linear edge
  leaves a visible ring where the gradient stops changing, and people read that
  ring as part of the picture.
- **Undo and redo**, per layer: the touch-up has its own history, so undoing a
  correction never disturbs the colouring.
- **It feeds the same mask as everything else.** `applyTouch` runs on the
  subject mask *before* the die-cut outline or the feathering see it, so the
  exported alpha channel, the outline and the preview cannot disagree about
  where the sticker's edge is.
- **Saved with the draft, losslessly**, as a PNG asset under `touchAssetId`,
  overwritten in place so a long session does not leave a trail of orphans.

**How it is stored.** The layer is straight RGBA: the red channel is what the
pixel should become, the alpha is how strongly. That is why a soft brush can
blend towards its target instead of stamping a hard-edged hole, and why a PNG
round trip returns exactly what was painted.

**No version bump.** `touchAssetId` is a new *field* on the draft row, not a new
table or index. IndexedDB stores whole objects; only indexes need declaring, so
version 5 is unchanged.

**Checked:** `npm test` 436 pass / 0 fail (7 new). `npm run golden` — digests
`e3e2a36e0ac60ce1` and `d4eeeb9e99cb1bfe`, unchanged, strict tier comparing.
`npm run golden:screen` — 0 pixels changed on both boards against a production
build. `npm run build` clean. Plus 14 browser checks on a generated photograph:
that Remove takes pixels out of the exported picture and Restore puts exactly
them back (90930 → 89505 → 90930 solid pixels), that softness lands at 95
distinct strengths rather than one, that undo/redo/clear each work on the touch
layer alone, that the die-cut follows the corrected edge, and that the whole
correction survives a reload weight for weight.

**Only checked in the sandbox:** the brush was driven with a mouse. Touch and
stylus use pointer events and `touch-none` so they should behave, but they are
untested. The test photograph is generated arithmetically — a real camera
photograph has chroma noise and JPEG artefacts this does not.

**Look at first:** open a real photograph in *Keep as is*, turn on *Touch up the
cut-out*, and check the green and red wash lands under your cursor rather than
offset from it. The wash is positioned by the die-cut margin, which is the part
most likely to be a pixel out on a different screen.
