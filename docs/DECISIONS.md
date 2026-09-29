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
