import assert from 'node:assert/strict';
import test from 'node:test';

import { PRESETS, boardFor, presetById } from '../lib/presets.ts';
import { foldsOf, reservedOf, safeOf, trimOf } from '../lib/board.ts';

test('every preset is distinct, named and the right way up for its job', () => {
  assert.deepEqual([...new Set(PRESETS.map((p) => p.id))].length, PRESETS.length);
  for (const p of PRESETS) {
    assert.ok(p.name && p.note && p.stated, p.id);
    assert.ok(p.width > 0 && p.height > 0, p.id);
    assert.ok(p.safeInset * 2 < Math.min(p.width, p.height), `${p.id}: safe area is bigger than the board`);
  }
  assert.ok(presetById('instagram-post'));
  assert.equal(presetById('nothing-like-this'), null);
});

test('pixel sizes convert exactly, which is the reason for points', () => {
  // 1200 x 628 is 900 x 471 on the nose. In inches it would be 6.541666...
  const link = presetById('link-image');
  assert.equal(link.width, 900);
  assert.equal(link.height, 471);
  assert.equal(presetById('instagram-post').width, 810);
  assert.equal(presetById('instagram-story').height, 1440);
});

test('a screen board is the size stated; a printed one gains its bleed', () => {
  const post = boardFor(presetById('instagram-post'));
  assert.equal(post.width, 810, 'nothing is trimmed off a screen');
  assert.equal(post.bleed, 0);
  assert.deepEqual(trimOf(post), { x: 0, y: 0, width: 810, height: 810 });

  // A 4.25in postcard is printed on a 4.5in sheet and cut down.
  const card = boardFor(presetById('postcard-a6'));
  assert.equal(card.width, 4.5 * 72);
  assert.equal(card.height, 6.25 * 72);
  assert.equal(trimOf(card).width, 4.25 * 72, 'what the buyer ends up holding');
});

test('a launch-kit board has a safe area and nothing else marked on it', () => {
  for (const preset of PRESETS) {
    const board = boardFor(preset);
    assert.equal(foldsOf(board).length, 0, `${preset.id} does not fold`);
    assert.equal(reservedOf(board).length, 0, `${preset.id} has no barcode`);
    assert.equal(safeOf(board).length, 1, preset.id);
    assert.deepEqual(Object.keys(board.panels), ['board']);
  }
});

test("a story keeps its safe area clear of the controls over each end", () => {
  const story = boardFor(presetById('instagram-story'));
  const safe = safeOf(story)[0].rect;
  assert.equal(safe.y, 187.5, '250px from the top');
  assert.equal(safe.y + safe.height, 1440 - 187.5);
  assert.match(safe.label ?? safeOf(story)[0].label, /visible/);
});
