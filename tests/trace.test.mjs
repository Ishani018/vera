import test from 'node:test';
import assert from 'node:assert/strict';

import { traceInk } from '../lib/lab/trace.ts';

/** A grey page, white, with a function deciding which pixels are ink. */
function page(width, height, ink) {
  const data = new Uint8ClampedArray(width * height).fill(255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (ink(x, y)) data[y * width + x] = 0;
  return { width, height, data };
}

const ring = (cx, cy, outer, inner) => (x, y) => {
  const d = Math.hypot(x - cx, y - cy);
  return d <= outer && d >= inner;
};

test('a drawing becomes an SVG that is the same size as the drawing', () => {
  const svg = traceInk(page(80, 60, ring(40, 30, 22, 14)));
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 80 60" width="80" height="60">/);
  assert.ok(svg.trim().endsWith('</svg>'));
});

test('a ring keeps its hole: one even-odd path with two rings in it', () => {
  const svg = traceInk(page(80, 60, ring(40, 30, 22, 14)));
  assert.equal((svg.match(/<path /g) ?? []).length, 1);
  assert.match(svg, /fill-rule="evenodd"/);
  assert.equal((svg.match(/M /g) ?? []).length, 2);   // the outside and the counter
  assert.equal((svg.match(/ Z/g) ?? []).length, 2);
});

test('a long thin stroke is a handful of curves, not one per pixel step', () => {
  const stroke = (x, y) => Math.abs(y - (0.5 * x + 20)) <= 1.5 && x >= 10 && x <= 190;   // a 3 px diagonal line
  const svg = traceInk(page(200, 140, stroke));
  const curves = (svg.match(/ C /g) ?? []).length;
  assert.ok(curves >= 2, `expected curve commands, found ${curves}`);
  assert.ok(curves < 40, `a straight stroke should not need ${curves} curves`);
  assert.doesNotMatch(svg, / L /);
});

test('a ring is traced with curves that follow it, not a staircase', () => {
  const svg = traceInk(page(120, 120, ring(60, 60, 50, 46)));
  assert.ok((svg.match(/ C /g) ?? []).length >= 8);
  assert.doesNotMatch(svg, / L /);
});

test('a speck of ink is noise and is dropped, but a real stroke beside it stays', () => {
  const svg = traceInk(page(80, 60, (x, y) => (x === 5 && y === 5) || (y >= 28 && y <= 31 && x >= 15 && x <= 65)));
  assert.equal((svg.match(/M /g) ?? []).length, 1);
});

test('a small hole inside a stroke is kept, because dropping it would fill it', () => {
  const svg = traceInk(page(60, 60, (x, y) => x >= 10 && x <= 50 && y >= 10 && y <= 50 && !(x >= 29 && x <= 30 && y >= 29 && y <= 30)));
  assert.equal((svg.match(/M /g) ?? []).length, 2);
});

test('a blank page gives a valid, empty SVG rather than an error', () => {
  const svg = traceInk(page(30, 30, () => false));
  assert.match(svg, /viewBox="0 0 30 30"/);
  assert.equal((svg.match(/<path /g) ?? []).length, 0);
});

/** Every point on every cubic of a path, so a test looks at the curve and not at its control points. */
function sampledPath(svg) {
  const d = svg.slice(svg.indexOf(' d="') + 4);
  const out = [];
  for (const ring of d.split('M ').slice(1)) {
    const nums = (ring.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    let [x0, y0] = nums;
    for (let i = 2; i + 5 < nums.length + 0; i += 6) {
      const [x1, y1, x2, y2, x3, y3] = nums.slice(i, i + 6);
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, u = 1 - t;
        out.push([u*u*u*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x3, u*u*u*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t*t*t*y3]);
      }
      x0 = x3; y0 = y3;
    }
  }
  return out;
}

test('the traced curve lies where the ink was, not just near it', () => {
  const svg = traceInk(page(100, 100, ring(50, 50, 30, 26)));
  // pixel (50, 50) spans 50..51, so the ring's centre in lattice coordinates is 50.5
  const radii = sampledPath(svg).map(([x, y]) => Math.hypot(x - 50.5, y - 50.5));
  assert.ok(radii.length > 50);
  // The ink runs from radius 26 to 30, so its edges are at about 25.5 and 30.5. The curve may stray by the fit
  // tolerance (0.9 px) plus the half pixel by which the edge of a rasterised circle is itself uncertain: measured,
  // median 0.5 px, 95th percentile 1.1, worst 1.3.
  const dev = radii.map((r) => Math.min(Math.abs(r - 30.5), Math.abs(r - 25.5)));
  const within = dev.filter((d) => d <= 1.25).length / dev.length;
  assert.ok(within >= 0.95, `only ${(within * 100).toFixed(0)}% of the curve was within 1.25 px of the ink's edge`);
  assert.ok(Math.max(...dev) <= 1.6, `the worst point strayed ${Math.max(...dev).toFixed(2)} px`);
});
