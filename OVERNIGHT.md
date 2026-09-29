# Overnight run

Branch `overnight`, never pushed to `main`. Written as I went; the summary at
the bottom is the thing to read first in the morning.

**The PDF goldens must not move, and have not:** `e3e2a36e0ac60ce1` (cover) and
`d4eeeb9e99cb1bfe` (poetry interior) after every commit below.

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
