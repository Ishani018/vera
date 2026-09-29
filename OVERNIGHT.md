# Overnight run

Branch `overnight`, never pushed to `main`. Written as I went; the summary at
the bottom is the thing to read first in the morning.

**The PDF goldens must not move, and have not:** `e3e2a36e0ac60ce1` (cover) and
`d4eeeb9e99cb1bfe` (poetry interior) after every commit below.

## Note on the shell

The sandbox's shell — everything that runs `npm`, `git` or a browser — went
down twice during the night, for long stretches, and came back both times.
Nothing below was claimed while it was down: rule 6, and it is the reason the
stages are stated as checked or not checked rather than as done.

---

## Stage 1 — rail and panels (commit 1 of 4)

**What it does.** A standalone design now opens on a left icon rail — Text,
Pictures, Stickers, Background, then a divider and muted Elements and
Templates marked Soon and not clickable. One panel at a time, 300px, with
headings and room. The old right-hand sidebar is gone from standalone designs.
The canvas is a neutral grey (`#6f6f6f`) with the board centred and fit. The
header, the Download menu, the zoom pill, the Guides toggle and the empty hint
are all as they were.

### A deviation from the brief, and why

The brief says to build `BoardEditor` as a new component. I did not. The rail
is a new component (`components/cover/Rail.tsx`) and the panels' contents are
the existing sections, but the rail is rendered *by* `CoverDesigner`, behind a
`rail` prop that defaults to false.

The reason is the thing stage 2 needs. Selection — which text box, which
picture — lives in `CoverDesigner`, along with the undo history, the drag
handlers, the snapping and the placement arithmetic. A separate `BoardEditor`
owning the rail would have to either duplicate that state or have it lifted out
of `CoverDesigner` and threaded back in, and lifting selection state out of the
component that owns dragging is exactly the seam I said was the risky part of
this rework. Doing it at the same time as introducing the rail would mean two
changes at once with no way to tell which broke what.

So: one implementation of the canvas, two arrangements around it, chosen by a
flag. The sections are named once in an object and rendered either down the
right-hand side (cover, unchanged) or dealt into panels (board). There is one
Artwork section, not two, which is what stops the arrangements drifting.

**How the toolbar in stage 2 gets selection:** it will be rendered by
`CoverDesigner` too, inside the canvas pane, reading the same `selectedId` and
`selectedSticker` it already keeps. Nothing is lifted, nothing is duplicated.

**How the in-book cover editor is protected:**

1. `rail` defaults to false, so every existing caller — the poetry cover, the
   colouring cover, the in-book launch kit — renders exactly what it did.
2. The panel-mode markup is the same section nodes in the same order inside the
   same `<aside>`, so the output is unchanged rather than merely similar.
3. The screen goldens are the proof, and they are the strongest result of this
   stage: **both passed with zero pixels changed and no re-recording.** The
   cover golden drives the in-book cover designer and the board golden drives
   the in-book launch kit; if either arrangement had moved by a pixel, they
   would have failed.

### Checked in a real browser

- All four sizes (Instagram post, Pinterest pin, Postcard, Bookmark) open on
  the rail with the Text panel open, no old sidebar, the board fitting inside
  the pane, canvas `rgb(111, 111, 111)`, guides off on the two screen boards
  and on for the two printed ones.
- Added text, uploaded a picture, borrowed from a book: 1 picture, 1 text box,
  the borrowed tray appears. After a reload: still there, picture drawn.
- Exported the bookmark: **675 × 1875 px**, which is 2.25 × 6.25 in (trim plus
  bleed) at 300 DPI.
- Opened the in-book cover: sidebar present, rail absent, all five sections
  (Stickers from this book, My stickers, Cover templates, Artwork, Text), the
  three Add-to buttons, and its own `11.305″ × 8.750″` and `0.0550″`
  measurements.

### Screen goldens

**Nothing re-recorded.** Both matched with zero pixels changed, which is the
expected result: this stage only adds an arrangement that the golden fixtures
do not use.

### Checks run

`npm test` 355 passing · `npm run golden` unchanged (`e3e2a36e0ac60ce1`,
`d4eeeb9e99cb1bfe`) · `npm run golden:screen` all match · `npm run build` clean.

### Only checkable in the sandbox

Chromium 141 on Linux. The screen goldens' image tier will skip on your Mac;
the layout tiers should pass. Google Fonts is unreachable here, so every
screenshot falls back to a system face.

---

## Stage 2 — floating toolbar (commit 2 of 4)

**What it adds.**

- `components/cover/SelectionToolbar.tsx`: a bar that floats over the selected
  thing, with `ToolButton`, `ToolSlider` and `ToolDivider` beside it. It takes
  the selection's box in canvas pixels rather than measuring the DOM, so it
  keeps up with a drag instead of arriving a frame late. It prefers to sit
  above the selection, drops below when the selection is near the top, and is
  clamped so it cannot leave the canvas.
- `CoverDesigner` tracks where the board sits inside the canvas pane and how
  big the pane is, updating on scroll, on resize and on zoom, and works the
  selection's box out from the same numbers the board is drawn from.
- Text toolbar: face, size, colour, bold, italic, the three alignments, curve,
  then duplicate, delete, layer up, layer down.
- Picture toolbar: arc, corners, border with its colour, shadow, then the same
  four.
- The controls that moved are hidden from the side panel on boards rather than
  repeated: `FontControls` gained `showFamily`, `showSize`, `showWeight` and
  `showItalic` flags, and `StickerInspector` gained `compact`. A cover passes
  neither and keeps every control exactly where it was.

**Flip is missing, on purpose.** The brief asks for flip among the picture
controls. `CoverSticker` has no flip field, and adding one means teaching
`lib/render/coverHtml.ts` to emit the mirror — that file is the renderer, and
your hard rules say the renderer must not be touched. A flip that worked on
screen and not in the PDF would be worse than no flip at all: it would look
right while you made the thing and come out wrong when you printed it. It is a
small change to make deliberately, in daylight, with the goldens watching.

**Two things the checking found, both fixed.**

1. `restack` was typed for stickers only, so moving a text box up or down the
   stack did not compile. It is now generic over anything with an id — drawing
   order is the order of the array either way, and the only thing it needs to
   know about what it is moving is which one it is.
2. At 200 % the selected picture was scrolled off the canvas, so the toolbar
   hid itself (which it should, rather than point at something invisible) —
   but that meant zooming in lost the controls. Zoom now anchors on the
   selection: the thing you are working on stays in the middle, and the
   toolbar stays with it. The board's own centre is the anchor when nothing is
   selected.

### Checked in a real browser

- Selecting a text box gives bold, italic, the three alignments, curve,
  duplicate, delete and the two layer buttons; selecting a picture swaps the
  whole bar for arc, corners, border, shadow and the same four. The swap was
  watched, not assumed.
- Dragging the picture 90 px right and 150 px down moved the toolbar exactly
  90 and 150 with it.
- At the board's top-left corner, at 50 % and at 200 %, the toolbar stayed
  inside the canvas every time.

### Screen goldens

**Nothing re-recorded, again.** Both passed with zero pixels changed. The
toolbar only exists behind the `rail` flag, so the in-book cover and the
in-book launch kit render what they always did — which is the same proof stage
1 relied on, and it is worth more than my saying so.

### Checks run

`npm test` 355 passing · `npm run golden` unchanged (`e3e2a36e0ac60ce1`,
`d4eeeb9e99cb1bfe`) · `npm run golden:screen` all match · `npx tsc --noEmit`
and `npm run build` clean.

---

## Stage 3 — colour system (commit 3 of 4)

`lib/palette.ts` and `components/cover/ColourField.tsx`.

**The palette** is 24 colours in four rows of six: neutrals, greens and blues,
reds and pinks, then the warm end. They are chosen to sit with the paper and
ink the rest of the app is made of, and there are enough dark ones that a cover
can be set in something other than black. Every one is a plain hex string,
which is exactly what the cover model already stores, so nothing converts on
the way in or out.

**Recently used** lives under a new key, `versecraft:recentColours` — a new
key, no existing one touched or renamed. Every read and write is wrapped:
storage is missing in a private window, refused by some settings, and empty
after site data is cleared, and a colour list nobody can read is not a reason
for the editor to fall over. It keeps eight, newest first, and the same colour
typed three ways is one entry because everything is normalised to six upper-case
digits first.

**The picker** is a colour wheel and a hex box. Dragging the wheel sends
hundreds of changes and only the last is remembered; typing in the hex box
changes nothing until what is typed is a colour, so half a code on the way to a
whole one does not repaint the board six times.

**Where it is used:** the Background panel, the text colour in the floating
toolbar, and a sticker's border colour in the toolbar.

**Shadow has no colour to choose.** The brief lists "sticker border and
shadow". `CoverSticker.shadow` is a boolean — there is no shadow colour in the
model, and adding one means changing the renderer, which tonight's rules put
out of bounds. The shadow is a switch in the toolbar; its colour is the
renderer's to decide, as it always has been.

**The cover keeps its old colour input.** A board gets `ColourField`; a cover
gets the control it has always had. The cover editor is not being redesigned
tonight, and a control that changes shape under someone in the middle of a book
is its own kind of bug.

### Checked in a real browser

- The popover offers 24 swatches under "Palette" and a wheel and hex box under
  "Anything else".
- Pressing Teal turned the board `rgb(11, 106, 98)`, which is `#0B6A62`.
- After two colours, `versecraft:recentColours` held `["#A23E63","#0B6A62"]`
  and a "Just used" row appeared above the palette.
- Typing `#123456` into the hex box turned the board `rgb(18, 52, 86)`.
- The text colour in the floating toolbar is the same component.

### Tests

`tests/palette.test.mjs`: all 24 are valid, normalised and distinct; `#abc`
and `#AaBbCc` and a pasted `"  #0b6a62 "` all come out as the same six-digit
code; and eight things that are not colours are refused, including `rgb(0,0,0)`
and a bare `0B6A62`.

### Checks run

`npm test` **358 passing** · `npm run golden` unchanged (`e3e2a36e0ac60ce1`,
`d4eeeb9e99cb1bfe`) · `npm run golden:screen` **all match, zero pixels, nothing
re-recorded** · `tsc` and `npm run build` clean.

No new dependencies.

---

## Stage 4 — accent and tints (commit 4 of 4)

Four tokens changed in `app/globals.css` and every use of the accent followed:
primary buttons, links, selected rail items, the sticker library's chosen item,
the poetry nav's current mode, and the focus ring, which is defined once as
`:focus-visible { outline: 2px solid var(--color-accent-500) }`.

```
--color-accent-50:  #f6efe1 → #e6f0ee
--color-accent-200: #ddc99c → #9cc7c1
--color-accent-500: #8a6522 → #0b6a62
--color-accent-600: #75551a → #08554f
```

Tile tints live in `lib/tiles.ts` as `CATEGORY_TINT`, one per category, applied
behind each tile's drawing: Books `#F3EDE1`, Covers `#E6F0EE`, Social
`#E8EEF4`, Print `#F4EAE4`.

### Measured, before and after

Read off the painted pixels in a browser, not computed from the hex.

| | before | after |
|---|---|---|
| primary button, label on the accent | 5.30 : 1 | **6.46 : 1** |
| selected rail item | 5.98 : 1 | **7.46 : 1** |
| link on paper | 5.30 : 1 | **6.46 : 1** |

Tints, all against `ink-900` and against the card they sit on: Books 15.16 : 1
and 1.17 : 1, Covers 15.20 : 1 and 1.16 : 1, Social 15.12 : 1 and 1.17 : 1,
Print 14.93 : 1 and 1.18 : 1. Soft enough to group at a glance, strong enough
to carry dark text if anything is ever put on them.

### The AA sweep, and what it found

I walked every visible piece of text on four screens — home, the standalone
editor, the poetry workspace and the poetry cover — compositing each
translucent layer down to a real colour first, because half of these
backgrounds are `oklab(… / 0.9)` over something else and treating one as opaque
gives a nonsense number. **Twelve failures, all now fixed:**

- **`ink-500` was 4.28 : 1 on the page's own beige.** That is the colour of
  every muted line in the app, so it failed in a great many places at once
  (segmented-control labels, "Scroll", "Grid", "Cover", "Launch kit"). Darkened
  to `#756d61`: 4.61 : 1 on the beige, 5.10 : 1 on paper.
- **Pale amber and emerald warnings** — "4 to check", "Google Fonts
  unreachable", the DPI readouts — were 1.4 to 1.7 : 1. They were written as
  `amber-300`/`amber-400`, which is a colour for a dark background, on white.
  All moved to the 700s across seven files.
- **The canvas hint and caption**, both mine from earlier tonight: white at
  70 % on the grey canvas is 1.07 : 1, and even solid white on that grey is
  only 3.5 : 1. Both now sit on a dark pill.
- **The text list's face label** went to 3.80 : 1 on a selected row's tint;
  it is `ink-700` now.

After the fixes the sweep prints *"every piece of text on all four screens
passes AA"*. None of these were caused by the teal — the sweep simply had not
been run before.

### Screen goldens

**Nothing re-recorded.** Both passed with zero pixels changed. The boards the
goldens draw carry no accent colour and no muted text: their contents are the
design's own colours, and the empty-board hint is not drawn on a board with
something on it.

### Checks run

`npm test` 358 passing · `npm run golden` unchanged (`e3e2a36e0ac60ce1`,
`d4eeeb9e99cb1bfe`) · `npm run golden:screen` all match · `tsc` clean.

Before and after screenshots of the home screen and the editor are in the
sandbox only — they cannot be committed to the repo without adding binaries to
it, and they are of a browser you can open yourself in ten seconds.

---

## Stage 5 — text presets, and why the shapes are not here

### Text presets: done

`lib/textPresets.ts`. Heading, Subheading and Body, each a share of the
board's **shorter side** rather than a fixed number of points, because forty
points is a title on a post and most of the width of a bookmark. Eight per
cent, four and a half, two point eight — clamped at both ends, because
proportion stops being sensible eventually and a heading under eighteen points
is not a heading.

The panel shows what each will actually be: "Heading · 64.75 pt on this board"
on an Instagram post, "Heading · 18 pt on this board" on a bookmark. One press
puts it on the board, already the right size, already placed — a heading a
fifth of the way down, the other two underneath it, inset by a twelfth of the
width on both sides so nothing lands on the safe margin.

Five tests in `tests/textPresets.test.mjs`: the three are in descending order;
a heading is 64.75 pt on a post and floors at 18 pt on a bookmark; nothing is
ever sized outside its own bounds, including on absurd boards of 10 pt and
5000 pt; a new box always lands inside the board, symmetrically inset; and the
three do not start on top of each other. Checked in a browser on both boards.

### Rectangles and ellipses: not done, deliberately

**They cannot be built without touching the renderer, and your hard rules say
the renderer must not be touched.**

A shape needs four things: a model, a migration, drawing on screen, and drawing
in the export. The fourth is `lib/render/coverHtml.ts`, which walks
`cover.stickers` and `cover.textBoxes` and would need to walk `cover.shapes`
too. There is no way round it that is not worse:

- Rendering shapes on screen only would mean a rectangle you can see while you
  work and that is missing from the PDF you send to a printer. That is the
  same failure as the 1/72 text bug, deliberately introduced.
- Making a shape a sticker with a generated SVG behind it keeps the renderer
  untouched, but writes a new asset to the database every time you change a
  fill, and leaves the shape uneditable as a shape. Twenty lines of renderer
  replaced by a hundred lines of workaround and a worse model.

So it stopped, rather than half-doing it or breaking the rule. **What it would
take, in daylight:** a `CoverShape` type, `shapes ??= []` in the two
migrations, a block in `CoverDesigner`'s stage beside the sticker layer, and
about twenty lines in `buildBoardHtml`. The PDF goldens would prove it safe —
their fixtures contain no shapes, so an empty `shapes` array must leave both
digests exactly where they are. That is a good morning's work with the goldens
watching, and it is not something to do unsupervised against a rule that says
not to.

### Stage 6 — starter templates: not started

Gated on stage 5, and the gate was right. Your six templates are "built only
from text, rectangles and my own pictures". Two of those three exist. I could
have made six text-and-picture layouts tonight and you would have wanted them
rebuilt the moment rectangles arrived, which is the churn the gate exists to
prevent.
