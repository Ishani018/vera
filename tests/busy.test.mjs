import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DRAFT_EDGE,
  SHOW_WORKING_AFTER,
  SLOW_AFTER,
  asFullSize,
  progressFraction,
  progressLine,
  wanted,
} from '../lib/busy.ts';

test('the working mark appears inside a tenth of a second', () => {
  assert.ok(SHOW_WORKING_AFTER < 100, `${SHOW_WORKING_AFTER}ms is too late to read as a response`);
  assert.ok(SHOW_WORKING_AFTER > 0, 'zero would flicker on every quick render');
});

test('a sentence waits for a job that is actually slow', () => {
  assert.equal(SLOW_AFTER, 1000);
  assert.ok(SLOW_AFTER > SHOW_WORKING_AFTER * 5);
});

test('a drag preview is small enough to be a fraction of the work', () => {
  assert.ok(DRAFT_EDGE <= 400);
  // Work goes as the area, so this is the promise the number is making.
  assert.ok((DRAFT_EDGE / 800) ** 2 <= 0.3);
});

test('only the newest answer is wanted', () => {
  assert.equal(wanted(7, 7), true);
  assert.equal(wanted(6, 7), false);
  // A result from the future cannot happen, and would still not be the newest.
  assert.equal(wanted(8, 7), false);
});

test('a draft reports the size the real one will be', () => {
  const draft = { width: 400, height: 300, pad: 8, blob: 'x' };
  const scaled = asFullSize(draft, { width: 800, height: 600 });
  assert.equal(scaled.width, 800);
  assert.equal(scaled.height, 600);
  assert.equal(scaled.pad, 16);
  assert.equal(scaled.blob, 'x', 'everything else travels untouched');
});

test('rounding a draft up never jitters the number under the picture', () => {
  // 267 scaled by 800/400 is 534, a pixel off the 533 the real one reported.
  const draft = { width: 400, height: 267, pad: 4 };
  assert.equal(asFullSize(draft, { width: 800, height: 533 }).height, 533);
});

test('but a shape that really did change is reported as it is', () => {
  // A die-cut outline being widened makes the picture genuinely taller, and
  // hiding that would hide the thing the drag is for.
  const draft = { width: 400, height: 360, pad: 20 };
  assert.equal(asFullSize(draft, { width: 800, height: 600 }).height, 720);
});

test('a draft with no full size to copy keeps its own numbers', () => {
  const draft = { width: 400, height: 300, pad: 8 };
  assert.deepEqual(asFullSize(draft, null), draft);
});

test('the pad is scaled, because it is read as a fraction of the width', () => {
  const draft = { width: 400, height: 400, pad: 10 };
  const scaled = asFullSize(draft, { width: 1000, height: 1000 });
  assert.equal(scaled.pad / scaled.width, draft.pad / draft.width);
});

test('a size of zero is left alone rather than divided by', () => {
  const nothing = { width: 0, height: 0, pad: 0 };
  assert.deepEqual(asFullSize(nothing, { width: 800, height: 600 }), nothing);
});

test('progress counts when there is something to count', () => {
  assert.equal(progressLine('Exporting', 3, 12), 'Exporting… 3 of 12');
  assert.equal(progressLine('Working'), 'Working…');
  assert.equal(progressLine('Working', 3), 'Working…');
  assert.equal(progressLine('Working', 3, 0), 'Working…');
  assert.equal(progressLine(''), 'Working…');
});

test('progress never reads past the end', () => {
  assert.equal(progressLine('Saving', 13, 12), 'Saving… 12 of 12');
  assert.equal(progressFraction(13, 12), 1);
  assert.equal(progressFraction(-1, 12), 0);
});

test('an unknown total has no fraction, rather than a made-up one', () => {
  assert.equal(progressFraction(undefined, undefined), null);
  assert.equal(progressFraction(3, 0), null);
  assert.equal(progressFraction(3, 12), 0.25);
});
