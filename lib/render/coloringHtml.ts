import type { ColoringBook, ColoringPage, FontSpec, RenderOptions } from '../types';
import { pictureAssetId } from '../coloring/picture';
import { artBox, matterArt, matterArtwork, sheetOf, type Side } from './coloringLayout';
import { RUNTIME_SCRIPT, type RuntimeConfig } from './runtime';
import { FLIP_SCRIPT } from './flip';
import { VIEWER_SCRIPT } from './viewer';
import { cssColor, cssFamily, escapeHtml, jsonForScript } from './text';

/**
 * A coloring book's interior.
 *
 * Deliberately not the poetry renderer with the verse taken out. That one is
 * about a flow of type finding its own page breaks; this is a stack of sheets,
 * one picture each, whose positions are known before anything is laid out. The
 * two share the parts that are about paper — the trim, the bleed, the gutter,
 * the runtime that tags pages and counts them — and nothing else.
 */

const ptToIn = (pt: number) => pt / 72;

function fontDecls(spec: FontSpec): string {
  return [
    `font-family: '${cssFamily(spec.family)}', ${spec.fallback};`,
    `font-weight: ${spec.weight};`,
    `font-style: ${spec.italic ? 'italic' : 'normal'};`,
    `font-size: ${spec.sizePt}pt;`,
    `line-height: ${spec.lineHeight};`,
    `color: ${cssColor(spec.color)};`,
    `text-align: ${spec.align};`,
    spec.letterSpacingEm ? `letter-spacing: ${spec.letterSpacingEm}em;` : '',
  ]
    .filter(Boolean)
    .join('\n  ');
}

const pageId = (page: ColoringPage) => `cp_${page.id}`;

/**
 * One picture's placement, written out for both sides of the fold.
 *
 * Which side a page lands on is not knowable until Paged.js has laid the book
 * out, and the gutter is on the left of a recto and the right of a verso — so
 * both are written and the class Paged.js puts on the page chooses between
 * them. A picture that bleeds gets the same box either way, but it costs
 * nothing to say so once.
 */
function placementCss(page: ColoringPage, book: ColoringBook): string {
  const rule = (side: Side) => {
    const box = artBox(page, book, side);
    const turn = box.rotate ? ' transform: rotate(90deg);' : '';
    return `.pagedjs_${side}_page #${pageId(page)} .cpage-art {
  left: ${box.x.toFixed(4)}in;
  top: ${box.y.toFixed(4)}in;
  width: ${box.width.toFixed(4)}in;
  height: ${box.height.toFixed(4)}in;${turn}
}`;
  };
  return `${rule('left')}\n${rule('right')}`;
}

function buildColoringCss(book: ColoringBook, screen: boolean): string {
  const sheet = sheetOf(book);
  const { title, body } = book.typography;
  const { margins } = book;

  return `
* { box-sizing: border-box; }

@page {
  size: ${sheet.width}in ${sheet.height}in;
  /* No page margin at all: a picture that bleeds has to reach the sheet edge,
     and every other page sets its own padding. One rule, no exceptions to it. */
  margin: 0;
}

html { font-kerning: normal; }
body {
  margin: 0;
  ${fontDecls(body)}
  background: ${screen ? '#8b8b8b' : 'transparent'};
}

/* A page of the book: one sheet, nothing flowing past its edge.
   The size is written out in inches rather than as 100%. A percentage height
   resolves against the parent, and Paged.js puts two auto-height wrappers
   between the page box and anything of ours — so 100% came out as nothing at
   all, and every picture was clipped away by its own overflow rule. The sheet
   is a known size; saying so is both simpler and the only thing that works. */
.cpage, .matter-sheet, .matter-art, .vc-blank-page {
  break-before: page;
  break-inside: avoid;
  position: relative;
  width: ${sheet.width}in;
  height: ${sheet.height}in;
  overflow: hidden;
  margin: 0;
}

/* Single-sided: every picture takes a right-hand page, which leaves the page
   behind it blank. That blank is the point — it is what a marker soaks into
   instead of the next picture. The page pens are tested on wants one for the
   same reason, more so.

   Both of these come after the rule above rather than before it: they are no
   more specific than it is, so written first they would simply lose to it and
   every one of these pages would land wherever it fell. */
.cpage[data-recto='true'] { break-before: right; }
.matter-recto { break-before: right; }

.cpage-art {
  position: absolute;
  transform-origin: center center;
  /* The box is already the picture's own proportions, worked out in inches, so
     there is nothing left for object-fit to decide. */
  object-fit: fill;
}

.cpage-missing {
  position: absolute;
  inset: 25%;
  display: grid;
  place-items: center;
  border: 1px dashed #b9b2a6;
  color: #8d867a;
  font: italic 11pt/1.4 sans-serif;
  text-align: center;
}

/* The generated front matter. Inside the margins, like any other type. */
.matter-sheet {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: ${(sheet.bleed + margins.top).toFixed(4)}in
           ${(sheet.bleed + margins.outside).toFixed(4)}in
           ${(sheet.bleed + margins.bottom).toFixed(4)}in
           ${margins.inside.toFixed(4)}in;
}
.pagedjs_left_page .matter-sheet {
  padding-left: ${(sheet.bleed + margins.outside).toFixed(4)}in;
  padding-right: ${margins.inside.toFixed(4)}in;
}

.matter-title { ${fontDecls(title)} margin: 0; }
.matter-subtitle { margin: 0.35in 0 0; font-size: ${(body.sizePt * 1.35).toFixed(1)}pt; }
.matter-author { margin: 0.6in 0 0; font-size: ${(body.sizePt * 1.2).toFixed(1)}pt; }
.matter-lines { margin: 0; }
.matter-lines p { margin: 0 0 ${ptToIn(body.sizePt * 0.9).toFixed(4)}in; }
.matter-small { font-size: ${Math.max(8, body.sizePt - 1.5).toFixed(1)}pt; }

/* "This book belongs to": a heading and a rule wide enough to write on. */
.belongs-heading { ${fontDecls(title)} font-size: ${(title.sizePt * 0.7).toFixed(1)}pt; margin: 0 0 0.9in; }
.belongs-rule {
  width: 70%;
  height: 0;
  border-bottom: 2.5pt solid ${cssColor(body.color)};
}
.belongs-note { margin: 1.1in 0 0; font-size: ${Math.max(8, body.sizePt - 1).toFixed(1)}pt; opacity: 0.7; }

/* The colour test page: somewhere to try a pen before it soaks through a
   picture. Outlined boxes only — filling them with ink would defeat the test
   and cost the printing. */
.test-heading { ${fontDecls(title)} font-size: ${(title.sizePt * 0.62).toFixed(1)}pt; margin: 0 0 0.25in; }
.test-note { margin: 0 0 0.5in; font-size: ${Math.max(8, body.sizePt - 1).toFixed(1)}pt; }
.test-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.22in;
  width: 100%;
}
.test-swatch {
  aspect-ratio: 1 / 1;
  border: 1.5pt solid ${cssColor(body.color)};
  border-radius: 0.06in;
}

${
  screen
    ? `.pagedjs_pages { padding: 24px 0 48px; }
.pagedjs_page { margin: 0 auto 22px; background: #fff; box-shadow: 0 6px 22px rgba(0,0,0,0.35); }`
    : ''
}
`;
}

function renderPicture(page: ColoringPage, book: ColoringBook, options: RenderOptions): string {
  // The line art if it has been made, and the original if it has not: a book
  // half-converted should still preview as a book rather than as holes.
  const assetId = pictureAssetId(book, page);
  const src = assetId ? (options.assets?.[assetId] ?? '') : '';
  const art = src
    ? `<img class="cpage-art" src="${escapeHtml(src)}" alt="${escapeHtml(page.title)}">`
    : '<div class="cpage-missing">This picture has not been converted yet</div>';

  return `<div class="cpage" id="${pageId(page)}" data-recto="${book.coloring.singleSided}" data-title="${escapeHtml(page.title)}">${art}</div>`;
}

/**
 * A front-matter page whose design is a drawing rather than type.
 *
 * The same box and the same placement arithmetic as a coloring page, minus the
 * recto rule — where these land is decided by what comes before them, not by
 * anything about themselves.
 */
function renderMatterArt(
  book: ColoringBook,
  art: ColoringPage,
  label: string,
  options: RenderOptions,
  recto = false,
): string {
  const assetId = pictureAssetId(book, art);
  const src = assetId ? (options.assets?.[assetId] ?? '') : '';
  const picture = src
    ? `<img class="cpage-art" src="${escapeHtml(src)}" alt="${escapeHtml(label)}">`
    : '<div class="cpage-missing">This page has not been converted yet</div>';
  return `<div class="matter-art${recto ? ' matter-recto' : ''}" id="${pageId(art)}" data-label="${escapeHtml(label)}">${picture}</div>`;
}

function renderTitlePage(book: ColoringBook, options: RenderOptions): string {
  const art = matterArt(book, 'title');
  if (art) return renderMatterArt(book, art, 'Title page', options);

  const { title, subtitle, author } = book.meta;
  return `<div class="matter-sheet" data-label="Title page">
<h1 class="matter-title">${escapeHtml(title)}</h1>
${subtitle ? `<p class="matter-subtitle">${escapeHtml(subtitle)}</p>` : ''}
${author ? `<p class="matter-author">${escapeHtml(author)}</p>` : ''}
</div>`;
}

function renderCopyrightPage(book: ColoringBook): string {
  const { title, author, publisher, isbn, year, copyrightExtra } = book.meta;
  const lines = [
    `${escapeHtml(title)}`,
    `Copyright © ${escapeHtml(year)} ${escapeHtml(author)}`,
    'All rights reserved.',
    publisher ? escapeHtml(publisher) : '',
    isbn ? `ISBN ${escapeHtml(isbn)}` : '',
    copyrightExtra ? escapeHtml(copyrightExtra) : '',
  ].filter(Boolean);

  return `<div class="matter-sheet" data-label="Copyright">
<div class="matter-lines matter-small">${lines.map((line) => `<p>${line}</p>`).join('')}</div>
</div>`;
}

function renderBelongsPage(book: ColoringBook, options: RenderOptions): string {
  const art = matterArt(book, 'belongs');
  if (art) return renderMatterArt(book, art, 'This book belongs to', options);

  return `<div class="matter-sheet" data-label="This book belongs to">
<p class="belongs-heading">This book belongs to</p>
<div class="belongs-rule"></div>
<p class="belongs-note">Fill every page however you like. There is no wrong way.</p>
</div>`;
}

function renderColorTestPage(book: ColoringBook, options: RenderOptions): string {
  const art = matterArt(book, 'colorTest');
  if (art) return renderMatterArt(book, art, 'Pen test page', options, book.coloring.singleSided);

  const swatches = Array.from({ length: 16 }, () => '<div class="test-swatch"></div>').join('');
  // "Test your pens" rather than "try your colours": the word is spelled two
  // ways and the printed page cannot hedge. This sidesteps it, and is what the
  // page is for anyway — the thing being tested is the pen, not the colour.
  return `<div class="matter-sheet${book.coloring.singleSided ? ' matter-recto' : ''}" data-label="Pen test page">
<p class="test-heading">Test your pens here</p>
<p class="test-note">Some pens soak through. Try one here first, then turn the page to see.</p>
<div class="test-grid">${swatches}</div>
</div>`;
}

export function buildColoringHtml(book: ColoringBook, options: RenderOptions): string {
  const preview = options.mode === 'preview';
  const sheet = sheetOf(book);
  const { coloring } = book;

  // No section wrappers around the three runs. The poetry renderer needs them
  // to switch named pages for roman folios; here they only cost a pair of empty
  // sheets, because a box that starts on a right-hand page inside a fresh block
  // makes Paged.js open one whether anything needs it or not.
  const front = [
    coloring.titlePage ? renderTitlePage(book, options) : '',
    coloring.copyrightPage ? renderCopyrightPage(book) : '',
    coloring.belongsToPage ? renderBelongsPage(book, options) : '',
    coloring.colorTestPage ? renderColorTestPage(book, options) : '',
  ]
    .filter(Boolean)
    .join('');

  const body = book.pages.map((page) => renderPicture(page, book, options)).join('');
  // Front-matter artwork is placed by the same arithmetic as a picture, so its
  // rules are written the same way.
  const placements = [...matterArtwork(book), ...book.pages]
    .map((page) => placementCss(page, book))
    .join('\n');

  const pad = Array.from(
    { length: Math.max(0, options.padPages) },
    () => '<div class="vc-blank-page"></div>',
  ).join('');

  // The runtime is the poetry one, unchanged. Everything in it that is about
  // verse finds nothing here and does nothing; what is left is page tagging and
  // the page count, which is exactly what a coloring book needs and exactly
  // what the export route waits on.
  const runtimeConfig: RuntimeConfig = {
    continuedMarker: '',
    showContinuedMarker: false,
    guides: preview ? options.guides : { margins: false, bleed: false, safe: false, gutter: false },
    geometry: {
      contentTop: sheet.bleed + book.margins.top,
      contentBottom: sheet.bleed + book.margins.bottom,
      contentInside: book.margins.inside,
      contentOutside: sheet.bleed + book.margins.outside,
      bleed: sheet.bleed,
    },
    postToParent: preview,
    autoPrint: Boolean(options.autoPrint),
    heads: { verso: 'none', recto: 'none', bookTitle: book.meta.title, author: book.meta.author },
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(book.meta.title)}</title>
${options.fontStyle}
<style>${buildColoringCss(book, preview)}
${placements}</style>
<script>window.PagedConfig = { auto: false };</script>
<script>window.__VC_CONFIG__ = ${jsonForScript(runtimeConfig)};</script>
</head>
<body>
<div class="book">
${front}${body}${pad}
</div>
${options.pagedJsSrc ? `<script src="${escapeHtml(options.pagedJsSrc)}"></script>` : ''}
${options.pagedJsSrc ? `<script>${RUNTIME_SCRIPT}</script>` : ''}
${preview ? `<script>${FLIP_SCRIPT}</script><script>${VIEWER_SCRIPT}</script>` : ''}
</body>
</html>`;
}
