import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { INK, PAPER } from '../lib/lineart/pipeline.ts';
import { compositeSticker, maskFromInk, scalePaint } from '../lib/lineart/mask.ts';
import {
  HISTORY_STEPS,
  LEAK_SHARE,
  PaintHistory,
  Stroke,
  applyPatch,
  barrierOf,
  disc,
  fillAt,
  makePaint,
  painted,
  smear,
} from '../lib/stickers/colour.ts';
import { buildBackup } from '../lib/backup.ts';
import { createProject } from '../lib/defaults.ts';
import { draftList, migrateDraft, newDraft } from '../lib/stickers/drafts.ts';
import { draftAssets } from '../lib/assetRefs.ts';
import { listTrash } from '../lib/trash.ts';

/* ---------------------------------------------------------------- fixtures */

/** Line art: `plot(x, y)` returns true where there is a line. */
function lines(width, height, plot) {
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = plot(x, y) ? INK : PAPER;
  }
  return { width, height, data };
}

/**
 * A box outline in the middle of the canvas, optionally with a hole of `gap`
 * pixels in its top edge — the sort a scan leaves.
 *
 * It takes up a quarter of the canvas, deliberately: the leak guard is a share
 * of the whole canvas, so a fixture whose every fill was already past half
 * would not be able to tell a leak from an ordinary fill.
 */
const LO = (size) => (size / 4) | 0;
const HI = (size) => size - LO(size) - 1;

function box(size, gap = 0) {
  const lo = LO(size);
  const hi = HI(size);
  const mid = (size / 2) | 0;
  return lines(size, size, (x, y) => {
    const onEdge =
      ((x === lo || x === hi) && y >= lo && y <= hi) || ((y === lo || y === hi) && x >= lo && x <= hi);
    if (!onEdge) return false;
    if (gap && y === lo && x > mid - gap / 2 - 1 && x < mid + gap / 2 + 1) return false;
    return true;
  });
}

/** How many pixels the inside of such a box holds. */
const inner = (size) => (HI(size) - LO(size) - 1) ** 2;

const at = (grid, x, y) => y * grid.width + x;

/* -------------------------------------------------------------- the bucket */

test('a fill stops at the lines and stays inside the shape', () => {
  const art = box(40);
  const found = fillAt({ barrier: barrierOf(art, 0), at: at(art, 20, 20), gap: 0 });

  assert.ok(found, 'a click inside a closed shape fills something');
  // The room, plus the one round of growth that tucks it under the walls.
  assert.equal(found.pixels.length, inner(40) + 4 * (HI(40) - LO(40) - 1));
  assert.equal(found.leaked, false);

  // Nothing outside the box.
  const inside = new Set(found.pixels);
  assert.equal(inside.has(at(art, 1, 1)), false, 'the background is untouched');
  assert.equal(inside.has(at(art, LO(40) - 1, 20)), false, 'and so is the far side of the line');
});

test('a click on a line fills nothing rather than filling everything', () => {
  const art = box(40);
  assert.equal(fillAt({ barrier: barrierOf(art, 0), at: at(art, LO(40), 20), gap: 0 }), null);
});

test('a broken outline leaks, and closing the gap stops it', () => {
  // Four pixels missing from the top edge: the sort of hole a scan leaves.
  const art = box(40, 4);

  const leaky = fillAt({ barrier: barrierOf(art, 0), at: at(art, 20, 20), gap: 0 });
  assert.ok(leaky.pixels.length > inner(40) * 2, 'without gap closing the fill escapes');
  assert.ok(leaky.share > LEAK_SHARE, 'and covers most of the canvas');
  assert.equal(leaky.leaked, true, 'which is what the warning is for');

  const closed = fillAt({ barrier: barrierOf(art, 3), at: at(art, 20, 20), gap: 3 });
  assert.equal(closed.leaked, false, 'gap closing holds it in');
  assert.ok(closed.pixels.length < inner(40) * 2, 'and it is about the size of the room');
});

test('gap closing is a working copy: the drawing itself is never altered', () => {
  const art = box(40, 4);
  const before = Uint8ClampedArray.from(art.data);
  const barrier = barrierOf(art, 3);
  fillAt({ barrier, at: at(art, 20, 20), gap: 3 });

  assert.deepEqual(art.data, before, 'the line art is byte for byte what it was');
  assert.notDeepEqual(barrier.data, before, 'and the barrier really is thicker');
});

test('the fill tucks under the lines, so no pale halo is left along them', () => {
  const art = box(40);
  const wall = LO(40);
  const gap = 2;
  const found = fillAt({ barrier: barrierOf(art, gap), at: at(art, 20, 20), gap });
  const inside = new Set(found.pixels);

  // Filling against a thickened barrier and not growing back would leave the
  // pixels beside the line uncoloured — a pale outline round every region.
  assert.equal(inside.has(at(art, wall + 1, 20)), true, 'right up against the line');
  assert.equal(inside.has(at(art, wall, 20)), true, 'and a pixel under it');
  // But never out the other side into the background.
  assert.equal(inside.has(at(art, wall - 1, 20)), false, 'and no further');
  assert.equal(inside.has(at(art, 0, 20)), false);
});

test('the tuck cannot step out into the room next door', () => {
  // Two rooms sharing a one-pixel wall. A tuck of three would cross it if it
  // were allowed to walk through open paper rather than only under ink.
  const art = lines(40, 20, (x) => x === 20);
  const found = fillAt({ barrier: barrierOf(art, 3), at: at(art, 5, 10), gap: 3 });
  const inside = new Set(found.pixels);

  assert.equal(inside.has(at(art, 19, 10)), true, 'up to the wall is fine');
  assert.equal(inside.has(at(art, 20, 10)), true, 'and a pixel under it');
  assert.equal(inside.has(at(art, 21, 10)), false, 'through it is not');
  assert.equal(inside.has(at(art, 30, 10)), false);
});

test('the leak guard is a share of the canvas, and fires either side of the line', () => {
  const half = lines(20, 20, (_, y) => y === 12);
  // Below the line: seven rows of twenty, plus the row it tucks under.
  const small = fillAt({ barrier: barrierOf(half, 0), at: at(half, 5, 15), gap: 0 });
  assert.equal(small.leaked, false);
  assert.ok(small.share < LEAK_SHARE, `${small.share} of the canvas`);

  const open = lines(20, 20, () => false);
  const whole = fillAt({ barrier: barrierOf(open, 0), at: 0, gap: 0 });
  assert.equal(whole.share, 1);
  assert.equal(whole.leaked, true, 'a fill of the entire canvas is always worth a word');
});

/* ------------------------------------------------------- brush and rubber */

test('the brush is a circle and the eraser takes it away again', () => {
  const paint = makePaint(20, 20);
  const stroke = new Stroke(paint);
  stroke.apply(disc(20, 20, 10, 10, 3), { r: 200, g: 30, b: 40 });

  assert.equal(paint.data[(10 * 20 + 10) * 4 + 3], 255, 'opaque at the centre');
  assert.equal(paint.data[(10 * 20 + 13) * 4], 200, 'and out to the radius');
  assert.equal(paint.data[(10 * 20 + 16) * 4 + 3], 0, 'but not beyond it');
  assert.equal(painted(paint), true);

  const rubber = new Stroke(paint);
  rubber.apply(disc(20, 20, 10, 10, 3), null);
  assert.equal(painted(paint), false, 'erasing puts it back to nothing at all');
});

test('a quick drag draws a stroke rather than a dotted line', () => {
  const pixels = new Set(smear(40, 40, { x: 5, y: 20 }, { x: 35, y: 20 }, 2));
  for (let x = 5; x <= 35; x++) {
    assert.equal(pixels.has(20 * 40 + x), true, `the stroke is unbroken at x=${x}`);
  }
});

/* --------------------------------------------------------- undo and redo */

test('one undo puts back a whole gesture, not the last pixel of it', () => {
  const paint = makePaint(40, 40);
  const history = new PaintHistory();

  const first = new Stroke(paint);
  first.apply(disc(40, 40, 10, 10, 4), { r: 10, g: 20, b: 30 });
  history.record(first.commit());

  const second = new Stroke(paint);
  // A drag: many separate applications, one gesture.
  for (let x = 20; x < 35; x++) second.apply(disc(40, 40, x, 20, 3), { r: 90, g: 90, b: 90 });
  history.record(second.commit());

  assert.deepEqual(history.depth, { past: 2, future: 0 });

  assert.equal(history.undo(paint), true);
  assert.equal(paint.data[(20 * 40 + 25) * 4 + 3], 0, 'the whole drag is gone');
  assert.equal(paint.data[(10 * 40 + 10) * 4], 10, 'the earlier stroke is still there');

  assert.equal(history.redo(paint), true);
  assert.equal(paint.data[(20 * 40 + 25) * 4], 90, 'and comes back whole');
  assert.deepEqual(history.depth, { past: 2, future: 0 });
});

test('undo and redo come back to exactly the pixels that were there', () => {
  const art = box(60);
  const paint = makePaint(60, 60);
  const history = new PaintHistory();

  const fill = fillAt({ barrier: barrierOf(art, 2), at: at(art, 30, 30), gap: 2 });
  const stroke = new Stroke(paint);
  stroke.apply(fill.pixels, { r: 240, g: 180, b: 40 });
  const after = Uint8ClampedArray.from(paint.data);
  history.record(stroke.commit());

  history.undo(paint);
  assert.deepEqual(paint.data, new Uint8ClampedArray(60 * 60 * 4), 'back to blank');
  history.redo(paint);
  assert.deepEqual(paint.data, after, 'and forward to the very same bytes');
});

test('a new change throws the redos away, as everywhere else in the app', () => {
  const paint = makePaint(20, 20);
  const history = new PaintHistory();
  const one = new Stroke(paint);
  one.apply([0], { r: 1, g: 2, b: 3 });
  history.record(one.commit());
  history.undo(paint);
  assert.deepEqual(history.depth, { past: 0, future: 1 });

  const two = new Stroke(paint);
  two.apply([5], { r: 4, g: 5, b: 6 });
  history.record(two.commit());
  assert.deepEqual(history.depth, { past: 1, future: 0 });
});

test('a gesture that changed nothing is not worth an undo step', () => {
  const paint = makePaint(20, 20);
  const stroke = new Stroke(paint);
  stroke.apply(disc(20, 20, 10, 10, 2), null); // erasing what was never painted
  assert.equal(stroke.commit(), null);
});

test('the history has a floor as well as a ceiling', () => {
  const paint = makePaint(40, 40);
  const history = new PaintHistory();
  for (let n = 0; n < HISTORY_STEPS + 10; n++) {
    const stroke = new Stroke(paint);
    stroke.apply([n], { r: n, g: 0, b: 0 });
    history.record(stroke.commit());
  }
  assert.equal(history.depth.past, HISTORY_STEPS, 'old steps drop off the bottom');
});

test('a patch is smaller than a snapshot, which is why it is a patch', () => {
  const paint = makePaint(500, 500);
  const stroke = new Stroke(paint);
  stroke.apply(disc(500, 500, 250, 250, 20), { r: 1, g: 2, b: 3 });
  const patch = stroke.commit();
  const snapshot = paint.data.byteLength;
  const cost = patch.pixels.byteLength + patch.before.byteLength + patch.after.byteLength;
  assert.ok(cost < snapshot / 10, `${cost} bytes against ${snapshot} for a whole layer`);
});

/* ------------------------------------------------------------ compositing */

test('the colour goes under the drawing, never over it', () => {
  const art = box(20);
  const paint = makePaint(20, 20);
  const stroke = new Stroke(paint);
  const fill = fillAt({ barrier: barrierOf(art, 2), at: at(art, 10, 10), gap: 2 });
  stroke.apply(fill.pixels, { r: 255, g: 0, b: 0 });

  const out = compositeSticker({
    subject: maskFromInk(art),
    ring: null,
    paint: null,
    colour: paint,
    inkColour: '#000000',
    ringColour: '#FFFFFF',
  });

  const line = at(art, LO(20), 10) * 4;
  assert.deepEqual([out.data[line], out.data[line + 1], out.data[line + 2]], [0, 0, 0], 'the line is still black');
  assert.equal(out.data[line + 3], 255);

  const middle = at(art, 10, 10) * 4;
  assert.deepEqual([out.data[middle], out.data[middle + 1], out.data[middle + 2]], [255, 0, 0]);
  assert.equal(out.data[middle + 3], 255, 'and coloured-in pixels are solid');

  const outside = at(art, 1, 1) * 4;
  assert.equal(out.data[outside + 3], 0, 'outside the shape is still see-through');
});

test('no colour layer composites exactly as it did before there was one', () => {
  const art = box(20);
  const args = { subject: maskFromInk(art), ring: null, paint: null, inkColour: '#1B1815', ringColour: '#FFFFFF' };
  assert.deepEqual(compositeSticker(args).data, compositeSticker({ ...args, colour: null }).data);
});

test('the colour layer resizes without inventing colours that are in neither region', () => {
  const small = makePaint(4, 4);
  new Stroke(small).apply([0, 1, 4, 5], { r: 255, g: 0, b: 0 });
  const big = scalePaint(small, 8, 8);

  assert.equal(big.width, 8);
  const seen = new Set();
  for (let i = 0; i < big.data.length; i += 4) {
    seen.add(`${big.data[i]},${big.data[i + 1]},${big.data[i + 2]},${big.data[i + 3]}`);
  }
  assert.deepEqual([...seen].sort(), ['0,0,0,0', '255,0,0,255'], 'two colours in, two colours out');
  assert.equal(big.data[(0 * 8 + 0) * 4], 255, 'and the red quarter is still the red quarter');
  assert.equal(big.data[(3 * 8 + 3) * 4 + 3], 255);
  assert.equal(big.data[(4 * 8 + 4) * 4 + 3], 0);
});

test('scaling to the size it already is hands back the same layer, not a copy', () => {
  const paint = makePaint(10, 10);
  assert.equal(scalePaint(paint, 10, 10), paint);
});

/* ----------------------------------------------------------- the drafts */

test('a draft survives being stored and read back with nothing lost', () => {
  const draft = {
    ...newDraft('asset-1', 'Fox'),
    tags: 'fox, woodland',
    colourAssetId: 'asset-2',
    colourAt: { width: 1200, height: 900 },
    gapClosing: 3,
    dieCut: { width: 6, colour: '#FFFFFF', radius: 4 },
  };

  // What the browser does to a row on the way in and on the way out. It throws
  // on anything it cannot carry, which is the thing a reload would lose.
  const stored = structuredClone(draft);
  assert.deepEqual(migrateDraft(stored), draft, 'every field comes back as it went in');

  // And the pictures are referred to by id, so the layer itself is a stored
  // asset rather than something held in a tab that is about to close.
  assert.deepEqual(draftAssets(draft).sort(), ['asset-1', 'asset-2']);
});

test('an older draft, saved before a field existed, opens with a sensible default', () => {
  const { gapClosing, colourAssetId, colourAt, ...older } = newDraft('asset-1', 'Fox');
  const opened = migrateDraft(structuredClone(older));
  assert.equal(opened.gapClosing, 2);
  assert.equal(opened.colourAssetId, null);
  assert.equal(opened.colourAt, null);
  assert.equal(opened.name, 'Fox', 'and the rest is untouched');
});

test('a draft in the trash is not listed, and a restored one is whole again', () => {
  const kept = newDraft('a', 'Kept');
  const binned = { ...newDraft('b', 'Binned'), deletedAt: 1_000 };

  const listed = draftList([kept, binned]);
  assert.deepEqual(listed.map((d) => d.name), ['Kept']);

  const restored = draftList([kept, { ...binned, deletedAt: undefined }]);
  assert.equal(restored.length, 2);
  assert.deepEqual(
    migrateDraft(restored.find((d) => d.name === 'Binned')),
    migrateDraft({ ...binned, deletedAt: undefined }),
    'nothing was lost while it sat in the trash',
  );
});

test('drafts are newest first', () => {
  const rows = [
    { ...newDraft('a', 'Old'), updatedAt: 1 },
    { ...newDraft('b', 'New'), updatedAt: 3 },
    { ...newDraft('c', 'Middle'), updatedAt: 2 },
  ];
  assert.deepEqual(draftList(rows).map((d) => d.name), ['New', 'Middle', 'Old']);
});

test('a backup carries no drafts, because a backup is of finished work', () => {
  const draft = newDraft('asset-1', 'Half a fox');
  const payload = buildBackup({
    project: createProject({ name: 'Winter Poems' }),
    assets: [],
    stickers: [{ id: 'st1', name: 'A finished fox', assetId: 'asset-9', createdAt: 1, tags: [] }],
    templates: [],
    designs: [],
  });

  const text = JSON.stringify(payload);
  assert.equal(text.includes(draft.id), false, 'no draft id anywhere in it');
  assert.equal(text.includes('stickerDrafts'), false, 'and no room for one');
  assert.equal(payload.library.stickers.length, 1, 'the finished sticker is there');
});

test('nothing outside the drafts module and the trash ever reads the drafts table', () => {
  // The rule that keeps a half-traced drawing off somebody's cover. A list or
  // a backup can only show a draft if it reads the table, so this is checked
  // where it can be checked: at the only door into it.
  const allowed = new Set([
    'lib/stickers/drafts.ts', // the only reader
    'lib/trash.ts', // and the trash, which reads everything by design
  ]);

  // Reaching the table, rather than mentioning it: `db.stickerDrafts`, not the
  // word in a comment explaining why nothing else may touch it.
  const reads = /\.stickerDrafts\b/;
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry) && reads.test(readFileSync(path, 'utf8'))) {
        if (!allowed.has(path)) offenders.push(path);
      }
    }
  };
  for (const dir of ['lib', 'app', 'components']) walk(dir);

  assert.deepEqual(offenders, [], 'a new reader of the drafts table needs a new rule, not a new import');
});

test('the trash knows about drafts, so a deleted one can come back', () => {
  // listTrash needs a database and there is not one here; what can be checked
  // without one is that the kind exists and the assets are counted, which is
  // the part that decides whether a draft's picture survives a sweep.
  assert.equal(typeof listTrash, 'function');
  const draft = { ...newDraft('src', 'Fox'), colourAssetId: 'colour' };
  assert.deepEqual(draftAssets(draft), ['src', 'colour']);
  assert.deepEqual(draftAssets({ ...draft, colourAssetId: null }), ['src']);
});
