# Decisions

One entry per decision that would be expensive to reverse. Newest last. If a
decision is revisited, add a new entry rather than editing the old one — the
reasoning that turned out to be wrong is the useful part.

---

## 1. Scope: the wedge, not a general Canva

*29 September 2026 — decided*

**Isnaevy is the design tool for people who self-publish books**: covers, interiors,
and the launch kit around a release (Instagram post, Pinterest pin, postcard,
bookmark). Not a general-purpose design tool.

**Why.** Canva's moat is not its canvas — most of a canvas already exists in this
repo. It is tens of thousands of templates and a licensed asset library, which is a
content operation with a budget, not a programming problem. Competing there means a
first year building the editor and a second buying the content.

The narrow version is winnable instead of unwinnable. Canva's print output is the
weakest part of Canva and always has been; exact page boxes, real embedded font
subsets and KDP's actual rules are already working here and are genuinely hard to
copy. It also gives the product a single sentence, which "general design tool" never
does.

**Reversible?** Cheaply, in one direction. Everything built for the wedge is a
subset of the general tool, so widening later costs nothing already spent. Starting
wide and narrowing later wastes the difference.

---

## 2. Architecture: two engines on one shared floor

*29 September 2026 — decided, correcting the original framing*

The original idea was one general editor core with the book makers as modes on top.
**That is wrong for the book interiors.** A canvas editor and a paginated-document
engine are different machines.

**Why.** The ~2,800 lines of pagination here do things a canvas model has no way to
express: named `@page` rules, running heads suppressed per page type, roman-then-
arabic folios that no CSS counter can produce, orphans and widows, `break-before:
right`, a contents page carrying real page numbers. Forcing that through a canvas
model destroys it, and there is nothing to gain — no canvas tool on the market does
it, which is exactly why it is worth keeping.

So: a **canvas engine** (covers, posts, posters, pins), a **flow engine** (book
interiors), and a shared floor of assets, fonts, undo and the HTML → Chromium → PDF
pipeline. Both engines emit HTML; that is the seam. See `architecture.md`.

**Reversible?** Yes, and that is the point — the two can be merged later if it ever
looks right. Merging them now would be irreversible.

---

## 3. Units: store points, not inches

*29 September 2026 — decided*

All geometry is stored in **points** (1/72 inch). Each board declares its own
display unit (`px`, `in`, `mm`) for the interface.

**Why.** Everything today is inches because everything today is print. A general
board has to hold 8.5 × 11 inches and 1080 × 1080 pixels without either becoming
ugly. Points are exact for both: inches × 72, CSS pixels × 0.75. Facebook's
1200 × 628 px is exactly 900 × 471 pt; stored as inches it is 6.541666…, and the
display would round-trip to 627.9999. Millimetres stay display-only, since 72/25.4
is not exact and nobody demands exact mm round-trips.

**Cost.** One `× 72` pass in `migrateProject`, alongside the `curve ??= 0` and
`arc ??= 0` lines already there. The risk is that print exactness is measured in
thousandths of an inch, so the migration has to be followed by re-verifying real
PDF bytes.

**Therefore: golden-file tests come first, before the migration.** That ordering is
part of this decision, not a detail of it.

---

## 4. Assets: Google Fonts and own line art only

*29 September 2026 — decided*

No SVG Repo, no OpenMoji, no stock photo libraries, for now.

**Why.** Each of the tempting sources carries a problem worth avoiding while the
product is unproven. SVG Repo has **mixed licences per asset** with no blanket
grant, so every file needs filtering and per-file attribution. OpenMoji is
**CC BY-SA** — share-alike, a real constraint on a commercial product. Unsplash and
Pexels allow commercial use but restrict redistributing the photos *as* a stock
library, which is arguably what a browsable in-app gallery is.

Google Fonts is mostly OFL/Apache and already wired up. And the line art pipeline
turns the user's own paintings into graphics nobody else has and no licence covers
— which is the only asset moat here that cannot be copied.

*(Licence terms above are as understood at the time of writing and were not
verified against the sources. Check before any of them becomes load-bearing.)*

**Reversible?** Adding a source later is easy. Shipping one and having to pull it is
not, and a share-alike clause discovered late can force a licence change on the
whole product.

---

## 5. MVP defers the document model

*29 September 2026 — decided*

The `Artboard`/`Node` document model is **not** in the MVP. The launch kit ships on
the existing `CoverSpec` shape.

**Why.** Available time is about half a week, against a full plan of 14–18 FTE
weeks — seven to nine months at that pace. Fitting 4–5 FTE weeks means cutting
something structural rather than trimming.

This is the right thing to cut because the code makes it cheap: stickers are already
board-absolute (`sticker.x` is measured from the whole cover, not a panel), so they
work on any board untouched. Text is the only thing tied to the cover's structure,
via `CoverTextBox.panel`, and a one-panel board needs one new union member —
additive, not a refactor.

So the expensive, general, correct model gets bought later, with evidence that
anyone wants the product. The migration path in `isnaevy-plan.md` §4 stays valid
whenever that happens.

**Reversible?** Yes. The cost of deferring is doing the `CoverSpec` → `Artboard`
migration on more data later. The cost of not deferring is shipping nothing before
February.

---

## 6. Sticker Studio is queued after the MVP, not inside it

*29 September 2026 — decided*

A mode that turns any image into a sticker: convert or clean up, colour it in,
knock out the background, add a die-cut edge, export a transparent PNG. Planned in
`isnaevy-plan.md` part three as **S1, after M3**.

**Why queued rather than dropped.** It reuses more of this repo than anything else
proposed — the line art pipeline, the morphology, the asset store, the library, and
a flood traversal that turns out to already be sitting inside `despeckle`. It is
also the only thing here someone can try in thirty seconds without learning an
editor, and it points at the same person the wedge does: a KDP seller making a cover
badge is not a different audience.

**Why not inside the MVP.** Fourteen days is three FTE weeks, which is six calendar
weeks at half time — more than half the MVP again. The MVP has one week of slack in
ten. Adding this would not delay the launch kit by a little.

It also gets cheaper by waiting: M2 builds the raster export it needs, and M1
generalises the board that lets a finished sticker be placed without a special case.

**Reversible?** Entirely. Nothing in M0–M3 depends on it.

**Noted for launch, not for the build:** terms of service must say uploaded artwork
is the user's responsibility. A tool that makes stickers from any image will be
pointed at copyrighted characters on day one.

---

## 7. A stored book carries its own schema number

*29 September 2026 — decided, while doing M0*

`BookBase.schema`. Absent means 1, a book whose cover is in inches; 2 means
points. `migrateProject` converts when it sees 1 and sets 2.

**Why a marker rather than detection.** Nothing in the numbers says which unit
they are in. A text box at x = 43.2 is as plausible in points as 0.6 is in
inches, so a second pass over an already-converted cover would multiply by
seventy-two again and put every sticker thousands of points off the page — and
there would be no way back, because the wrong answer looks exactly like a
right one.

The cost is that a book made today has to be born carrying the marker, in both
places books are made. That is the kind of thing that gets forgotten, so the
tests check it: a fresh book must come back from the migration unchanged.

**Reversible?** It is a version number; later shapes add to it. The thing that
would not be reversible is the migration it prevents running twice.

---

## 8. Baselines are an encoder fact, not a document fact

*29 September 2026 — decided, reversing a call made the same day*

Where each line of type sits was added to the portable golden tier to close the
gap an ink box leaves, then moved to the strict tier when it failed on Chrome
153.

**What went wrong.** The claim that baselines were portable rested on two
engines agreeing — the pinned Chromium 141 and a HeadlessChrome 149 that
`@sparticuz/chromium` unpacks. Eight major versions apart looked like a real
test. It was not: those two build the same PDFs. Chrome 153 produced four fewer
baselines on the cover, none of them new, and the golden failed on the first
machine that was genuinely different.

**Why it cannot be fixed by rounding.** Chromium positions letter-spaced and
curved type one glyph at a time, so a "baseline" is frequently a single glyph's
own y rather than a line's. How many of those there are, and where they land,
is the encoder's business. Any quantisation has boundaries and two engines will
eventually straddle one; the fix is not a coarser bucket.

**The lesson, which is the part worth keeping.** Two things agreeing is
evidence they are alike, not evidence either is right. A portability claim
needs a case known to differ — and the one to hand, the user's own machine,
was the one not consulted.

**What this costs.** The portable tier is back to page count, media boxes,
declared fonts, images and per-page ink boxes, and is once again blind to an
object shifting inside a page while the page's widest and tallest elements stay
put. The strict tier still catches it, on the machine that recorded it.

Closing that gap portably means comparing rendered page images rather than
drawing instructions, which is the only representation both engines are trying
to make identical. That is a real piece of work and is not scheduled.

---

## 9. A board is the unit of layout, and it carries its own guides

*29 September 2026 — decided, doing M1*

`lib/board.ts`. A board is a size, a bleed, some named panels and a list of
guides. A KDP cover is one, produced by `coverLayout`; a social post is one,
produced by `plainBoard`.

**Why guides carry their own wording.** The alternative is a table downstream
mapping a warning to a sentence, which has to learn every board there will ever
be. "The spine" is a fact about covers. The board that has a spine is the only
thing that should be saying so, and a board without one then needs no special
case to stay quiet about it — it simply has no fold guide, and no warning is
produced.

**Why panels are walked rather than named.** `snapLines` used to reach for
`panels.back` and `panels.front`. Walking `Object.values(panels)` gives a
one-panel board its own centre and a cover its three, out of the same code.

**Why `panel: 'board'` exists on a cover too.** So that anything written for a
board with no faces places things on a cover without knowing it has any. It is
deliberately not offered as a fourth button in the designer: it would do what
the back cover already does, with worse arithmetic.

**What this is not.** The renderer still takes a book and asks `coverLayout`
for its board. Rendering an arbitrary board is M2. M1 is the model and the
geometry; the proof it is real is that the warnings, the snapping and the DPI
reading all run on an 810 x 810 point board that is not a book, in the tests.

**Reversible?** Yes, and cheaply — it is additive. `CoverLayout` is a `Board`
with two extra named fields, so every existing caller reads what it always did.

---

## 10. A tile may only say it is ready if it opens something that exists

*29 September 2026 — decided, building the front page*

`lib/tiles.ts` holds every tile the front page offers, one entry each:
category, size, status, destination. A tile is `ready` or `soon`; a `soon`
one is muted and cannot be clicked, and its destination must be `none`. The
rule is checked in `tests/tiles.test.mjs` rather than trusted: a ready tile
has to have a destination, and a tile pointing at a launch-kit board has to
name a board that `lib/presets.ts` actually has.

**Why a test rather than care.** A front page is where a tool makes its
promises, and the cheapest thing in the world is to add a tile for something
that is nearly finished. The test is what stops "nearly" from shipping. It
also means the size line under each board tile is read from the preset, so a
tile cannot advertise a size the board would not produce.

**Why designs are created before navigating.** The front page writes the new
design into the book and then opens the editor on it by id. Creating it on
arrival instead puts the design in a race with the book being read off the
disk, and the design loses: it is written to the database, then wiped out of
memory when the load finishes, so it exists but is not on screen. That was
observed, not theorised.

**What is deliberately not here.** The tiles do not cover everything the app
can do — there is no tile for the sticker library or for importing a
manuscript, because a tile is an answer to "what will you make", not a menu
of features.

---

## 11. The screen gets its own golden, in two tiers, and only one of them travels

*29 September 2026 — decided*

`scripts/screen-golden.mjs`, `npm run golden:screen`. It drives a real browser
to the cover designer and to a launch-kit board, and records two things about
each.

**Why at all.** The PDF goldens cannot see the screen, and the two worst bugs
so far lived exactly there: every line of type on the cover drawn at a
seventy-second of its size — in the DOM, selectable, invisible, with a
perfect PDF coming out the other end — and an Instagram post that offered a
3375-pixel export and wrote a 10547-pixel file. Nothing in a PDF fingerprint
could have caught either. Both are caught now; both were re-introduced on
purpose to prove it.

**The layout tier** is measurements, in points: where each text box, picture
and guide sits, how big it is, what size the type is, and every size the
panel states out loud. It is compared on every machine. Two things are
deliberately left out — a text box's height, and anything else the type
decides, because that is decided by whichever typeface the machine managed to
load. Google Fonts is blocked for the whole run for the same reason: whether
the network was up is not a fact about this code, and which faces a book
embeds is already checked in the PDF goldens.

**The image tier** is the board rasterised and compared pixel by pixel, and it
is keyed to the engine that recorded it, exactly as the PDF strict tier is.
Two Chrome builds do not anti-alias the same glyph the same way, so a picture
recorded on Chromium 141 cannot be a portable claim — decision 8 is the
lesson that says so. On the same engine it is exact: two runs differ by zero
pixels, so the tolerance (a difference of 8/255 or less is an edge blended
differently, and no more than half a percent of the image may differ even
that much) has never yet been needed. Both counts are printed on every run,
passing or failing, so the allowance cannot quietly grow to cover a real
change.

**What the image tier adds over the layout tier.** Anything drawn rather than
positioned: a changed typeface, a dash pattern, a shadow, a picture that
failed to decode. Shrinking the barcode caption by two pixels is invisible to
the layout tier and moves 699 pixels here, and the failure names where.

**What it costs.** Two PNGs in the repository, about 110KB, re-recorded
whenever the designer's appearance is meant to change — and a check that
needs a browser, so it is its own command rather than part of `npm run
golden`. A browser-driven check fails for reasons a PDF check cannot, and
those reasons should not be able to redden the one that decides whether books
print correctly.

---

## 12. The accent is a deep teal, and it is the only cool thing on the page

*30 September 2026 — decided*

`--color-accent-500: #0b6a62`, with `#08554f` for hover, `#e6f0ee` for the tint
behind a selected thing, and `#9cc7c1` for borders. Four candidates were
rendered on the real chrome at the real sizes and measured off the painted
pixels: deep teal, burnt terracotta, deep plum, and the old brown darkened.

**Why the teal.** The other three are cousins of the paper. Everything in this
app is warm — the beige, the cream, the ink with a little brown in it — and a
warm accent on a warm page reads as a shade rather than as a signal. A selected
rail item, a primary button and a focus ring all have exactly one job, which is
to be unmistakable, and the teal is the only one of the four that cannot be
mistaken for the page having a slightly different mood.

**What it costs.** Nothing measurable: white on it is 6.46:1 where the brown
was 5.30, a selected rail item is 7.46:1 where it was 5.98, and a link is
6.46:1 where it was 5.30. Every number went up.

**What it revealed.** Sweeping four screens for AA afterwards found twelve
failures that had nothing to do with the accent, the worst of them `ink-500` at
4.28:1 against the app's own beige — the colour of every muted line in the
product, under AA everywhere at once. The lesson is the same one the goldens
keep teaching: a thing nobody measured is not a thing that passes.

**Reversible?** Four tokens. The tints on the home tiles are four more, in
`lib/tiles.ts`.

---

## 13. The rail lives inside CoverDesigner, not in a BoardEditor beside it

*30 September 2026 — decided, against the brief that asked for a new component*

A board opens on a left rail with one panel at a time; a cover keeps its
right-hand sidebar. Both arrangements are rendered by `CoverDesigner`, chosen
by a `rail` prop that defaults to false.

**Why not a separate component.** Selection — which text box, which picture —
lives in `CoverDesigner`, with the undo history, the drag handlers, the
snapping and the placement arithmetic. A `BoardEditor` owning the rail would
have to duplicate that state or have it lifted out and threaded back in, and
lifting selection out of the component that owns dragging is the one genuinely
risky seam in this rework. Doing it in the same change that introduced the rail
would have meant two changes at once with no way to tell which broke what.

**What keeps the two arrangements honest.** The sidebar's contents are named
once, in a single object, and either stacked down the right or dealt into
panels. There is one Artwork section, not two. A control that moves to the
floating toolbar is hidden from the panel rather than repeated, through flags
on `FontControls` and `StickerInspector`, because the same setting in two
places is two places to look and one to be wrong about.

**How the cover is protected, and how it is proved.** The flag defaults to
false, so every existing caller renders what it did. The proof is not that
claim: the screen goldens drive the in-book cover designer and the in-book
launch kit, and they passed with **zero pixels changed** through all four
commits of the rework. A pixel of movement in either arrangement would have
failed them.

**Reversible?** Yes, and that is the point. When the rail has been used in
anger and the cover is ready to follow, the flag becomes the default and then
goes away. Until then the cover editor is exactly the one that has been making
books.

---

## 14. Everything a person does to a sticker is a setting, not a change to their picture

*1 October 2026 — decided across Stages 4, 5, 6 and 7*

The upload is stored once and never written on. Recolouring, flipping, turning,
cropping, words and decorations are all stored as small values on the draft row
and applied on the way to the preview and on the way to the export, at the size
each of those needs.

**Why.** Three reasons, in order of how much they cost to find out the hard way.

A sticker gets exported more than once — at 500 px for a shop listing and 2000 px
for print — and a setting applies cleanly at both, where a baked pixel has to be
resampled. Turning a drawing five degrees and back is free this way and costs two
resamplings the other way, leaving it softer than it started. And every one of
these is something a person will change their mind about, so the undo has to be
real rather than a second destructive operation hoping to cancel the first.

**What it costs.** The preview is a round trip through the worker rather than a
local redraw, so a slider has a settle time of a second or so on a large picture.
That is the trade, and it is the right way round: the delay is while you are
looking, and the quality is in the file somebody pays for.

**The one exception, and why.** The colouring and the touch-up layers *are*
pixels, stored as lossless PNGs beside the draft. They have to be: they are marks
somebody made with a brush at a particular place, not a value. They are kept at a
fixed 1200-pixel grid rather than the export size, so changing the export size
does not throw an afternoon's colouring away.

**Reversible?** Each is a field on the draft row with a default, so dropping one
means removing a field and a panel. Nothing stored anywhere else depends on them.

---

## 15. Packs are a tag, and drafts are a table

*1 October 2026 — decided, and the two decisions are the same decision*

Sticker packs are `pack:name` tags on the existing `stickers` rows. Half-finished
stickers got their own `stickerDrafts` table and a version bump to 5.

**Why they went different ways.** The question is not "how much data" but **who
has to know about it**.

A pack is a *view* of stickers that already exist. Every reader of the library
can already read tags, the search already searches them, and a sticker in two
packs is a sticker with two tags. Nothing has to learn anything. The costs are
real and small: an empty pack cannot exist, and renaming one retags every sticker
in it. Both are said on the screen.

A draft is **not a sticker**. Putting half-traced work in the `stickers` table
would mean every reader of the library — the cover designer, the launch kit, both
backup builders, the trash — had to learn to ignore some of it, and the one that
forgot would put a half-traced drawing on somebody's cover. A separate table makes
that mistake impossible rather than merely unlikely: nothing outside
`lib/stickers/drafts.ts` and `lib/trash.ts` reads it, and a test walks the whole
source tree to prove nothing has started to.

**The rule this gives.** Add a tag when the new thing is a way of looking at
existing rows. Add a table when the new thing would be *mistaken for* an existing
row. The second is worth a version bump; the first never is.

**Reversible?** The tags, trivially — they are tags. The table, not really, which
is why it was asked about before it was bumped.

---

## 16. A cut line is traced from the exported PNG, not from the mask that made it

*1 October 2026 — decided in Stage 8*

The SVG a cutting machine follows is traced from the alpha channel of the very
PNG that goes to the printer, rather than recomputed from the artwork or kept
from the mask the pipeline held a moment earlier.

**Why.** Two files that are meant to describe the same edge, produced by two
routes, will eventually disagree — and the way anybody finds out is a sheet of
stickers cut a millimetre wrong. Tracing the file itself makes disagreement
impossible rather than unlikely.

It also settles a question that would otherwise need an opinion: the words and
the drop shadow are in that alpha, so they are cut round. That is right. A shadow
is part of the sticker.

**What it costs.** The trace runs at export size on the main thread, which is a
second or so on a large sticker, and it has to be done again whenever anything
changes. Both are acceptable for something pressed once per sticker.

**How it is checked.** The path is filled back into a canvas and compared with
the alpha pixel by pixel — 99.8% agreement in the browser, exact in the unit
tests before simplification. A simplified line may differ only *at the edge*: a
disagreement in the middle would mean a loop wound the wrong way or a hole filled
in, which is a sticker cut to the wrong shape rather than one cut a hair off.

**Reversible?** Yes. It is one function over an alpha channel and nothing depends
on how it got there.

---

## 17. The look is tokens, and anything that must not move with a theme is a data default

*2 October 2026 — decided across the aesthetic run*

Three themes — Sunrise, Lagoon, Candy — generated from `lib/theme.ts` into
`app/tokens.css` by `scripts/make-tokens.mjs`, with a test that fails if the
generated file drifts. Every colour in the chrome comes from a token and nothing
else does.

**The distinction that makes it safe.** A colour is either *chrome* or a *data
default*. Chrome moves with the theme: buttons, panels, the hero band, the tile
that shows what a drop shadow does. A data default never moves, because it ends
up in a file somebody keeps or sells: the ink a sticker is traced in, the white a
die-cut outline is drawn in, the page colour a book is laid out on. A sticker
whose ink changed colour because the app happened to be in Candy would be a
sticker nobody asked to change.

That is enforced rather than remembered: a test walks every `.tsx` under
`components/` and `app/` and fails on any hard-coded hex that is not on a short
allow-list, and the allow-list has its own test asking whether each entry really
does end up in an export.

**Two things this caught that nothing else would have.** `bg-paper-0` was used in
seven places and named a token that does not exist, so Tailwind dropped the
utility and those elements had no background at all — an unknown token makes a
utility vanish, not a build fail. And thirty-three classes of the form
`shadow-[--shadow-rest]` and `duration-[--motion-base]` compiled to the bracket's
contents *verbatim* — a literal string, not a reference — because Tailwind 3 read
that shorthand as a variable and Tailwind 4 does not. Every card shadow in the
app was missing and every motion duration fell back to the browser's default.
Both are now guarded by tests in `tests/theme.test.mjs`.

**The rule this gives.** A token name must not collide with one of Tailwind's own
(a role called `sky` quietly resolved to Tailwind's sky and moved a golden by 427
pixels; it is called `denim`). An arbitrary value that means a token must say
`var()` out loud. And if a colour would end up in somebody's file, it is not
chrome and it does not belong in `lib/theme.ts`.

**Reversible?** The themes, yes — they are data. The distinction, no, and it
should not be: it is the thing that lets the look change without the output
changing.

---

## 18. Motion is transform and opacity, and it stops when asked

*2 October 2026 — decided across the aesthetic run*

Everything that moves — the rail's sliding pill, the panel that fades in, the
curling corner on a sticker card, the fanned pack, the book turning on the front
page, the toasts, the shapes that float up the first time something is exported —
animates `transform` and `opacity` and nothing else. No layout property is ever
animated, so nothing the app does costs a reflow. Measured: a hover, a menu open
and a page change are all 16.7 ms median with nothing over 20.

**Reduced motion is not "the same thing, faster".** The global rule collapses
durations, which is right for a fade and wrong for everything else: a corner that
snaps up the instant the pointer arrives is still a thing that moved, and
somebody whose reason for asking is that movement makes them ill is not helped by
it happening quickly. So each moving thing also has an explicit
`prefers-reduced-motion` rule that turns it *off* — the book becomes a still
frame, still turned 18° so it reads as a book; the peel does not peel; the shapes
do not appear at all.

**Two traps worth writing down.** A CSS animation that sets `transform` replaces
the *whole* transform, so anything that was positioning the element — a
`translate(-50%)`, a tilt, a rotation — is thrown away for the animation's
duration. Either put the positioning on a wrapper, or fold it into the same
transform. And an element that is `pointer-events: none` can never match
`:hover`, so a pause-on-hover rule written on a decorative element is a rule that
compiles and never fires.

**Reversible?** Yes, one rule at a time. Nothing else depends on any of it.

## The Line Art Lab runs on algorithms, and says so

**Decision.** Every look in the Lab is our own code implementing a published
algorithm. No pretrained model, no weights, no download, no inference runtime.
The interface says *"Made with algorithms, no AI model"* and makes no claim
about anybody's disclosure rules.

**Why.** It began the other way round — the plan allowed an ONNX port of
Informative Drawings behind a licence check — and the research is what changed
it. The repository's MIT licence covers its *code*; the pre-trained weights are
not in the repository, are linked from a file-sharing service, and carry no
model card and no licence statement anywhere I could find. An unstated licence
reads as "not granted".

Dropping the models cost less than it looked like it would and bought three
things outright: the Lab works the first time, offline, with nothing to fetch;
the same picture gives the same bytes forever, which pixel-hash fixtures hold us
to; and there is no third-party licence to explain to anybody.

`docs/ALGORITHMS.md` lists each algorithm with its published reference and
states that no code was copied from any reference implementation.

**Reversible?** Easily — nothing depends on the absence of a model. But the
licence question would have to be answered first, and it has not been.

## Measure the engine, do not look at it

**Decision.** Every parameter range in `lib/lineart/` was set by measuring the
engine's response — ink coverage, midtone share, stroke counts, runtimes — and
the numbers are written into the comments beside the constants.

**Why.** Four faults in Stage 1 alone were invisible to the eye and obvious in a
table. Scaling the parameters to the picture clamped `sigma` to its floor, so on
a 700-pixel picture **all four looks were identical**. A difference of Gaussians
with `tau` below 1 answers `v(1 - tau)` on flat ground, so the level meaning
"paper" tracked brightness: the same settings put 2.91% of a test card in ink and
0.63% of a photograph. The morphology from the colouring pipeline is binary and
tested `=== INK`, so it flattened every half-tone to paper and erased the
softness slider — all four looks measured exactly zero midtones.

None of those would have been found by looking at thumbnails, and two of them
produce pictures that look plausible.

`npm run lab:bench <folder>` is the same discipline for anybody else: a contact
sheet per picture and a table of what was measured.

**Reversible?** The numbers are, one at a time. The habit should not be.
