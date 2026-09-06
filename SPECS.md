# SPECS — KDP print maths, as implemented

Every number below is implemented in [`lib/kdp.ts`](lib/kdp.ts) and covered by
[`tests/kdp.test.mjs`](tests/kdp.test.mjs). If you change a number here, change
it there and re-run `npm test`. Nothing in the app derives print dimensions
anywhere else.

All dimensions are **inches** unless stated.

---

## 1. Trim sizes

The user picks one of 17 trims. `TRIM_SIZES` in `lib/kdp.ts`:

| Trim | Trim | Trim |
|---|---|---|
| 5 × 8 | 5.06 × 7.81 | 5.25 × 8 |
| **5.5 × 8.5** | **6 × 9** | 5.83 × 8.27 (A5) |
| 6.14 × 9.21 | 6.69 × 9.61 | 7 × 10 |
| 7.44 × 9.69 | 7.5 × 9.25 | 8 × 10 |
| 8.25 × 6 | 8.25 × 8.25 | 8.5 × 8.5 |
| 8.5 × 11 | 8.27 × 11.69 (A4) | |

**Bold** trims are flagged `recommendedForPoetry` in the picker: they are the
two conventional poetry trims and the cheapest to print. The app defaults to
5.5 × 8.5.

## 2. Inside (gutter) margin minimums

The gutter widens with the book because a thicker spine swallows more of the
inner margin. `GUTTER_TABLE`:

| Page count | Minimum inside margin |
|---|---|
| 24 – 150 | 0.375" |
| 151 – 300 | 0.5" |
| 301 – 500 | 0.625" |
| 501 – 700 | 0.75" |
| 701 – 828 | 0.875" |

The table is contiguous — each tier starts one page after the previous tier
ends — and a test asserts that, so a page count can never fall between tiers.

`minInsideMargin(pageCount)` clamps outside the table: below 24 pages it
returns the 24–150 value, above 828 the 701–828 value. Both of those page
counts are separately reported as errors (§5), so the clamp never silently
green-lights an unprintable book.

## 3. Outside, top and bottom margin minimums

| | Minimum |
|---|---|
| Without bleed | 0.25" |
| With bleed | 0.375" |

## 4. Bleed

Bleed is **0.125"**, added to the **top, bottom and outside edges only**. It is
never added to the gutter — the gutter is the bound edge and has nothing to
bleed into.

So the interior page box is:

```
width  = trim width  + (bleed ? 0.125 : 0)
height = trim height + (bleed ? 0.25  : 0)
```

## 5. Page count

- Minimum **24** pages, maximum **828** pages.
- The final page count must be **even**. The app pads with blank pages at the
  end of the book (`padToEven`), and the pad happens on export, so what you
  upload is always even.
- Page count is measured from live Paged.js pagination, not estimated, so the
  margin warnings in §2 update as you add poems.

## 6. Spine width

```
spine width = page count × per-page caliper
```

| Paper | Caliper (inches per page) |
|---|---|
| Black & white on white | 0.002252 |
| Black & white on cream | 0.0025 |
| Colour | 0.002347 |

Cream is the poetry default: it is the thickest, so a slim collection gets a
spine wide enough to carry legible text.

## 7. Full wraparound cover

```
cover width  = (2 × trim width) + spine width + 0.25"
cover height = trim height + 0.25"
```

The trailing 0.25" is total bleed: 0.125" on each of the four edges. Landmarks
measured from the left edge of the cover PDF:

```
0                                                                     width
|--0.125--|------- back cover -------|-- spine --|------- front -------|--0.125--|
          ^                          ^           ^
       trim edge              spineStart      spineEnd
```

- `spineStart = 0.125 + trim width`
- `spineEnd   = 0.125 + trim width + spine width`

### Barcode zone

KDP reserves **2" × 1.2"** at the bottom-right of the **back** cover for the
barcode, inset 0.25" from the trim edge. The cover designer draws this zone and
keeps text boxes out of it.

### Cover image resolution

Minimum **300 DPI** at final placed size. `effectiveDpi(pixels, inches)` =
`pixels / inches`; a 5.5" wide front cover therefore needs at least 1650px of
image width. Below that the export panel raises a warning, not an error — KDP
accepts the upload and complains later, so the choice stays the user's.

## 8. What gets exported

Two separate PDFs, because KDP takes them as two separate uploads:

| File | Page size | Contents |
|---|---|---|
| Interior | page box from §4, every page identical | Front matter, body, back matter, padded to even |
| Cover | one page, dimensions from §7 | Back, spine and front as a single spread |

Neither PDF carries crop marks — KDP rejects them. Fonts are embedded as
subsets in both.
