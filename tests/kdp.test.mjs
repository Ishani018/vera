import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BLEED,
  COVER_BLEED_TOTAL,
  GUTTER_TABLE,
  PAPER_THICKNESS,
  TRIM_SIZES,
  checkMargins,
  checkPageCount,
  coverDimensions,
  effectiveDpi,
  getTrim,
  minInsideMargin,
  minOutsideMargin,
  padToEven,
  spineWidth,
} from '../lib/kdp.ts';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~= ${b}`);

test('gutter tiers match the KDP table exactly at every boundary', () => {
  const expected = [
    [24, 0.375], [150, 0.375],
    [151, 0.5], [300, 0.5],
    [301, 0.625], [500, 0.625],
    [501, 0.75], [700, 0.75],
    [701, 0.875], [828, 0.875],
  ];
  for (const [pages, inside] of expected) {
    assert.equal(minInsideMargin(pages), inside, `${pages} pages`);
  }
});

test('gutter table has no gaps and no overlaps', () => {
  for (let i = 1; i < GUTTER_TABLE.length; i++) {
    assert.equal(GUTTER_TABLE[i].minPages, GUTTER_TABLE[i - 1].maxPages + 1);
  }
});

test('outside margin minimum depends on bleed', () => {
  assert.equal(minOutsideMargin(false), 0.25);
  assert.equal(minOutsideMargin(true), 0.375);
});

test('spine width uses the published per-page caliper', () => {
  near(spineWidth(100, 'white'), 0.2252);
  near(spineWidth(100, 'cream'), 0.25);
  near(spineWidth(100, 'color'), 0.2347);
  assert.equal(PAPER_THICKNESS.cream, 0.0025);
});

test('cover dimensions: 2 x trim + spine + 0.25 bleed', () => {
  const trim = getTrim('6x9');
  const d = coverDimensions(trim, 120, 'cream');
  near(d.spine, 0.3);
  near(d.width, 2 * 6 + 0.3 + COVER_BLEED_TOTAL); // 12.55
  near(d.height, 9 + COVER_BLEED_TOTAL); // 9.25
  near(d.spineStart, BLEED + 6);
  near(d.spineEnd, BLEED + 6 + 0.3);
});

test('page count is padded to even', () => {
  assert.equal(padToEven(101), 102);
  assert.equal(padToEven(102), 102);
});

test('all 17 KDP trim sizes are present and unique', () => {
  assert.equal(TRIM_SIZES.length, 17);
  assert.equal(new Set(TRIM_SIZES.map((t) => t.id)).size, 17);
  for (const t of TRIM_SIZES) assert.ok(t.width > 0 && t.height > 0);
});

test('margin check flags a gutter that is legal at 150 pages but not at 151', () => {
  const margins = { inside: 0.375, outside: 0.375, top: 0.5, bottom: 0.5 };
  assert.equal(checkMargins({ margins, pageCount: 150, bleed: false }).filter(i => i.level === 'error').length, 0);
  const errs = checkMargins({ margins, pageCount: 151, bleed: false }).filter(i => i.level === 'error');
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /0\.5"/);
});

test('margin check flags sub-minimum outside margins under bleed', () => {
  const margins = { inside: 0.75, outside: 0.3, top: 0.3, bottom: 0.3 };
  const errs = checkMargins({ margins, pageCount: 100, bleed: true }).filter(i => i.level === 'error');
  assert.equal(errs.length, 3);
});

test('page count check: parity, floor and ceiling', () => {
  assert.equal(checkPageCount(101).some((i) => i.id === 'page-parity'), true);
  assert.equal(checkPageCount(20).some((i) => i.id === 'page-min'), true);
  assert.equal(checkPageCount(900).some((i) => i.id === 'page-max'), true);
  assert.equal(checkPageCount(120).length, 0);
});

test('effective DPI', () => {
  near(effectiveDpi(1650, 5.5), 300);
  assert.equal(effectiveDpi(1000, 0), 0);
});
