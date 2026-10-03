import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import {
  contoursOf,
  fitCurves,
  signedArea,
  simplify,
} from '../lib/lineart/contour.ts';
import { LOGO_DEFAULTS, pathDataFor, resolveLogo, runLogo, toSvg } from '../lib/lab/logo.ts';

/** A picture of flat colours, for tracing. */
const picture = (width, height, fn) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
};

/* -------------------------------------------------------------- contours */

test('a square comes back as one closed ring of the right size', () => {
  const found = contoursOf((x, y) => x >= 4 && x < 16 && y >= 4 && y < 16, 20, 20);
  assert.equal(found.length, 1);
  assert.equal(found[0].area, 144);
  assert.equal(found[0].hole, false);
  // Closed: every step is one unit, and the last point joins the first.
  const points = found[0].points;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    assert.equal(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1, `step ${i} is not a unit`);
  }
});

test('a hole is found, and is marked as one', () => {
  const found = contoursOf(
    (x, y) => x >= 4 && x < 16 && y >= 4 && y < 16 && !(x >= 8 && x < 12 && y >= 8 && y < 12),
    20,
    20,
  );
  assert.equal(found.length, 2);
  const [outer, hole] = found;
  assert.equal(outer.hole, false);
  assert.equal(hole.hole, true);
  assert.equal(hole.area, 16);
  // The winding is what says which is which, and the two must disagree.
  assert.ok(signedArea(outer.points) > 0 && signedArea(hole.points) < 0);
});

test('two separate shapes are two rings, not one', () => {
  const found = contoursOf((x, y) => y >= 4 && y < 10 && (x < 6 || x >= 14), 20, 20);
  assert.equal(found.length, 2);
  for (const one of found) assert.equal(one.hole, false);
});

test('a shape touching the edge of the picture still closes', () => {
  // The lattice runs one past the pixels, so an edge-touching region has a
  // boundary along the picture's own border rather than running off it.
  const found = contoursOf((x, y) => x < 6 && y < 6, 20, 20);
  assert.equal(found.length, 1);
  assert.equal(found[0].area, 36);
});

/* ------------------------------------------------------------- simplify */

test('simplifying keeps the ends and never strays further than it was told', () => {
  const points = Array.from({ length: 60 }, (_, i) => ({ x: i, y: Math.sin(i / 7) * 9 }));
  const epsilon = 1.2;
  const tidy = simplify(points, epsilon);
  assert.deepEqual(tidy[0], points[0]);
  assert.deepEqual(tidy[tidy.length - 1], points[points.length - 1]);
  assert.ok(tidy.length < points.length / 2, `kept ${tidy.length} of ${points.length}`);
  // Every dropped point is within epsilon of the line that replaced it.
  for (const p of points) {
    let best = Infinity;
    for (let i = 0; i + 1 < tidy.length; i++) {
      best = Math.min(best, pointToSegment(p, tidy[i], tidy[i + 1]));
    }
    assert.ok(best <= epsilon + 1e-9, `a point moved ${best.toFixed(3)}`);
  }
});

test('a straight line simplifies to its two ends', () => {
  const points = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 5 }));
  assert.equal(simplify(points, 0.5).length, 2);
});

function pointToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (length === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / length;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/* -------------------------------------------------------------- Béziers */

const onCurve = ([p0, p1, p2, p3], t) => {
  const m = 1 - t;
  return {
    x: m ** 3 * p0.x + 3 * m * m * t * p1.x + 3 * m * t * t * p2.x + t ** 3 * p3.x,
    y: m ** 3 * p0.y + 3 * m * m * t * p1.y + 3 * m * t * t * p2.y + t ** 3 * p3.y,
  };
};

test('the fitted curves start and end exactly where the points do', () => {
  const points = Array.from({ length: 30 }, (_, i) => ({ x: i * 2, y: Math.sin(i / 5) * 12 }));
  const curves = fitCurves(points, 1);
  assert.ok(curves.length >= 1);
  assert.deepEqual(curves[0][0], points[0]);
  assert.deepEqual(curves[curves.length - 1][3], points[points.length - 1]);
});

test('the fitted curves really do pass near the points', () => {
  // The whole claim of the fit: not "a curve of about this shape" but "no
  // point is further than the tolerance from the curve".
  const points = Array.from({ length: 50 }, (_, i) => ({
    x: 40 + 30 * Math.cos((i / 50) * Math.PI * 2),
    y: 40 + 30 * Math.sin((i / 50) * Math.PI * 2),
  }));
  const tolerance = 1.5;
  const curves = fitCurves([...points, points[0]], tolerance);
  for (const p of points) {
    let best = Infinity;
    for (const curve of curves) {
      for (let i = 0; i <= 24; i++) {
        const q = onCurve(curve, i / 24);
        best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y));
      }
    }
    assert.ok(best < tolerance * 2, `a point is ${best.toFixed(2)} from every curve`);
  }
});

test('a tighter tolerance uses more curves', () => {
  const points = Array.from({ length: 60 }, (_, i) => ({ x: i, y: Math.sin(i / 4) * 14 }));
  assert.ok(fitCurves(points, 0.3).length > fitCurves(points, 4).length);
});

test('fitting a straight run takes exactly one curve', () => {
  assert.equal(fitCurves(Array.from({ length: 30 }, (_, i) => ({ x: i, y: 9 })), 1).length, 1);
});

test('fitting is the same every time', () => {
  const points = Array.from({ length: 40 }, (_, i) => ({ x: i, y: Math.cos(i / 6) * 11 }));
  assert.deepEqual(fitCurves(points, 1), fitCurves(points, 1));
});

/* ----------------------------------------------------------------- logo */

/** A mark: a dark ring on a pale ground, with a hole in the middle. */
const mark = () =>
  picture(260, 200, (x, y) => {
    const d = Math.hypot(x - 130, y - 100);
    return d > 40 && d < 70 ? [30, 30, 36] : [238, 234, 226];
  });

test('a logo is paths and nothing else — no raster anywhere in it', () => {
  const result = runLogo(mark(), LOGO_DEFAULTS);
  assert.ok(result.svg.startsWith('<svg xmlns='));
  assert.ok(!/<image|data:image|base64/.test(result.svg), 'there is a bitmap in the svg');
  assert.ok((result.svg.match(/<path/g) ?? []).length >= 1);
  assert.ok(result.svg.includes('fill-rule="evenodd"'), 'holes will not be holes');
  assert.ok(!/NaN|Infinity|undefined/.test(result.svg), 'a bad number got into the svg');
});

test('the ring keeps its hole', () => {
  const result = runLogo(mark(), LOGO_DEFAULTS);
  const shape = result.shapes[0];
  assert.ok(shape, 'nothing was traced');
  // An outline and a hole: two rings, and the inner one wound the other way.
  assert.ok(shape.curves.length >= 2, `only ${shape.curves.length} rings`);
});

test('the palest fill is dropped rather than painted', () => {
  // Otherwise a two-colour mark comes with a white rectangle stuck behind it,
  // which nobody notices until it is on a dark background.
  const result = runLogo(mark(), { ...LOGO_DEFAULTS, colours: 2 });
  assert.equal(result.shapes.length, 1);
  const fill = result.shapes[0].fill;
  const n = parseInt(fill.slice(1), 16);
  const lightness = ((n >> 16) & 255) * 0.2126 + ((n >> 8) & 255) * 0.7152 + (n & 255) * 0.0722;
  assert.ok(lightness < 128, `kept the pale one: ${fill}`);
});

test('more colours means more fills, up to the number asked for', () => {
  const three = picture(200, 160, (x) => (x < 70 ? [20, 20, 20] : x < 140 ? [200, 60, 50] : [245, 243, 238]));
  const result = runLogo(three, { ...LOGO_DEFAULTS, colours: 3 });
  assert.ok(result.shapes.length <= 3);
  assert.ok(result.shapes.length >= 2, `only ${result.shapes.length} fills`);
});

test('a chosen palette is used instead of the picture’s own', () => {
  const result = runLogo(mark(), { ...LOGO_DEFAULTS, colours: 2, palette: ['#112233', '#445566'] });
  for (const shape of result.shapes) {
    assert.ok(['#112233', '#445566'].includes(shape.fill), `got ${shape.fill}`);
  }
});

test('it says when what it got was not a logo', () => {
  // The honest part. A busy picture should admit to being busy rather than
  // quietly producing four hundred curves and calling it a mark.
  let seed = 3;
  const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const busy = picture(300, 240, () => {
    const v = noise() * 255;
    return [v, v * 0.8, v * 0.6];
  });
  assert.equal(runLogo(busy, LOGO_DEFAULTS).verdict.busy, true);
  assert.equal(runLogo(mark(), LOGO_DEFAULTS).verdict.busy, false);
});

test('the sliders run the way their labels say', () => {
  const at = (field, v) => resolveLogo({ ...LOGO_DEFAULTS, [field]: v }, 1e6);
  assert.ok(at('smoothness', 100).epsilon > at('smoothness', 0).epsilon);
  assert.ok(at('smoothness', 100).fitError > at('smoothness', 0).fitError);
  assert.ok(at('minShape', 100).minArea > at('minShape', 0).minArea);
  // Smoother really does mean fewer curves on a real shape.
  const loose = runLogo(mark(), { ...LOGO_DEFAULTS, smoothness: 95 });
  const tight = runLogo(mark(), { ...LOGO_DEFAULTS, smoothness: 5 });
  assert.ok(loose.verdict.curves < tight.verdict.curves, `${tight.verdict.curves} -> ${loose.verdict.curves}`);
});

test('an empty picture makes an empty logo rather than throwing', () => {
  const blank = picture(80, 60, () => [250, 250, 250]);
  const result = runLogo(blank, LOGO_DEFAULTS);
  assert.ok(result.svg.startsWith('<svg'));
  assert.equal(result.shapes.length <= 1, true);
});

test('the same picture gives the same logo, every time', () => {
  const digest = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
  assert.equal(digest(runLogo(mark(), LOGO_DEFAULTS).svg), digest(runLogo(mark(), LOGO_DEFAULTS).svg));
});

test('the svg carries the size of the picture it came from', () => {
  const result = runLogo(mark(), LOGO_DEFAULTS);
  assert.ok(result.svg.includes(`viewBox="0 0 ${result.width} ${result.height}"`));
  assert.ok(toSvg([], 12, 34).includes('viewBox="0 0 12 34"'));
});

test('the canvas and the svg are drawn from one path, not two implementations', () => {
  // They were two, briefly, and the difference was not subtle: the canvas
  // filled each ring separately, which fills the holes, so a line drawing of a
  // cat came out as a solid black cat.
  const result = runLogo(mark(), LOGO_DEFAULTS);
  for (const shape of result.shapes) {
    const d = pathDataFor(shape);
    assert.ok(result.svg.includes(`d="${d}"`), 'the svg is not using the shared path data');
    // All of the shape's rings in one run of commands, so even-odd can see them
    // together: as many moves as there are rings.
    assert.equal((d.match(/M /g) ?? []).length, shape.curves.length);
  }
});
