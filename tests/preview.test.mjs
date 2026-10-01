import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DRAWING_FITS,
  PREVIEW_BOX,
  PREVIEW_INSET,
  PREVIEW_ROUND,
  VIEW_BOX,
  fittedInto,
} from '../lib/preview.ts';

/**
 * The preview box, and the rule that keeps a drawing inside it.
 *
 * A drawing that carries its own size overflows the first box that is smaller
 * than that size — which is what happened: an 80 by 120 drawing in a 44 px box,
 * 23 px below the card and over the title. Nothing threw, because an svg
 * hanging out of its parent is not an error.
 *
 * These tests are the guard. The arithmetic ones say a fitted drawing is inside
 * its box; the source one reads the component and fails if any drawing is given
 * a size again.
 */

const source = readFileSync(new URL('../components/TilePreview.tsx', import.meta.url), 'utf8');

test('the box is one fixed square, decided in one place', () => {
  assert.equal(PREVIEW_BOX, 56);
  assert.equal(PREVIEW_ROUND, 48);
  assert.ok(PREVIEW_INSET > 0 && PREVIEW_INSET < PREVIEW_BOX / 4);
});

test('a fitted drawing is inside its box, at every size a box might be', () => {
  for (const box of [24, 32, 44, PREVIEW_ROUND, PREVIEW_BOX, 96, 120]) {
    const drawn = fittedInto(box);
    assert.ok(drawn.width <= box - PREVIEW_INSET * 2 + 1e-9, `${box}: ${drawn.width} wide`);
    assert.ok(drawn.height <= box - PREVIEW_INSET * 2 + 1e-9, `${box}: ${drawn.height} tall`);
  }
});

test('and keeps its proportions while it does', () => {
  const drawn = fittedInto(PREVIEW_BOX);
  assert.ok(Math.abs(drawn.width / drawn.height - VIEW_BOX.width / VIEW_BOX.height) < 1e-9);
});

test('a box smaller than its own padding gives nothing, not a negative drawing', () => {
  const drawn = fittedInto(4, 4);
  assert.equal(drawn.width, 0);
  assert.equal(drawn.height, 0);
});

test('a drawing fills what it is given and keeps its shape', () => {
  assert.deepEqual({ ...DRAWING_FITS }, {
    width: '100%',
    height: '100%',
    preserveAspectRatio: 'xMidYMid meet',
  });
});

test('no drawing carries a size of its own', () => {
  // The bug, exactly: `className="h-20"` on the svg. Any sizing class or
  // width/height attribute on a drawing fails this.
  const svgs = source.match(/<svg[^>]*>/g) ?? [];
  assert.ok(svgs.length >= 7, `${svgs.length} drawings found`);
  for (const tag of svgs) {
    assert.ok(tag.includes('{...fits}'), `a drawing not using the shared sizing: ${tag}`);
    assert.ok(!/className=/.test(tag), `a drawing with a class of its own: ${tag}`);
    assert.ok(!/\bwidth="\d/.test(tag), `a drawing with a width: ${tag}`);
    assert.ok(!/\bheight="\d/.test(tag), `a drawing with a height: ${tag}`);
  }
});

test('the box clips, so a drawing outside its own viewBox cannot escape either', () => {
  assert.match(source, /overflow-hidden/);
});

test('every drawing has a label, since each is the only picture on its card', () => {
  const labels = source.match(/aria-label="[^"]+"/g) ?? [];
  assert.ok(labels.length >= 7, labels.join(', '));
});

test('the size is set from the numbers, not typed into the markup again', () => {
  // `width: size, height: size` on the box and nothing else deciding it.
  assert.match(source, /width: size,\s*height: size,/);
  assert.ok(!/h-11|w-11|h-20|size-12/.test(source), 'a fixed size class crept back in');
});
