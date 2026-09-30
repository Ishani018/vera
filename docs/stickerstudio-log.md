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

**Commit:** `2680d04`

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

---

## Stage 2 — Send to design

**Commit:** `5106297`

A **Send to a design…** button next to Download and Save, offering the four
boards a sticker is actually for: Instagram post, Pinterest pin, postcard,
bookmark. Pressing one makes a standalone design of that size with the sticker
placed in the middle and opens it.

**The picture is copied, not referenced.** The design gets its own asset in the
existing `assets` table. Deleting the sticker afterwards — or emptying the
trash, or re-tracing it at a different threshold — cannot reach into a design
that was finished weeks ago and change or empty it. That costs a copy of the
bytes and it is worth it: the alternative is a design that quietly breaks long
after the decision that broke it.

**Placed, not filled.** The sticker is centred in the board's *safe* area at 82%
of it, contained rather than cropped, keeping its own proportions. Not 100%,
because a sticker touching the safe margin on two sides reads as a mistake
rather than as a choice, and the first thing anyone does with a design is move
things anyway — so it starts somewhere sensible to adjust from.

Nothing new was added to the data model: a standalone design with one
`CoverSticker` on it is exactly what the design editor already makes.

**Checked:** `npm test` 441 pass / 0 fail (5 new). Goldens unchanged,
`golden:screen` 0 pixels changed, build clean. Plus 13 browser checks: that all
four boards are offered and say the right sizes, that pressing one opens
`/design?id=…`, that exactly one design is made at the asked-for preset, that
the sticker's centre lands on the board's centre to within a point
(375.0, 562.5 of 375, 562.5 on a Pinterest pin), that it stays inside the board
and keeps its aspect ratio to three decimals, that its asset id is a *new* one,
and — the point of the whole stage — that the design's picture still opens
after every other asset in the store is deleted.

**Only checked in the sandbox:** the design opens in this container's Chromium.
I did not check how it looks at a real screen size or that the design editor's
own controls behave with a sticker it did not place itself.

**Look at first:** send a sticker to a Pinterest pin and check it is centred and
not touching the safe guides, then delete the sticker from My stickers and
reopen the design — the picture should still be there.

---

## Stage 3 — Real-input testing of background removal

**Commit:** `9254990`

Three realistic inputs, measured before and after, with the pictures kept in
`docs/background-removal/` — source, before and after for each. See the README
there; it has the numbers and the side-by-side.

The pictures are generated arithmetically from a fixed seed rather than
photographed, so the comparison is repeatable and nobody's photograph is in the
repository. No AI: the grain is a linear congruential generator, the lighting a
radial gradient, the shapes arcs and béziers.

**The worst failure found:** a page under a desk lamp left a large blotch of
unremoved paper in the bright corner, with about 7,500 grains scattered round
it, and the cut-out in seventeen pieces. One averaged paper colour with a fixed
tolerance cannot reach both ends of an unevenly lit page.

**Three changes, each earning its place on one of the three pictures:**

1. **It walks down a gradient rather than measuring from one colour.** A pixel
   joins the background if it is close to *the pixel it spread from* as well as
   broadly paper-like. `flood` gained an optional second argument — the pixel a
   step comes from — which `despeckle` and the colouring fill ignore.
2. **It ignores grain.** Regions of 48 pixels or fewer become whatever
   surrounds them. This was the big one: 7490 specks to 2.
3. **It cuts softly.** Where the flood stopped because one step was a little
   too big — a fade rather than a drawn line — the boundary pixel comes out
   part-transparent in proportion.

| Picture | Specks before → after | Pieces before → after | Soft edge px before → after |
|---|---|---|---|
| cream | 0 → 0 | 2 → 2 | 0 → 69 |
| texture | 7490 → **2** | 17 → **2** | 0 → 104 |
| object | 85 → **0** | 2 → 2 | 0 → 73 |

**Two bugs found and fixed while doing this**, both mine, both in the new code:

- The despeckler capped its traversal of a region and moved on, leaving the rest
  of a large region unvisited but its frontier marked — so a later round found
  the middle of the picture as a fresh, small region and punched a hole in it.
  Traversing every region all the way fixed it, and that single fix is most of
  the 7490 → 2.
- The softening faded any boundary pixel whose colour was near the paper, which
  erased a transparent ring around a subject that the flood had stopped at for
  a different reason. It now softens only where the flood stopped *because the
  step was too big*, which is the case that means a fade.

**Reverted:** a tapering step allowance, strict the further from paper a pixel
is, meant to stop the flood following a soft shadow into its own object. It
helped the shadow slightly and hurt uneven lighting badly — brightly lit paper
is itself far from the average paper colour — taking `texture` from 502 specks
to 1068 with the bright corner in fragments. Taken out, with the reason recorded
in the code so nobody tries it twice.

**Said plainly in the interface**, in the background-removal panel: busy
photographs, hair and fur, glass and anything see-through, a soft shadow
touching the object, and a background that fades from one colour to a different
one. Each followed by the sentence that matters — that the touch-up brushes from
Stage 1 are what those cases are for.

**Checked:** `npm test` 447 pass / 0 fail (6 new, including one that pins the
tuning defaults so changing them is deliberate). Goldens unchanged,
`golden:screen` 0 pixels changed, build clean.

**Only checked in the sandbox:** these three pictures are arithmetic, not
photographs. A real camera adds chroma noise and JPEG blocking that none of them
have, and a phone photograph of a sketchbook has lens vignetting that will look
to the flood like more uneven lighting. The direction of every change is right
for that, but the numbers would differ.

**Look at first:** open `docs/background-removal/texture-before.png` and
`texture-after.png` side by side — that pair is the whole stage in one picture.
Then photograph a real drawing under a lamp and see whether the bright corner
comes away.

---

## Stage 4 — Recolour tools

**Commit:** `c387d93`

An **eyedropper** and a **colour swap**, in a *Change a colour* panel, both
working by pointing at the picture.

Two places need recolouring and they are not the same place, so they work
differently and the screen says which one happened:

- **The colouring** is flat areas somebody filled, so a swap there is exact:
  the pixels that are that colour become the other one, as one undoable step on
  the layer. The message says "in the colouring".
- **A kept picture** is a photograph or a painting, where "the red" is a
  thousand reds. So a swap there has a tolerance, it is stored as a *setting* on
  the draft rather than painted into pixels, and it is re-applied at export size.
  The message says "in the picture", and the swaps are listed in order with a
  per-swap undo.

**Tolerance is measured in Lab**, not RGB, because a tolerance in RGB decides
that navy and black are closer than two pinks. A test pins this: two pairs of
colours exactly equal in RGB come out unequal in Lab.

**Swaps are a recipe read top to bottom.** Red→blue then blue→green makes the
original red green, which is what anyone reading the list expects. Each pixel is
decided once against the colour of the step before.

**The eyedropper reads the preview.** That is the only place the composited
picture exists on this side — the pipeline runs in a worker and hands back a
PNG — and it is exactly the colour the person is pointing at rather than a guess
about what the pipeline would have produced. The point is corrected for the
die-cut margin first.

For traced modes the lines are one colour, which the existing **Line colour**
control already changes all at once; the panel says so rather than pretending
there is something else to point at.

**No version bump.** `swaps` is a plain field on the draft row.

**Checked:** `npm test` 456 pass / 0 fail (9 new). Goldens unchanged,
`golden:screen` 0 pixels changed, build clean. Plus 14 browser checks across
both paths: that the eyedropper picks `#BD4442` out of a photograph, that
swapping it for `#11AA44` turns 65,658 pixels green and undo takes every one of
them off again, that the swap is stored as `{from, to, tolerance}` rather than
baked in, that a swap on the colouring changes exactly 111,656 pixels and no
more, and that pointing at a see-through part says so instead of doing something
odd.

**Only checked in the sandbox:** colour accuracy was judged by reading pixels
back, not by eye on a calibrated screen. The Lab conversion is the app's
existing one, shared with the background removal.

**Look at first:** open a photograph, use the eyedropper on it, then swap that
colour and slide *How close a match counts* from 0 to 60 — the point where it
starts eating the rest of the picture is the number worth knowing for your own
photographs.

---

## Stage 5 — Flip, rotate and crop

**Commit:** `056fccb`

A *Flip, turn or crop* panel: flip left-to-right and top-to-bottom, quarter
turns both ways, a free angle, drag-a-box crop, **Trim to the sticker**, and
**Whole picture**. Undo and redo of its own.

**Lossless, as asked.** The upload is stored once and never written on. All of
this is four numbers on the draft — `{ flipX, flipY, rotate, crop }` — applied
on the way to the preview and on the way to the export, at the size each needs.
Turning a picture five degrees and back costs nothing; baking it in would have
cost two resamplings and left the drawing softer than it started. A browser
check confirms the stored asset is still 900 × 600 after every one of these.

**Quarter turns move pixels; they do not sample them.** Four of them come back
byte for byte — a test asserts exactly that, and so does a browser check
(54,868 ink pixels before and after). A general rotation would give very nearly
the same answer, and "very nearly" on a right angle means a drawing that gets
blurrier every time you turn it.

**Free angles are bilinear and sampled backwards** — for each output pixel,
where did it come from — because sampling forwards leaves holes wherever two
source pixels land on the same destination. It is the app's own arithmetic
rather than the browser's resampler, so it is the same answer on any browser.

**A bug this stage found and fixed:** a turned picture came back with four
solid black corners. Rotation leaves the corners transparent, and the tracer
reads a *colour* — a transparent pixel's colour is zero, which is black, so the
corners traced as ink. They are now flattened onto the picture's own border
colour, so the background removal treats them as what they look like, more
paper, and takes them away. The browser check that caught it reads the four
corner alphas of the preview: 255,255,255,255 before, 0,0,0,0 after.

**Order is flip, then turn, then crop**, and the crop is expressed against the
picture *after* the first two, so it stays where it was put. Framing is applied
to the source before tracing, so the tracer, the background removal and the
colouring grid all agree about what the picture is — a crop applied later would
leave the colouring painted on a picture that no longer exists.

**No version bump.** `frame` is a plain field on the draft row.

**Checked:** `npm test` 471 pass / 0 fail (15 new). Goldens unchanged,
`golden:screen` 0 pixels changed, build clean. Plus 17 browser checks including
the four-quarter-turn round trip, that a 30° turn makes room for the corners
(900×600 → 1080×970) and leaves them see-through, that a rubber band shows while
dragging, that a stray click is not a crop, and that trimming to the sticker
takes the empty margins off without losing ink.

**Only checked in the sandbox:** free rotation was checked for geometry and
transparency, not judged for sharpness by eye. Bilinear on a hard-edged drawing
softens the strokes a little — that is inherent to any angle that is not a
quarter, and it happens once at export however many times the slider moves.

**Look at first:** turn a drawing 30°, then straighten it, and check it looks as
crisp as it did — that is the whole claim of "settings, not pixels". Then drag a
crop and press *Trim to the sticker* to see it narrow the crop you already made
rather than replace it.

---

## Stage 6 — Text on a sticker

**Commit:** `72d6a6e`

A *Put words on it* panel: the words, the font from the existing picker, colour,
size, curve, position, and an outline. Up to eight lots of words per sticker,
each with its own settings, and undo and redo over the lot.

**The curve is the cover's curve.** `lib/cover/curve.ts` gained one exported
function, `textArc`, which is the circle a line of text is bent around — sweep,
direction, a radius per line. `curvedText` now calls it, so the cover renderer
and Sticker Studio bend text around exactly the same circle. What they do *on*
that circle is different and has to be: an SVG has a text path, a canvas has
nothing of the kind, so the studio measures each glyph, turns it to face along
the arc and draws it one at a time.

**Drawn onto a canvas, never through `coverHtml.ts`.** And on the *main thread*
rather than in the worker, for one reason: fonts. The families come from Google
at runtime, a worker has no document to load them into, and text drawn in a face
that failed to arrive is text in the wrong face — silently, and only visible in
a file somebody has already sold. On the main thread the font can be asked for
and waited on first. So the pipeline makes the sticker and the words go on
afterwards, for the preview and the export alike.

**Sizes and positions are fractions of the sticker**, so the same words land in
the same place whether it is exported at 500 pixels or 2000.

**The outline is stroked first and the fill painted over it**, so it grows
outward from the letters instead of eating into them — the same reason the
die-cut ring is drawn before the artwork. It is stroked at twice the asked-for
width because half a stroke falls inside the letter.

**A bug this stage found and fixed:** a hanging line came out upside down and
reading backwards, like the bottom half of a rubber stamp. The letters were
being drawn on the far side of their circle. They now stand on the side facing
the centre whichever way the line bends, and `glyphSpot` writes that arithmetic
out in the open so two tests can pin it — that an arch drops at its ends and a
hanging line rises at them, and that both read left to right.

**A bug in my own browser checks, worth recording** because it made three
results look like code faults: the helper that drives a slider walked one level
too far up the DOM and found the *first* slider in the panel instead of the
named one, so every "set the curve" was setting the size. Chasing a hanging
curve that would not appear is what turned up the real upside-down bug behind
it.

**No version bump.** `texts` is a plain field on the draft row.

**Checked:** `npm test` 479 pass / 0 fail (12 new). Goldens unchanged — including
`curve.test.mjs`, which matters here because `curvedText` was refactored to call
the new shared function and had to keep producing the same paths.
`golden:screen` 0 pixels changed, build clean. Plus 15 browser checks: that the
words appear in the chosen colour (13,001 pixels of `#FF00AA`), that size grows
them, that curving keeps the letters rather than losing them (49,373 straight →
49,279 curved), that arched and hanging come out within a third of each other,
that an outline adds 50,623 white pixels outside without replacing the letters,
that undo and redo work, and that everything survives a reload.

**Only checked in the sandbox:** the fonts loaded from Google in this container.
A machine that cannot reach Google Fonts falls back to the category fallback —
the text still draws, in a different face, and `waitForFonts` cannot tell the
difference. Kerning between adjacent letters is lost on a curve, because each
glyph is measured and placed on its own; at large sizes in a tightly kerned face
this shows, and there is no fixing it without shaping the whole run.

**Look at first:** put words on a sticker, slide *Curve* from -100 to 100, and
watch it pass through straight. Then try a display face at a large size — that
is where the missing kerning on a curve will show if it is going to.

---

## Stage 7 — Decorations

**Commit:** `STAGE7HASH`

A *Finishing* section with three, all off to start with: **drop shadow**
(softness, offset both ways, strength, colour), **glossy highlight** (strength,
direction of the light) and **paper texture** (strength, coarseness).

**Deterministic, which here is the whole point.** The grain comes from a hash of
the coordinates, not a random number generator — a pure function of x and y,
with no seed to carry and no state to get out of step. A browser check renders
the same sticker twice with the whole pipeline running in between and compares
the two PNGs: byte for byte identical. A decoration that came out a little
different each time would make the preview a lie.

**The shadow goes under, and that is an order, not a detail.** It is composited
first and the sticker put back over it, so a white sticker stays white. A test
pins exactly that, because the other order is the obvious way to write it and it
turns every pale sticker grey.

**The shadow asks for room.** The padding that already existed for the die-cut
now also covers the shadow's blur and offset, so a sticker whose artwork runs to
the edge does not have its shadow cut off by the edge. The picture grows to
suit — 800 px wide to 932 in the browser check.

**The shadow is cast by the whole thing,** outline included: a die-cut sticker is
one piece of vinyl and casts one shadow, so the ring is merged into the shape
the shadow is made from.

**Gloss and grain never touch the alpha channel.** Both are checked for that,
in a test and in the browser — 75,043 solid and 422,557 clear pixels before and
after. Only the shadow may change the shape, because a shadow that added nothing
outside the sticker would not be a shadow.

**Order:** grain, then gloss, then shadow. Grain and gloss belong to the
sticker's own surface; a shadow is cast by the finished thing rather than
textured along with it.

**No version bump.** `decorations` is a plain field on the draft row.

**Checked:** `npm test` 489 pass / 0 fail (10 new). Goldens unchanged,
`golden:screen` 0 pixels changed, build clean. Plus 11 browser checks including
the byte-for-byte determinism one.

**Only checked in the sandbox:** the gloss is a soft band across the sticker,
not a physically modelled reflection, and how convincing it looks is a matter of
taste I cannot check by counting pixels. The grain is tuned against the
generated fixtures; on a very small sticker exported at 500 px a coarseness of 3
may read as noise rather than paper.

**Look at first:** turn on all three at once on a plain-coloured sticker and
look at it at full size — there is a rendered example at
`docs/background-removal/` scale in the log's own screenshot, but your own
judgement of the gloss is the only one that matters here. Then export the same
sticker twice and compare the files.
