import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  CLASSIC_LOOKS,
  CLASSIC_WORKING_EDGE,
  deSpeckle,
  thicken,
  dogAcross,
  gaussian,
  resolveClassic,
  runClassic,
  settingsFor,
  smoothAlong,
  softThreshold,
  tangentFlow,
  toField,
} from '../lib/lineart/xdog.ts';
import { INK, PAPER, toGray } from '../lib/lineart/pipeline.ts';

/**
 * The classic engine.
 *
 * The thing being guarded is that this path never changes by accident: it is
 * the one that works offline, on any machine, with no model, and the whole
 * promise of it is that the same picture gives the same drawing. So as well as
 * the behaviour tests there are pixel hashes, which fail the moment a constant
 * moves — including a constant somebody moved on purpose and meant to tell
 * everyone about.
 */

/* ------------------------------------------------------------- a test card */

/**
 * A picture with a bit of everything, built from arithmetic so it is the same
 * in every run on every machine: a dark disc, a diagonal bar, a thin line, a
 * smooth corner-to-corner ramp, and a patch of fine checks that a detail
 * slider should be able to keep or throw away.
 */
function testCard(width = 320, height = 320) {
  const data = new Uint8ClampedArray(width * height * 4);
  const cx = width * 0.36;
  const cy = height * 0.4;
  const r = Math.min(width, height) * 0.22;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // A gentle ramp, so nothing is flat.
      let v = 210 - (x / width) * 40 - (y / height) * 25;
      // The disc.
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) v = 70;
      // A diagonal bar a few pixels wide.
      if (Math.abs(x - y - width * 0.22) < width * 0.035) v = 40;
      // One thin line, one pixel of it, to catch a thinning bug.
      if (y === Math.round(height * 0.82)) v = 30;
      // Fine checks in a corner. The cell is a share of the picture, not a
      // fixed two pixels: the card has to be the SAME SCENE at any size, or
      // the size tests below are measuring the card rather than the engine.
      if (x > width * 0.68 && y > height * 0.12 && y < height * 0.34) {
        const cell = Math.max(1, Math.round(width / 160));
        v = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 235 : 120;
      }
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

const hash = (gray) => createHash('sha256').update(Buffer.from(gray.data.buffer, gray.data.byteOffset, gray.data.length)).digest('hex').slice(0, 16);
const inkShare = (gray) => {
  let ink = 0;
  for (const v of gray.data) if (v < 128) ink += 1;
  return ink / gray.data.length;
};
const constantField = (width, height, value) => ({
  width,
  height,
  data: new Float32Array(width * height).fill(value),
});

/* --------------------------------------------------------------- the parts */

test('a Gaussian of a flat field is the same flat field', () => {
  // The kernel is normalised, so it must not change a constant — and it must
  // not darken the border either, which is what edge clamping is for.
  for (const sigma of [0.5, 1, 2.5, 6]) {
    const out = gaussian(constantField(24, 18, 0.63), sigma);
    for (const v of out.data) assert.ok(Math.abs(v - 0.63) < 1e-5, `${sigma}: ${v}`);
  }
});

test('a Gaussian spreads a spike symmetrically and keeps its total', () => {
  const field = constantField(41, 41, 0);
  field.data[20 * 41 + 20] = 1;
  const out = gaussian(field, 3);
  let total = 0;
  for (const v of out.data) total += v;
  assert.ok(Math.abs(total - 1) < 1e-3, `total ${total}`);
  const at = (x, y) => out.data[y * 41 + x];
  assert.ok(Math.abs(at(23, 20) - at(17, 20)) < 1e-6, 'left and right disagree');
  assert.ok(Math.abs(at(20, 23) - at(20, 17)) < 1e-6, 'up and down disagree');
  assert.ok(at(20, 20) > at(23, 20), 'the middle is not the brightest');
});

test('the flow runs along an edge, not across it', () => {
  // A vertical edge: dark on the left, light on the right. The tangent should
  // be vertical, which is to say its x part is nothing.
  const width = 40;
  const height = 40;
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = x < 20 ? 0.15 : 0.85;
  }
  const flow = tangentFlow({ width, height, data }, 2);
  for (let y = 10; y < 30; y++) {
    for (const x of [19, 20, 21]) {
      const i = y * width + x;
      assert.ok(Math.abs(flow.tx[i]) < 0.05, `(${x},${y}) tangent leans across the edge: ${flow.tx[i]}`);
      assert.ok(Math.abs(flow.ty[i]) > 0.95, `(${x},${y}) tangent is not along the edge`);
    }
  }
});

test('the flow is a unit vector everywhere, including on flat ground', () => {
  // A zero vector in the field would make the streamline walk stand still, and
  // a flat picture is exactly where the eigenvectors go undefined.
  const flow = tangentFlow(constantField(20, 20, 0.5), 2);
  for (let i = 0; i < 400; i++) {
    assert.ok(Math.abs(Math.hypot(flow.tx[i], flow.ty[i]) - 1) < 1e-5, `not unit at ${i}`);
  }
});

test('smoothing along the flow leaves a flat response flat', () => {
  const flow = tangentFlow(constantField(24, 24, 0.5), 2);
  const out = smoothAlong(constantField(24, 24, 0.42), flow, 3);
  for (const v of out.data) assert.ok(Math.abs(v - 0.42) < 1e-5, `${v}`);
});

test('a difference of Gaussians across the flow answers zero on flat ground', () => {
  // tau is 1 here, so a constant must cancel exactly: narrow minus wide.
  const field = constantField(24, 24, 0.7);
  const flow = tangentFlow(field, 2);
  const out = dogAcross(field, flow, 1.2, 1.6, 1);
  for (const v of out.data) assert.ok(Math.abs(v) < 1e-5, `${v}`);
});

test('the soft threshold is paper above epsilon and ink well below it', () => {
  const values = { width: 4, height: 1, data: new Float32Array([0.5, 0.02, 0.0, -1]) };
  const out = softThreshold(values, 0.01, 200);
  assert.equal(out.data[0], PAPER, 'well above epsilon is paper');
  assert.equal(out.data[1], PAPER, 'just above epsilon is paper');
  assert.ok(out.data[3] <= INK + 1, 'well below epsilon is ink');
  assert.ok(out.data[2] < PAPER, 'just below epsilon has started to darken');
});

test('a gentler phi gives a softer edge', () => {
  const values = { width: 5, height: 1, data: new Float32Array([-0.002, -0.004, -0.006, -0.008, -0.01]) };
  const hard = softThreshold(values, 0, 320);
  const soft = softThreshold(values, 0, 4);
  const spread = (g) => Math.max(...g.data) - Math.min(...g.data);
  // A hard threshold has already bottomed out across this range; a soft one is
  // still on its way down, so it keeps more distinct values.
  assert.ok(new Set(soft.data).size >= new Set(hard.data).size, 'the soft edge is not softer');
  assert.ok(spread(soft) > 0, 'the soft edge is flat');
});

/* ------------------------------------------------------------- the sliders */

test('every slider does something over the whole of its travel', () => {
  // The bug this prevents: a slider mapped linearly onto a range whose useful
  // part is at one end, so three quarters of it does nothing anybody can see.
  const base = settingsFor('ink-pen');
  const checks = [
    ['detail', (p) => p.sigma],
    ['thickness', (p) => p.dilateRadius],
    ['softness', (p) => p.phi],
    ['cleanup', (p) => p.minArea],
  ];
  for (const [name, read] of checks) {
    const seen = [0, 25, 50, 75, 100].map((v) => read(resolveClassic({ ...base, [name]: v })));
    const distinct = new Set(seen.map((n) => Number(n.toFixed(4))));
    assert.ok(distinct.size >= 4, `${name} only has ${distinct.size} settings: ${seen.join(', ')}`);
  }
});

test('the sliders run the way their labels say', () => {
  const base = settingsFor('ink-pen');
  const at = (name, v) => resolveClassic({ ...base, [name]: v });
  // More detail is a narrower Gaussian: smaller things survive.
  assert.ok(at('detail', 100).sigma < at('detail', 0).sigma);
  // More thickness grows the line more.
  assert.ok(at('thickness', 100).dilateRadius > at('thickness', 20).dilateRadius);
  // More softness is a gentler falloff, which is a smaller phi.
  assert.ok(at('softness', 100).phi < at('softness', 0).phi);
  // More cleanup lifts bigger specks and blurs more first.
  assert.ok(at('cleanup', 100).minArea > at('cleanup', 0).minArea);
  assert.ok(at('cleanup', 100).preBlur > at('cleanup', 0).preBlur);
});

test('thickness zero grows the line not at all', () => {
  assert.equal(resolveClassic({ ...settingsFor('ink-pen'), thickness: 0 }).dilateRadius, 0);
});

test('a slider means one thing, whatever size the picture is', () => {
  // The engine works at one size and the picture is resampled to it, rather
  // than the parameters being scaled to the picture. So the mapping takes no
  // size at all: the same settings are the same numbers, always.
  assert.equal(resolveClassic.length, 1, 'resolveClassic takes a size again');
  const base = settingsFor('bold');
  assert.deepEqual(resolveClassic(base), resolveClassic(base));
});

test('a big picture is brought down to the working size, and a small one is left alone', () => {
  // Down and never up: enlarging would invent detail the engine would then
  // faithfully draw.
  const big = runClassic(testCard(CLASSIC_WORKING_EDGE + 600, 300), settingsFor('fine'));
  assert.equal(Math.max(big.width, big.height), CLASSIC_WORKING_EDGE);
  const small = runClassic(testCard(120, 90), settingsFor('fine'));
  assert.deepEqual([small.width, small.height], [120, 90]);
});

test('the same picture at two upload sizes gives the same drawing', () => {
  // The promise the working size exists to keep, and the one the old pipeline
  // scaled its parameters for: a painting photographed twice must not come out
  // as two different pages. Both of these come down to the working edge first.
  const share = (w) => inkShare(runClassic(testCard(w, Math.round(w * 0.72)), settingsFor('ink-pen')));
  const a = share(CLASSIC_WORKING_EDGE + 100);
  const b = share(CLASSIC_WORKING_EDGE + 800);
  assert.ok(Math.abs(a - b) < b * 0.25, `${a.toFixed(4)} vs ${b.toFixed(4)}`);
});

test('running small is NOT the same as running big and shrinking', () => {
  // Stated as a test because it is a trap the Lab has to avoid: the parameters
  // are in pixels, so a small input gets proportionally much heavier lines.
  // Look cards must reduce the RESULT, not the input.
  const small = inkShare(runClassic(testCard(240, 173), settingsFor('ink-pen')));
  const large = inkShare(runClassic(testCard(960, 691), settingsFor('ink-pen')));
  // Measured at about 20.1% against 13.0%. The margin is deliberately loose:
  // the claim is "noticeably heavier", not a particular ratio.
  assert.ok(small > large * 1.2, `${small.toFixed(4)} vs ${large.toFixed(4)}`);
});

test('every look is a different drawing, and all four are named', () => {
  const looks = Object.keys(CLASSIC_LOOKS);
  assert.deepEqual(looks, ['ink-pen', 'fine', 'bold', 'sketch']);
  for (const look of looks) {
    assert.ok(CLASSIC_LOOKS[look].label.length > 0, `${look} has no label`);
    assert.ok(CLASSIC_LOOKS[look].blurb.length > 10, `${look} has no blurb`);
  }
  const card = testCard();
  const drawn = looks.map((look) => hash(runClassic(card, settingsFor(look))));
  assert.equal(new Set(drawn).size, 4, `two looks drew the same picture: ${drawn.join(' ')}`);
});

test('Bold lays down more ink than Fine', () => {
  const card = testCard();
  const bold = inkShare(runClassic(card, settingsFor('bold')));
  const fine = inkShare(runClassic(card, settingsFor('fine')));
  assert.ok(bold > fine, `bold ${bold.toFixed(3)} is not heavier than fine ${fine.toFixed(3)}`);
});

test('inverting is not the same as not inverting', () => {
  const card = testCard();
  const plain = runClassic(card, settingsFor('ink-pen'));
  const flipped = runClassic(card, { ...settingsFor('ink-pen'), invert: true });
  assert.notEqual(hash(plain), hash(flipped));
});

test('thickening grows a line and keeps its half-tones', () => {
  // The bug this is here for: `dilate` in pipeline.ts is binary, so it turned
  // every midtone into paper and quietly erased the softness slider.
  const width = 9;
  const data = new Uint8ClampedArray(width * 3).fill(PAPER);
  data[width + 4] = INK;
  data[width + 5] = 150;
  const out = thicken({ width, height: 3, data }, 1);
  assert.equal(out.data[width + 3], INK, 'the line did not grow');
  assert.ok(out.data[width + 6] === 150, `the half-tone was flattened to ${out.data[width + 6]}`);
  assert.equal(out.data[width + 0], PAPER, 'it grew further than it was asked to');
});

test('despeckling lifts the speck and leaves the tone alone', () => {
  const width = 20;
  const height = 20;
  const data = new Uint8ClampedArray(width * height).fill(PAPER);
  // One speck of two pixels, and one broad soft patch that must survive.
  data[0] = INK;
  data[1] = INK;
  for (let y = 10; y < 18; y++) for (let x = 10; x < 18; x++) data[y * width + x] = 100;
  const out = deSpeckle({ width, height, data }, 8);
  assert.equal(out.data[0], PAPER, 'the speck stayed');
  assert.equal(out.data[12 * width + 12], 100, 'the soft patch lost its tone');
});

test('a soft look really does leave tone on the page', () => {
  const card = testCard();
  const tones = (g) => {
    let mid = 0;
    for (const v of g.data) if (v > 20 && v < 235) mid += 1;
    return mid / g.data.length;
  };
  const sketch = tones(runClassic(card, settingsFor('sketch')));
  const fine = tones(runClassic(card, settingsFor('fine')));
  assert.ok(sketch > 0.002, `sketch has no midtones at all: ${sketch}`);
  assert.ok(sketch > fine, `sketch ${sketch.toFixed(4)} is no softer than fine ${fine.toFixed(4)}`);
});

/* ---------------------------------------------------------- determinism */

test('the same picture gives the same bytes, every time', () => {
  const card = testCard();
  for (const look of Object.keys(CLASSIC_LOOKS)) {
    const a = runClassic(card, settingsFor(look));
    const b = runClassic(card, settingsFor(look));
    assert.equal(hash(a), hash(b), `${look} is not deterministic`);
  }
});

test('nothing in the engine reads a clock or a random number', () => {
  // Cheap, and it catches the one kind of change that would quietly break the
  // promise above without failing any test that only runs twice in a row.
  const source = readEngineSource();
  for (const forbidden of ['Math.random', 'Date.now', 'new Date', 'performance.now']) {
    assert.ok(!source.includes(forbidden), `the engine uses ${forbidden}`);
  }
});

function readEngineSource() {
  // Comments stripped: the file explains at length that it uses no random
  // number, and a check that reads prose cannot tell the explanation from the
  // thing it is warning about.
  return readFileSync(new URL('../lib/lineart/xdog.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');
}

/* -------------------------------------------------------------- fixtures */

/**
 * Pixel hashes.
 *
 * These are not here to say the drawing is good — a person says that. They are
 * here so that a change to a constant, a kernel or an order of operations
 * cannot slip through unnoticed. If one of these moves, that is a real change
 * to what everyone's pictures will look like: work out why, decide whether you
 * meant it, and only then write the new number down.
 */
const FIXTURES = {
  'ink-pen': 'eb3e8ca0bf181772',
  fine: '9eff8b64ba40a259',
  bold: '0e9cb9cb394a4446',
  sketch: 'fc9f2a07c23ef967',
};

test('the fixtures still hold', () => {
  const card = testCard();
  const now = {};
  for (const look of Object.keys(CLASSIC_LOOKS)) now[look] = hash(runClassic(card, settingsFor(look)));
  assert.deepEqual(now, FIXTURES);
});
