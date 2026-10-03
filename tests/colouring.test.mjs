import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import {
  COLOURING_DEFAULTS,
  colouringPage,
  labelRegions,
  mergeSmall,
  outline,
  quantise,
  resolveColouring,
  runColouring,
} from '../lib/lineart/colouring.ts';
import { INK, PAPER, toLab } from '../lib/lineart/pipeline.ts';

/**
 * Colouring page mode.
 *
 * The test that matters is the last group: a colouring page with a gap in it is
 * not a colouring page, so every white area of a finished page is filled and
 * checked to lie inside exactly one region. The rest is here to make sure the
 * regions it is checking are worth having.
 */

/** A deterministic pseudo-random, so "noisy" means the same noise every run. */
function noise(seed = 1) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
}

/** Flat panels of known colours, with grain, and one small speck. */
function panels(width = 160, height = 120, grain = 10) {
  const rnd = noise(5);
  const data = new Uint8ClampedArray(width * height * 4);
  const colours = [
    [220, 60, 60],
    [60, 160, 90],
    [70, 90, 200],
    [240, 230, 120],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const panel = (x < width / 2 ? 0 : 1) + (y < height / 2 ? 0 : 2);
      const [r, g, b] = colours[panel];
      const n = rnd() * grain * 2;
      const i = (y * width + x) * 4;
      data[i] = r + n;
      data[i + 1] = g + n;
      data[i + 2] = b + n;
      data[i + 3] = 255;
    }
  }
  // A three-pixel speck, far too small to be worth colouring in.
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
    const i = ((30 + dy) * width + 30 + dx) * 4;
    data[i] = 10; data[i + 1] = 10; data[i + 2] = 10;
  }
  return { width, height, data };
}

const hash = (g) =>
  createHash('sha256')
    .update(Buffer.from(g.data.buffer, g.data.byteOffset, g.data.length))
    .digest('hex')
    .slice(0, 16);

/* ------------------------------------------------------------- quantising */

test('quantising is the same every run', () => {
  const lab = toLab(panels(), false);
  const a = quantise(lab, 6, 12);
  const b = quantise(lab, 6, 12);
  assert.deepEqual([...a.labels], [...b.labels]);
  assert.deepEqual([...a.l], [...b.l]);
});

test('quantising four flat panels finds four colours', () => {
  const lab = toLab(panels(), false);
  const { labels } = quantise(lab, 4, 12);
  const used = new Set(labels);
  assert.equal(used.size, 4, `found ${used.size}`);
  // And each panel is one of them, rather than the four being split across the
  // grain: count the commonest label in each quarter and check it dominates.
  for (const [x0, y0] of [[10, 10], [90, 10], [10, 70], [90, 70]]) {
    const counts = new Map();
    for (let y = y0; y < y0 + 40; y++) {
      for (let x = x0; x < x0 + 60; x++) {
        const l = labels[y * 160 + x];
        counts.set(l, (counts.get(l) ?? 0) + 1);
      }
    }
    const best = Math.max(...counts.values());
    assert.ok(best > 40 * 60 * 0.95, `the panel at ${x0},${y0} was split`);
  }
});

test('more complexity asks for more colours, and a bigger minimum eats more', () => {
  const at = (field, v) => resolveColouring({ ...COLOURING_DEFAULTS, [field]: v }, 1e6);
  assert.ok(at('complexity', 100).colours > at('complexity', 0).colours);
  assert.ok(at('minRegion', 100).minArea > at('minRegion', 0).minArea);
  assert.ok(at('thickness', 100).thicken > at('thickness', 10).thicken);
  // Every slider distinguishable across its travel.
  for (const [field, read] of [
    ['complexity', (p) => p.colours],
    ['minRegion', (p) => p.minArea],
  ]) {
    const seen = new Set([0, 25, 50, 75, 100].map((v) => read(at(field, v))));
    assert.ok(seen.size >= 4, `${field} has only ${seen.size} settings`);
  }
});

test('the smallest area is a share of the picture, not a count of pixels', () => {
  const small = resolveColouring(COLOURING_DEFAULTS, 500 * 400);
  const big = resolveColouring(COLOURING_DEFAULTS, 2000 * 1600);
  assert.ok(big.minArea > small.minArea * 3, `${small.minArea} vs ${big.minArea}`);
});

/* --------------------------------------------------------------- regions */

test('two patches of one colour that do not touch are two regions', () => {
  // A stripe of 1s down the middle, 0 either side: three regions, not two.
  const width = 9;
  const height = 3;
  const labels = new Int32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 3; x < 6; x++) labels[y * width + x] = 1;
  const regions = labelRegions(labels, width, height);
  assert.equal(regions.sizes.length, 3);
  assert.deepEqual([...regions.sizes].sort((a, b) => a - b), [9, 9, 9]);
});

test('labelling accounts for every pixel exactly once', () => {
  const lab = toLab(panels(), false);
  const { labels } = quantise(lab, 6, 12);
  const regions = labelRegions(labels, 160, 120);
  let total = 0;
  for (const n of regions.sizes) total += n;
  assert.equal(total, 160 * 120);
  for (const id of regions.ids) assert.ok(id >= 0 && id < regions.sizes.length);
});

test('merging absorbs the slivers and loses no pixels', () => {
  const picture = panels();
  const lab = toLab(picture, false);
  const quantised = quantise(lab, 6, 12);
  const before = labelRegions(quantised.labels, 160, 120);
  const after = mergeSmall(before, quantised, 200);

  assert.ok(after.sizes.length < before.sizes.length, 'nothing was merged');
  for (const size of after.sizes) {
    assert.ok(size >= 200 || after.sizes.length === 1, `a region of ${size} survived`);
  }
  let total = 0;
  for (const n of after.sizes) total += n;
  assert.equal(total, 160 * 120, 'pixels went missing');
});

test('merging is repeated until nothing moves, not done once', () => {
  // A row of ever-smaller slivers: one pass leaves a tide line of leftovers,
  // because a sliver whose only neighbours are slivers cannot go anywhere yet.
  const width = 64;
  const height = 8;
  const labels = new Int32Array(width * height);
  let colour = 0;
  for (let x = 0; x < width; x += 2) {
    for (let y = 0; y < height; y++) {
      labels[y * width + x] = colour;
      if (x + 1 < width) labels[y * width + x + 1] = colour;
    }
    colour = (colour + 1) % 5;
  }
  const regions = labelRegions(labels, width, height);
  const quantised = { labels, l: new Float32Array(5), a: new Float32Array(5), b: new Float32Array(5) };
  for (let c = 0; c < 5; c++) quantised.l[c] = c * 20;
  const merged = mergeSmall(regions, quantised, 100);
  for (const size of merged.sizes) {
    assert.ok(size >= 100 || merged.sizes.length === 1, `a region of ${size} survived`);
  }
});

/* ------------------------------------------------------- the one guarantee */

/**
 * Every white area of the page, four-connected.
 *
 * Deliberately the same traversal a fill tool uses, rather than anything that
 * knows about regions: the question is whether a person tapping the bucket can
 * get from one area into another.
 */
function paperAreas(page) {
  const { width, height, data } = page;
  const area = new Int32Array(width * height).fill(-1);
  const areas = [];
  const stack = [];
  for (let start = 0; start < data.length; start++) {
    if (data[start] === INK || area[start] !== -1) continue;
    const id = areas.length;
    const members = [];
    area[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop();
      members.push(i);
      const x = i % width;
      const y = (i / width) | 0;
      if (x > 0) step(i - 1);
      if (x < width - 1) step(i + 1);
      if (y > 0) step(i - width);
      if (y < height - 1) step(i + width);
    }
    areas.push(members);

    function step(j) {
      if (area[j] === -1 && data[j] !== INK) {
        area[j] = id;
        stack.push(j);
      }
    }
  }
  return areas;
}

test('a fill started anywhere never leaks into another region', () => {
  // The promise the whole mode rests on, on a real picture rather than a
  // contrived one, at three settings including the busiest.
  for (const complexity of [15, 45, 85]) {
    const { page, regions } = colouringPage(panels(220, 170, 14), {
      ...COLOURING_DEFAULTS,
      complexity,
    });
    const areas = paperAreas(page);
    assert.ok(areas.length > 3, `complexity ${complexity}: only ${areas.length} areas to colour`);
    for (const members of areas) {
      const first = regions.ids[members[0]];
      for (const i of members) {
        assert.equal(
          regions.ids[i],
          first,
          `complexity ${complexity}: a fill crossed from region ${first} into ${regions.ids[i]}`,
        );
      }
    }
  }
});

test('the outline seals the edges of the page', () => {
  // Without this a fill in a region that reaches the edge escapes round the
  // outside of the picture and into everything else that touches it.
  const width = 12;
  const height = 9;
  const ids = new Int32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) ids[y * width + x] = x < 6 ? 0 : 1;
  const page = outline({ width, height, ids, sizes: new Int32Array([54, 54]), colour: new Int32Array(2) });
  for (let y = 0; y < height; y++) assert.equal(page.data[y * width + width - 1], INK, `row ${y}`);
  for (let x = 0; x < width; x++) assert.equal(page.data[(height - 1) * width + x], INK, `column ${x}`);
  assert.equal(paperAreas(page).length, 2, 'the two halves are not separate');
});

test('a thicker line cannot open a closed one', () => {
  // Thickening is a minimum filter: it only ever turns paper into ink, so it
  // can close a gap and never open one. Stated because the opposite would be a
  // very quiet way to break the guarantee.
  const picture = panels(180, 140, 14);
  for (const thickness of [0, 20, 60, 100]) {
    const { page, regions } = colouringPage(picture, { ...COLOURING_DEFAULTS, thickness });
    for (const members of paperAreas(page)) {
      const first = regions.ids[members[0]];
      for (const i of members) assert.equal(regions.ids[i], first, `thickness ${thickness}`);
    }
  }
});

/* ------------------------------------------------------------------ whole */

test('a colouring page is ink on paper and nothing in between', () => {
  // It feeds the existing colouring tools, which expect two values.
  const page = runColouring(panels(), COLOURING_DEFAULTS);
  for (const v of page.data) assert.ok(v === INK || v === PAPER, `found ${v}`);
});

test('more complexity puts more line on the page', () => {
  const picture = panels(200, 150, 12);
  const ink = (g) => { let n = 0; for (const v of g.data) if (v === INK) n += 1; return n; };
  const simple = ink(runColouring(picture, { ...COLOURING_DEFAULTS, complexity: 10 }));
  const busy = ink(runColouring(picture, { ...COLOURING_DEFAULTS, complexity: 90 }));
  assert.ok(busy > simple, `${simple} -> ${busy}`);
});

test('the same picture gives the same page, every time', () => {
  const picture = panels();
  assert.equal(
    hash(runColouring(picture, COLOURING_DEFAULTS)),
    hash(runColouring(picture, COLOURING_DEFAULTS)),
  );
});

const FIXTURE = '872b667395345acf';

test('the fixture still holds', () => {
  assert.equal(hash(runColouring(panels(), COLOURING_DEFAULTS)), FIXTURE);
});
