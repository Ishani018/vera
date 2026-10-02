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

### Stage 2 — the sticker pages

#### `43da369` — two dead colour classes, a guard, and (by accident) stage 2's surfaces

This commit was meant to be the class fix alone and its message describes only
that. The surfaces stage 2 needed — `.peel`, `.fan`, `.drop-in`, `.stamped`,
`.stagger-in`, `.skeleton` in `app/surfaces.css`, and the peel and fan in
`Thumb.tsx` — were in the working tree and went in with it. It was pushed before
I noticed, so it stays as it is rather than being rewritten under anyone who has
already pulled; `d3f8d06` completes and explains the stage.

What the commit was for: `bg-paper-0` was used in seven places and named a token
that does not exist, so Tailwind dropped the utility and the hub's sidebar, the
sticker tab bar, the Studio's start card and every pack card had no background at
all. Nothing warns about this — an unknown token makes the utility vanish, not the
build fail. The new guard in `tests/theme.test.mjs` caught a second one straight
away: `text-accent-700` on the tool strip's chosen tool, from `84b186b`, which
left the chosen glyph inheriting the rail's near-white on a pale accent tint.

Two sandbox fixes went in with it, both to the contrast sweep:

- It read only `background-color`, so every button painted with a gradient — every
  primary and Create button — looked transparent, composited down to the white
  page, and came back as white text on white at 1.00:1. Three findings that were
  not real. It now reads the stops out of a computed `background-image`, which
  Chrome has already resolved from `color-mix()` and `var()`, and checks the text
  against each one.
- A disabled control is greyed on purpose and WCAG 1.4.3 puts text in an inactive
  component outside the contrast rule. Raising "Templates — soon" to AA would make
  something that does not work look like something that does. The sweep now skips
  genuinely disabled controls and holds everything else to the rule.

After both, the sweep reports every piece of text on all four screens passing AA.

#### `d3f8d06` — the stage, and thirty-three classes that did nothing

The stage: sticker cards curl a corner and catch a band of light; a pack is three
of its stickers fanned in perspective rather than four in a grid; the sheet rests
on a soft shadow and arrives with a bounce, with the stickers waiting to be
pressed onto it dropping in staggered; keeping a sticker stamps KEPT onto the
picture; searching for free graphics shows blocks the shape of the pictures with
a light crossing them, and results fade in one after another.

**The real find.** Thirty-three classes of the form `shadow-[--shadow-rest]`,
`duration-[--motion-base]` and `ease-[--ease-out]` compiled to
`--tw-shadow: --shadow-rest` and `transition-duration: --motion-base` — the
bracket's contents verbatim, a literal string rather than a reference. Tailwind 3
read that shorthand as a variable and Tailwind 4 does not. So **every card shadow
in the app was missing, and every motion duration and easing fell back to the
browser's default**: a good deal of commit 2's work had never once run. They are
`-[var(--…)]` now. The guard test refuses the shorthand outright and checks the
token named exists, so it cannot come back.

Found by driving it: the sheet's shadow came back as `none` in Chrome, which is
what led to looking at the compiled stylesheet in the first place.

One thing deliberately not done: the stickers already placed on the sheet are not
animated onto it one at a time. They are drawn by the same `draw()` the download
uses — that is the whole point of that file — so a drop-in per sticker would be a
change to the code that makes the exported PNG, which rule 1 forbids. The sheet
itself bounces in instead, and the tray beside it staggers.

Checked: 745 tests pass; both PDF digests `e3e2a36e0ac60ce1` and
`d4eeeb9e99cb1bfe` unchanged; `golden:screen` 0 pixels changed; build clean;
export still `b9eabef0…212994`. In Chrome at 1280×720 and 800 wide: the curl
rests at opacity 0 and reaches 1 on hover with `peel-sheen` running; a pack fans
three cards under a 700 px perspective with real `matrix3d` transforms; the sheet
carries the two-layer float shadow and `drop-in`, the tray staggered at
0/45/90/135 ms; the search shows 36 skeleton blocks with offset sweeps; keeping a
sticker stamps KEPT on the picture, centred, deaf to the pointer, gone by itself.

#### Only checkable in the sandbox

- The live result cards arriving one after another could not be driven: there is
  no outbound route from this machine to Wikimedia or the Smithsonian, so
  `/api/graphics/search` answers 502 and no cards are produced. The `.stagger-in`
  class is checked against the live stylesheet instead — `arrive`, fill both,
  delays 0/40/80 ms — which proves the rule, not the path through it.
- Hover had to be driven with `page.hover`. A bare `page.mouse.move` leaves
  nothing hovered at all in this headless Chromium —
  `document.querySelectorAll(':hover')` comes back empty, `html` and `body`
  included — so every hover rule read as not applying. Worth knowing before
  trusting any hover check in this scratchpad.
- The peel, the fan and the stamp are measured by computed style and element box.
  Whether the curl looks like paper and the stamp looks like a stamp is still a
  thing to see.

#### Added dependencies

None.

### Stage 3 — feedback and flow — `0bc3e36`

Five things:

- **Page to page.** `@view-transition { navigation: auto }` in `app/globals.css`
  gives a real cross-fade on a full page load. Client navigations inside the app
  get a plain fade on `body`, driven by a `data-arriving` flag on `<html>` from
  `components/Flow.tsx`. See below for why that is the honest answer rather than
  a shortcut.
- **Toasts** (`components/Toasts.tsx`): transient messages move out of the panels
  into the bottom-right corner, newest at the bottom, at most three stacked,
  sliding in and fading out on a timer. Warnings and errors stay where they were.
- **A progress ring** (`ProgressRing` in `components/ui.tsx`), in the batch panel
  and the studio's work overlay. It carries its own number, so it needs no width
  and sits beside the words rather than under them. With no total it spins.
- **A skeleton** where a list has not arrived: the designer's sticker panel used
  to say "Nothing saved yet…" for as long as the library took to read, so it
  flashed that on every open on a library with forty stickers in it.
- **One well done a session** (`components/WellDone.tsx`): six shapes float up for
  900 ms the first time something is exported or saved, then never again in that
  session. The flag is in `sessionStorage`, so it is per tab and per visit.

#### Why the view transition is partly a fade, and not a cut corner

`document.startViewTransition` needs the new DOM to exist by the time its callback
returns. `router.push` does not work that way: it starts a navigation and resolves
later, so the transition captures the old page twice and shows nothing at all. The
fix React and Next have for this is `<ViewTransition>` behind
`experimental.viewTransition`, and React 19.2.8 — the version installed here —
does not export it; it is in the experimental channel only. Using it means
swapping React for an experimental build, which is a new dependency under rule 5
and a bad trade on an unattended run.

So: the browser does the real thing where it can do it unaided, and a 200 ms
opacity fade covers the rest. `components/Flow.tsx` is the single place that
changes when a stable React ships the component, and it says so.

#### Found and fixed while driving it

`WellDone` had its stop-timer in the same effect as its start, keyed on the same
counter. A second export changed the counter, React ran the cleanup and cancelled
the timer that was about to take the shapes away, and the "already celebrated"
guard then returned early without setting another — so six shapes stayed on the
screen for the rest of the session. The timer is now its own effect, keyed on what
it stops. Caught by the check that the celebration never happens twice.

#### Checked

745 tests pass; both PDF digests `e3e2a36e0ac60ce1` and `d4eeeb9e99cb1bfe`
unchanged; `golden:screen` 0 pixels changed; build clean; export still
`b9eabef0…212994`; the contrast sweep reports every piece of text on all four
screens passing AA. In Chrome at 1280×720 and 800 wide: the `@view-transition`
rule is in the live stylesheet; a navigation runs `route-fade` on `body`; a batch
shows a ring labelled "How far through the batch" with a real dash array; keeping
a sticker raises a `toast-in` message in the bottom-right under `aria-live=polite`
whose container is `pointer-events: none`; the session's first finish floats six
`rise` shapes for 0.9 s staggered 0/70/140 ms and none on the second; a library
being read never claims to be empty, over 37 frames at 1280 and 38 at 800.

#### Only checkable in the sandbox

- The ring could not be shown on an export: a 2000 px sticker finishes in about
  half a second on this machine, and the studio's overlay deliberately waits a
  full second (`SLOW_AFTER` in `lib/busy.ts`) so a quick job never flashes a
  progress indicator. The ring is checked on a three-picture batch instead, which
  is slow by definition. On a slower machine the export would show it too.
- Catching the library's skeleton depends on how warm IndexedDB is: it was caught
  at 800 (9 blocks sweeping) and not at 1280, where the read finished inside one
  frame. What is asserted at both widths is the regression — that the panel never
  claims to be empty while it is reading.
- `@view-transition` is declared and present in the live stylesheet, but a real
  cross-document transition cannot be *seen* in a headless screenshot run. That
  one needs a Mac and an eye.

#### Carried forward to the layout audit

At 800 wide `/design` overflows the viewport by its whole width (`scrollWidth -
innerWidth` = 800). Same root cause as the stage 1 finding that the board is not
drawn at that width: the designer has no narrow layout, so its sidebar and rail
take the whole row and everything else is pushed off to the side. Two findings,
one fix, in stage 6.

#### Added dependencies

None.

### Stage 4 — a book on the first screen — `dd93d24`

Five faces (two boards, a spine, a fore edge, the top of the page block), a 900 px
perspective on the parent, and two slow transforms: `book-turn` through 52° over
eighteen seconds and `book-float` seven pixels over six, on separate layers so the
browser composites two transforms and touches no layout. `components/BookMock.tsx`
and the `.book*` rules at the end of `app/surfaces.css`.

CSS only, as asked: zero `img`, `canvas` or `svg` inside it, and nothing added to
first load — it is markup and a stylesheet rule. Which also means it wears the
theme rather than being a picture of one: coral in Sunrise (`rgb(201,69,44)`), the
lagoon's warmer red (`rgb(191,74,52)`), candy's pink (`rgb(192,53,104)`), read
straight from the tokens.

#### Two things it got wrong on the first pass

- It was `pointer-events: none`, being decorative — which makes `.book:hover`
  unreachable, so the pause-on-hover rule was written, compiled and dead. Caught
  by a check that hovered it and found it still turning. It takes the pointer now,
  keeps `aria-hidden`, and sits in its own space with nothing behind it to click.
- Under `prefers-reduced-motion` it is a still frame turned 18°, not the same turn
  done faster.

#### Checked

745 tests pass; both PDF digests `e3e2a36e0ac60ce1` and `d4eeeb9e99cb1bfe`
unchanged; `golden:screen` 0 pixels changed; build clean; export still
`b9eabef0…212994`; contrast sweep still all-AA. In Chrome at 1280×720 and 800 wide
in all three themes (18 checks each width): five faces, five `matrix3d`
transforms, `preserve-3d`, `book-turn` and `book-float` running with a breathing
shadow, no image of any kind inside it, inside the band at both widths (33 px clear
of the right edge), running until the pointer arrives and paused while it is there,
turning again when it leaves. With reduced motion both animations are `none` and
the frame is still turned.

Frame times with it turning, from `scratchpad/perf.mjs`: hover+tilt, menu open,
page change and idle all 16.7 ms median, 16.8 ms p95, nothing over 20 ms.

#### Only checkable in the sandbox

The screenshots say the geometry is right; whether it reads as a *book* rather
than a red box at a jaunty angle is a judgement for a real screen. The shots are
in the scratchpad as `s4-book-<theme>-<width>.png` and will be in
`docs/aesthetic-shots/` after stage 6.

#### Added dependencies

None.

### Stage 5 — the transparent PNG bug — **written, proven, and reverted**

Nothing from this stage is on `main`. It was written, it worked, and the brief's
own rule required it to be taken out again. This is the most important entry in
this log, because the bug is real and it is still there.

#### The bug

Every decode on the way into the tracer draws onto a fresh `OffscreenCanvas`, and
a fresh canvas is **transparent black** — `rgba(0, 0, 0, 0)`. Everything below
that point reads the colour channels and ignores the alpha, because by then a
picture is a field of brightnesses and nothing else. So a PNG with a transparent
background was traced as a drawing **on black paper**: "Painting or photo" found
an edge all the way round the picture and filled everything outside the drawing,
and "Already line art" thresholded the whole page to ink.

That is the one kind of file somebody is most likely to bring to a sticker maker,
and it was the one kind that could not work. The same reasoning is already written
down three feet away, in `framed()` in `lib/lineart/worker.ts`: *"Onto the
picture's own paper, not left see-through: a turn leaves empty corners, and the
tracer reads a colour, so a transparent corner would be read as black and come
back as solid ink."* That flatten only runs when a frame is being applied.

#### The fix that worked

`flattenOntoWhite(source)` in `lib/lineart/pipeline.ts`, applied at the top of
`runCleanup`, `runLineArt`, `analyseGrey`, `analyseRidges` and `guessSource`. White
because white is what a transparent PNG is drawn on everywhere else it is ever
shown, so it is the background the person was looking at when they decided the
drawing was finished. A partly-transparent pixel lands between its own colour and
white, which is what compositing has always meant — not a rule that see-through
means white. A fully opaque picture is returned as the same object, uncopied, so
the common case pays nothing.

`analyseGrey` and `analyseRidges` needed it as well as `runLineArt`, because the
worker calls them directly to fill its cache and hands the result back in
`analysis` — so `runLineArt`'s own flatten is never reached on the cached path. Not
doing that would have given a picture that traced correctly the first time and
wrongly every time after, which is worse than wrong every time.

Seven new tests, all passing: paper not ink in each mode, the drawn shape still
found, a half-transparent pixel landing halfway, an opaque picture returned
unchanged and uncopied, the guess seeing white, and the cached analysis path in
both modes. 752 tests passed in total.

#### Why it was reverted

The stage says: *"Keep the fixed-picture export test unchanged… If the
fixed-picture export digest would change, stop and revert this stage instead of
re-recording it."*

The digest changed, from
`b9eabef0e5424e828acb78c0801e62bab06737140751fa59b047558407212994` (25,236 bytes)
to `6e2ca05ed20a7e74aa44fb3f07a1d93a1ac93b8965331fcc6599f6022418db30`
(98,320 bytes).

**It had to.** The fixed picture that test pins is
`starter/lines/cat.png`, and that file is **94.0% fully transparent, 1.5% partly
transparent, 4.6% opaque, with its transparent pixels stored as `rgb(0,0,0)`**,
measured by inflating the PNG and counting its alpha channel. The harness traces
it in **"Already line art"** mode. So the pinned baseline *is an instance of the
bug*: it has been traced on black all along, and `b9eabef0…` is the digest of that
wrong output. The file nearly quadrupled because 94% of the picture stopped being
solid ink.

There is no honest fix that leaves that digest alone — any fix that spared it
would have to spare exactly the case it is meant to repair. The two instructions
genuinely conflict, and the brief itself says which one wins, so the stage is out.

#### What is on disk, and what to do next

The whole stage is kept, unapplied, in the sandbox:

```
scratchpad/stage5-pipeline.ts.rejected
scratchpad/stage5-lineart.test.mjs.rejected
```

The decision this needs is one a person should take awake: the fix is right, the
test is right to notice, and the baseline is wrong. The way through is to re-record
the fixed-picture digest **in the same commit as the fix**, with the measurement
above in the message — or to repoint the test at an opaque fixture and add a
transparent one beside it with its own digest, which is better, because then the
test covers both kinds of file instead of pinning one.

After the revert: 745 tests pass; both PDF digests `e3e2a36e0ac60ce1` and
`d4eeeb9e99cb1bfe` unchanged; the fixed-picture export is
`cat-1026x1026.png  25236 bytes  sha256 b9eabef0…212994` again, byte for byte;
build clean. Nothing was re-recorded.

### Stage 5, shipped after all — the transparent PNG fix

The stage above was reverted on 2 October because it moved the fixed-picture
export digest. It is now in, on a decision taken awake, and the baseline has been
re-recorded on purpose. **The old digest and the new one, for the record:**

| | sha256 | bytes |
| --- | --- | --- |
| **old** | `b9eabef0e5424e828acb78c0801e62bab06737140751fa59b047558407212994` | 25,236 |
| **new** | `6e2ca05ed20a7e74aa44fb3f07a1d93a1ac93b8965331fcc6599f6022418db30` | 98,320 |

**Why it moved.** The picture that test pins is `starter/lines/cat.png`, and it is
94.0% fully transparent with its transparent pixels stored as `rgb(0,0,0)`. The
harness traces it in "Already line art". So the old baseline was a hash of a
sticker that had been traced on *black paper*: the whole page thresholded to ink
and the drawing disappeared inside it. The file nearly quadrupled because 94% of
the picture stopped being solid black. `docs/transparent-png/comparison.png` shows
all three panels — what you upload, what came out before, what comes out now.

**What proves only transparent inputs changed.** The export test now pins two
pictures instead of one:

- `starter/lines/cat.png` — transparent, the case the fix is for;
- `tests/fixtures/cat-opaque.png` — *the same drawing* composited onto white by
  hand and written as PNG colour type 2, which has no alpha channel at all.

The opaque one exports to `6e2ca05e…18db30` **both before and after** the fix,
byte for byte. That is the measurement that says the flatten is a no-op on
anything already opaque. And after the fix both pictures export to the *same*
bytes — which is "composite onto white, then proceed exactly as before" stated as
an assertion rather than as a sentence. The harness checks all three facts.

Baselines now live in `tests/golden/export-digests.json` rather than in this
prose, so the next person can see what changed and when.

**The lesson about fixtures**, worth more than the fix: a regression fixture that
is itself an instance of a bug will defend the bug, and it will do it
convincingly, because the test is doing exactly what it was built to do. The one
picture pinning this export path was 94% transparent. Pin two when a code path has
two kinds of input.

Unchanged by this, and checked: 752 tests pass (7 new), both PDF digests
`e3e2a36e0ac60ce1` and `d4eeeb9e99cb1bfe`, `golden:screen` 0 pixels changed, build
clean, `npm run check:topbar` passing.

### Stage 6 — the layout audit — `2e9bac7`

A browser test visits all nine pages at 1280×720 and 800 wide in all three
themes — 54 combinations — and measures five things:

1. nothing pokes outside its parent, unless the parent scrolls on purpose;
2. no page scrolls sideways;
3. no text sits on top of other text;
4. every button has at least 32 px of target;
5. every picture and drawing is inside its box.

All 54 report clean. They did not at the start.

#### The two that mattered

**The designer had no narrow layout at all.** `Rail` has always known how to be a
bar along the bottom with its panel as a drawer above it (`max-lg:order-last`,
`max-lg:w-full`), and `CoverDesigner`'s wrapper was a plain flex row that never
let it. In a row, `w-full` means the whole row — so at 800 px the rail and the
panel each claimed 800 px, the page grew an 800 px horizontal scrollbar, and the
canvas pane was squeezed to nothing: `scale` never became positive and the board
was not drawn. This is the fault stages 1 and 3 found from two directions and
carried here. One class: `max-lg:flex-col`.

**The poetry header pushed the window 113 px wider.** `StudioHeader` scrolls
sideways rather than growing and says in a comment why — a bar that makes the
whole page scroll sideways takes the thing being worked on with it. The poetry
workspace has its own header and never got that treatment.

#### The rest

- The spread nav's page label had `min-w-48` as a floor, so at 800 the group
  stayed 280 px in a 240 px space and hung 40 px out. 192 px is what it wants,
  not what it must have.
- The undo footer sits in the 78 px rail, which may not be widened because the
  board's size is worked out from it; two buttons and a caption in a row came to
  147 px. It is a column in the rail and a row in the bottom bar.
- "Background" is the longest rail label, and a single word has no break
  opportunity, so at 10.5 px it hung over the edge. 10 px fits, with
  `[overflow-wrap:anywhere]` as insurance for a label nobody has thought of yet.
- Eleven kinds of control were under 32 px of target: the home filter pills and
  sticker category chips (28.8), the poetry guide toggles (26.5), the board's
  Guides and zoom pills (26), the walkthrough's dismiss (24), the panel close
  (22.5), "← Everything" (19.5), a pack's source link (18), and the card corner
  buttons on the hub and the colouring grid (28).

#### Two refinements to the audit, because it was wrong twice

- A switch's visible track is 30 px and its hit area is 44 — `lib/switch.ts` says
  so, and a `::before` with a negative top and bottom does it, precisely so the
  switch can be hit without being drawn as a slab. The audit measures the target
  now, not the paint.
- A `-mx-2` bleed exists so a list row's hover background reaches the panel's
  edges, by reaching into the padding of an ancestor further up. A child with a
  negative margin that is still inside its *grandparent* landed where it was
  aimed; anything escaping the grandparent too is still a fault.

The panel close button then needed the switch's trick rather than a bigger box:
drawn at 32 px it made the panel header eight pixels taller and the Picture panel
needed two pixels of scroll at 1280×720, which stage 1 forbids. 24 px cross,
32 px target, panel back to 0 px over.

#### The gallery

`docs/aesthetic-shots/` — 54 shots, **1.31 MB in all**, biggest 56 KB, with a
README on reading them. WebP, because 54 full-colour PNGs of this app come to
about thirty megabytes, there is no image compressor on this machine and rule 5
does not allow installing one, so Chrome — which took the screenshots — encoded
them too, at quality 72. Flat colour and type; it barely shows.

---

## Stage 7 — the numbers, and how to look at all of it

### Every commit, in order

`pre-aesthetic-4` → `ec96f7d` is the rollback point. Everything below is on
`main` and pushed.

| hash | what |
| --- | --- |
| `1366f6e` | Start the overnight log |
| `fc56ec9` | **Commit 4a** — moving chrome in the editors, and a text diet |
| `84b186b` | **Commit 4b** — the tools beside the picture, and the picture's own colours |
| `330e6e3` | **Commit 4c** — three effects you can see, and a toolbar that floats |
| `3b2e970` | log: stage 1 |
| `43da369` | Two colour classes that compiled to nothing, and a guard — and, by accident, stage 2's surfaces |
| `d3f8d06` | **Commit 5** — the sticker pages, and thirty-three classes that did nothing |
| `fac5fae` | log: stage 2 |
| `0bc3e36` | **Commit 6** — feedback and flow |
| `798656b` | log: stage 3 |
| `dd93d24` | **Commit 7** — a book on the first screen |
| `09b5298` | log: stage 4 |
| `884d5c8` | log: **stage 5, written and reverted** — read this one |
| `2e9bac7` | **Commit 8** — the layout audit, and the eleven things it found |

Stage 5 produced no code commit, deliberately. `884d5c8` explains why.

### Frame times

From a Chrome performance trace against the production build, `requestAnimationFrame`
deltas, with the book turning on the front page throughout:

| what | frames | median | p95 | worst | over 20 ms |
| --- | --- | --- | --- | --- | --- |
| hover and tilt a card | 39 | 16.7 ms | 16.7 ms | 16.8 ms | 0 |
| open the Create menu | 108 | 16.7 ms | 16.8 ms | 16.8 ms | 0 |
| change page | 149 | 16.7 ms | 16.7 ms | 16.8 ms | 0 |
| idle, with the dropzone marching | 190 | 16.7 ms | 16.8 ms | 16.8 ms | 0 |

A flat 60 fps with nothing to report, which is what animating only `transform`
and `opacity` buys.

### Asset sizes, before and after

Both measured the same way: every response on a first load of `/` against a
production build, `pre-aesthetic-4` on one port and `main` on the other.

| | before (`ec96f7d`) | after (`2e9bac7`) | change |
| --- | --- | --- | --- |
| CSS | 74.5 KB | 87.8 KB | **+13.3 KB** |
| JavaScript | 537.4 KB | 542.7 KB | **+5.3 KB** |
| Fonts | 0 KB | 0 KB | — |
| Images | 0.3 KB | 0.3 KB | — |
| Other | 19.8 KB | 21.2 KB | +1.4 KB |
| **Total** | **632.0 KB** | **652.0 KB** | **+20.0 KB** |
| Requests | 12 | 14 | +2 |

**+20.0 KB against a 150 KB budget**, and none of it a font or an image: the whole
run added no asset of any kind. The book on the front page, the peel, the fan, the
toasts, the skeletons and the celebration are all markup and stylesheet rules.

Fonts read as 0 KB because the check blocks Google Fonts; the two stylesheet
links in `app/layout.tsx` are the same two that were there before this run, so
they are unchanged either way.

Per-route first-load JS, before → after: `/` 167 → 169 KB, `/coloring` 244 → 244,
`/design` 232 → 233, `/poetry` 256 → 256, `/stickers` 185 → 189,
`/stickers/library` 159 → 161, `/stickers/packs` 157 → 158.

### Dependencies added

**None.** Not in any stage. Where one would have helped, it was done without:
React 19.2 stable has no `<ViewTransition>` and Next's flag for it needs a React
experimental build, so client navigations fade (stage 3); and there is no image
compressor on the machine, so Chrome encoded the gallery itself (stage 6).

### What was reverted

**Stage 5, in full** — the transparent-PNG fix. Written, tested, proven, and taken
out because it moves the fixed-picture export digest, which the brief forbids. The
bug is still in the app. Read the stage 5 entry above before anything else; the
code is in `scratchpad/stage5-pipeline.ts.rejected` and
`scratchpad/stage5-lineart.test.mjs.rejected`, which are **in the sandbox, not in
this repository** — if that sandbox is gone, the diagnosis in the log is enough to
write it again in an hour.

Nothing else was reverted, and no golden or digest was re-recorded at any point in
this run.

### Reviewing it on a Mac

```bash
git fetch origin && git checkout main && git pull
npm ci

# The four checks, in the order they are cheapest to run.
npm test                 # 745 unit tests
npm run build            # must be clean
npm run golden           # PDF digests e3e2a36e0ac60ce1 and d4eeeb9e99cb1bfe
npm run golden:screen    # must say 0 pixels changed (needs the build above)

# Then look at it.
npm run build && npm start      # http://localhost:3000
open http://localhost:3000/?theme=sunrise
open http://localhost:3000/?theme=lagoon
open http://localhost:3000/?theme=candy

# The gallery of what it looked like when this was written.
open docs/aesthetic-shots
qlmanage -p docs/aesthetic-shots/*-sunrise-1280.webp

# To see the whole run as a diff, or to go back.
git diff pre-aesthetic-4..main --stat
git log --oneline pre-aesthetic-4..main
git reset --hard origin/pre-aesthetic-4    # on a branch you do not mind losing
```

To check the reduced-motion path without changing your system settings: in Chrome,
open DevTools, press ⌘⇧P, type "Emulate CSS prefers-reduced-motion: reduce". The
book should stop turning and sit at an angle; the sticker cards should not peel;
nothing should float up when you export.

### What to look at first, now that it is done

1. **The stage 5 entry above.** It is the only thing in this log that is still
   broken on purpose, and the only one that needs a decision.
2. **`/design` at 800 px wide.** It had no narrow layout at all until stage 6, so
   it is the screen most changed by this run and the one least likely to have been
   seen before.
3. **The Sticker Studio with a picture open**, at 1280×720. The tool strip, the
   eight panels and the colours read off your own picture are the biggest change
   to how the app is used, rather than to how it looks.
4. **The three themes on the front page.** Sunrise is the default; the other two
   are one query parameter away and are remembered once asked for.
