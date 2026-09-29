import assert from 'node:assert/strict';
import test from 'node:test';

import { CATEGORIES, INTERIORS, TILES, tileSize } from '../lib/tiles.ts';
import { presetById } from '../lib/presets.ts';

test('every tile is distinct, named and filed under a real category', () => {
  const ids = TILES.map((tile) => tile.id);
  assert.equal(new Set(ids).size, ids.length);
  const categories = new Set(CATEGORIES.map((entry) => entry.id));
  for (const tile of TILES) {
    assert.ok(tile.label, tile.id);
    assert.ok(categories.has(tile.category), `${tile.id}: ${tile.category} is not a chip`);
  }
});

/**
 * The rule that keeps the front page honest: a tile is only allowed to say it
 * is ready if it has somewhere real to go. A board it names has to exist.
 */
test('a ready tile opens something that exists', () => {
  for (const tile of TILES) {
    if (tile.status !== 'ready') {
      assert.equal(tile.destination.kind, 'none', `${tile.id}: a muted tile must open nothing`);
      continue;
    }
    assert.notEqual(tile.destination.kind, 'none', `${tile.id} says ready but goes nowhere`);
    if (tile.destination.kind === 'design') {
      assert.ok(
        presetById(tile.destination.presetId),
        `${tile.id} points at a board that does not exist: ${tile.destination.presetId}`,
      );
    }
  }
});

test('the size line comes from the board itself, so it cannot drift', () => {
  for (const tile of TILES) {
    assert.ok(tileSize(tile), `${tile.id} has no size line`);
    if (tile.destination.kind === 'design') {
      assert.equal(tileSize(tile), presetById(tile.destination.presetId).stated);
    }
  }
});

test('one kind of interior is honestly marked as not built', () => {
  const activity = INTERIORS.find((entry) => entry.id === 'activity');
  assert.equal(activity.status, 'soon');
  assert.deepEqual(
    INTERIORS.filter((entry) => entry.status === 'ready').map((entry) => entry.id),
    ['poetry', 'coloring'],
  );
});
