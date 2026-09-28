import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INK,
  PAPER,
  adaptiveThreshold,
  analyseRidges,
  analyseGrey,
  analysisKey,
  blur,
  canny,
  despeckle,
  dilate,
  erode,
  guessSource,
  lightness,
  otsuThreshold,
  reduce,
  resolve,
  runCleanup,
  smoothEdges,
  sobel,
  colorSobel,
  strokeWidth,
  toLab,
  runLineArt,
  stretchContrast,
  toBitmap,
  toGray,
  upscale,
} from '../lib/lineart/pipeline.ts';

const DEFAULTS = {
  mode: 'threshold',
  detail: 50,
  thickness: 45,
  cleanup: 40,
  smoothing: 50,
  invert: false,
};

/** An RGBA bitmap from a function of x and y returning 0–255 grey. */
function bitmap(width, height, at) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = at(x, y);
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

const grey = (width, height, at) => {
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = at(x, y);
  return { width, height, data };
};

const countInk = (image) => image.data.reduce((n, v) => n + (v === INK ? 1 : 0), 0);

// --- the property the whole feature rests on --------------------------------

// The claim that nothing here is generated is only worth as much as this test.
test('the same picture and settings give byte-identical output, every time', () => {
  const source = bitmap(64, 64, (x, y) => (x * 7 + y * 13) % 256);
  const once = runLineArt(source, DEFAULTS);
  const twice = runLineArt(source, DEFAULTS);
  assert.deepEqual([...twice.data], [...once.data]);
});

test('nothing but pure black and pure white comes out', () => {
  const source = bitmap(48, 48, (x, y) => 40 + ((x * 3 + y * 5) % 180));
  for (const mode of ['threshold', 'edges']) {
    const out = runLineArt(source, { ...DEFAULTS, mode });
    for (const v of out.data) assert.ok(v === INK || v === PAPER, `${v} is neither ink nor paper`);
    // And once drawn back to RGBA it is still only 0 and 255, at full alpha.
    const rgba = toBitmap(out).data;
    for (let i = 0; i < rgba.length; i += 4) {
      assert.ok(rgba[i] === 0 || rgba[i] === 255);
      assert.equal(rgba[i + 3], 255);
    }
  }
});

test('the output keeps the size of the picture it came from', () => {
  const out = runLineArt(bitmap(37, 53, () => 128), DEFAULTS);
  assert.equal(out.width, 37);
  assert.equal(out.height, 53);
});

// --- grayscale ---------------------------------------------------------------

test('grey follows the eye, not the arithmetic mean', () => {
  const green = { width: 1, height: 1, data: new Uint8ClampedArray([0, 255, 0, 255]) };
  const blue = { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 255, 255]) };
  // A plain average would call these the same. They are nothing like the same.
  assert.ok(toGray(green).data[0] > 180);
  assert.ok(toGray(blue).data[0] < 40);
});

test('inverting turns light-on-dark into dark-on-light', () => {
  const dark = bitmap(4, 4, () => 20);
  assert.ok(toGray(dark).data[0] < 30);
  assert.ok(toGray(dark, true).data[0] > 225);
});

// --- blur --------------------------------------------------------------------

test('blur leaves a flat field flat, including at the edges', () => {
  const flat = grey(16, 16, () => 200);
  const out = blur(flat, 3);
  // A border handled by zero-padding instead of clamping darkens the frame.
  for (const v of out.data) assert.ok(Math.abs(v - 200) <= 1, `edge fell to ${v}`);
});

test('blur softens an edge rather than moving it', () => {
  const step = grey(32, 8, (x) => (x < 16 ? 0 : 255));
  const out = blur(step, 3);
  assert.ok(out.data[2] < 20, 'far side of the edge stays dark');
  assert.ok(out.data[29] > 235, 'far side stays light');
  assert.ok(out.data[15] > 20 && out.data[16] < 235, 'the edge itself is now a ramp');
});

// --- contrast stretch --------------------------------------------------------

// The case that came back a blank page before this step existed.
test('a pale wash is pulled out to the full range of greys', () => {
  const pale = grey(40, 40, (x, y) => 180 + ((x + y) % 46));
  const out = stretchContrast(pale);
  let min = 255, max = 0;
  for (const v of out.data) { min = Math.min(min, v); max = Math.max(max, v); }
  assert.ok(min < 20 && max > 235, `still only spans ${min}–${max}`);
});

test('an image that already uses the full range is left as it is', () => {
  const full = grey(40, 40, (x) => (x * 255) / 39);
  const out = stretchContrast(full);
  for (let i = 0; i < out.data.length; i++) {
    assert.ok(Math.abs(out.data[i] - full.data[i]) <= 2);
  }
});

test('one bright speck does not set the scale for the whole picture', () => {
  const mostlyDark = grey(40, 40, (x, y) => (x === 0 && y === 0 ? 255 : 30 + ((x + y) % 20)));
  const out = stretchContrast(mostlyDark);
  // If the speck set the top of the range, everything else would stay crushed.
  let bright = 0;
  for (const v of out.data) if (v > 200) bright++;
  assert.ok(bright > 100, `only ${bright} pixels came up`);
});

test('a genuinely flat field is not amplified into a drawing', () => {
  const flat = grey(30, 30, () => 128);
  const out = stretchContrast(flat);
  for (const v of out.data) assert.equal(v, 128);
});

test('a soft, low-contrast painting produces actual lines, not a blank page', () => {
  // Overlapping pale blobs on a pale ground: nothing here is more than about
  // 30 grey levels from anything else.
  const wash = bitmap(120, 120, (x, y) => {
    const a = Math.hypot(x - 45, y - 50) < 30 ? 14 : 0;
    const b = Math.hypot(x - 80, y - 75) < 34 ? 18 : 0;
    return 205 - a - b;
  });
  const out = runLineArt(wash, { ...DEFAULTS, cleanup: 20 });
  const ink = countInk(out);
  assert.ok(ink > 40, `a soft painting produced ${ink} pixels of ink — effectively a blank page`);
  assert.ok(ink < out.data.length * 0.6, 'and it is not a solid black page either');
});

// --- adaptive threshold ------------------------------------------------------

// This is the step that makes a photograph of a painting usable.
test('a local threshold ignores a lighting gradient a global one would fail', () => {
  // A dark line down the middle, over a background that ramps from black to white.
  const lit = grey(80, 40, (x, y) => {
    const lighting = (x / 80) * 200 + 30;
    return Math.abs(x - 40) < 2 ? Math.max(0, lighting - 90) : lighting;
  });
  const out = adaptiveThreshold(lit, 21, 8);

  const inkAt = (x) => out.data[20 * 80 + x] === INK;
  assert.ok(inkAt(40), 'the line is found in the bright half');
  assert.ok(!inkAt(10) && !inkAt(70), 'and the background is paper on both sides');
});

test('a flat field of any brightness produces no ink at all', () => {
  for (const level of [10, 128, 240]) {
    const out = adaptiveThreshold(grey(40, 40, () => level), 15, 6);
    assert.equal(countInk(out), 0, `a flat field at ${level} invented ink`);
  }
});

test('raising the bias makes less ink, never more', () => {
  const noisy = grey(60, 60, (x, y) => 128 + 40 * Math.sin(x / 3) * Math.cos(y / 4));
  let previous = Infinity;
  for (const bias of [2, 6, 12, 20]) {
    const ink = countInk(adaptiveThreshold(noisy, 15, bias));
    assert.ok(ink <= previous, `bias ${bias} produced more ink than the one before`);
    previous = ink;
  }
});

// --- edges -------------------------------------------------------------------

test('edge mode finds the boundary of a shape and leaves its inside alone', () => {
  const disc = grey(60, 60, (x, y) => (Math.hypot(x - 30, y - 30) < 18 ? 30 : 230));
  // A share of the page, not an absolute level.
  const out = canny(sobel(disc), 0.15);
  const at = (x, y) => out.data[y * 60 + x] === INK;
  assert.ok(!at(30, 30), 'the middle of the shape is not an edge');
  assert.ok(!at(2, 2), 'nor is the empty corner');
  // Somewhere on the rim, there is a line.
  let rim = 0;
  for (let a = 0; a < 360; a += 5) {
    const x = Math.round(30 + 18 * Math.cos((a * Math.PI) / 180));
    const y = Math.round(30 + 18 * Math.sin((a * Math.PI) / 180));
    for (let d = -2; d <= 2; d++) if (at(clampi(x + d, 59), y)) { rim++; break; }
  }
  assert.ok(rim > 40, `only ${rim} of 72 points around the rim found an edge`);
});

const clampi = (v, hi) => (v < 0 ? 0 : v > hi ? hi : v);

test('edge mode on a flat field finds nothing', () => {
  // Even asked to keep everything: there is nothing there to keep.
  assert.equal(countInk(canny(sobel(grey(40, 40, () => 160)), 0.15)), 0);
  assert.equal(countInk(canny(sobel(grey(40, 40, () => 160)), 1)), 0);
});

// --- morphology and despeckle ------------------------------------------------

test('growing then shrinking by the same amount restores a solid shape', () => {
  const block = grey(40, 40, (x, y) => (x > 12 && x < 28 && y > 12 && y < 28 ? INK : PAPER));
  const closed = erode(dilate(block, 2), 2);
  assert.equal(countInk(closed), countInk(block));
});

test('growing the ink makes lines heavier', () => {
  const line = grey(40, 40, (x) => (x === 20 ? INK : PAPER));
  assert.ok(countInk(dilate(line, 2)) > countInk(line) * 3);
});

test('specks go and the drawing stays', () => {
  const withNoise = grey(60, 60, (x, y) => {
    if (y === 30 && x > 5 && x < 55) return INK; // a line, 49 pixels
    if (x === 10 && y === 10) return INK; // a speck, 1 pixel
    if (x === 40 && y === 45) return INK; // another
    return PAPER;
  });
  const out = despeckle(withNoise, 10);
  assert.equal(out.data[30 * 60 + 30], INK, 'the line survived');
  assert.equal(out.data[10 * 60 + 10], PAPER, 'the speck did not');
  assert.equal(out.data[45 * 60 + 40], PAPER);
});

test('despeckle counts a region by touching sides, not corners', () => {
  // Two dots meeting only at a corner are two specks, not one four-pixel line.
  const corners = grey(20, 20, (x, y) => ((x === 5 && y === 5) || (x === 6 && y === 6) ? INK : PAPER));
  assert.equal(countInk(despeckle(corners, 3)), 0);
});

test('a big connected region is never mistaken for a speck', () => {
  const solid = grey(50, 50, (x, y) => (x > 5 && x < 45 && y > 5 && y < 45 ? INK : PAPER));
  assert.equal(countInk(despeckle(solid, 200)), countInk(solid));
});

// --- the slider mapping ------------------------------------------------------

test('every slider reaches a deliberate value at both ends', () => {
  const low = resolve({ ...DEFAULTS, detail: 0, thickness: 0, cleanup: 0 });
  const high = resolve({ ...DEFAULTS, detail: 100, thickness: 100, cleanup: 100 });

  assert.equal(low.blurRadius, 0, 'no cleanup means no blur at all');
  assert.equal(high.blurRadius, 4);
  assert.equal(low.minArea, 0);
  assert.ok(high.minArea > 50);
  assert.equal(low.dilateRadius, 0, 'the thinnest setting must not thicken');
  assert.equal(high.dilateRadius, 3);
  // More detail means a smaller window: fine texture survives a small one.
  assert.ok(high.window < low.window);
  assert.equal(high.window % 2, 1, 'the window has to have a centre pixel');
  assert.equal(low.window % 2, 1);
});

test('the sliders are clamped, so a bad value cannot reach the kernels', () => {
  const wild = resolve({ ...DEFAULTS, detail: 999, thickness: -50, cleanup: 1e6 });
  assert.ok(wild.window >= 9 && wild.window <= 251);
  assert.equal(wild.dilateRadius, 0);
  assert.ok(wild.blurRadius <= 4);
});

test('more cleanup leaves less noise behind', () => {
  const speckled = bitmap(80, 80, (x, y) => ((x * 31 + y * 17) % 97 < 12 ? 40 : 220));
  const dirty = countInk(runLineArt(speckled, { ...DEFAULTS, cleanup: 0 }));
  const clean = countInk(runLineArt(speckled, { ...DEFAULTS, cleanup: 100 }));
  assert.ok(clean < dirty, `cleanup left ${clean} against ${dirty}`);
});

test('a thicker setting puts down more ink than a thinner one', () => {
  const shapes = bitmap(70, 70, (x, y) => (Math.hypot(x - 35, y - 35) < 20 ? 40 : 220));
  const thin = countInk(runLineArt(shapes, { ...DEFAULTS, thickness: 0 }));
  const thick = countInk(runLineArt(shapes, { ...DEFAULTS, thickness: 100 }));
  assert.ok(thick > thin, `thick ${thick} was not more than thin ${thin}`);
});

// --- art that is already a drawing ------------------------------------------

/** A drawing: white paper, a few hard black strokes, nothing in between. */
const drawing = (width = 120, height = 120) =>
  bitmap(width, height, (x, y) => {
    const onStroke =
      Math.abs(x - 30) < 3 ||
      Math.abs(y - 80) < 3 ||
      Math.abs(Math.hypot(x - 70, y - 40) - 25) < 3;
    return onStroke ? 10 : 250;
  });

/** A photograph: everything is a midtone, nothing is paper. */
const photograph = (width = 120, height = 120) =>
  bitmap(width, height, (x, y) => 90 + 60 * Math.sin(x / 9) * Math.cos(y / 11));

test('a drawing is recognised as line art and a photograph is not', () => {
  assert.equal(guessSource(drawing()).kind, 'lineart');
  assert.equal(guessSource(photograph()).kind, 'painting');
});

test('a soft wash is not mistaken for a drawing', () => {
  // The case that motivated the split: pale, but full of midtones.
  const wash = bitmap(120, 120, (x, y) => 185 + 35 * Math.sin((x + y) / 30));
  assert.equal(guessSource(wash).kind, 'painting');
});

// Both of these were got wrong by counting light and dark pixels, which is why
// the guess asks whether the dark part is strokes or areas instead.

test('a bold painting of flat shapes on white is still a painting', () => {
  // As light as a drawing and as two-toned as one. What it is not is thin.
  const shapes = bitmap(400, 400, (x, y) => {
    const inside = Math.hypot(x - 130, y - 150) < 90 || (x > 230 && x < 370 && y > 200 && y < 360);
    return inside ? 20 : 246;
  });
  const guess = guessSource(shapes);
  assert.equal(guess.kind, 'painting', `solid share was ${guess.solid}`);
  assert.ok(guess.solid > 0.5, 'a filled shape survives being eroded');
});

test('a drawing with a soft grey wash behind it is still a drawing', () => {
  // What a generator hands back when it decides to add shading: an outline
  // over a broad grey disc, which is neither paper nor ink.
  const shaded = bitmap(400, 400, (x, y) => {
    const fromCentre = Math.hypot(x - 200, y - 200);
    if (Math.abs(fromCentre - 120) < 3 || Math.abs(fromCentre - 60) < 3) return 20;
    return fromCentre < 160 ? 214 : 250;
  });
  const guess = guessSource(shaded);
  assert.equal(guess.kind, 'lineart', `solid share was ${guess.solid}`);
});

test('the guess does not change when the same drawing arrives bigger', () => {
  const rings = (size) =>
    bitmap(size, size, (x, y) => {
      const r = Math.hypot(x - size / 2, y - size / 2) / size;
      const stroke = Math.abs(r - 0.18) < 0.006 || Math.abs(r - 0.34) < 0.006;
      return stroke ? 20 : 248;
    });
  assert.equal(guessSource(rings(512)).kind, 'lineart');
  assert.equal(guessSource(rings(2048)).kind, 'lineart');
});

test('reducing averages, so a thin stroke leaves a mark instead of vanishing', () => {
  const hairline = grey(400, 400, (x) => (x === 200 ? INK : PAPER));
  const small = reduce(hairline, 50);
  assert.equal(small.width, 50);
  // Somewhere on the row the stroke has to have darkened a pixel.
  const row = Array.from(small.data.slice(25 * 50, 26 * 50));
  assert.ok(Math.min(...row) < PAPER, 'the stroke was dropped rather than averaged in');
});

test('reducing an image that is already small enough changes nothing', () => {
  const small = grey(40, 40, (x, y) => (x + y) % 256);
  assert.deepEqual(Array.from(reduce(small, 512).data), Array.from(small.data));
});

test("Otsu's cut lands between the two groups it is separating", () => {
  const twoTone = grey(60, 60, (x) => (x < 20 ? 40 : 210));
  const cut = otsuThreshold(twoTone);
  // The cut is the last value in the darker group, so `<= cut` keeps that
  // group whole. Anything below 40 would throw the dark tone away entirely.
  assert.ok(cut >= 40 && cut < 210, `cut was ${cut}`);
});

// The whole reason the two paths exist. A stroke is a filled bar; tracing it
// finds its two sides and leaves the middle white, which is a hollow, doubled
// drawing nobody can colour. Cleaning it keeps the bar filled.
test('cleaning a drawing keeps its strokes solid where tracing would hollow them', () => {
  const bar = bitmap(80, 80, (x, y) => (x >= 30 && x < 50 ? 10 : 250));
  const centre = (image) => image.data[40 * 80 + 40];

  const cleaned = runCleanup(bar, DEFAULTS);
  const traced = runLineArt(bar, { ...DEFAULTS, mode: 'edges', thickness: 0 });

  assert.equal(centre(cleaned), INK, 'the middle of the stroke must stay inked');
  assert.equal(centre(traced), PAPER, 'tracing does hollow it — which is why cleanup exists');
});

test('cleaning a drawing drops soft grey shading, and the slider says how much', () => {
  // Black lines, a broad grey wash between them, white paper around it — the
  // shape of an AI coloring page that came back with shading nobody asked for.
  const shaded = bitmap(100, 100, (x) => {
    if (Math.abs(x - 20) < 3 || Math.abs(x - 80) < 3) return 10;
    return x > 23 && x < 77 ? 120 : 250;
  });
  const strokes = 10 * 100;

  const kept = countInk(runCleanup(shaded, { ...DEFAULTS, detail: 100, thickness: 0 }));
  const dropped = countInk(runCleanup(shaded, { ...DEFAULTS, detail: 0, thickness: 0 }));

  assert.ok(dropped < kept, `low detail kept ${dropped}, high detail kept ${kept}`);
  // Low detail leaves the drawing and nothing else.
  assert.equal(dropped, strokes, `the strokes went with the shading: ${dropped} left`);
  // High detail keeps the wash as colourable texture.
  assert.ok(kept > strokes * 2, `high detail dropped the wash anyway: ${kept}`);
});

test('cleaning is deterministic too', () => {
  const source = drawing();
  assert.deepEqual(
    Array.from(runCleanup(source, DEFAULTS).data),
    Array.from(runCleanup(source, DEFAULTS).data),
  );
});

test('a thicker setting thickens a cleaned drawing as well', () => {
  const source = drawing();
  const thin = countInk(runCleanup(source, { ...DEFAULTS, thickness: 0 }));
  const thick = countInk(runCleanup(source, { ...DEFAULTS, thickness: 100 }));
  assert.ok(thick > thin, `thick ${thick} was not more than thin ${thin}`);
});

// --- enlarging --------------------------------------------------------------

test('enlarging returns exactly two colours, so the page stays printable', () => {
  const small = runCleanup(drawing(60, 60), DEFAULTS);
  const big = upscale(small, 180, 180);
  assert.equal(big.width, 180);
  assert.equal(big.height, 180);
  for (const value of big.data) assert.ok(value === INK || value === PAPER, `found ${value}`);
});

test('enlarging keeps the drawing, roughly in proportion', () => {
  const small = runCleanup(drawing(60, 60), { ...DEFAULTS, thickness: 0 });
  const before = countInk(small);
  const after = countInk(upscale(small, 180, 180));
  // Nine times the pixels, so nine times the ink give or take the boundary.
  const ratio = after / (before * 9);
  assert.ok(ratio > 0.7 && ratio < 1.4, `ink scaled by ${ratio.toFixed(2)} of what it should`);
});

test('enlarging at the same size changes nothing', () => {
  const same = runCleanup(drawing(50, 50), DEFAULTS);
  assert.deepEqual(Array.from(upscale(same, 50, 50).data), Array.from(same.data));
});

test('enlarging does not break a line into a staircase of islands', () => {
  // A diagonal is the case nearest-neighbour ruins. It must come out as one
  // connected stroke, not a row of separated squares.
  const diagonal = grey(40, 40, (x, y) => (Math.abs(x - y) < 2 ? INK : PAPER));
  const big = upscale(diagonal, 120, 120);
  // Despeckling with a generous floor removes anything that is not the stroke;
  // if the stroke survived as one piece, almost all the ink is still there.
  const kept = countInk(despeckle(big, 200));
  assert.ok(kept > countInk(big) * 0.9, `only ${kept} of ${countInk(big)} survived as one stroke`);
});

// --- colour -----------------------------------------------------------------

/** An RGBA bitmap from a function of x and y returning [r, g, b]. */
function colorBitmap(width, height, at) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = at(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

// The red and the teal from a checkerboard that came out with the boundaries
// missing: to the eye they are nothing alike, and to a grey picture they are
// within a dozen levels of each other.
const RED = [196, 52, 48];
const TEAL = [52, 120, 132];

test('two colours that look different can be the same grey', () => {
  const patch = colorBitmap(8, 8, (x) => (x < 4 ? RED : TEAL));
  const values = new Set(Array.from(toGray(patch).data));
  const spread = Math.max(...values) - Math.min(...values);
  assert.ok(spread < 30, `grey told them ${spread} apart, which is why this test exists`);

  const lab = toLab(patch);
  // Same story in lightness alone — the difference is entirely in hue.
  const light = Array.from(lightness(lab).data);
  assert.ok(Math.max(...light) - Math.min(...light) < 30);
  const chroma = lab.a[0] - lab.a[lab.a.length - 1];
  assert.ok(Math.abs(chroma) > 60, `hue told them only ${chroma} apart`);
});

test('the colour gradient finds a boundary the grey gradient misses', () => {
  const patch = colorBitmap(60, 60, (x) => (x < 30 ? RED : TEAL));
  const at = (grad, x, y) => Math.hypot(grad.gx[y * 60 + x], grad.gy[y * 60 + x]);

  const grey = sobel(toGray(patch));
  const colour = colorSobel(toLab(patch));
  assert.ok(
    at(colour, 30, 30) > at(grey, 30, 30) * 3,
    `colour ${at(colour, 30, 30).toFixed(0)} against grey ${at(grey, 30, 30).toFixed(0)}`,
  );
});

test('outlines are drawn between two colours of the same lightness', () => {
  // Four squares of a checkerboard, no black lines drawn between them.
  const board = colorBitmap(160, 160, (x, y) => ((x < 80) === (y < 80) ? RED : TEAL));
  const out = runLineArt(board, { ...DEFAULTS, mode: 'edges', thickness: 0, smoothing: 0 });
  const at = (x, y) => out.data[y * 160 + x] === INK;

  // The line down the middle has to be somewhere near the middle.
  let found = 0;
  for (let y = 20; y < 140; y += 10) {
    for (let d = -3; d <= 3; d++) if (at(80 + d, y)) { found++; break; }
  }
  assert.ok(found > 8, `only ${found} of 12 crossings found the boundary`);
  // And the inside of a square stays paper: this is an outline, not a fill.
  assert.ok(!at(40, 40), 'the middle of a square must be left to colour in');
});

// --- smoothing ---------------------------------------------------------------

test('smoothing files the bumps off a ragged edge without moving it', () => {
  // A straight edge with a bite out of it and a bump beside it.
  const ragged = grey(60, 60, (x, y) => {
    const edge = 30 + (y % 6 === 0 ? 3 : y % 5 === 0 ? -3 : 0);
    return x < edge ? INK : PAPER;
  });
  const smoothed = smoothEdges(ragged, 2);

  const crossings = (image) => {
    const xs = [];
    for (let y = 5; y < 55; y++) {
      let x = 0;
      while (x < 60 && image.data[y * 60 + x] === INK) x++;
      xs.push(x);
    }
    const sorted = [...xs].sort((a, b) => a - b);
    const middle = sorted[sorted.length >> 1];
    return { middle, spread: sorted[sorted.length - 1] - sorted[0] };
  };

  const before = crossings(ragged);
  const after = crossings(smoothed);
  assert.ok(after.spread < before.spread, `wobble went ${before.spread} to ${after.spread}`);
  // Still in the same place, give or take a pixel.
  assert.ok(Math.abs(after.middle - before.middle) <= 1, 'smoothing moved the edge');
});

test('smoothing at zero is exactly no smoothing', () => {
  const shape = grey(40, 40, (x, y) => (Math.hypot(x - 20, y - 20) < 12 ? INK : PAPER));
  assert.deepEqual(Array.from(smoothEdges(shape, 0).data), Array.from(shape.data));
});

test('stroke width sees a thin line as thin and a block as thick', () => {
  const line = grey(60, 60, (x) => (Math.abs(x - 30) < 1 ? INK : PAPER));
  const block = grey(60, 60, (x) => (Math.abs(x - 30) < 10 ? INK : PAPER));
  assert.ok(strokeWidth(line) < 4, `a one-pixel line measured ${strokeWidth(line)}`);
  assert.ok(strokeWidth(block) > 12, `a twenty-pixel block measured ${strokeWidth(block)}`);
});

test('a hairline drawing survives the smoothest setting', () => {
  // The cap exists for this: smoothing by more than the stroke is wide would
  // rub the drawing out, so the line has to still be there afterwards.
  const hairline = colorBitmap(300, 300, (x, y) => {
    const onLine = Math.abs(x - 150) < 1 || Math.abs(y - 150) < 1;
    return onLine ? [20, 20, 20] : [250, 250, 250];
  });
  const out = runLineArt(hairline, { ...DEFAULTS, thickness: 0, cleanup: 0, smoothing: 100 });
  assert.ok(countInk(out) > 300, `the drawing was rubbed out: ${countInk(out)} left`);
});

test('smoothing more never leaves a page with more ink than smoothing less', () => {
  const shapes = colorBitmap(200, 200, (x, y) => {
    const v = Math.hypot(x - 100, y - 100) < 60 || (x + y) % 17 < 2 ? 30 : 240;
    return [v, v, v];
  });
  const rough = countInk(runLineArt(shapes, { ...DEFAULTS, smoothing: 0 }));
  const smooth = countInk(runLineArt(shapes, { ...DEFAULTS, smoothing: 100 }));
  assert.ok(smooth <= rough * 1.05, `smoothing added ink: ${rough} to ${smooth}`);
});

// --- the analysis cache -------------------------------------------------------

test('a kept analysis gives exactly the same page as building it fresh', () => {
  const painting = colorBitmap(200, 200, (x, y) => {
    const inside = Math.hypot(x - 100, y - 100) < 60;
    return inside ? [196, 52, 48] : [52, 120, 132];
  });
  for (const mode of ['threshold', 'edges']) {
    const settings = { ...DEFAULTS, mode };
    const analysis =
      mode === 'edges'
        ? { ridges: analyseRidges(painting, settings) }
        : { grey: analyseGrey(painting, settings) };
    assert.deepEqual(
      Array.from(runLineArt(painting, settings, analysis).data),
      Array.from(runLineArt(painting, settings).data),
      `${mode} differed when the analysis was reused`,
    );
  }
});

test('an analysis is keyed by everything it actually depends on', () => {
  const base = analysisKey(DEFAULTS);
  // These move it: they change what the analysis contains.
  assert.notEqual(analysisKey({ ...DEFAULTS, invert: true }), base);
  assert.notEqual(analysisKey({ ...DEFAULTS, cleanup: 80 }), base);
  // These do not, which is the whole point of keeping it.
  assert.equal(analysisKey({ ...DEFAULTS, detail: 90 }), base);
  assert.equal(analysisKey({ ...DEFAULTS, thickness: 90 }), base);
  assert.equal(analysisKey({ ...DEFAULTS, smoothing: 90 }), base);
  assert.equal(analysisKey({ ...DEFAULTS, mode: 'edges' }), base);
});

test('smoothing leaves an already-drawn page exactly as it was', () => {
  // It is there to straighten what tracing made ragged. A page that arrived
  // drawn has nothing to straighten and, very often, a line of small type that
  // a vote of the neighbourhood would fuse into blots.
  const source = drawing();
  assert.deepEqual(
    Array.from(runCleanup(source, { ...DEFAULTS, smoothing: 100 }).data),
    Array.from(runCleanup(source, { ...DEFAULTS, smoothing: 0 }).data),
  );
});

test('small lettering on a drawn page survives the cleanup', () => {
  // Rows of short strokes a few pixels apart, with gaps the size of the
  // strokes: the shape of a caption, and the thing that was being destroyed.
  const caption = colorBitmap(400, 120, (x, y) => {
    const inStroke = y > 40 && y < 80 && x % 12 < 3 && x > 40 && x < 360;
    return inStroke ? [20, 20, 20] : [250, 250, 250];
  });
  const out = runCleanup(caption, { ...DEFAULTS, smoothing: 100, thickness: 0 });
  assert.ok(countInk(out) > 0, 'the caption should not vanish altogether either');
  // Count the gaps along the middle row: they are what must not close.
  let gaps = 0;
  for (let x = 41; x < 360; x++) {
    const here = out.data[60 * 400 + x] === INK;
    const next = out.data[60 * 400 + x + 1] === INK;
    if (here && !next) gaps++;
  }
  assert.ok(gaps > 20, `only ${gaps} strokes stayed separate; the caption ran together`);
});

test('smoothing still straightens a traced edge, which is what it is for', () => {
  const ragged = colorBitmap(300, 300, (x, y) => {
    // A shape whose boundary wobbles by a pixel or two, as tracing leaves it.
    const edge = 150 + ((y * 7) % 5) - 2;
    const v = x < edge ? 30 : 240;
    return [v, v, v];
  });
  const rough = runLineArt(ragged, { ...DEFAULTS, mode: 'threshold', smoothing: 0 });
  const smooth = runLineArt(ragged, { ...DEFAULTS, mode: 'threshold', smoothing: 100 });
  assert.notDeepEqual(
    Array.from(smooth.data),
    Array.from(rough.data),
    'smoothing must still do something on the path it exists for',
  );
});

test('the speck floor on a drawn page is small enough to keep punctuation', () => {
  // The full floor is sized for what a camera adds. A drawn page has none of
  // that, and at the full floor a full stop goes with the dust.
  const dotted = colorBitmap(200, 60, (x, y) => {
    // A short stroke and, well clear of it, a four-pixel full stop.
    const stroke = x > 20 && x < 24 && y > 20 && y < 45;
    const stop = x > 60 && x < 64 && y > 41 && y < 45;
    return stroke || stop ? [20, 20, 20] : [250, 250, 250];
  });
  const out = runCleanup(dotted, { ...DEFAULTS, thickness: 0, cleanup: 100 });
  // The stop is its own piece of ink; if the floor ate it, this column is bare.
  let stopInk = 0;
  for (let y = 38; y < 48; y++) for (let x = 57; x < 68; x++) {
    if (out.data[y * 200 + x] === INK) stopInk++;
  }
  assert.ok(stopInk > 0, 'the full stop was swept up with the dust');
});
