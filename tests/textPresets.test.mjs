import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TEXT_PRESETS,
  presetBox,
  presetByKind,
  presetSizePt,
} from '../lib/textPresets.ts';
import { boardFor, presetById } from '../lib/presets.ts';

const INSTAGRAM = boardFor(presetById('instagram-post'));
const BOOKMARK = boardFor(presetById('bookmark'));

test('three presets, each named and in descending size', () => {
  assert.deepEqual(
    TEXT_PRESETS.map((p) => p.kind),
    ['heading', 'subheading', 'body'],
  );
  for (const preset of TEXT_PRESETS) {
    assert.ok(preset.label && preset.text, preset.kind);
    assert.ok(preset.min < preset.max, preset.kind);
  }
  const sizes = TEXT_PRESETS.map((p) => presetSizePt(p, INSTAGRAM));
  assert.ok(sizes[0] > sizes[1] && sizes[1] > sizes[2], `not descending: ${sizes}`);
});

test('a heading is a heading on a big board and on a small one', () => {
  // 810pt square: eight per cent is 64.8, stepped to a quarter point.
  assert.equal(presetSizePt(presetByKind('heading'), INSTAGRAM), 64.75);
  // A bookmark is 162pt across its short side, so the share would be 13 —
  // under the floor, and a heading under eighteen points is not a heading.
  assert.equal(presetSizePt(presetByKind('heading'), BOOKMARK), 18);
});

test('nothing is ever sized outside its own bounds', () => {
  const absurd = [
    { width: 10, height: 10 },
    { width: 5000, height: 5000 },
    INSTAGRAM,
    BOOKMARK,
  ];
  for (const board of absurd) {
    for (const preset of TEXT_PRESETS) {
      const size = presetSizePt(preset, board);
      assert.ok(size >= preset.min && size <= preset.max, `${preset.kind} on ${board.width}: ${size}`);
    }
  }
});

test('a new box lands inside the board, with room at both sides', () => {
  for (const board of [INSTAGRAM, BOOKMARK]) {
    for (const preset of TEXT_PRESETS) {
      const box = presetBox(preset, board);
      assert.ok(box.x > 0, `${preset.kind}: flush to the left edge`);
      assert.ok(box.y > 0 && box.y < board.height, `${preset.kind}: off the board`);
      assert.ok(box.x + box.width <= board.width + 0.01, `${preset.kind}: wider than the board`);
      // Symmetrical: what is inset on the left is inset on the right.
      assert.ok(Math.abs(board.width - (box.x + box.width) - box.x) < 0.02, `${preset.kind}: lopsided`);
    }
  }
});

test('the three do not start on top of each other', () => {
  const tops = TEXT_PRESETS.map((p) => presetBox(p, INSTAGRAM).y);
  assert.ok(tops[0] < tops[1] && tops[1] < tops[2], `stacked wrongly: ${tops}`);
});
