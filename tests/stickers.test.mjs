import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCoverHtml } from '../lib/render/coverHtml.ts';
import { coverLayout } from '../lib/render/coverLayout.ts';
import {
  WARNING_TEXT,
  stickerBounds,
  stickerDpi,
  stickerWarnings,
} from '../lib/render/stickers.ts';
import { createColoringBook } from '../lib/projects.ts';
import { projectAssetIds } from '../lib/exportClient.ts';

const sticker = (over = {}) => ({
  id: 's1',
  assetId: 'a1',
  naturalWidth: 1200,
  naturalHeight: 1200,
  x: 9,
  y: 3,
  widthIn: 2,
  heightIn: 2,
  rotate: 0,
  cornerRadius: 0,
  border: null,
  shadow: false,
  name: 'Cat',
  ...over,
});

const book = (stickers = []) => {
  const b = createColoringBook('Ghosts');
  b.cover.stickers = stickers;
  return b;
};

const render = (b, assets = { a1: 'data:image/png;base64,AAA' }) =>
  buildCoverHtml(b, { pageCount: 52, fontStyle: '', guides: false, assets });

test('a sticker lands in the exported cover at the inches it was given', () => {
  const html = render(book([sticker()]));
  assert.ok(html.includes('data:image/png;base64,AAA'));
  const rule = html.match(/#cs0 \{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /left: 9in;/);
  assert.match(rule, /top: 3in;/);
  assert.match(rule, /width: 2in;/);
  assert.match(rule, /height: 2in;/);
});

test('stickers are drawn in array order, so the last one is on top', () => {
  const html = render(
    book([sticker({ id: 'a' }), sticker({ id: 'b', assetId: 'a2', name: 'Second' })]),
    { a1: 'data:image/png;base64,AAA', a2: 'data:image/png;base64,BBB' },
  );
  const body = html.slice(html.indexOf('<body>'));
  assert.ok(body.indexOf('AAA') < body.indexOf('BBB'), 'the second must be written after');
  // And text sits above every picture, so a title is never buried.
  assert.ok(body.indexOf('cover-sticker') < body.indexOf('cover-text') || !body.includes('cover-text'));
});

test('a sticker with no image is left out rather than drawn empty', () => {
  const body = render(book([sticker()]), {}).split('<body>')[1];
  assert.ok(!body.includes('cover-sticker'), 'an empty box would print as a border or a shadow');
});

test('rounding, borders and shadows only appear when asked for', () => {
  const plain = render(book([sticker()])).match(/#cs0 \{[^}]*\}/)[0];
  assert.ok(!plain.includes('border-radius'));
  assert.ok(!plain.includes('border:'));
  assert.ok(!plain.includes('box-shadow'));

  const dressed = render(
    book([sticker({ cornerRadius: 0.5, border: { widthPt: 2, color: '#112233' }, shadow: true })]),
  ).match(/#cs0 \{[^}]*\}/)[0];
  // Half the shorter side is a circle: a 2in square rounds by 1in.
  assert.match(dressed, /border-radius: 1\.0000in;/);
  assert.match(dressed, /border: 2pt solid #112233;/);
  assert.match(dressed, /box-shadow:/);
});

test('a sticker turns about its own centre, not its corner', () => {
  const upright = stickerBounds(sticker());
  const turned = stickerBounds(sticker({ rotate: 90 }));
  const centre = (r) => [r.x + r.width / 2, r.y + r.height / 2];
  assert.deepEqual(centre(turned).map(Math.round), centre(upright).map(Math.round));
});

test('a turned sticker is measured by the box that contains it', () => {
  // A 2 × 1 turned 90° occupies 1 × 2, and at 45° it covers more than either.
  const flat = stickerBounds(sticker({ widthIn: 2, heightIn: 1 }));
  assert.ok(Math.abs(flat.width - 2) < 1e-9 && Math.abs(flat.height - 1) < 1e-9);

  const right = stickerBounds(sticker({ widthIn: 2, heightIn: 1, rotate: 90 }));
  assert.ok(Math.abs(right.width - 1) < 1e-6 && Math.abs(right.height - 2) < 1e-6);

  const diagonal = stickerBounds(sticker({ widthIn: 2, heightIn: 1, rotate: 45 }));
  assert.ok(diagonal.width > 2 && diagonal.height > 1.4, 'a corner sticks out further');
});

test('resolution is judged by whichever way the picture is stretched further', () => {
  // A wide picture squeezed into a tall box is as soft as its worst axis.
  const squeezed = sticker({ naturalWidth: 2000, naturalHeight: 400, widthIn: 2, heightIn: 2 });
  assert.equal(stickerDpi(squeezed), 200);
  assert.equal(stickerDpi(sticker({ widthIn: 4, heightIn: 4 })), 300);
});

test('a sticker is told when it is soft, cut, folded or under the barcode', () => {
  const layout = coverLayout(createColoringBook(), 52);
  const { dimensions: d, folds, barcode } = layout;

  assert.deepEqual(stickerWarnings(sticker({ x: 10, y: 3 }), layout), []);

  const soft = sticker({ x: 10, y: 3, naturalWidth: 300, naturalHeight: 300 });
  assert.deepEqual(stickerWarnings(soft, layout), ['soft']);

  const offEdge = sticker({ x: -0.5, y: 3 });
  assert.ok(stickerWarnings(offEdge, layout).includes('off-the-trim'));

  const onFold = sticker({ x: folds[0] - 1, y: 3 });
  assert.ok(stickerWarnings(onFold, layout).includes('across-the-spine'));

  const onBarcode = sticker({ x: barcode.x, y: barcode.y });
  assert.ok(stickerWarnings(onBarcode, layout).includes('under-the-barcode'));

  // The bottom edge is as much an edge as the left one.
  const offBottom = sticker({ x: 10, y: d.height - d.bleed - 1 });
  assert.ok(stickerWarnings(offBottom, layout).includes('off-the-trim'));
});

test('every warning has something to say', () => {
  const layout = coverLayout(createColoringBook(), 52);
  const all = stickerWarnings(sticker({ x: -1, y: -1, naturalWidth: 10, naturalHeight: 10 }), layout);
  assert.ok(all.length >= 2);
  for (const warning of all) assert.ok(WARNING_TEXT[warning]?.length > 10, warning);
});

test('sticker images travel with the book, or the export loses them', () => {
  const b = book([sticker({ assetId: 'sticker_asset' })]);
  assert.ok(projectAssetIds(b).includes('sticker_asset'));
});

test('a cover saved before stickers existed still opens', async () => {
  const { migrateProject } = await import('../lib/projects.ts');
  const b = createColoringBook();
  delete b.cover.stickers;
  assert.deepEqual(migrateProject(b).cover.stickers, []);
});

// --- moving things about ------------------------------------------------------

import {
  SNAP_DISTANCE,
  angleTo,
  resizeFromCorner,
  restack,
  snapAngle,
  snapLines,
  snapMove,
} from '../lib/cover/stickerEdit.ts';

const layoutOf = () => coverLayout(createColoringBook(), 52);

test('a sticker catches on the cover centre and on the spine folds', () => {
  const layout = layoutOf();
  const lines = snapLines(layout, []);
  const fold = layout.folds[0];

  const near = sticker({ x: fold - 0.03, y: 3 });
  const moved = snapMove(near, lines);
  assert.ok(Math.abs(moved.x - fold) < 1e-9, 'its left edge should land on the fold');
  assert.ok(moved.guides.some((g) => g.axis === 'x' && Math.abs(g.at - fold) < 1e-9));
});

test('nothing catches from further away than the snap distance', () => {
  const lines = snapLines(layoutOf(), []);
  const far = sticker({ x: 5.31, y: 3.17 });
  const moved = snapMove(far, lines, SNAP_DISTANCE);
  assert.equal(moved.x, far.x);
  assert.equal(moved.y, far.y);
  assert.deepEqual(moved.guides, []);
});

test('the two axes snap independently, so one can line up without the other', () => {
  const layout = layoutOf();
  const lines = snapLines(layout, []);
  const middle = layout.dimensions.height / 2;
  // Vertically almost centred, horizontally nowhere near anything.
  const s = sticker({ x: 5.37, y: middle - 1 - 0.02 });
  const moved = snapMove(s, lines);
  assert.equal(moved.x, s.x, 'x had nothing to catch on');
  assert.ok(Math.abs(moved.y + 1 - middle) < 1e-9, 'y centred itself');
});

test('stickers line up with each other, which is what makes a row of badges', () => {
  const first = sticker({ id: 'a', x: 4, y: 2 });
  const lines = snapLines(layoutOf(), [first]);
  const second = sticker({ id: 'b', x: 8, y: 2.04 });
  const moved = snapMove(second, lines);
  assert.ok(Math.abs(moved.y - 2) < 1e-9, 'their tops should line up');
});

test('resizing from a corner leaves the opposite corner where it was', () => {
  const s = sticker({ x: 4, y: 2, widthIn: 2, heightIn: 2 });
  for (const corner of ['nw', 'ne', 'se', 'sw']) {
    const out = resizeFromCorner(s, corner, 0.5, 0.5, { free: true });
    const anchored = {
      nw: [s.x + s.widthIn, s.y + s.heightIn],
      ne: [s.x, s.y + s.heightIn],
      se: [s.x, s.y],
      sw: [s.x + s.widthIn, s.y],
    }[corner];
    const now = {
      nw: [out.x + out.widthIn, out.y + out.heightIn],
      ne: [out.x, out.y + out.heightIn],
      se: [out.x, out.y],
      sw: [out.x + out.widthIn, out.y],
    }[corner];
    assert.ok(Math.abs(now[0] - anchored[0]) < 1e-9, `${corner} x drifted`);
    assert.ok(Math.abs(now[1] - anchored[1]) < 1e-9, `${corner} y drifted`);
  }
});

test('resizing keeps the proportions unless it is told not to', () => {
  const s = sticker({ widthIn: 2, heightIn: 1 });
  const locked = resizeFromCorner(s, 'se', 1, 0.05);
  assert.ok(Math.abs(locked.widthIn / locked.heightIn - 2) < 1e-9, 'it should stay twice as wide');

  const free = resizeFromCorner(s, 'se', 1, 0.05, { free: true });
  assert.ok(Math.abs(free.widthIn - 3) < 1e-9);
  assert.ok(Math.abs(free.heightIn - 1.05) < 1e-9);
});

test('a locked resize follows whichever way the hand actually moved', () => {
  const s = sticker({ widthIn: 2, heightIn: 1 });
  // Mostly downwards: the height leads and the width follows.
  const tall = resizeFromCorner(s, 'se', 0.05, 1);
  assert.ok(Math.abs(tall.heightIn - 2) < 1e-9);
  assert.ok(Math.abs(tall.widthIn - 4) < 1e-9);
});

test('a sticker cannot be dragged smaller than nothing', () => {
  const s = sticker({ widthIn: 2, heightIn: 2 });
  const out = resizeFromCorner(s, 'se', -10, -10, { free: true, minimum: 0.2 });
  assert.equal(out.widthIn, 0.2);
  assert.equal(out.heightIn, 0.2);
});

test('the angle to a point is measured from up, clockwise', () => {
  const s = sticker({ x: 0, y: 0, widthIn: 2, heightIn: 2 });
  assert.equal(Math.round(angleTo(s, 1, -5)), 0, 'straight up');
  assert.equal(Math.round(angleTo(s, 5, 1)), 90, 'to the right');
  assert.equal(Math.round(angleTo(s, 1, 5)), 180, 'straight down');
});

test('rotation catches on the twelfths of a turn but not from far off', () => {
  assert.equal(snapAngle(88), 90);
  assert.equal(snapAngle(2), 0);
  assert.equal(snapAngle(44), 45);
  assert.equal(snapAngle(37), 37, 'seven degrees away is a choice, not a miss');
});

test('restacking moves one place and refuses to fall off either end', () => {
  const list = [sticker({ id: 'a' }), sticker({ id: 'b' }), sticker({ id: 'c' })];
  assert.deepEqual(restack(list, 'a', 1).map((s) => s.id), ['b', 'a', 'c']);
  assert.deepEqual(restack(list, 'c', -1).map((s) => s.id), ['a', 'c', 'b']);
  assert.deepEqual(restack(list, 'a', -1).map((s) => s.id), ['a', 'b', 'c']);
  assert.deepEqual(restack(list, 'c', 1).map((s) => s.id), ['a', 'b', 'c']);
  assert.deepEqual(restack(list, 'nope', 1).map((s) => s.id), ['a', 'b', 'c']);
});

// --- the library --------------------------------------------------------------

import { allTags, parseTags, searchStickers } from '../lib/cover/library.ts';

const lib = (name, tags = []) => ({
  id: name,
  name,
  tags,
  assetId: 'a_' + name,
  width: 800,
  height: 800,
  createdAt: 1,
});

test('search looks at names and tags together', () => {
  const all = [lib('Tabby', ['cats']), lib('Daisy', ['flowers']), lib('Gold star', ['badges'])];
  // Nobody remembers which of the two they used, so both have to match.
  assert.deepEqual(searchStickers(all, 'tab', null).map((s) => s.name), ['Tabby']);
  assert.deepEqual(searchStickers(all, 'cats', null).map((s) => s.name), ['Tabby']);
  assert.deepEqual(searchStickers(all, '', null).length, 3);
});

test('a tag narrows the tray, and a search narrows it further', () => {
  const all = [lib('Tabby', ['cats']), lib('Ginger', ['cats']), lib('Daisy', ['flowers'])];
  assert.equal(searchStickers(all, '', 'cats').length, 2);
  assert.deepEqual(searchStickers(all, 'ging', 'cats').map((s) => s.name), ['Ginger']);
  assert.equal(searchStickers(all, 'ging', 'flowers').length, 0);
});

test('tags are offered most-used first, so the common ones are to hand', () => {
  const all = [lib('a', ['cats']), lib('b', ['cats', 'badges']), lib('c', ['flowers'])];
  assert.deepEqual(allTags(all), ['cats', 'badges', 'flowers']);
});

test('typing tags is forgiving about commas, spaces, case and repeats', () => {
  assert.deepEqual(parseTags('Cats, flowers  cats'), ['cats', 'flowers']);
  assert.deepEqual(parseTags('   '), []);
  assert.deepEqual(parseTags('Badges'), ['badges']);
});
