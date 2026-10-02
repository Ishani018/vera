# Three directions for the home screen

Static mockups. **Nothing here is wired to the app, imported by it, or changes
it.** Plain HTML and CSS, one file each, opened directly in a browser.

```bash
open docs/design-explorations/a-sticker-shop.html
open docs/design-explorations/b-paper-desk.html
open docs/design-explorations/c-zine.html
open docs/design-explorations/shots          # the screenshots
```

| | 1280 × 720 | 800 wide |
| --- | --- | --- |
| A — Sticker shop | `shots/a-sticker-shop-1280.png` | `shots/a-sticker-shop-800.png` |
| B — Paper desk | `shots/b-paper-desk-1280.png` | `shots/b-paper-desk-800.png` |
| C — Zine | `shots/c-zine-1280.png` | `shots/c-zine-800.png` |

## What they are made of

All three use the **real** material and nothing invented:

- **The wordmark**, Great Vibes, as it is in the app now.
- **Your line drawings** — `art/` is a copy of `starter/lines/`: moon, cat, boat,
  leaf. The cat is the character in every empty state.
- **Your token colours** — teal `#0B6A62` (`accent.mid`, and the one colour
  identical across all three current themes), red `#C9452C` (`coral.mid`), clay
  `#9A3220`, cream `#FCF9F4` / `#F5EFE5`.
- **Real sample data** — "Salt and Small Hours", "Cat, winking", "Harbour
  Lights", "Autumn Market", with real sizes, page counts and dates. No
  "Untitled", no empty rectangles.

Each has the same content: search, Create, shortcuts, recent designs, trash, and
a designed empty state.

**Two things you named are not in the repository**, so nothing here pretends to
be them: there is no ghost sticker and no red-and-teal checkerboard cover, and
`docs/references/` has never existed in any commit. The brief said "a ghost **or**
cat character", and the cat is real, so the empty states use the cat and no
character was invented. When you add the ghost and the cover, they drop into the
same slots.

Every icon is inline SVG, drawn for its own direction: 2.5px rounded ink in A,
1.6px even-weight line in B, 2.6px hard-cornered in C. Nothing uses a generic
icon set, no direction has a gradient, a pastel circle chip, or a blurred shadow.

---

## A — Sticker shop

**The idea.** The thing this app makes is a die-cut vinyl sticker, so the app is
made of them. Thick ink outlines, flat blocks of colour, hard offset shadows with
no blur at all — the shadow a sticker casts on a table, not a glow. Every recent
design is a die-cut sticker with a real lifted corner: the plate is clipped on
the diagonal and the backing shows through behind the fold.

**What it changes in the real app.** Mostly `app/tokens.css` and
`app/surfaces.css`. The shadow tokens change meaning — `--shadow-rest`,
`--shadow-raised` and `--shadow-float` become hard offsets rather than blurs,
which is a one-line change per token that every surface inherits. `.btn`, `.card`,
`.chip` and `.field` gain a 2.5px ink border and lose their soft edges. `Thumb`
gets the peel, which **already exists** as `.peel` in `app/surfaces.css` from the
sticker-pages work — it needs the corner clip adding and the blur taking out.
No component is restructured and no layout moves, so the editors, the board and
the goldens are untouched.

**Reuse.** The highest of the three: ~90% of tokens (the ramps stay, the shadows
and radii change), ~95% of components unchanged, every layout as it is. The
contrast sweep should pass unaltered since the ink-on-cream pairs are darker than
today's.

**Effort: 3–4 days.** One on tokens and surfaces, one on the peel and the card,
one on icons, half on the three themes still working, half on checks.

---

## B — Paper desk

**The idea.** This is where you make things to print and cut, so the screen is
the desk you would do it on: a self-healing cutting mat in the brand teal under
everything, kraft and cream paper on top, washi tape holding the bar down, pencil
labels in the margin, and rubber stamps for status. Depth comes from paper having
a real thickness — a tight, dark, almost unblurred offset — not from a glow.

**What it changes in the real app.** The most new *surface* work of the three. The
mat is four CSS gradients on `body` and costs nothing, but every pane becomes a
sheet of paper on it, which means a new surface family alongside `.card`
(`.paper`, `.kraft`) and a rule about what may sit directly on the mat. Tape and
stamp are two new small components. It needs one webfont for the handwriting
(Caveat, ~30 KB) — the first addition to first load in this whole run, and worth
pricing. **The risk to watch:** the board, the canvas and the sticker stage must
stay neutral and untextured, because a cutting-mat grid behind a cover being
designed is a cutting-mat grid in the way. Those three screens would keep a plain
surface and the texture stops at their edge.

**Reuse.** Middling: ~70% of tokens (teal is promoted from accent to the ground
itself, which changes what `accent` means), ~80% of components, layouts unchanged.

**Effort: 5–6 days.** Two on the surface family and the mat, one on tape and
stamps, one on icons and the handwriting pass, one on keeping the editors neutral,
half on checks and the font budget.

---

## C — Zine

**The idea.** A photocopied two-colour zine: black ink and one spot red, nothing
else, which is the discipline that makes it work. Oversized type set tight, blocks
cut out and pasted down at slight angles, halftone dots where a photocopier would
lose the midtones, labels rotated because they were stuck on afterwards.

**What it changes in the real app.** The most, and not only visually. The
two-colour rule is the problem: the app currently uses six colour roles to say
what kind of thing something is — coral for create, sun for highlights, lilac for
stickers, sage for success, denim for social, clay for print — and a zine has two
inks. Those distinctions would have to be carried by weight, rule thickness and
position instead, which is a real information-design job, not a repaint. The home
screen also loses the sidebar for a horizontal masthead strip, so `Landing`'s
layout changes and the hub's navigation model changes with it. The type scale
roughly doubles at the top end, which reflows every heading in the app.

**Reuse.** The lowest: ~40% of tokens (most role ramps stop being used), ~60% of
components, and the home layout is rebuilt. It is also the direction least likely
to survive contact with the editors, where a dense panel of controls needs more
than two inks to stay legible — it may end up as a style for the hub and the
marketing surface only, with the editors in something quieter.

**Effort: 7–9 days**, and I would want a second mockup of a *panel-heavy editor
screen* before committing, because that is where it will either work or not.

---

## Animation: five to keep, and what to take out

**Keep, at most these five.** Each one says something that words would otherwise
have to:

1. **The sticker corner peel** on hover, on cards that represent stickers. It is
   the one piece of motion that is about what the product *is*. Already built.
2. **The stamp when something is saved** — a mark pressed onto the thing that was
   saved, so the confirmation is attached to the object rather than to a corner of
   the screen. Already built.
3. **Toasts sliding in and stacking.** Transient confirmations that must not push
   the layout around. Already built.
4. **The progress ring** on exports and batches. Not decoration: it is the only
   thing on screen that says how much is left.
5. **Skeleton shimmer** while a list is being read, so an empty list and a list
   that has not arrived are different things. Already built, and it fixed a real
   bug where the library claimed to be empty while loading.

**Take out.**

- **The 3D book on the hero** — your "blank red slab". It is a rectangle pretending
  to be a book and it says nothing. Delete `components/BookMock.tsx` and the
  `.book*` rules.
- **The gradient hero band** and the shimmer that crosses the Create button. Both
  are the stock-SaaS tell you named.
- **The card tilt** (`components/Tilt.tsx`): cards leaning towards the pointer is
  the single most generic effect on the page.
- **The pop on the circle icon chips** — and the chips themselves, in all three
  directions.
- **The once-a-session celebration** (shapes floating up). Charming once,
  and it is the kind of thing that reads as a template flourish.
- **The fan spread on pack cards**, the drop-in bounce on the sheet tray, and the
  staggered arrival of search results. All three are motion for its own sake.
- **The sliding rail pill** and the panel slide-in are borderline: they are
  orientation rather than decoration. I would keep the pill and drop the slide,
  but if five is a hard cap, the pill goes too.

That leaves motion only where it carries meaning, and nothing that moves merely
because a page loaded.
