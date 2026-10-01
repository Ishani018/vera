import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATEGORIES, INTERIORS, TILES, tileSize } from '../lib/tiles.ts';
import { presetById } from '../lib/presets.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
    if (tile.destination.kind === 'route') {
      // Read off the filesystem rather than compared against a list kept here,
      // because a list kept here would be a second place to remember to update
      // and the whole point of this test is that nobody has to remember.
      const path = join(ROOT, 'app', tile.destination.href.replace(/^\//, ''), 'page.tsx');
      assert.ok(
        existsSync(path),
        `${tile.id} points at ${tile.destination.href}, which has no page: ${path}`,
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
