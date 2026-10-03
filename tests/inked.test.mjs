import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  INKED_DEFAULTS,
  chaikin,
  joinGaps,
  pathLength,
  pruneSkeleton,
  renderStrokes,
  resolveInked,
  runInked,
  runInkedSvg,
  skeletonise,
  strokesFrom,
  strokesToSvg,
  trace,
} from '../lib/lineart/inked.ts';
import { INK, PAPER } from '../lib/lineart/pipeline.ts';

/** A mask with ink where `fn` says so. */
const mask = (width, height, fn) => {
  const data = new Uint8ClampedArray(width * height).fill(PAPER);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (fn(x, y)) data[y * width + x] = INK;
  return { width, height, data };
};
const litCount = (g) => { let n = 0; for (const v of g.data) if (v < 128) n += 1; return n; };
const hash = (g) =>
  createHash('sha256').update(Buffer.from(g.data.buffer, g.data.byteOffset, g.data.length)).digest('hex').slice(0, 16);

/* -------------------------------------------------------------- skeleton */

test('a thick line is thinned to one pixel, and stays one line', () => {
  const thick = mask(40, 15, (x, y) => y >= 5 && y <= 9 && x >= 4 && x <= 35);
  const thin = skeletonise(thick);
  // Nowhere more than one pixel thick.
  const columns = [];
  for (let x = 0; x < 40; x += 1) {
    let count = 0;
    for (let y = 0; y < 15; y += 1) if (thin.data[y * 40 + x] < 128) count += 1;
    assert.ok(count <= 1, `column ${x} is still ${count} pixels thick`);
    if (count) columns.push(x);
  }
  // The ends pull in by about half the original thickness, which is what
  // thinning a blunt-ended bar does and not a fault: measured, a bar from 4 to
  // 35 thins to 6 to 32. What matters is that nearly all of it is still there.
  assert.ok(columns.length > 24, `only ${columns.length} columns left of 32`);
  assert.equal(columns[columns.length - 1] - columns[0], columns.length - 1, 'the line has holes');
  assert.ok(litCount(thin) < litCount(thick) / 3, 'barely anything was removed');
});

test('thinning keeps a ring a ring rather than eroding it away', () => {
  // The difference between thinning and erosion: an erosion of a ring is
  // eventually nothing, and a thinning of it is still a ring.
  const ring = mask(60, 60, (x, y) => {
    const d = Math.hypot(x - 30, y - 30);
    return d > 16 && d < 22;
  });
  assert.ok(litCount(skeletonise(ring)) > 90, 'the ring was eaten');
  // Through the whole chain, because the raw skeleton of a ring is full of
  // little junctions and tracing alone shatters it into thirty-odd fragments.
  // Putting it back together is what the tidying is for, so that is what is
  // measured: one stroke going most of the way round.
  const strokes = strokesFrom(ring, { ...INKED_DEFAULTS, wobble: 0 });
  const longest = Math.max(...strokes.map((one) => pathLength(one.points)));
  assert.ok(longest > 90, `the ring came out in pieces: longest ${longest.toFixed(1)} of about 120`);
});

/* --------------------------------------------------------------- tracing */

test('a straight line traces to one path', () => {
  const paths = trace(mask(30, 7, (x, y) => y === 3 && x >= 3 && x <= 26));
  assert.equal(paths.length, 1);
  assert.equal(paths[0].length, 24);
});

test('a cross is cut apart at the junction, into four arms', () => {
  // Not one path wandering through the crossing and out the far side: that is
  // what cutting at junctions prevents.
  //
  // Four arms, and some two-pixel offcuts with them. Those are not a fault:
  // the walk is eight-connected, so the pixel above the centre of a one-pixel
  // cross touches the centre AND both of its horizontal neighbours, which
  // makes a little cluster of high-degree pixels rather than one junction.
  // The offcuts are shorter than any length filter keeps.
  const cross = mask(21, 21, (x, y) => (y === 10 && x >= 2 && x <= 18) || (x === 10 && y >= 2 && y <= 18));
  const paths = trace(cross);
  const arms = paths.filter((one) => pathLength(one) >= 6);
  assert.equal(arms.length, 4, `got ${arms.length} arms from ${paths.length} paths`);
  for (const one of paths) assert.ok(pathLength(one) >= 6 || one.length <= 2, 'an odd middling piece');
});

test('a diagonal is followed, not read as a row of dots', () => {
  // Eight-connected, because a thinned diagonal IS a chain of diagonal touches.
  const paths = trace(mask(20, 20, (x, y) => x === y && x >= 2 && x <= 17));
  assert.equal(paths.length, 1);
  assert.equal(paths[0].length, 16);
});

/* ---------------------------------------------------------------- tidying */

test('a barb hanging off a line is rubbed out, and the line is not', () => {
  const barbed = mask(40, 20, (x, y) => (y === 10 && x >= 2 && x <= 37) || (x === 20 && y >= 7 && y <= 10));
  const tidy = pruneSkeleton(barbed, 9);
  for (let y = 7; y < 10; y += 1) assert.equal(tidy.data[y * 40 + 20], PAPER, `the barb survived at y=${y}`);
  for (let x = 2; x <= 37; x += 1) assert.equal(tidy.data[10 * 40 + x], INK, `the line was cut at x=${x}`);
});

test('two pieces of one line are joined back together', () => {
  const a = Array.from({ length: 12 }, (_, i) => ({ x: i, y: 5 }));
  const b = Array.from({ length: 12 }, (_, i) => ({ x: i + 15, y: 5 }));
  const joined = joinGaps([a, b], 5);
  assert.equal(joined.length, 1, 'they were left apart');
  assert.equal(joined[0].length, 24);
});

test('two things that merely pass close by are left alone', () => {
  // Ends three pixels apart but pointing across each other: two corners, not
  // one line, and bridging them would draw something nobody photographed.
  const a = Array.from({ length: 12 }, (_, i) => ({ x: i, y: 5 }));
  const b = Array.from({ length: 12 }, (_, i) => ({ x: 14, y: 5 + i }));
  assert.equal(joinGaps([a, b], 5).length, 2);
});

test('two arcs that meet exactly at a junction are joined', () => {
  // The regression this function exists for. Thinning leaves little loops, and
  // every one is a junction; tracing cuts there, so a smooth circle came out as
  // four arcs with the short bits between them dropped. The arcs meet at the
  // junction, so the gap is ZERO — which the first version skipped outright.
  const a = Array.from({ length: 14 }, (_, i) => ({ x: i, y: 5 }));
  const b = Array.from({ length: 14 }, (_, i) => ({ x: 13 + i, y: 5 }));
  const joined = joinGaps([a, b], 5);
  assert.equal(joined.length, 1, 'a zero-length gap was not closed');
});

test('a join is found whichever way round the two paths were traced', () => {
  // A path traced outwards from a junction may run either way, so all four
  // pairings of the two ends have to be tried.
  const a = Array.from({ length: 12 }, (_, i) => ({ x: i, y: 5 }));
  const reversed = Array.from({ length: 12 }, (_, i) => ({ x: 26 - i, y: 5 }));
  assert.equal(joinGaps([a, reversed], 5).length, 1, 'end-to-end was missed');
  const backwards = Array.from({ length: 12 }, (_, i) => ({ x: 11 - i, y: 5 }));
  assert.equal(joinGaps([backwards, reversed], 5).length, 1, 'start-to-start was missed');
});

test('rounding the corners keeps both ends exactly where they were', () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  const smooth = chaikin(points, 2);
  assert.deepEqual(smooth[0], { x: 0, y: 0 });
  assert.deepEqual(smooth[smooth.length - 1], { x: 10, y: 10 });
  assert.ok(smooth.length > points.length);
  // The corner is cut, so the path is shorter than going round the elbow.
  assert.ok(pathLength(smooth) < pathLength(points));
});

/* --------------------------------------------------------------- strokes */

test('the sliders run the way their labels say', () => {
  const at = (field, v) => resolveInked({ ...INKED_DEFAULTS, [field]: v });
  assert.ok(at('thickness', 100).radius > at('thickness', 0).radius);
  assert.ok(at('taper', 100).taperTo < at('taper', 0).taperTo);
  assert.ok(at('wobble', 100).wobbleAmount > at('wobble', 0).wobbleAmount);
  // More detail keeps shorter strokes.
  assert.ok(at('detail', 100).minLength < at('detail', 0).minLength);
  for (const [field, read] of [
    ['thickness', (p) => p.radius],
    ['taper', (p) => p.taperTo],
    ['wobble', (p) => p.wobbleAmount],
    ['detail', (p) => p.minLength],
  ]) {
    const seen = new Set([0, 25, 50, 75, 100].map((v) => read(at(field, v)).toFixed(4)));
    assert.ok(seen.size >= 4, `${field} has only ${seen.size} settings`);
  }
});

test('turning the taper up thins the ends and leaves the middle', () => {
  const line = mask(120, 21, (x, y) => y >= 9 && y <= 11 && x >= 8 && x <= 111);
  const [flat] = strokesFrom(line, { ...INKED_DEFAULTS, taper: 0, wobble: 0 });
  const [tapered] = strokesFrom(line, { ...INKED_DEFAULTS, taper: 100, wobble: 0 });
  const middle = (s) => s.widths[Math.floor(s.widths.length / 2)];
  assert.ok(Math.abs(middle(flat) - middle(tapered)) < 0.01, 'the middle changed');
  assert.ok(tapered.widths[0] < flat.widths[0] * 0.5, 'the end did not thin');
});

test('the wobble is the same wobble every time', () => {
  const line = mask(120, 21, (x, y) => y >= 9 && y <= 11 && x >= 8 && x <= 111);
  const settings = { ...INKED_DEFAULTS, wobble: 90 };
  const a = strokesFrom(line, settings)[0];
  const b = strokesFrom(line, settings)[0];
  assert.deepEqual(a.points, b.points);
});

test('the wobble moves the line across itself, not along it', () => {
  // Pushing a point along its own direction bunches the samples up instead of
  // moving the line, which is a different and much worse-looking artefact.
  const line = mask(140, 21, (x, y) => y >= 9 && y <= 11 && x >= 8 && x <= 131);
  const [straight] = strokesFrom(line, { ...INKED_DEFAULTS, wobble: 0 });
  const [wobbly] = strokesFrom(line, { ...INKED_DEFAULTS, wobble: 100 });
  assert.equal(straight.points.length, wobbly.points.length);
  let acrossMoved = 0;
  let alongMoved = 0;
  for (let i = 0; i < straight.points.length; i++) {
    alongMoved = Math.max(alongMoved, Math.abs(wobbly.points[i].x - straight.points[i].x));
    acrossMoved = Math.max(acrossMoved, Math.abs(wobbly.points[i].y - straight.points[i].y));
  }
  assert.ok(acrossMoved > 0.5, `it did not wobble: ${acrossMoved.toFixed(2)}`);
  assert.ok(alongMoved < acrossMoved * 0.2, `it moved along the line by ${alongMoved.toFixed(2)}`);
});

test('nothing in this file reads a clock or a random number', () => {
  // Comments stripped first: this file explains at length that it does not use
  // a random number, and a check that reads prose cannot tell the explanation
  // from the thing it is warning about.
  const source = readFileSync(new URL('../lib/lineart/inked.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');
  for (const forbidden of ['Math.random', 'Date.now', 'new Date', 'performance.now']) {
    assert.ok(!source.includes(forbidden), `it uses ${forbidden}`);
  }
});

/* ------------------------------------------------------------------- svg */

test('the svg is one path per stroke, and every path is closed', () => {
  const line = mask(120, 60, (x, y) => (y >= 9 && y <= 11 && x >= 8 && x <= 111) || (x >= 40 && x <= 42 && y >= 20 && y <= 55));
  const strokes = strokesFrom(line, INKED_DEFAULTS);
  const svg = strokesToSvg(strokes, 120, 60);
  const paths = svg.match(/<path d="[^"]+"\/>/g) ?? [];
  assert.equal(paths.length, strokes.length, `${strokes.length} strokes but ${paths.length} paths`);
  for (const path of paths) {
    const d = path.slice(path.indexOf('"') + 1, path.lastIndexOf('"'));
    assert.ok(d.startsWith('M '), 'does not start with a move');
    assert.ok(d.endsWith(' Z'), 'is not closed');
    // Two arcs: one cap at each end. A stroke whose width varies cannot be an
    // SVG stroke-width, so it is drawn as its own outline.
    assert.equal((d.match(/ A /g) ?? []).length, 2, 'wrong number of caps');
    assert.ok(!/NaN|Infinity|undefined/.test(d), `bad number in ${d.slice(0, 80)}`);
  }
});

test('the svg says the size of the picture it came from', () => {
  const svg = runInkedSvg(mask(90, 40, (x, y) => y === 20 && x > 5 && x < 80), INKED_DEFAULTS);
  assert.ok(svg.includes('viewBox="0 0 90 40"'), svg.slice(0, 120));
  assert.ok(svg.includes('width="90"') && svg.includes('height="40"'));
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
});

test('the svg and the pixels are drawn from the same strokes', () => {
  // Not "they look similar": one list of points and widths feeds both, so the
  // shapes and where they sit have to agree. The outline is offset by the
  // half-width, so it may stand off the stroke by that much and no more.
  const picture = mask(140, 90, (x, y) => (y >= 20 && y <= 22 && x >= 10 && x <= 130) || (x >= 60 && x <= 62 && y >= 30 && y <= 80));
  const strokes = strokesFrom(picture, INKED_DEFAULTS);
  const svg = strokesToSvg(strokes, 140, 90);
  assert.ok(strokes.length > 0);
  assert.equal((svg.match(/<path/g) ?? []).length, strokes.length);

  const widest = Math.max(...strokes.flatMap((one) => one.widths));
  const bounds = {
    x0: Math.min(...strokes.flatMap((one) => one.points.map((q) => q.x))) - widest - 0.5,
    x1: Math.max(...strokes.flatMap((one) => one.points.map((q) => q.x))) + widest + 0.5,
    y0: Math.min(...strokes.flatMap((one) => one.points.map((q) => q.y))) - widest - 0.5,
    y1: Math.max(...strokes.flatMap((one) => one.points.map((q) => q.y))) + widest + 0.5,
  };
  for (const d of svg.match(/<path d="([^"]+)"/g) ?? []) {
    for (const [, x, y] of d.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)) {
      assert.ok(Number(x) >= bounds.x0 && Number(x) <= bounds.x1, `x ${x} outside the strokes`);
      assert.ok(Number(y) >= bounds.y0 && Number(y) <= bounds.y1, `y ${y} outside the strokes`);
    }
  }
});

/* ----------------------------------------------------------------- whole */

test('a heavier pen puts more ink down', () => {
  const picture = mask(140, 90, (x, y) => (y >= 20 && y <= 22 && x >= 10 && x <= 130) || (x >= 60 && x <= 62 && y >= 30 && y <= 80));
  const light = litCount(runInked(picture, { ...INKED_DEFAULTS, thickness: 5 }));
  const heavy = litCount(runInked(picture, { ...INKED_DEFAULTS, thickness: 95 }));
  assert.ok(heavy > light * 1.5, `${light} -> ${heavy}`);
});

test('the strokes have round ends rather than square ones', () => {
  // Discs are stamped at every sample, so the end of a stroke is a half-circle.
  // A square end would put ink in the corner of the end's bounding box; a round
  // one leaves that corner clear while still bulging a full radius along the
  // line's own direction.
  const line = mask(100, 40, (x, y) => y === 20 && x >= 20 && x <= 79);
  const drawn = renderStrokes(
    strokesFrom(line, { ...INKED_DEFAULTS, taper: 0, wobble: 0, thickness: 100 }),
    100,
    40,
  );
  const r = resolveInked({ ...INKED_DEFAULTS, thickness: 100 }).radius;
  const strokes = strokesFrom(line, { ...INKED_DEFAULTS, taper: 0, wobble: 0, thickness: 100 });
  const end = strokes[0].points[0];
  const at = (x, y) => drawn.data[Math.round(y) * 100 + Math.round(x)];
  assert.ok(at(end.x, end.y) < 128, 'the end of the line is not drawn');
  // A full radius along the line, past where the samples stop: the cap.
  assert.ok(at(end.x - r + 0.6, end.y) < 200, 'the cap does not reach past the last sample');
  // And the corner at a radius in both directions, which is a radius times the
  // square root of two away and so outside any circle of that radius.
  assert.equal(at(end.x - r - 0.5, end.y - r - 0.5), PAPER, 'the end is square, not round');
});

test('the same mask gives the same drawing, every time', () => {
  const picture = mask(140, 90, (x, y) => (y >= 20 && y <= 22 && x >= 10 && x <= 130) || (x >= 60 && x <= 62 && y >= 30 && y <= 80));
  assert.equal(hash(runInked(picture, INKED_DEFAULTS)), hash(runInked(picture, INKED_DEFAULTS)));
  assert.equal(runInkedSvg(picture, INKED_DEFAULTS), runInkedSvg(picture, INKED_DEFAULTS));
});

const FIXTURE = '5972a02a9e7221b5';

test('the fixture still holds', () => {
  const picture = mask(140, 90, (x, y) => (y >= 20 && y <= 22 && x >= 10 && x <= 130) || (x >= 60 && x <= 62 && y >= 30 && y <= 80));
  assert.equal(hash(runInked(picture, INKED_DEFAULTS)), FIXTURE);
});
