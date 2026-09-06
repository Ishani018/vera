# Versecraft

A browser-based typesetter for poetry collections. Paste or import poems, set
the book the way a book should be set, and export the two print-ready PDFs KDP
asks for: the interior and the wraparound cover.

Everything runs locally. There is no account, no server-side database and no
upload of your manuscript — the project lives in your browser's IndexedDB, and
the only thing the server does is drive a headless Chromium when you export.

<sub>The screenshots and sample text in this repository use nine short
placeholder verses written for it. They are deletable — see
[Sample content](#sample-content).</sub>

---

## What it does

**Poetry typesetting, not word processing.** Line breaks are meaningful and are
never reflowed. A line too long for the measure wraps with a hanging turnover
indent instead of becoming a new line of verse; leading indentation survives;
stanzas do not split across pages; and a poem that carries over is labelled
"*(continued)*" on the page that continues it.

**KDP dimensions taken from KDP.** 17 trim sizes, the five-tier gutter table,
bleed rules, per-stock spine calipers and the barcode reserve are implemented
once in [`lib/kdp.ts`](lib/kdp.ts) and documented in [SPECS.md](SPECS.md). The
margin warning updates as pages are added, because the page count comes from
real pagination rather than an estimate.

**The preview is the output.** Both the preview and the exported PDF come from
one function, rendered by the same engine (Paged.js in Chromium). There is no
second layout path that can drift out of agreement with the first.

Also: sections and drag-to-reorder, front and back matter with roman numerals
that restart at 1 in arabic for the body, an auto table of contents with real
folios, an optional index of first lines, configurable running heads, decorative
borders and section ornaments, a Google Fonts picker, a wraparound cover
designer with live spine width, a pre-export validation panel, and JSON
backup/restore.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

Node 20 or newer. `npm run dev` and `npm run build` first copy the Paged.js
polyfill into `public/vendor/` (see `scripts/copy-vendor.mjs`); that directory
is generated and not committed.

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | KDP maths, the renderer's invariants, font requests |
| `npm run typecheck` | `tsc --noEmit` |
| Linting | Not configured. Correctness is covered by `npm test` and `npm run typecheck`; `next lint` is deprecated in Next 16, so no half-working script is shipped. |
| `npm run check:render` | Renders the seeded book in real Chromium and reports page count, folios, page tags and resolved TOC numbers; writes a PDF and page PNGs to `.render-check/` |

### Environment

| Variable | Needed? | What it changes |
|---|---|---|
| `GOOGLE_FONTS_API_KEY` | Optional | With it, the font picker lists the full Google catalogue. Without it, a curated list of book-suitable families ([`lib/fonts.ts`](lib/fonts.ts)) — every one of which still loads and embeds normally. |
| `CHROME_PATH` | Optional | An explicit Chrome/Chromium binary for server-side export. |

### Exporting

Export runs headless Chromium on the server. It looks for a local Chrome first,
then falls back to `@sparticuz/chromium` (installed as an optional dependency,
which is what makes export work on Vercel). If neither is available the export
route returns 503 and the panel offers **Print to PDF** instead, which opens the
identical Paged.js document and prints it from your own browser — same
pagination, same type, one dialog. In that dialog: paper size **A4/Letter is
ignored** (the document sets its own), margins **None**, background graphics
**on**.

Deploying to Vercel works as-is; the export routes are `nodejs` runtime with a
300s `maxDuration`, and `next.config.mjs` traces the Paged.js polyfill into the
deployed function.

---

## Uploading to KDP

1. **Get the page count settled first.** The spine width is derived from it, so
   finish the interior before you export the cover. The status bar and the
   export panel both show the count; the number that matters is the one after
   parity padding.
2. **Export interior PDF.** It is already padded to an even page count, carries
   no crop marks (KDP rejects them) and embeds font subsets.
3. **Export cover PDF.** One page, back + spine + front, sized from the current
   page count and paper stock.
4. In KDP, create a **Paperback**, and under *Print Options* choose the same
   **trim size** and the same **paper type** you set in Versecraft. These have to
   match or the spine will be wrong.
5. Upload the interior under *Manuscript*, and the cover under *Book Cover →
   Upload a cover you already have (print-ready PDF)*.
6. Run KDP's **Previewer** and read its margin and spine warnings. Anything it
   raises that Versecraft did not is worth reporting as a bug here.
7. Order a **proof copy**. Screens lie about leading and about how dark the ink
   sits on cream stock.

### Before you export

The export panel's validation list checks page-count parity and KDP's 24–828
range, margin compliance against the live page count, cover image DPI at
printed size, spine width against KDP's minimum for spine text, back-cover text
overlapping the barcode reserve, missing title and copyright pages, poems with
no lines, and poems left in a deleted part. It reports; it never blocks an
export, because a draft PDF of a half-finished manuscript is a reasonable thing
to want.

---

## Sample content

A new project is seeded with nine short placeholder verses so the preview is not
empty on first run. They are throwaway text written for this repository to
exercise specific layout paths — long-line turnovers, a poem that breaks across
pages, a three-line poem for vertical centring, uneven stanzas, an epigraph, an
overlong title.

They live in [`src/data/samplePoems.ts`](src/data/samplePoems.ts) and are marked
with a `sampleKey`. **Clear sample poems** in the poem list removes all of them
at once; deleting the file removes them for good.

---

## How it fits together

```
lib/kdp.ts            KDP print maths. The only place print dimensions come from.
lib/types.ts          The project document — plain data, round-trips through JSON.
lib/store.ts          Zustand + Dexie. One active project, debounced to IndexedDB.

lib/render/
  bookHtml.ts         project -> a whole book as one HTML document
  css.ts              page geometry, poetry rules, borders, guides
  runtime.ts          injected into the document: page tagging, folios,
                      "(continued)" markers, cross-references
  viewer.ts           injected into the preview: spread/scroll/grid, page turn
  coverLayout.ts      panel, fold and barcode rectangles, in inches
  coverHtml.ts        the wraparound cover as one page

lib/server/           font embedding, Chromium lookup, PDF rendering
app/api/export/       interior and cover routes
components/           the workspace
```

The renderer is a pure function of the project. The preview calls it with
`mode: 'preview'`, the export calls it with `mode: 'export'`, and that is the
only difference between what you see and what you upload.

### Things worth knowing if you work on this

Three Paged.js behaviours are worked around deliberately, and each has a comment
at the site and a test:

- **An inline `style` attribute makes Paged.js treat an element as
  "undisplayed"**, and undisplayed elements are skipped when it resolves
  `break-before`. The renderer emits no inline styles anywhere; a test enforces
  it.
- **`counter-reset: page` only takes effect on the page carrying it**, so a CSS
  counter cannot express "roman through the front matter, then arabic from 1".
  Folios are computed in the runtime. `target-counter()` has the matching
  problem — it counts physical sheets — so TOC and index numbers are resolved
  against the same folio table, and a contents line always matches the number
  printed on the page it points at.
- **Nothing may use `:nth-of-type` in a stylesheet present during layout** —
  Paged.js's own handler throws on it. The view controller's stylesheet is
  inserted only after pagination finishes.

And one Chromium behaviour, which is the difference between a PDF a printer
accepts and one it does not: **Google Fonts returns a variable font whenever
more than one weight of a family is requested, and Chromium cannot embed a
variable-font instance** — it writes Type3 glyph procedures with no embedded
font program. Font requests are therefore split one weight per URL, and the
server fetches them as TTF rather than woff2. See `tests/fonts.test.mjs`.

---

## Licence

The code is yours to do as you like with. The placeholder verses are throwaway
test fixtures, not literature; delete them.
