# Isnaevy roadmap

Four waves, in order. Written for one person working part-time on a tool for
KDP self-publishers who need covers, launch posts and mockups.

Day estimates are focused working days for one person who knows this codebase.
They include the tests and the golden fixtures, because in this repo those are
not optional and are usually a third of the work.

**The constraint that shapes everything below:** `lib/render/coverHtml.ts` is
the only renderer, it is shared by the screen and the export, and its output is
fingerprinted. Every change to it risks the two digests `e3e2a36e0ac60ce1` and
`d4eeeb9e99cb1bfe`. That is why wave (a) is one batch and not five.

---

## Wave (a) — one renderer batch

Shapes, text outline and shadow, crop, flip, image filters. **All of it lands
together, in one design, behind one review.** See "The combined design" below
for why, and for the rule about existing work.

| Feature | Days | Touches `coverHtml.ts` |
| --- | ---: | --- |
| Shapes: rectangle, ellipse, line | 5 | **Yes** |
| Text outline and shadow | 3 | **Yes** |
| Crop | 5 | **Yes** |
| Flip horizontal and vertical | 2 | **Yes** |
| Image filters: brightness, contrast, saturation | 3 | **Yes** |
| Golden fixtures, migration, cross-checks | 4 | — |
| **Wave total** | **22** | |

### a1. Shapes — 5 days

Rectangle and ellipse with fill, stroke colour, stroke width, corner radius and
opacity. A line is a thin rectangle, which is simpler and honest: nothing about
a line needs a different primitive, and a rotated thin rectangle is a line at
any angle.

**Files:** `lib/types.ts` (new `CoverShape`, `CoverSpec.shapes?`), new
`lib/render/shapes.ts`, `lib/render/coverHtml.ts`, new
`components/cover/ShapeLayer.tsx`, `components/cover/StickerLayer.tsx` (extract
the gesture machinery both will share), `components/CoverDesigner.tsx`,
`lib/cover/stickerEdit.ts` (generalise `snapMove`, `resizeFromCorner`,
`angleTo` from `CoverSticker` to a placed-box type), `lib/projects.ts` and
`lib/designs.ts` (migrations), `lib/projects.ts` (`itemsOn`, so shapes appear on
cards).

**What could break:**
- **Z-order.** Shapes get their own array and render as their own band. My
  recommendation is *below* stickers, so `restack` works within shapes and the
  renderer changes least. The cost is that a scrim over a photograph is not
  possible until cross-kind layering exists — which is a real limitation and
  should be written down, not discovered.
- **Old files opening in a new build** is fine (`shapes ?? []`). **New files in
  an old build** is the one to check by hand: nothing in the current code
  iterates unknown keys, so a design with shapes should open and simply not draw
  them. Worth proving against a checkout of the previous commit rather than
  assuming.
- Empty-array rendering must produce byte-identical HTML for every existing
  document. The goldens are the proof.

### a2. Text outline and shadow — 3 days

The single biggest win for covers: a title over a photograph is unreadable
without one of them, and right now neither exists.

**Files:** `lib/types.ts` (`FontSpec` gains `outline` and `shadow`, both
optional), `lib/render/coverHtml.ts`, `components/FontControls.tsx`,
`components/cover/SelectionToolbar.tsx`, `components/CoverDesigner.tsx`.

**What could break:**
- **Curved text is drawn as SVG, straight text as HTML.** They take outline and
  shadow through different properties (`paint-order`/`stroke` versus
  `-webkit-text-stroke`/`text-shadow`), and they will not match unless both are
  derived from one function. This is exactly the shape of the 1/72 bug.
- `-webkit-text-stroke` centres the stroke on the glyph edge, thinning the
  letterform. At thumbnail size that can make a title *less* legible, so it
  should be paired with the browse-size check.
- Shadows print. A hard shadow on a paper cover reads as a mistake; keep the
  defaults gentle, as the sticker shadow already is.

### a3. Crop — 5 days

Non-destructive: a normalised rectangle on the sticker, never a new bitmap.

**Files:** `lib/types.ts` (`CoverSticker.edits`), `lib/render/coverHtml.ts`,
`lib/render/stickers.ts` (**`stickerDpi` must account for it**),
`components/cover/StickerLayer.tsx` (crop handles), `components/CoverDesigner.tsx`.

**What could break:**
- **`stickerDpi` starts lying.** It divides `naturalWidth` by the printed size.
  Crop away half the pixels and the "300 DPI" badge is wrong by 2× — on the one
  number an author trusts before paying for a print run. This must ship in the
  same change, not after.
- **Bending.** `lib/cover/bendImage.ts` pre-renders arced pictures through a
  canvas. Crop has to compose with that warp in a defined order, and it is the
  fiddliest part of the wave.
- The cover's `frontImage` already has `fit: cover | contain`. Crop and fit are
  two answers to one question; decide which wins and say so, or they will
  disagree.

### a4. Flip — 2 days

**Files:** `lib/types.ts`, `lib/render/coverHtml.ts`,
`components/cover/StickerLayer.tsx`, `components/cover/SelectionToolbar.tsx`.

**What could break:** **transform order.** `rotate` already exists;
`scaleX(-1)` composed in the wrong sequence gives a different result, and it
will look right on screen and wrong in the PDF unless both read one helper.
Flipping a bent picture needs deciding: flip then bend, or bend then flip.

### a5. Image filters — 3 days

Brightness, contrast, saturation as CSS `filter`, stored as numbers.

**Files:** `lib/types.ts`, `lib/render/coverHtml.ts`,
`components/cover/StickerLayer.tsx`, `components/cover/SelectionToolbar.tsx`.

**What could break:** the least of the five. Watch that `filter` on an element
that also has `box-shadow` changes how the shadow is drawn, and that a filtered
element creates a stacking context — which can change what overlaps what.

### The combined design

**One shape of change, applied five times.** Every one of these is an optional
field that means "identity" when absent:

```
CoverSpec.shapes?: CoverShape[]        // absent → no shape band is emitted
CoverSticker.edits?: {                 // absent → the image is drawn as now
  crop?: { x, y, width, height }       // normalised 0–1
  flipX?: boolean
  flipY?: boolean
  brightness?: number                  // 1 is unchanged
  contrast?: number
  saturation?: number
}
FontSpec.outline?: { widthPt, color }  // absent → no stroke
FontSpec.shadow?: { dx, dy, blur, color }
```

Three rules make the batch safe:

1. **Absent means identity.** No migration writes any of these into an existing
   document. A cover saved yesterday produces the same HTML, byte for byte,
   after the change as before it.
2. **Screen and export read one function per effect.** Neither
   `coverHtml.ts` nor `StickerLayer.tsx` is allowed its own arithmetic. Every
   effect gets a helper in `lib/render/` that returns the values, and both call
   it. This is the rule the 1/72 bug was caused by breaking.
3. **A golden fixture per feature, and the existing two untouched.**

### Golden fixtures for wave (a)

| Fixture | Proves |
| --- | --- |
| `shapes.fixture.json` | a rectangle, a rounded rectangle, an ellipse and a line land at the right place and size in the PDF |
| `texteffects.fixture.json` | outline and shadow on straight text *and* on curved text, so the two paths are compared against each other |
| `imageedits.fixture.json` | a cropped, flipped, filtered picture, and the same picture bent as well |

Each is a new case in `scripts/golden.mjs` with its own digest. Plus one new
`screen-*` case so the same three are checked on screen, since the screen is
where both historical bugs lived.

### The rule for wave (a)

> **Before any golden fixture contains a shape, an effect or an edit, the two
> existing PDF digests must still be `e3e2a36e0ac60ce1` and `d4eeeb9e99cb1bfe`,
> and `npm run golden:screen` must show 0 pixels changed.**
>
> That check runs first, on an empty implementation — the types added, the
> renderer branching added, and nothing using any of it. Only once the existing
> work is proven unmoved does the first fixture gain a shape.
>
> If a digest moves at any point, the change is wrong until explained. A digest
> is never re-recorded to make a failure go away.

---

## Wave (b) — templates and mockups

| Feature | Days | Touches `coverHtml.ts` |
| --- | ---: | --- |
| Six starter templates | 6 | No |
| Book mockups | 8 | No — a new renderer beside it |
| **Wave total** | **14** | |

### b1. Starter templates — 6 days

Built from text, shapes and pictures only, so they depend on wave (a).

**Files:** new `lib/templates/` (the template data), `lib/tiles.ts`,
`components/cover/CoverTemplates.tsx` (or a new Templates rail item),
`components/CoverDesigner.tsx`, `lib/projects.ts` (thumbnails).

**What could break:**
- Applying a template must **keep pictures already placed**, which means it
  replaces text and shapes and merges stickers, not a wholesale swap of
  `CoverSpec`.
- Placeholder text must be obviously replaceable. "Your heading" beats lorem
  ipsum, and the first click should select the whole box so typing replaces it.
- Templates encode point sizes for one board. Applying an Instagram template to
  a Pinterest pin needs wave (c)'s resize, or it must simply be refused.

### b2. Book mockups — 8 days

See the section below, which answers this properly.

**Files:** new `lib/render/mockupHtml.ts`, new `lib/mockups.ts` (the presets),
`app/api/export/board/route.ts` (a `mockup` field — additive),
`lib/exportClient.ts`, a new mockup panel component.

**What could break:**
- **A mockup must never be uploadable as a cover.** It is a marketing picture
  with perspective and a shadow. Keep it on the PNG/JPG board path and never
  offer it as a cover PDF.
- Fonts have to be embedded the same way the cover export embeds them, or the
  mockup renders in a fallback face and looks like a different book.

---

## Wave (c) — multi-page and resize

| Feature | Days | Touches `coverHtml.ts` |
| --- | ---: | --- |
| Multi-page designs | 10 | **Yes** |
| Resize to another format | 6 | No |
| **Wave total** | **16** | |

### c1. Multi-page designs — 10 days

A carousel post is several boards; so is a mockup set.

**Files:** `lib/types.ts` (`Design.pages: CoverSpec[]`, keeping `cover` as page
one for old records), `lib/render/coverHtml.ts`, `lib/exportClient.ts`,
`app/api/export/board/route.ts`, `components/DesignEditor.tsx`,
`components/CoverDesigner.tsx`, `lib/projects.ts` (thumbnails show page one).

**What could break:**
- This is the **largest data-model change in the roadmap**. Every place that
  says `design.cover` becomes a place that says "which page?". Missing one means
  editing page two and exporting page one.
- Export becomes N renders per design, which multiplies time and memory.
- The undo history is per-board today and would need to know about pages.

### c2. Resize to another format — 6 days

One post becomes the pin, the story and the bookmark.

**Files:** new `lib/resize.ts`, `lib/presets.ts`,
`components/DesignEditor.tsx`, `components/DesignWorkspace.tsx`.

**What could break:** resizing is proportional scaling plus judgement. A square
to a tall pin leaves everything stranded in a band unless the layout is
re-flowed. Be honest that it produces a **starting point**, not a finished
design, and never overwrite the original — always create a copy.

---

## Wave (d) — the designer grows up

| Feature | Days | Touches `coverHtml.ts` |
| --- | ---: | --- |
| Multi-select, align, distribute | 6 | No |
| Grouping | 5 | **Yes** |
| Sticker Studio | 8 | No |
| Brand kit | 4 | No |
| **Wave total** | **23** | |

### d1. Multi-select, align, distribute — 6 days

**Files:** `components/CoverDesigner.tsx` (selection becomes a set),
`components/cover/StickerLayer.tsx`, `components/cover/SelectionToolbar.tsx`,
new `lib/cover/align.ts`.

**What could break:** selection is a single id in several places today.
Widening it touches the toolbar, the inspector panels and the keyboard
handling. No renderer change, which makes this the safest item in wave (d).

### d2. Grouping — 5 days

**Files:** `lib/types.ts`, `lib/render/coverHtml.ts`,
`components/cover/StickerLayer.tsx`, `lib/cover/stickerEdit.ts`.

**What could break:** a group is a tree, and everything in this codebase is a
flat array in paint order. That is a genuine structural change — it touches
restacking, snapping, hit-testing and the renderer at once. **Do it last, or
not at all**; align and distribute cover most of what people actually want
groups for.

### d3. Sticker Studio — 8 days

Turn a photograph into a reusable sticker: cut out, tidy the edge, name, tag,
keep. Uses the existing line-art pipeline machinery.

**Files:** new `lib/lineart/cutout.ts`, new studio component,
`lib/cover/library.ts`, `components/cover/StickerLibrary.tsx`.

**What could break:** background removal without AI means thresholding and
edge-following, which works on clean studio-style photographs and poorly on
busy ones. Set expectations in the interface or it reads as broken. **No
generative AI here** — the no-AI-disclosure property is worth more than the
feature.

### d4. Brand kit — 4 days

Three colours, two faces, a logo, an author photo.

**Files:** `lib/db.ts` (**a new table — this needs a version bump to 5**),
new `lib/brand.ts`, `lib/palette.ts`, `components/cover/ColourField.tsx`,
`components/FontPicker.tsx`.

**What could break:** very little, and the v4→v5 precedent is established and
additive. Two cautions: `versecraft:recentColours` must not move, and applying
a brand to an existing design must be an explicit action, never automatic.

---

## Book mockups, in detail

### Deterministic, and no AI

The insight that makes this cheap: **do the mockup in the same HTML renderer,
so the cover is real text and real vectors under a CSS transform** — not a
low-resolution bitmap being warped.

```
Design (points)
   ↓
mockupHtml.ts  — the cover's own HTML, inside a transformed container
   ↓
headless Chrome (already pinned, already deterministic)
   ↓
PNG at the requested scale
```

Everything is a CSS transform with numbers chosen by the mockup preset:
`perspective`, `rotateY`, `translateZ`, a linear-gradient for the page block, a
second gradient for the spine, and a blurred ellipse for the shadow. No
photography, no third-party assets, no model. The same input gives the same
output, which the existing golden system already proves for the cover path and
can prove for this one.

### The four types

| Type | How it is built | Days |
| --- | --- | --- |
| **Flat** | The front cover, a soft drop shadow, a background colour or gradient. A rounded corner and a subtle page-edge line on the right. | 1 |
| **3D book** | A container with `perspective`, the front rotated a few degrees on Y, a spine face rotated 90° and joined at the left edge, a page block drawn as a repeating linear-gradient on the right, and a contact shadow beneath. | 3 |
| **Stack** | Three or four copies of the flat mockup at small offsets and rotations, each with its own shadow, back to front. Mostly composition. | 1.5 |
| **Phone screen** | A device outline drawn as shapes — rounded rectangle, bezel, a notch — with the design inside the screen area, optionally at a slight angle. Drawn, never photographed, so there is no device maker's trade dress in it. | 2.5 |

Plus 1 day for the panel, presets and export wiring.

### How the PNG stays sharp

1. **Nothing is resampled.** The cover inside the mockup is live DOM — real
   text, real SVG, the original images at their full resolution. Chrome
   rasterises the *transformed* content at output resolution, so a title under a
   15° rotation gets clean edges rather than a resized screenshot's mush.
2. **`outputSize` already does the arithmetic.** `lib/presets.ts` computes a
   `shotScale` and a pixel target; mockups reuse it. A 2000px-wide mockup is
   `deviceScaleFactor` 2 on a 1000px layout, not an upscale.
3. **The source image is the limit, and it can be stated.** The existing
   `stickerDpi` machinery already knows how many real pixels a picture has. A
   mockup can warn before rendering that the cover art is too small to hold up
   at 2000px — the same honesty as the print DPI badge.
4. **Shadows and gradients are drawn, not bitmapped.** They stay smooth at any
   scale.

The one genuine limit: Chrome's 3D rasterisation of a heavily rotated element
can soften at extreme angles. Keep the presets under about 25° and it does not
show.

---

## How many templates and elements you can realistically make

### Templates

An honest rate for one person designing in a settled style:

- **Design it well: 1–2 hours.** Most of that is the first one in a family; the
  second in the same family is 30 minutes.
- **Encode it as data: 20–40 minutes**, once there is a helper for it.
- **Thumbnail, test, check at browse size: 20 minutes.**

So **about half a day per template**, less in families.

| Horizon | Realistic |
| --- | ---: |
| Wave (b) | **6 templates** — 3 days of design, 3 of plumbing |
| Six months, part-time | **15–20 templates** |
| Ambitious but not silly | 24, if they come in families of three |

Six is the right number to start with and the number you asked for. **Do not
aim for thirty.** Fifteen good templates in one voice beats forty in five
voices, and a self-publisher browsing them can only hold about a dozen in mind
anyway.

### Elements

Elements are much cheaper per unit and much more dangerous to sprawl.

- A simple element (rule, corner, dot motif): **10–20 minutes** once the style
  is fixed.
- A considered one (a botanical spray, a seal, a frame): **45–90 minutes**.

| Horizon | Realistic |
| --- | ---: |
| A first coherent set | **30–40 elements**, about 2 part-time weeks |
| Six months | **80–120**, if you keep to the vocabulary |

### What a small consistent library needs

Consistency is a set of rules decided once, not taste applied repeatedly:

1. **One stroke scale.** Three weights, in points, everywhere. Nothing is drawn
   at a fourth weight because it looked better that day.
2. **One corner radius scale.** Two values plus square.
3. **One palette.** The 24 in `lib/palette.ts`, plus the teal accent. Elements
   ship monochrome and take the board's colour, so they can never clash.
4. **One grid.** Draw everything on a 24-unit square so things align when
   placed together without anyone nudging.
5. **Every element must work at 40px.** The browse-size check already built for
   covers is the same test. An element that becomes a grey smudge in a thumbnail
   is a liability on a cover that will mostly be seen as a thumbnail.
6. **A tag vocabulary decided up front** — about 12 tags, not free text.
   `lib/cover/library.ts` already stores tags; the discipline is in using a
   closed list.
7. **Families of three.** Never draw one corner ornament; draw the corner, the
   divider and the end-cap that go with it. Three related elements are worth
   more than six unrelated ones.
8. **A rejection rule.** If it cannot be drawn in the vocabulary above, it does
   not go in the library. That single rule is what keeps 100 elements looking
   like one hand.

---

## What to skip until there are real users

**Skip entirely, and revisit only when someone has asked twice:**

- **Grouping** (d2). A tree in a codebase built on flat arrays, to serve a need
  that align and distribute mostly cover. The most structural risk-per-value in
  the roadmap.
- **Multi-page designs** (c1) *if* carousels turn out not to matter. It is the
  biggest data-model change here and it is speculative until someone says they
  want a carousel.
- **Gradients.** Every design tool has them and every beginner's cover is worse
  for them. Add when asked.
- **Anything collaborative** — comments, sharing, versions-with-authors. One
  author, one browser.
- **Anything hosted** — accounts, sync, a shared library. That plan exists on
  the `hosting` branch and should stay parked.
- **Video, audio, whiteboards, spreadsheets, websites, charts, tables,
  presentations.** A paperback has none of these.
- **Any generative AI.** Not merely low priority: the line-art pipeline is
  deliberately free of it so books made here need no AI disclosure on KDP. That
  is a stated product advantage and worth more than any feature it would buy.
- **Bulk create.** A novelist does not need 300 personalised cards.
- **Folders and search.** At twenty projects, the front page is the index.

**The reason to wait is not effort, it is information.** Every item above is
guessable in both directions, and building the wrong one costs a month and
teaches nothing. The four waves are ordered so that each ships something
usable on its own, which is what makes it possible to stop after any of them
and find out.

**The first three things to learn from a real user:** do they finish a cover
they started; do they use a template or start blank; do they ever look at the
browse-size preview before exporting. All three are answerable by watching one
person for an hour, and none is answerable by building more.
