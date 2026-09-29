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
