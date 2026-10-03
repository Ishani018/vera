import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  anisotropicKuwahara,
  bilateral,
  localContrast,
  octant,
  prepare,
} from '../lib/lineart/smooth.ts';
import {
  fastBlur,
  gaussian,
  runClassic,
  settingsFor,
  tangentFlow,
} from '../lib/lineart/xdog.ts';

/**
 * Cleaning the picture up before any line is drawn.
 *
 * The property every one of these filters has to have, and the one a plain blur
 * does not: noise goes away and edges stay. So most of what follows measures
 * exactly those two things on the same picture — how flat the flat parts came
 * out, and how much of the step across an edge survived.
 */

const field = (width, height, fn) => {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = fn(x, y);
  return { width, height, data };
};

/** A deterministic pseudo-random, so "noisy" means the same noise every run. */
function noise(seed = 1) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
}

/** A hard step with grain on both sides of it. */
function noisyStep(width = 64, height = 64, grain = 0.06) {
  const rnd = noise(7);
  return field(width, height, (x) => (x < width / 2 ? 0.25 : 0.75) + rnd() * grain * 2);
}

/** How rough a region is: the standard deviation inside it. */
function roughness(f, x0, x1) {
  const values = [];
  for (let y = 4; y < f.height - 4; y++) for (let x = x0; x < x1; x++) values.push(f.data[y * f.width + x]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

/** How big the jump across the middle is. */
function step(f) {
  const mid = Math.floor(f.height / 2);
  const left = f.data[mid * f.width + Math.floor(f.width / 2) - 6];
  const right = f.data[mid * f.width + Math.floor(f.width / 2) + 6];
  return right - left;
}

/* ------------------------------------------------------------- bilateral */

test('a bilateral filter leaves a flat field exactly where it is', () => {
  const out = bilateral(field(24, 24, () => 0.42), 3, 0.1);
  for (const v of out.data) assert.ok(Math.abs(v - 0.42) < 1e-4, `${v}`);
});

test('a bilateral filter takes the grain out and leaves the edge', () => {
  const before = noisyStep();
  const after = bilateral(before, 3, 0.1);
  const roughBefore = roughness(before, 4, 24);
  const roughAfter = roughness(after, 4, 24);
  assert.ok(roughAfter < roughBefore * 0.5, `grain ${roughBefore.toFixed(4)} -> ${roughAfter.toFixed(4)}`);
  // The step is 0.5. A plain blur of this radius would eat most of it.
  assert.ok(step(after) > 0.45, `the edge was softened to ${step(after).toFixed(3)}`);
});

test('a plain blur does NOT, which is the whole reason this file exists', () => {
  const before = noisyStep();
  const blurred = gaussian(before, 3);
  assert.ok(step(blurred) < step(bilateral(before, 3, 0.1)), 'the plain blur kept the edge better');
});

/* ---------------------------------------------------- anisotropic Kuwahara */

test('eight sectors by comparison agree with the trigonometry they replaced', () => {
  // The claim made in the comment where `atan2` used to be.
  const slow = (u, v) => {
    let a = Math.atan2(v, u);
    if (a < 0) a += Math.PI * 2;
    return Math.min(7, ((a / (Math.PI * 2)) * 8) | 0);
  };
  for (let i = 0; i < 2000; i++) {
    // Off the exact boundaries, where the two round differently and neither is
    // more right than the other.
    const angle = (i / 2000) * Math.PI * 2 + 0.013;
    const u = Math.cos(angle) * (1 + (i % 5));
    const v = Math.sin(angle) * (1 + (i % 5));
    assert.equal(octant(u, v), slow(u, v), `at ${angle.toFixed(4)} (${u.toFixed(3)}, ${v.toFixed(3)})`);
  }
});

test('the Kuwahara filter leaves a flat field alone', () => {
  const flat = field(24, 24, () => 0.42);
  const out = anisotropicKuwahara(flat, tangentFlow(flat, 2), 3, 8, 1.4);
  for (const v of out.data) assert.ok(Math.abs(v - 0.42) < 1e-4, `${v}`);
});

test('the Kuwahara filter flattens the sides and sharpens the edge', () => {
  const before = noisyStep();
  const after = anisotropicKuwahara(before, tangentFlow(before, 2), 3, 8, 1.4);
  assert.ok(roughness(after, 4, 24) < roughness(before, 4, 24) * 0.5, 'it did not flatten');
  // It does not merely preserve the step, it is allowed to steepen it: each
  // pixel takes its answer from the most uniform sector, which near an edge is
  // the side it is already on.
  assert.ok(step(after) > 0.45, `the edge was softened to ${step(after).toFixed(3)}`);
});

/* ------------------------------------------------------ local contrast */

test('local contrast normalisation does not amplify nothing', () => {
  // The floor on the spread is what stops a flat region's own rounding error
  // being multiplied up into noise.
  const flat = field(40, 40, () => 0.5);
  const out = localContrast(flat, 12, 1);
  assert.ok(roughness(out, 4, 36) < 1e-4, `flat ground came back rough: ${roughness(out, 4, 36)}`);
});

test('local contrast normalisation makes a faint line in the dark count as much as a bright one', () => {
  // Two identical marks, one on a dark ground at low contrast and one on a
  // bright ground at high contrast. Afterwards they should look alike.
  const f = field(120, 40, (x, y) => {
    const dark = x < 60;
    const base = dark ? 0.22 : 0.78;
    const amplitude = dark ? 0.04 : 0.16;
    const onMark = y > 16 && y < 23;
    return base - (onMark ? amplitude : 0);
  });
  const depth = (g, x) => g.data[10 * g.width + x] - g.data[19 * g.width + x];
  const beforeRatio = depth(f, 30) / depth(f, 90);
  const after = localContrast(f, 14, 1);
  const afterRatio = depth(after, 30) / depth(after, 90);
  assert.ok(beforeRatio < 0.35, `the test picture is wrong: ratio was already ${beforeRatio.toFixed(2)}`);
  assert.ok(afterRatio > beforeRatio * 1.8, `faint ${beforeRatio.toFixed(2)} -> ${afterRatio.toFixed(2)}`);
});

/* -------------------------------------------------------------- fast blur */

test('the fast blur is close enough to the real one for statistics', () => {
  // Measured, not assumed: the mean error is about one grey level in 255, and
  // the worst reaches five percent on a sinusoid near the blur's own scale.
  // That is fine for a mean or a variance and hopeless for a difference of two
  // Gaussians, which is why `gaussian` is still used for the latter.
  const f = field(64, 64, (x, y) => 0.3 + 0.4 * Math.sin(x / 7) * Math.cos(y / 9));
  for (const sigma of [1, 2, 4, 8, 12]) {
    const exact = gaussian(f, sigma);
    const fast = fastBlur(f, sigma);
    let worst = 0;
    let sum = 0;
    for (let i = 0; i < exact.data.length; i++) {
      const d = Math.abs(exact.data[i] - fast.data[i]);
      if (d > worst) worst = d;
      sum += d;
    }
    assert.ok(sum / exact.data.length < 0.005, `sigma ${sigma}: mean ${(sum / exact.data.length).toFixed(5)}`);
    assert.ok(worst < 0.06, `sigma ${sigma}: worst ${worst.toFixed(4)}`);
  }
});

test('the exact Gaussian is the one the difference of Gaussians uses', () => {
  // Stated as a test because the temptation to swap it for the fast one is
  // obvious and the consequence is not: five percent of a response that IS a
  // few percent would be most of the drawing.
  const source = readFileSync(new URL('../lib/lineart/xdog.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export function runClassic'));
  assert.ok(body.includes('gaussian(field, p.sigma)'), 'the narrow blur is no longer exact');
  assert.ok(body.includes('gaussian(field, p.sigma * p.k)'), 'the wide blur is no longer exact');
});

test('the fast blur leaves a flat field flat, borders included', () => {
  const out = fastBlur(field(32, 32, () => 0.63), 5);
  for (const v of out.data) assert.ok(Math.abs(v - 0.63) < 1e-4, `${v}`);
});

/* ----------------------------------------------------------------- whole */

test('prepare does nothing when it is asked for nothing', () => {
  const f = noisyStep();
  const out = prepare(f, { style: 'none', amount: 0, contrast: 0 });
  assert.deepEqual([...out.data], [...f.data]);
});

test('the smoothing slider really is a slider', () => {
  const f = noisyStep();
  const seen = [0, 0.3, 0.6, 1].map((amount) =>
    roughness(prepare(f, { style: 'bilateral', amount, contrast: 0 }), 4, 24).toFixed(5),
  );
  assert.equal(new Set(seen).size, 4, `only ${new Set(seen).size} settings: ${seen.join(', ')}`);
  assert.ok(Number(seen[3]) < Number(seen[0]), 'turning it up did not smooth more');
});

test('smoothing a grainy picture puts less noise on the page', () => {
  // The point of the whole stage, measured end to end.
  const grainy = grainyPicture();
  const rough = runClassic(grainy, { ...settingsFor('ink-pen'), smoothing: 0 });
  const smooth = runClassic(grainy, { ...settingsFor('ink-pen'), smoothing: 70 });
  const ink = (g) => { let n = 0; for (const v of g.data) if (v < 128) n += 1; return n / g.data.length; };
  assert.ok(ink(smooth) < ink(rough) * 0.75, `${ink(rough).toFixed(4)} -> ${ink(smooth).toFixed(4)}`);
});

test('smoothing is deterministic, like everything else here', () => {
  const grainy = grainyPicture();
  const hash = (g) => createHash('sha256').update(Buffer.from(g.data.buffer, g.data.byteOffset, g.data.length)).digest('hex').slice(0, 16);
  const settings = { ...settingsFor('bold'), smoothing: 55 };
  assert.equal(hash(runClassic(grainy, settings)), hash(runClassic(grainy, settings)));
});

/** A flat grey field with heavy grain on it, and one real edge to keep. */
function grainyPicture(width = 220, height = 180) {
  const rnd = noise(99);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const base = x < width * 0.45 ? 150 : 205;
      const v = base + rnd() * 54;
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}
