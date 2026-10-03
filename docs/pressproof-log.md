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

## Stage 4 — the home screen

The reference is 1440×1000. Sidebar 248 wide; a 480-max search box with a
shortcut badge that really focuses it; a hero carrying the real date and the
real count of unnamed drafts; two numbered section rules; seven format tiles at
144×150 drawn as silhouettes at their real proportions with crop marks; filter
chips; project cards 259 wide with real thumbnails, type tags and Fraunces
titles; and a designed empty state with the cat rather than a grey slab.

### Nothing is called "Untitled"

`lib/home/naming.ts` decides what to call a design nobody named, in order: the
name somebody gave it, the first words actually on the board, what it is made
of, then the date. Pure and out of the component so the awkward cases can be
tested rather than eyeballed — a board holding one em dash is not a name, a
forty-word heading is cut at a word boundary at 32 characters. 11 tests in
`tests/naming.test.mjs`, one of which is called *never, under any
circumstances, "Untitled"*.

Seeded with four real designs the cards read: **Small hours** (the words on the
board), **Garden notes** (the name given), **Thank you for the tea** (the words
on the board), **2 stickers** (a bookmark with no words on it).

### Previews are drawn at the design's own proportions

A row of identical landscape boxes with the real thing letterboxed inside says
a bookmark and a postcard are the same shape, which is the opposite of the
point. `previewBox()` fits the box to the design instead, inside 199×136, so
the art fills it and the crop marks sit on the corners of the sheet rather than
on the corners of a container. The proportions are the board's — trim plus
bleed on all four sides — which is what a proof shows: 1.00 for the square
post, 0.67 for the pin, 0.72 for the postcard, 0.36 for the bookmark.

### Two bugs found, both by things that could not be seen before

**Night's sidebar was near-black on near-black.** `scripts/make-tokens.mjs`
worked the sidebar colours out a second time, by hand, instead of asking
`colourAt()`. The hand copy gave a dark sidebar `paper50` for its text — which
is near-white in five palettes and near-BLACK in the dark one. The contrast
sweep never caught it because the sweep reads `colourAt` and only the browser
read the generated CSS. The generator now asks `colourAt` for all seven derived
colours; the diff is exactly four lines, all in Night.

Two guards added so it cannot come back quietly: one reads `app/tokens.css` and
checks every derived colour against `colourAt` directly, the other asserts
every sidebar pair passes AA from the palette data. Proved by reintroducing the
old derivation — the guard fails with `night --sidebar-text: css says #14110E,
colourAt says #F4EEE1`.

**Great Vibes and Fraunces Italic hung out of their lines.** With real fonts
loading for the first time (see below) the wordmark's inline box is 57px inside
a 46px line and the italic word's is 74px inside a 61px one. Leading raised to
1.26 and 1.24, which are the faces' own metric boxes.

### What could only be checked in the sandbox, and what could not

**Webfonts do not load in this sandbox's browser.** Every request to
`fonts.googleapis.com` dies with `ERR_CERT_AUTHORITY_INVALID`: the browser's
NSS store was baked into the image in September with a different CA from this
session's agent proxy, and there is no `certutil` to re-import one. `curl`
trusts the CA fine, so the +20.7 KB measurement in Stage 1 stands — but it
means **every screenshot and every measurement before this stage was of a
fallback stack**, and the typography was never what was photographed. Rather
than turn TLS verification off, the stylesheet and all 23 woff2 files were
fetched with `curl` into a cache and are served to the browser from disk. All
23 faces now report `loaded`. Nothing about how the app loads fonts changed.

**Hover states could not be seen at all.** This headless Chromium reports
`(hover: none)` *and* `(pointer: none)` — it believes there is no mouse — and
Tailwind wraps every `hover:` and `group-hover:` utility in `@media (hover:
hover)`. So every hover in the app was inert under every check run so far, and
a screenshot of a hovered thing was a screenshot of a resting thing. The build
ignores both `--blink-settings=primaryHoverType=2,…` and CDP's
`Emulation.setEmulatedMedia` features, so the harness instead reads the app's
own stylesheet back, unwraps the `@media (hover: hover)` blocks and injects the
declarations unchanged — same selectors, same declarations, only the condition
a real desktop already satisfies removed. 4,072 bytes of rules.

I misread this at first and rewrote the home screen's hovers believing
`group-hover:` was broken in the app. It is not: it is fine on real hardware.
The rewrite is kept because it earns its place for a different reason — the
plate has to take its outline when something inside it takes **focus** as well
as on hover, and that is two variants and a transition repeated on every tile
and every card. `.plate` / `.proof` / `.proof-lift` / `.proof-tools` in
`surfaces.css` say it once, keep Tailwind's `(hover: hover)` guard on the hover
half so a tap does not leave a plate stuck looking hovered, and deliberately
leave the focus half outside that guard, because a keyboard is a keyboard
whatever the pointer situation is.

Measured with the gate removed: the plate goes `rgba(0,0,0,0)` → `rgb(27,24,21)`
at 1px, the card lifts exactly −2px, the rename and duplicate buttons go to
opacity 1, and focusing inside a card with the pointer parked at 0,0 outlines it
the same way.

`.chip:hover` and `.card-lift:hover` in `surfaces.css` are still unguarded from
Stage 3, and three sticker components still use `group-hover:border-accent-500`.
Both are correct on a desktop; the touch question belongs to Stage 8 and the
Stage 10 audit, not here.

### Smaller things

- The seven tiles did not fit across: 7×144 = 1008 inside 1096, but `gap-x-4`
  added 96px and pushed them to 1104. `justify-between` alone spaces them.
  They still wrap at 1280, where only 936px is available — which is what a
  wrapping list is for.
- The date reads `Saturday 3 October`, not `Saturday, October 3` (`en-GB`).
- Tiles say what they are: Book interior, Book cover, Instagram post, Pinterest
  pin, Postcard, Bookmark, Stickers. "IG post" and "Pin" were jargon.
- The book cover's size line was `KDP wrap: back, spine and front`, which
  truncated at 144px. Now `Back, spine, front` — the tile is already called
  Book cover, so "KDP wrap" was saying it twice.

### Checked

772 tests pass (11 naming, 2 new theme guards). PDF digests
`e3e2a36e0ac60ce1` and `d4eeeb9e99cb1bfe` unchanged. `golden:screen`: **0
pixels changed on both boards**, so no golden was re-recorded. Build clean.
The fixed-picture export is still 98,320 bytes /
`6e2ca05ed20a7e74aa44fb3f07a1d93a1ac93b8965331fcc6599f6022418db30` under both
Press proof and Night, all five assertions. The browser contrast sweep reports
every piece of text on all four screens passing AA. Driven at 1280×720 and 800
wide in Press proof and Night across all nine pages: 36 combinations, no
element outside its parent, no sideways scroll, no overlapping text, and no
font request the cache could not answer. The palette picker's 17 checks still
pass. Six hover and focus assertions pass with the hover gate removed.

## Stage 5 — the Create menu and search

The menu's rows are plates now: a flat `paper100`, a hairline that goes to
`ink900` on hover and on focus, radius 6, a Fraunces name and the size in DM
Mono underneath. Its groups are numbered and ruled the way the home screen's
sections are — `01 Books`, `02 Covers`, `03 Social`, `04 Print`, `05 Stickers`
— because the menu is the same shop, not a different one. Gone with it: the
bob on hover, the lift, the raised shadow, the accent-tinted hover fill and
`rounded-xl`.

`PREVIEW_BOX` was already 56, so the shared box only needed restyling: radius
6 instead of `rounded-lg`, and a hairline rather than a shadow, so it reads as
a flat tint with an edge instead of a card hovering in the row. The search
results now use that same 56 square — a result and a format are the same kind
of object and should not be two different sizes.

`CATEGORY_TINT` and `CATEGORY_INK` moved off the legacy aliases
(`--color-sun-50`, `--color-denim-50`, `--color-clay-50`, `--color-lilac-50`)
and onto the palette's three accents plus the paper. Books and stickers share
the third ink; covers and print share the first. That is the same pairing the
home screen's chips and tags already make, and it is what having three accents
means — a fourth and fifth would be two more colours nobody can name.

### Three bugs found

**Every dialog and every panel had lost its background.** `.dialog` and
`.panel` said `background-image: var(--surface-raised)`, from when that token
was a gradient. Stage 3 flattened it to one colour — Press Proof has no
gradients — and `background-image: #F5EEDF` is not a value, so the browser
dropped the declaration in silence. The Create menu was a transparent box with
the home screen legible straight through it. Nothing warned, and no check
opened a modal, which is why it survived two stages.

A guard now reads the three stylesheets, follows each token one level of
indirection to what it actually holds, and fails if `background-image` is given
anything that is not a `url()` or a gradient. Proved by putting the old
declaration back: `background-image: var(--surface-raised) — that token holds
"#F5EEDF"`.

**There were two focus rings, and they disagreed.** `globals.css` drew a teal
one on `:focus-visible` for everything, `surfaces.css` drew an ink one on
`.btn`, `.field` and `.chip`. Stage 3 said one ring. It is now declared once,
in ink — the one colour every palette keeps furthest from its accents, so it
never lands teal-on-teal — and the duplicate block is gone. The gap around it
changed from the white sheet to the page colour: white is right in five
palettes and draws a white band round every focused control in the dark one.

**The dialog wore that ring around its whole self.** It is given focus on open
so Escape and Tab behave, which is housekeeping, not something somebody tabbed
to, and `outline-none` on the element lost to the unlayered `:focus-visible`
rule. A ring round the entire panel says the panel is selected. The controls
inside it keep theirs.

### And the last four "Untitled"s

Stage 4 removed the word from the cards; it was still in four other places on
this screen — the clean-up list, the book picker, the delete confirmation and
the rename field's label — all of which have a `LibraryEntry` and can simply
ask `nameFor`. `components/Landing.tsx` no longer contains the string.

It remains in the editors (a poem, a colouring page, a plate), where a thing
genuinely has a title field somebody left blank. That is a different question
from what to call a design in a list, and those files are Stage 7's, where the
brief allows colour only.

### Checked

773 tests pass (one new guard). PDF digests `e3e2a36e0ac60ce1` and
`d4eeeb9e99cb1bfe` unchanged. `golden:screen`: **0 pixels changed on both
boards**. Build clean. The fixed-picture export byte-identical under both
palettes. The contrast sweep passes on all four screens with the new focus
ring. 36 page/palette/width combinations clean at 1280×720 and 800 wide in
Press proof and Night. The palette picker's 17 checks still pass.
