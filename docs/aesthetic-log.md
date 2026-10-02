# The aesthetic redesign, overnight run

A running log. Newest stage last. Every hash here is on `main` and pushed.

## What to look at first

1. `?theme=sunrise`, `?theme=lagoon`, `?theme=candy` on any page — the three
   themes. Sunrise is the default and is remembered once you have asked for one.
2. The front page: the hero band, the coral Create button, the cards leaning
   towards the pointer.
3. The Sticker Studio with a picture open — the rail, the tool strip and the
   panels are the biggest change of this run.

## Rollback

`pre-aesthetic-4` points at `ec96f7d`, the commit this run started from.

```bash
git fetch origin
git reset --hard origin/pre-aesthetic-4   # on a branch you do not mind losing
```

## The run

### Before it started — ec96f7d

The design system (commit 1, `e171246`), the surfaces (commit 2, `6302315`) and
the front page and hub (commit 3, `ec96f7d`) were already in. This run picks up
at stage 1.

### Stage 1 — the editors' chrome, and a text diet

Three commits, because the stage was three jobs and each one could be checked
on its own.

#### `fc56ec9` — moving chrome, and the words off the panels

What changed: the rail's active pill slides to the panel you open; panels fade
and slide in over 200 ms; swatches and mode cards pop when chosen; a slider
shows a bubble that follows its thumb. Every hint moved from a sentence under
its control to an (i) beside its label, which is one change to `Toggle`, `Field`
and `Control` and drains the prose out of every panel at once. "More" became
Colour, Touch-up, Words and Effects. Rarely-used controls (line weight, tidying,
smoothing, batches, the SVG cut line) went into closed `<details>` sections. The
three mode cards now render the user's own picture at 120 px.

Checked: `npm test` 738 pass / 0 fail. `npm run golden` — `e3e2a36e0ac60ce1` and
`d4eeeb9e99cb1bfe`, "all goldens match". `npm run golden:screen` — 0 pixels
changed on both boards. `npm run build` clean. Driven in Chrome at 1280×720 and
800 wide: every panel measures 0 px of overflow at 1280×720, nothing visible is
longer than 8 words, no label is longer than 4, the rail is still 78 px and the
header still 63 px.

**The one thing that nearly went wrong.** The fixed-picture export digest came
back as `cat-1000x1000.png … sha256 5824a436…` against a baseline of
`cat-1026x1026.png … sha256 b9eabef0…`. The *filename* had changed, from 1026 to
1000, which is the die-cut outline's 13 px of padding on each side gone missing
— so the harness had exported a sticker with the outline switched off, not a
sticker that had changed. The harness found the die-cut switch by taking a
`<label>` whose text matched and asking its parent for a `[role=switch]`, and
this commit put the label inside a `<span>` alongside the switch. It now finds
the switch by its own accessible name and asks for the label by `for`, and it
throws rather than exporting if the switch is not found. With that repaired the
digest is `b9eabef0e5424e828acb78c0801e62bab06737140751fa59b047558407212994`,
byte-identical to the baseline. Nothing was re-recorded.

#### `84b186b` — the tools beside the picture, and the picture's own colours

Three grids of word-buttons in three different panels became icons in a strip
down the side of the canvas, grouped by the switch they belong to, with the tool
in hand named in words underneath. `Stage` already had a `tools` slot; nothing
had ever filled it.

Then three things that were numbers became pictures: the colour well now offers
the colours read off the user's own file (`lib/stickers/palette.ts`, 200 px long
edge, 32 levels per channel, thinned by Lab distance); the brush is drawn as a
circle under the pointer at the size it will actually paint; and a fill that
escapes rings the pixel it started from, beside the gap in the outline.

One pre-existing bug fixed on the way: the crop band was absolutely positioned
inside the padded surface, so its percentages measured against the padding and
the dashed rectangle was drawn a few pixels off the box that was actually
cropped. The cropped value was always right.

Checked: 743 tests pass (5 new, for the colour extractor); both PDF digests
unchanged; 0 pixels changed; build clean; export still `b9eabef0…212994`. At
1280 and 800: the strip is 49 px wide with every button 36 px, the swatch row
offers four of the picture's colours, the brush ring measures 18 px at 1280 and
6 px at 800, and a drawing with a deliberate gap in its outline warned and rang
at 2.6 % 2.5 % — which is where it was clicked.

#### `330e6e3` — three effects you can see, and a toolbar that floats

Drop shadow, Glossy highlight and Paper texture became three tiles with the
effect drawn on them, each tile its own switch. The board's selection toolbar
now floats on `--shadow-float` and fades over 180 ms when the selection changes,
replayed by cancelling and playing the animation rather than by remounting.

The first version of the tiles put their colours in the component as hex, and
`tests/theme.test.mjs` refused it — correctly, because a tile never reaches an
export and is therefore chrome. The colours moved to `.tile-shadow`,
`.tile-gloss` and `.tile-grain` in `app/surfaces.css`, built from the theme's
own tokens.

Checked: 743 tests pass; both PDF digests unchanged; 0 pixels changed; build
clean; export still `b9eabef0…212994`. At 1280 and 800: three tiles, each
painted, 82 px and 67 px tall, pressing one turns the effect on, opens its
sliders and pops the tile, and the panel still fits at 1280. The toolbar has
the float shadow and a 0.2 s `surface-in` that replays on a selection change.

#### Only checkable in the sandbox

- Everything driven in Chromium 141 headless at 1280×720 and 800×720 against
  the production build on `127.0.0.1:3000`. Real-browser font fallback, pointer
  latency and GPU compositing behaviour on a Mac are not covered by it.
- The brush ring and the leak mark are measured by computed style and element
  box, not by looking at pixels, so "it looks right" is still a thing to see.
- `npm run golden:screen` emulates `prefers-reduced-motion: reduce` and sets
  `data-motion="off"`, so the goldens prove the animations are *off* under those
  conditions, not what they look like when on.

#### Carried forward, not fixed here

At 800 wide `/design` renders no board at all: the sidebar and rail take the
whole row, the canvas pane measures zero width, and the stage is gated on a
scale that never becomes positive, so `[data-cover-stage]` never exists. It
predates this run. Stage 6 is the layout audit and this is its first finding.

#### Added dependencies

None.
