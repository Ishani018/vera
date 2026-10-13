import assert from 'node:assert/strict';
import test from 'node:test';

import { isReady, pictureAssetId, usesLineArt } from '../lib/coloring/picture.ts';
import { EXTREME_UPSCALE, pageQuality, printedDpi } from '../lib/coloring/quality.ts';
import { validateColoringBook } from '../lib/coloring/validate.ts';
import { createColoringBook, migrateProject } from '../lib/projects.ts';
import { picturesOf } from '../lib/pictures.ts';
import { buildColoringHtml } from '../lib/render/coloringHtml.ts';
import { TRACE_EDGE } from '../lib/lineart/pipeline.ts';

/**
 * Line art and blank backs are two switches on the book, not two kinds of book.
 *
 * With line art on, each picture is traced and the line art prints. Off, the
 * upload prints exactly as it came — a maze, a word search, a dot-to-dot, a page
 * drawn elsewhere — which is what an activity book needs, and usually it wants
 * the back of every page to be a page too, so the blank backs switch is off too.
 */

const page = (over = {}) => ({
  id: 'page_1',
  title: 'A maze',
  source: 'painting',
  sourceGuessed: true,
  sourceAssetId: 'src_1',
  lineArtAssetId: 'art_1',
  renderedWith: null,
  upscaled: 1,
  fit: 'contain',
  rotate: 0,
  naturalWidth: 1200,
  naturalHeight: 1200,
  settings: { mode: 'threshold', detail: 50, thickness: 45, cleanup: 40, smoothing: 50, invert: false },
  ...over,
});

const bookWith = (count = 1, over = {}) => {
  const book = createColoringBook('Mazes');
  book.pages = Array.from({ length: count }, (_, i) =>
    page({ id: `page_${i}`, title: `Maze ${i + 1}`, sourceAssetId: `src_${i}`, lineArtAssetId: `art_${i}` }),
  );
  Object.assign(book.coloring, over);
  return book;
};

const options = () => ({
  mode: 'export',
  fontStyle: '',
  pagedJsSrc: '',
  guides: { margins: false, bleed: false, safe: false, gutter: false },
  assets: Object.fromEntries(
    Array.from({ length: 4 }, (_, i) => [[`art_${i}`, `blob:art${i}`], [`src_${i}`, `blob:src${i}`]]).flat(),
  ),
  padPages: 0,
});

test('a new book traces its pictures and puts a blank page behind each, as it always did', () => {
  const book = createColoringBook();
  assert.equal(book.coloring.lineArtOn, true);
  assert.equal(book.coloring.singleSided, true);
});

test('a book saved before the switch existed still traces its pictures', () => {
  const saved = structuredClone(createColoringBook('Old'));
  delete saved.coloring.lineArtOn;
  const opened = migrateProject(saved);
  assert.equal(opened.coloring.lineArtOn, true);
  assert.equal(usesLineArt(opened), true);
  // And one that was switched off stays off through a save and an open.
  const off = structuredClone(createColoringBook('Off'));
  off.coloring.lineArtOn = false;
  assert.equal(migrateProject(off).coloring.lineArtOn, false);
});

test('a book with no coloring block at all is read as line art on, not a crash', () => {
  assert.equal(usesLineArt({}), true);
  assert.equal(usesLineArt({ coloring: {} }), true);
});

test('with line art on a page prints from the line art, falling back to the upload', () => {
  const book = bookWith(1);
  assert.equal(pictureAssetId(book, page()), 'art_1');
  // Still being converted: the upload stands in, so the book never has holes.
  assert.equal(pictureAssetId(book, page({ lineArtAssetId: null })), 'src_1');
  assert.equal(isReady(book, page()), true);
  assert.equal(isReady(book, page({ lineArtAssetId: null })), false);
});

test('with line art off a page prints from the upload, even if line art was made earlier', () => {
  const book = bookWith(1, { lineArtOn: false });
  assert.equal(pictureAssetId(book, page()), 'src_1', 'the stale line art must be ignored');
  assert.equal(pictureAssetId(book, page({ lineArtAssetId: null })), 'src_1');
  // Nothing to wait for.
  assert.equal(isReady(book, page({ lineArtAssetId: null })), true);
});

test('the printed book uses the original for every page when line art is off', () => {
  const on = buildColoringHtml(bookWith(2), options());
  const off = buildColoringHtml(bookWith(2, { lineArtOn: false }), options());
  const body = (html) => html.slice(html.indexOf('<body>'));
  assert.ok(body(on).includes('blob:art0') && body(on).includes('blob:art1'));
  assert.ok(!body(on).includes('blob:src0'));
  assert.ok(body(off).includes('blob:src0') && body(off).includes('blob:src1'));
  assert.ok(!body(off).includes('blob:art0'), 'the traced version must not appear');
});

test('a drawn front-matter page also follows the switch', () => {
  const book = bookWith(1, { lineArtOn: false });
  book.coloring.titleArt = page({ id: 'matter_title', sourceAssetId: 'src_2', lineArtAssetId: 'art_2' });
  const html = buildColoringHtml(book, options());
  const body = html.slice(html.indexOf('<body>'));
  assert.ok(body.includes('blob:src2') && !body.includes('blob:art2'));
});

test('no "not converted" error for pictures that are never going to be', () => {
  const unconverted = bookWith(2);
  for (const p of unconverted.pages) p.lineArtAssetId = null;
  const ids = (book) => validateColoringBook(book, 20).map((issue) => issue.id);

  assert.ok(ids(unconverted).includes('coloring-unconverted'), 'with line art on it is a real problem');
  unconverted.coloring.lineArtOn = false;
  assert.ok(!ids(unconverted).includes('coloring-unconverted'), 'off, there is nothing to wait for');
});

test('resolution is the upload\'s own when it prints as it is', () => {
  // A 2000px picture on a square 8.5in page (plus bleed): below 300 either way,
  // but the arithmetic differs. Traced, it is reduced to TRACE_EDGE and then
  // enlarged; as uploaded, it is simply its own pixels over the page.
  const big = page({ naturalWidth: 6000, naturalHeight: 6000, upscaled: 1 });
  const traced = bookWith(1);
  const asIs = bookWith(1, { lineArtOn: false });

  const tracedDpi = printedDpi(big, traced);
  const asIsDpi = printedDpi(big, asIs);
  assert.ok(6000 > TRACE_EDGE, 'the fixture has to be bigger than the trace limit to show it');
  assert.ok(asIsDpi > tracedDpi, 'a big upload keeps all its pixels when it is not traced');
  assert.ok(Math.abs(asIsDpi - 6000 / (8.5 + 0.125)) < 0.5);
});

test('an enlargement left over from line art is not reported once line art is off', () => {
  const stretched = page({ naturalWidth: 400, naturalHeight: 400, upscaled: EXTREME_UPSCALE + 1 });
  assert.equal(pageQuality(stretched, bookWith(1)).stretched, true);
  const off = pageQuality(stretched, bookWith(1, { lineArtOn: false }));
  assert.equal(off.stretched, false, 'nothing was enlarged: it prints as uploaded');
  assert.equal(off.factor, 1);
  assert.equal(off.stored, 400);
});

test('the pictures a cover or a post can borrow are what actually prints', () => {
  const on = picturesOf(bookWith(2));
  assert.deepEqual(on.map((p) => p.assetId), ['art_0', 'art_1']);
  const off = picturesOf(bookWith(2, { lineArtOn: false }));
  assert.deepEqual(off.map((p) => p.assetId), ['src_0', 'src_1']);
  // Unconverted pictures are not offered while line art is on, and are when it is off.
  const waiting = bookWith(1);
  waiting.pages[0].lineArtAssetId = null;
  assert.equal(picturesOf(waiting).length, 0);
  waiting.coloring.lineArtOn = false;
  assert.equal(picturesOf(waiting).length, 1);
});

test('with both switches off there are no blank backs in the printed length', async () => {
  const { sheetCount, frontMatterPages } = await import('../lib/render/coloringLayout.ts');
  const colouring = bookWith(10);
  const activity = bookWith(10, { lineArtOn: false, singleSided: false });

  // No blank backs: the generated pages and then the ten pictures, one sheet
  // each, back to back. (Padded to even, which 14 already is.)
  assert.equal(sheetCount(activity), frontMatterPages(activity) + 10);
  assert.equal(sheetCount(activity), 14);

  // With them, every picture must start a leaf, so each costs a blank sheet,
  // and the pen test page needs one ahead of itself as well.
  assert.ok(sheetCount(colouring) >= sheetCount(activity) + 10, `${sheetCount(colouring)} vs ${sheetCount(activity)}`);
});
