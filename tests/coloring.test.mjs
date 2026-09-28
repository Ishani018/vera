import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXTREME_UPSCALE,
  pageQuality,
  printedSize,
  storedLongEdge,
  targetLongEdge,
} from '../lib/coloring/quality.ts';
import { MAX_EDGE } from '../lib/lineart/pipeline.ts';
import { createColoringBook } from '../lib/projects.ts';

/** A page as the store writes one, with only what the reading depends on. */
const page = (over = {}) => ({
  id: 'page_1',
  title: 'A picture',
  source: 'painting',
  sourceGuessed: true,
  sourceAssetId: 'asset_1',
  lineArtAssetId: null,
  renderedWith: null,
  upscaled: 1,
  naturalWidth: 3000,
  naturalHeight: 3000,
  settings: { mode: 'threshold', detail: 50, thickness: 45, cleanup: 40, invert: false },
  ...over,
});

const square = () => createColoringBook('Square');

const tall = () => {
  const book = createColoringBook('Tall');
  book.trim = { ...book.trim, trimId: '8.5x11' };
  return book;
};

test('the printed page is the trim plus the bleed that is actually on it', () => {
  const book = square();
  assert.deepEqual(printedSize(book), { width: 8.625, height: 8.75 });

  book.trim = { ...book.trim, bleed: false };
  assert.deepEqual(printedSize(book), { width: 8.5, height: 8.5 });
});

test('the target long edge is 300 DPI across the paper that gets printed', () => {
  assert.equal(targetLongEdge(square()), Math.round(8.75 * 300));
  assert.equal(targetLongEdge(tall()), Math.round(11.25 * 300));
});

test('a picture that fits the page is measured by whichever side runs out first', () => {
  // Tall and narrow on a portrait page: the height decides, and reading the
  // width alone would report nearly twice the resolution there really is.
  const narrow = page({ naturalWidth: 1000, naturalHeight: 3000 });
  const dpi = pageQuality(narrow, tall()).dpi;
  assert.ok(Math.abs(dpi - 3000 / 11.25) < 0.01, `read ${dpi}`);
});

test('a picture below 300 DPI is called soft, and one above it is not', () => {
  assert.equal(pageQuality(page({ naturalWidth: 1200, naturalHeight: 1200 }), square()).soft, true);
  assert.equal(pageQuality(page(), square()).soft, false);
});

test('enlarging counts towards the reading, because the enlarged file is what prints', () => {
  const small = page({ naturalWidth: 1024, naturalHeight: 1024 });
  const before = pageQuality(small, square());
  const after = pageQuality({ ...small, upscaled: 2.56 }, square());
  assert.ok(after.dpi > before.dpi * 2.5);
  assert.equal(after.stored, Math.round(1024 * 2.56));
});

test('a long stretch is flagged, a modest one is not', () => {
  const small = page({ naturalWidth: 1024, naturalHeight: 1024 });
  assert.equal(pageQuality({ ...small, upscaled: EXTREME_UPSCALE + 0.1 }, square()).stretched, true);
  assert.equal(pageQuality({ ...small, upscaled: EXTREME_UPSCALE - 0.1 }, square()).stretched, false);
});

test('a scan larger than the converter works at is reported at the size that was saved', () => {
  // The converter reduces anything past MAX_EDGE before it starts, so the file
  // that prints is that reduction — not the 9000-pixel original.
  const huge = page({ naturalWidth: 9000, naturalHeight: 9000 });
  assert.equal(storedLongEdge(huge), MAX_EDGE);
  // A square picture on a page that bleeds runs out of width before height.
  const dpi = pageQuality(huge, square()).dpi;
  assert.ok(Math.abs(dpi - MAX_EDGE / 8.625) < 0.01, `read ${dpi}`);
});

test('a page with no measured size reads as nothing rather than as infinity', () => {
  const unknown = page({ naturalWidth: 0, naturalHeight: 0 });
  assert.equal(pageQuality(unknown, square()).dpi, 0);
  assert.equal(storedLongEdge(unknown), 0);
});
