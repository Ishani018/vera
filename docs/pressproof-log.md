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
