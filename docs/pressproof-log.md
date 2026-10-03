# Press Proof — the run log

A running log. Newest stage last. Every hash here is on `main` and pushed.

## What to look at first

1. **`?theme=press-proof`, `sherbet`, `mint-cloud`, `lilac-haze`, `riso`, `night`**
   on any page. Press proof is the default and is remembered once asked for.
2. **The home screen** — the sidebar, the format tiles and the project cards are
   the biggest change.
3. **The Sticker Studio with a picture open**, which is the one screen allowed
   its own sizes and gets a new layout.

## Rollback

`pre-pressproof` points at `2949d65`, the commit this run started from.

```bash
git fetch origin
git reset --hard origin/pre-pressproof   # on a branch you do not mind losing
```

## Two things about the brief, up front

**The Figma files could not be read.** The four links point at
`0K9dEz7luytO1llcNNy8Ws`. This machine has the Figma MCP server, and every call
to it returns *"You've reached the Figma MCP tool call limit on the Starter
plan"* — a quota on the account, not something a retry or a different node id
gets past. So nothing in this run was taken from the Figma file: every size,
colour, radius and font below comes from the brief's own text, which specifies
them exactly. Where the text and the file disagree, the file is right and this
is wrong, and the places most likely to differ are the ones the text describes
in words rather than numbers.

**The hairline border is not held to a contrast ratio.** Rule 5 says every text
and button colour pair must pass AA. A 1px rule between two surfaces is neither,
and holding `ink300` to 3:1 against the paper would make every border on the
page read as a heavy outline — the opposite of the look. Borders that carry
meaning rather than separation (a focus ring, a selected card) are drawn in
`ink900`, which passes easily. Said here because the first version of the sweep
did include them and failed twelve pairs across six palettes.

---

## Stage 1 — tokens, fonts, six palettes

### The palettes

`lib/theme.ts` is now six palettes of seventeen roles, in the order the brief
gives them, plus the three decisions each palette carries (`sidebarStyle`,
`textOnAccentA`, `isDark`) and one extra role, `outline`, which the brief asks
for in Night and which costs nothing elsewhere.

**Four values were nudged** to reach AA, each by the smallest step that passed,
found by darkening in 1% increments until every pair using that role cleared
4.5:1:

| palette | role | was | is | why |
| --- | --- | --- | --- | --- |
| sherbet | `ink500` | `#86697D` | `#755B6D` | 4.19 on `paper100`, 3.64 on the tinted sidebar |
| mint-cloud | `ink500` | `#647F75` | `#536961` | failed on all four of its surfaces, worst 3.37 |
| lilac-haze | `ink500` | `#6F6590` | `#665D84` | 3.97 on the tinted sidebar |
| riso | `accentA700` | `#C21F78` | `#B81D72` | 4.47 as lettering on `paper100`, 4.18 on its own badge |

Riso's `accentA500` keeps its fluorescent pink exactly — it is the point of that
palette, and it is why `textOnAccentA` is `ink` there.

### Three things the sweep had to learn

The first run reported 27 failures. Most were the sweep modelling the design
wrongly rather than the palettes being wrong, and the three fixes are worth
knowing because they are rules about the design language, not about this run:

- **The deep step letters; the mid step fills.** A red mark drawn as *text* uses
  `accentA700`, not `accentA500`. Checking `accentA500` as text failed almost
  everywhere, which is correct — you do not letter in the fill colour.
- **Text on a fill is chosen by contrast, not declared.** Riso's pink needs ink
  on it and Riso's deep magenta needs white, so one `textOnAccentA` per palette
  is wrong for one of them. `textOn(palette, fill)` works it out; the palette
  still declares `textOnAccentA` because that is the brand decision for the
  primary button.
- **A dark sidebar wants the palette's lightest ink, and which role that is
  flips.** In a light palette `paper50` is the near-white page; in Night it *is*
  the near-black page, so a nav label in `paper50` on a near-black sidebar was
  invisible at 1.05:1. There the light end is `ink900`.

All six palettes now pass every pair. `npm test` runs the sweep.

### The aliases, and why they exist

The app is written in the old token names — `ink-100`, `accent-500`,
`coral-500`, `ground`. `scripts/make-tokens.mjs` emits the new roles *and* keeps
those names pointing at the nearest role, so changing the palette did not
require changing every component on the same commit. They are a bridge, not a
second system: each is a line that can be deleted once the last component
reading it has moved over, and the later stages do exactly that.

### The fonts

Four faces in one request, loaded the way the two before them were — a
stylesheet link at runtime, `display=swap`, every stack ending in something the
machine already has.

| | latin bytes |
| --- | --- |
| **before**: Fraunces 500/700 + Great Vibes | 177,408 |
| **after**: Fraunces 600 + 600 italic + Great Vibes + Inter + DM Mono | 198,572 |
| **added** | **+21,164 (+20.7 KB)** |

Against a 150 KB budget. Inter is asked for as a variable face (`wght@400..600`)
rather than as three static weights: **48,256 bytes instead of 96,512**, which
is the single decision that kept this inside the budget. Fonts do load in this
sandbox — Google Fonts is reachable — so they were measured rather than
estimated, and the checks below run with fonts allowed.

### Chrome never reaches a file

Two tests, because the promise has two halves:

- `tests/export-palette.test.mjs` forbids the modules that write files
  (`lib/render`, `lib/lineart`, `lib/stickers`, `lib/cover`, `lib/exportClient.ts`,
  `app/api`) from importing `lib/theme.ts` at all. Proving the absence of an
  effect is hard; forbidding the import is easy and is the thing that would go
  wrong.
- `scripts/export-digest.mjs` now exports the fixed picture **a third time, with
  Night on**, and requires the bytes to be identical to the Press-proof run.
  They are: `98,320 bytes, sha256 6e2ca05e…18db30` under both.

### Checked

- `npm test` — 759 pass, 0 fail (6 new).
- `npm run golden` — `e3e2a36e0ac60ce1` and `d4eeeb9e99cb1bfe`, unchanged.
- `npm run golden:screen` — **0 pixels changed** on both boards. The board region
  is drawn from the design's own data, so the palette does not reach it; no
  golden needed re-recording at this stage.
- `npm run build` — clean.
- The fixed-picture export — identical under two palettes, as above.
- Driven in Chrome at 1280×720 and 800 wide in Press proof and Night, all nine
  pages: **36 combinations, all clean** — palette applied, no sideways scroll,
  nothing outside its parent, no overlapping text.

### Only checkable in the sandbox

- Headless Chromium on Linux. Font rasterisation, and whether Fraunces SemiBold
  Italic looks right at 60px, need a real screen.
- The palettes are checked as numbers. Whether Riso reads as a risograph rather
  than as a mistake is a judgement.

### Added dependencies

None.

---

## Stage 2 — the palette picker

`components/PalettePicker.tsx`: a button carrying a split dot in the palette's
own primary and secondary, opening a popover of six cards. Each card is a small
picture of the three things that actually differ — a strip of sidebar, a page
with two lines of text, and the accent row — because a name and a swatch do not
tell you what Riso is going to feel like and a 54px picture does.

It is in the home top bar next to Create, and in both of the studio's bars (the
start screen and the studio proper). Clicking applies instantly: `data-theme` on
the root is all it takes, because every colour in the app is a variable that
attribute redefines. No reload, no round trip.

**The cross fade is one opacity on the root**, not a colour transition on every
element — a hundred interpolations firing at once is a hundred things for the
compositor to do. It is skipped entirely under `prefers-reduced-motion` and
under the harness's `data-motion="off"`, where an instant swap is the honest
behaviour.

**The pre-paint script now also restores a mixed palette** (stage 9's output):
seventeen values from a second key, written onto the root as inline custom
properties before the first frame, so a palette somebody made is right on load
rather than a flash of the default. `custom` is accepted as an id only when that
key actually parses, so a half-written key cannot leave the app unpainted.

### Found by the guard test

`bg-accenta-500` was reported as naming a token that does not exist. The guard's
family list is an ordered alternation, and `accent` listed before `accenta`
matched the first seven letters and reported the token `accent`. Longest first,
plus a `(?![a-z0-9])` boundary. Worth knowing because every new role added to
that list from now on has the same trap.

### Checked

- `npm test` — 759 pass. `npm run golden` — both digests unchanged.
  `golden:screen` — 0 pixels changed. `npm run build` clean.
  `npm run check:topbar` — the bar still fits at 1280/800/1440 with the new
  button in it.
- The fixed-picture export, three ways — transparent, opaque, and transparent
  under Night — all `98,320 bytes, 6e2ca05e…18db30`.
- Driven in Chrome at 1280×720 and 800 wide: default is press-proof before
  anything is clicked; the popover opens with six cards and stays inside the
  window at both widths; clicking applies and remembers; after a reload the
  palette is on the root *before the page has finished loading*; Enter opens and
  Escape closes and returns focus to the button; the button shows a 2px focus
  ring. Under reduced motion the swap happens with no fade flag at all.
- The nine-page sweep again in press-proof and riso: 36 combinations, all clean.

---

## Stage 3 — shared surfaces, and the animation clean-up

### The surfaces

Buttons, fields, chips and cards rebuilt from the tokens. Flat fills, 1px
hairlines, radius 6 on anything you press or type into, 4 on a chip, 3 on a tag.
**No gradient anywhere and no blurred shadow anywhere.** The press is `scale(0.98)`
and it is the only thing that moves.

- **Primary and Create** are the same flat `accentA500` fill. The text on them is
  `--text-on-accenta`, which the palette worked out — white in five palettes, ink
  in Riso. The hover state darkens to `accentA700` and takes
  `--text-on-accenta-700` with it, which is computed separately: Riso's pink
  needs ink on it and Riso's deep magenta needs white, so the hover state cannot
  inherit the resting one.
- **One focus ring for every control**, 2px `ink900` offset 2px. Drawn in ink
  rather than in an accent because a ring has to be visible on an accent-filled
  button too, and an accent ring on an accent fill is not a ring.
- **The page is flat.** `--surface-page`, `--surface-card` and `--surface-raised`
  were two-stop gradients; each is now one token. The 3.5% grain stays — it is
  not a gradient, and a large area of one exact colour is the thing that reads as
  cheap.
- **The chequerboard follows the palette** now (`paper50` and `paper200`) instead
  of being a fixed off-white pair. The property that mattered is kept: neither
  square is pure white, so a white die-cut outline stays visible on it.

### Three new pieces of the language

- **`.crop-marks`** — 1px `ink500` lines, 9px long, 5px outside each corner.
  Four corners as eight gradients on one pseudo-element rather than eight nodes,
  because it is decoration and decoration should not add eight elements to every
  card on a page.
- **`.checker`** — two rows of eight 25px squares alternating `accentA500` and
  `accentB500`, as two repeating gradients on one element. The sidebar footer and
  nowhere else, as the brief says.
- **`.mono-label` and `.tag`** — the small uppercase annotations, so the tracking
  and the case are decided once.

### Removed

| gone | was |
| --- | --- |
| `components/BookMock.tsx` + `.book*` | the 3D book on the hero |
| the `.hero` band | a gradient wash with a radial bloom |
| `.shimmer` + `@keyframes create-shimmer` | the light crossing the Create button |
| `components/Tilt.tsx` + `.tilt`, `.tilt-lift` | cards leaning towards the pointer |
| `.pop`, `.pop-hover` | the icon chips bouncing |
| `components/WellDone.tsx` + `.rise` | the once-a-session celebration |
| `.fan`, `.fan-card` | the 3D spread on pack cards |
| `.drop-in` | the sheet tray bouncing in |
| `.stagger-in` | search results arriving one by one |

Kept, as the brief says: the sticker peel, the save stamp, toasts, the progress
ring, the loading shimmer, the panel fade and the sliding rail pill.

The pack card's fan became `.collage` — four flat tiles with a hairline between
them. A pack is a thing you open, not a hand of cards you riffle.

### Checked

759 tests pass; PDF digests `e3e2a36e0ac60ce1` and `d4eeeb9e99cb1bfe` unchanged;
`golden:screen` **0 pixels changed on both boards**; build clean; the
fixed-picture export identical under both palettes (all four assertions);
`npm run check:topbar` passing; the browser contrast sweep reports every piece of
text on all four screens passing AA. Driven at 1280×720 and 800 wide in Press
proof and Night across all nine pages: 36 combinations, all clean. The palette
picker's own 17 checks still pass.
