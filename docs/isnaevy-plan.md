# Isnaevy: restructuring Versecraft into a general design tool

A plan, not a commitment. Written 29 September 2026 against commit `3a468d7`.

---

## 1. The short version

**Your instinct about the cover designer is right.** It is a real canvas editor and
about 3,500 lines of it port over largely intact. The geometry underneath —
snapping, resize-from-corner, rotation, undo, curved text, the image warp — is
already free of book concepts. That is the expensive half of a canvas editor and
it exists.

**Your framing has one flaw, and it is worth catching before any code moves.**
"The book makers become modes on top of the general editor" cannot be true of the
book *interiors*. A canvas editor and a paginated-document engine are different
machines, and the ~2,800 lines of pagination machinery in this repo is the best
work in it. Forcing it through a canvas model would destroy it, and there is
nothing to gain: no canvas tool on the market does what it does.

The correct shape is **two engines on one shared floor**, not one engine with
modes:

```
                    ┌─────────────────────────────────┐
                    │        Isnaevy shell            │
                    │  documents · assets · templates │
                    └────────────┬────────────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              │                                     │
    ┌─────────▼──────────┐              ┌───────────▼──────────┐
    │   CANVAS ENGINE    │              │    FLOW ENGINE       │
    │ objects at x,y     │              │ Paged.js pagination  │
    │ on a fixed board   │              │ running heads, TOC,  │
    │                    │              │ folios, widows       │
    │ covers · posts     │              │ poetry · colouring   │
    │ posters · slides   │              │ interiors            │
    └─────────┬──────────┘              └───────────┬──────────┘
              │                                     │
              └──────────────────┬──────────────────┘
                                 │
                 ┌───────────────▼────────────────┐
                 │  SHARED FLOOR                  │
                 │  assets · fonts · colour ·     │
                 │  undo · HTML→Chromium→PDF/PNG  │
                 └────────────────────────────────┘
```

Covers, social posts, posters and slides are all *one artboard with objects on
it*. Books are a different thing that happens to share the floor. Say that out
loud in the architecture and everything downstream gets simpler.

**What four months actually buys:** the editor, not the asset library. See §7.

---

## 2. What is reusable, specifically

19,247 lines of source today. Broken down by what it is, not where it lives:

| Bucket | Lines | Fate |
|---|---:|---|
| Canvas (cover designer + its geometry) | 3,498 | **Becomes the core** |
| Flow (pagination renderers) | 2,808 | Stays as-is, book-only |
| Shared floor (assets, fonts, UI kit, PDF spine) | 2,816 | **Already general** |
| Book domain (KDP, contents, import, repair) | 1,468 | Stays, book-only |
| Line art pipeline | 1,691 | Book-only today; see below |
| Everything else (stores, screens, modes) | ~7,000 | Mixed; mostly rewritten or rehomed |

### Portable almost untouched

These are pure functions over geometry with no book in them. They move to
`lib/canvas/` on day one and barely change:

- **`lib/cover/stickerEdit.ts`** (156) — `snapLines`, `snapMove`, `resizeFromCorner`,
  `angleTo`, `snapAngle`, `restack`. This is *the* canvas interaction layer. Its
  only book dependency is taking a `CoverLayout` to source snap lines from, which
  becomes "take an artboard's guides".
- **`lib/cover/history.ts`** (~80) — snapshot undo, one per gesture. Typed to
  `CoverSpec`; make it generic over the document type and it is done.
- **`lib/cover/curve.ts`** (211) — curved text. Entirely general. Already unit-clean.
- **`lib/cover/bend.ts`** (191) + **`bendImage.ts`** (~95) — the arc warp. Entirely
  general.
- **`lib/assets.ts`** (239) — content-addressed blob store with copy-on-use. Already
  exactly what a design tool needs.
- **`lib/cover/library.ts`** (253) — "My stickers" + templates. Rename the concepts
  (stickers → assets, cover templates → design templates) and it is a brand kit.
- **`lib/fonts.ts`** (168), `FontPicker`, `FontControls` — general.
- **`lib/server/renderPdf.ts`** + `browser.ts` + `fontEmbed.ts` — the export spine.
  General. Needs a PNG target added, which is ~30 lines.

### Portable with surgery

- **`components/cover/StickerLayer.tsx`** (309) — the interactive layer. The
  gestures are general; it reaches into `CoverLayout` and `MIN_COVER_DPI`. Becomes
  `<ObjectLayer>` over an artboard.
- **`lib/render/stickers.ts`** (146) — `stickerRect`, `stickerBounds`, `stickerDpi`
  are general. `stickerWarnings` is half general (off the trim, under 300 DPI) and
  half KDP (across the spine, under the barcode). Split: general bounds/DPI in the
  core, warnings become **per-artboard rules** supplied by the mode.
- **`lib/render/coverHtml.ts`** (294) — already "objects at inch positions → HTML".
  Generalises into the canvas renderer almost directly.
- **`components/CoverDesigner.tsx`** (1,094) — 39 references to spine/barcode/trim/
  bleed/pageCount. Roughly half is the general editor shell and half is the KDP
  panel. Split accordingly; expect to rewrite rather than move.

### Not portable, and shouldn't be

`lib/render/css.ts` (667), `bookHtml.ts` (338), `runtime.ts` (442), `flip.ts` (567),
`viewer.ts` (296), `coloringHtml.ts` (344), `coloringLayout.ts` (154).

This is named `@page` rules, running heads suppressed per page-type, roman-then-
arabic folios that a CSS counter cannot express, `break-before: right`, orphans and
widows, borders painted onto the page box via pseudo-elements, and a TOC carrying
real page numbers. None of it has an analogue in a canvas tool. It is also the part
of this repo that a competitor cannot cheaply copy. **Leave it alone.**

### The odd one out

**`lib/lineart/`** (1,691) — classical CV: Lab colour, Di Zenzo gradients, Canny,
adaptive threshold, morphology, Otsu. Written for colouring books. It is also a
genuinely good general image effect ("turn this photo into line art") that no
free design tool offers well. Cheap to expose as a canvas filter later. Not a
priority, but do not bury it inside the colouring mode where it can't be reached.

---

## 3. Proposed architecture

### 3.1 The document model

```ts
type Design = {
  id: string;
  name: string;
  artboards: Artboard[];        // pages, slides, size variants
  createdAt: number; updatedAt: number;
};

type Artboard = {
  id: string; name: string;
  width: number; height: number;   // in POINTS — see §3.2
  displayUnit: 'px' | 'in' | 'mm';
  bleed: number;
  background: Paint;
  guides: Guide[];                 // named regions, supplied by the mode
  objects: Node[];                 // back to front; index IS z-order
};

type Guide =
  | { kind: 'safe';     rect: Rect; label: string }
  | { kind: 'fold';     at: number; axis: 'x' | 'y'; label: string }
  | { kind: 'reserved'; rect: Rect; label: string }   // e.g. KDP's barcode
  | { kind: 'grid';     step: number };

type Node = TextNode | ImageNode | ShapeNode | GroupNode;

type NodeBase = {
  id: string; name: string;
  x: number; y: number; width: number; height: number;
  rotate: number; opacity: number;
  locked: boolean; hidden: boolean;
  effects: Effect[];               // shadow, border, cornerRadius
};

type TextNode  = NodeBase & { type: 'text'; runs: TextRun[]; font: FontSpec; curve: number };
type ImageNode = NodeBase & { type: 'image'; assetId: string; naturalWidth: number;
                              naturalHeight: number; fit: Fit; crop: Rect | null; arc: number };
type ShapeNode = NodeBase & { type: 'shape'; shape: 'rect' | 'ellipse' | 'line' | 'path';
                              path?: string; fill: Paint; stroke: Stroke | null };
type GroupNode = NodeBase & { type: 'group'; children: Node[] };
```

Note what this preserves: `curve` and `arc` are already exactly these fields on
`CoverTextBox` and `CoverSticker`. The recent work lands here for free.

Note what it adds that you do not have and will need:
- **`ShapeNode`** — no shapes at all today. Rectangles, ellipses and lines are table
  stakes for posters and posts.
- **`GroupNode`** — grouping. Needed the moment anyone builds a badge out of three
  objects.
- **`runs: TextRun[]`** — today a text box is one string with one font. A design tool
  needs mixed styling inside a box. This is the single biggest hidden cost in the
  whole plan (§6, stage 3).
- **`locked` / `hidden`** — a layers panel is useless without them.

### 3.2 Units: store points, not inches

Everything today is inches, because everything today is print. A general tool has
to hold both 8.5 × 11 inches and 1080 × 1080 pixels without either becoming ugly.

Store **points** (1/72 inch) as the single canonical unit:

- inches → points is `× 72`. Exact.
- CSS pixels → points is `× 0.75`. Exact for every integer pixel size.
- Facebook's 1200 × 628 px = 900 × 471 pt exactly. Stored as inches it would be
  6.541666…, and round-tripping the display would show 627.9999.
- millimetres stay a *display* unit only (72/25.4 is not exact), which is fine —
  nobody demands exact mm round-trips.

**Migration cost:** one `× 72` pass over existing covers in `migrateProject`, next
to the `curve ??= 0` and `arc ??= 0` lines already there. The risk is that the PDF
exactness you have fought for is measured in thousandths of an inch, so this pass
has to be followed by re-verifying real PDF bytes — the same 5.5 × 8.5 and
17.36 × 8.75 checks already run. Budget a day for the migration and a day for
re-verification. Do it first, before anything is built on top.

### 3.3 Render targets

Today: `buildCoverHtml(project, opts) → HTML → Chromium → PDF`. Generalise to:

```ts
type RenderTarget =
  | { kind: 'print-pdf'; bleed: true;  marks: boolean; embedFonts: true }
  | { kind: 'screen-pdf'; bleed: false }
  | { kind: 'raster'; format: 'png' | 'jpg'; dpi: number; transparent: boolean }
  | { kind: 'svg' };   // later; see the caveat

renderArtboard(artboard, { assets, guides, target }) → string   // HTML
exportArtboard(artboard, target) → Blob                         // via Chromium
```

- **print-pdf** is what you have. Unchanged.
- **raster** is `page.screenshot({ clip, ... })` with `deviceScaleFactor = dpi/96`.
  Genuinely about 30 lines on top of the existing browser service.
- **svg** is deceptive: it needs a decision about whether text becomes paths (loses
  selectability, guarantees fidelity) or stays text (needs the font embedded or
  linked). Defer it. Nobody needs it in v1.

The flow engine keeps its own `buildBookHtml` / `buildColoringHtml` and its own
Paged.js step. Both engines hand HTML to **one** Chromium service. That is the
right seam: the expensive, fragile, carefully-tuned part is shared; the layout
logic is not forced to be.

### 3.4 Modes

A mode is thin. It supplies:

```ts
type Mode = {
  id: string; name: string;
  newDocument(): Design;
  presets: ArtboardPreset[];              // "Instagram post", "KDP 8.5×8.5 cover"
  guidesFor(artboard, context): Guide[];  // spine and barcode come from here
  rules: Rule[];                          // "under 300 DPI", "crosses the spine"
  panels?: React.ComponentType[];         // mode-specific sidebar
};
```

The KDP cover mode supplies the spine/barcode guides and the print warnings. An
Instagram mode supplies a safe area and nothing else. **`lib/kdp.ts` stays exactly
as it is** and becomes one mode's rule source rather than a global truth.

Poetry and colouring books are *not* canvas modes. They are their own document
kind with their own editor, sharing the floor. Be honest about this in the code:
`Document = Design | PoetryBook | ColoringBook`.

---

## 4. Migration path

The rule: **extract, never rewrite; the app works at every commit.**

1. **Units first** (§3.2), while the app is still small enough to verify quickly.
2. **Lift the core out from under the cover designer.** Create `lib/canvas/` and
   move the pure geometry in, with `CoverSpec` still as the only document type. The
   cover designer keeps working; nothing user-visible changes. This is where you
   find out how clean the seams really are.
3. **Introduce `Artboard` and `Node`, with an adapter.** `CoverSpec` ⇄ `Artboard`
   both ways. The cover designer now edits an artboard. The exporter still receives
   a `CoverSpec`. Existing books are untouched on disk.
4. **Flip the store.** Covers are stored as artboards; the adapter now runs only on
   load, as a migration. The exporter takes artboards directly.
5. **Only now** build the general editor shell, arbitrary artboard sizes, and the
   new modes.

Steps 2–4 are invisible to you as a user. That is the point: if a step is visible,
it has gone wrong.

**The guard rail throughout:** a golden-file test that renders a fixed cover and a
fixed poetry book to PDF and asserts the page boxes, the font subsets and the object
positions. You already check these by hand; make them a test before stage 2 starts,
because from then on they are the only thing standing between a refactor and a
silently broken book.

---

## 5. What breaks if this goes wrong

- **Print exactness.** The unit change touches every coordinate. Mitigation: do it
  first, verify against real PDF bytes, and never do it again.
- **The undo stack.** It snapshots `CoverSpec`. Made generic over `Design` it will
  hold much more; 60 snapshots of a 40-object design is fine, 60 of a 500-object one
  is not. Mitigation: cap by bytes, not by count.
- **The warp cache.** `bendImage.ts` caches decoded sources by asset id. With many
  more images on a board, that cache needs a real eviction policy.
- **IndexedDB size.** Copy-on-use for assets was the right call for books. With a
  photo library it multiplies. Mitigation: keep copy-on-use for anything a user
  places (the reason for it has not changed), but reference-count and offer a
  "reclaim space" pass.
- **Scope.** See below.

---

## 6. Staged plan

Effort assumes the pace of this project so far, with the same verification
discipline (browser checks, real PDF bytes — which caught every stage-3 bug and all
three caption bugs that the test suite passed).

| Stage | What | Effort |
|---|---|---:|
| 0 | Units → points, re-verify PDF exactness, golden-file tests | **1 week** |
| 1 | Extract `lib/canvas/`; cover designer runs on it, output identical | **2–3 weeks** |
| 2 | `Artboard`/`Node` model + adapter; generalise the renderer; PNG/JPG target; arbitrary sizes; preset picker | **2 weeks** |
| 3 | Shapes, groups, layers panel, **rich text runs** | **3–4 weeks** |
| 4 | Templates as first-class: placeholder slots, "swap the pictures", a gallery | **2 weeks** |
| 5 | Assets: font browser, icon set, photo search | **3–4 weeks** |
| 6 | Modes: books unchanged; add a book-marketing preset pack | **1–2 weeks** |

**Total: 14–18 weeks.** Four months is 17. So the schedule has no slack in it at
all — no bug budget, no polish, nothing for what always turns up.

Stage 3 is the one people underestimate. "Rich text" means selection model, caret,
mixed runs, auto-fit, list handling, and it is the difference between a toy and a
tool. Budget it honestly or cut it (see below).

---

## 7. What I would cut, and why

You asked for this honestly, so: **four months does not buy a Canva.** Canva's moat
is not the canvas — you have most of a canvas already. It is tens of thousands of
templates and a licensed asset library, and that is a content operation, not a
programming one. Stage 5 above is four weeks; doing it *properly* is a year and a
budget.

The good news is that the interesting position is not "general design tool". It is:

> **The design tool for people who self-publish books.**

Covers, interiors, and everything around a launch: the Instagram announcement, the
Pinterest pin, the A6 postcard, the bookmark, the author-bio card, the printable
activity sheet. All the same artboard engine. All sized correctly for print or
platform without the user having to know. And the print pipeline — Paged.js, real
font subsets, exact page boxes, KDP's actual rules — is a genuine moat, because
Canva's print output is the weakest part of Canva and always has been.

That version fits in four months comfortably: stages 0–4 and 6, with stage 5 reduced
to fonts only (Google Fonts, which you already wire up) plus your own line art as
the graphic library. It also gives you something to say in one sentence, which
"general design tool" never does.

If you want the broad version anyway, that is a legitimate choice — just do it
knowing that the first year is the editor and the second is the content.

### On assets and licences

You named the right sources. Three cautions, from what I understand of these terms
— they change, and I cannot check them from here, so verify before shipping:

- **Google Fonts** — mostly OFL/Apache, commercial use fine. Still per-family: a few
  have unusual terms. Safe foundation.
- **Heroicons** — MIT. Clean.
- **SVG Repo** — **mixed licences per asset.** This is the dangerous one. There is no
  blanket grant; you would need to filter by licence and carry attribution per file.
- **OpenMoji** — CC BY-SA 4.0. **Share-alike**, which is a real constraint on a
  commercial product, plus required attribution. Read it carefully before it is
  load-bearing.
- **Unsplash / Pexels** — free for commercial use, but both restrict redistributing
  the photos *as* a stock library, which is arguably what a template gallery does.
  Fine for you to use in your own designs; get advice before shipping them as
  browsable in-app content.

The safest asset moat here is the one you already own: **your own paintings, run
through your own line art pipeline.** Nobody can copy that and no licence covers it.

---

## 8. First three things, if this is approved

1. Golden-file PDF tests for one cover and one poetry book. An afternoon. Do it
   before touching anything.
2. The units migration. One day plus one day verifying.
3. `lib/canvas/` extracted with the cover designer running on it, producing a
   byte-identical cover PDF.

If step 3 lands cleanly, the rest of this plan is credible. If it fights back, the
seams are not where this document claims they are, and the plan should be revised
before going further rather than pushed through.
