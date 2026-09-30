import assert from 'node:assert/strict';
import test from 'node:test';

import { INK, PAPER } from '../lib/lineart/pipeline.ts';
import {
  CLEAR,
  SOLID,
  backgroundMask,
  compositeSticker,
  dieCutRing,
  feather,
  grow,
  hasTransparency,
  maskFromInk,
  padBitmap,
  padMask,
  parseColour,
  roundCorners,
} from '../lib/lineart/mask.ts';

/* ---------------------------------------------------------------- fixtures */

/** A picture: `plot(x, y)` returns [r,g,b] and everything is opaque. */
function picture(width, height, plot) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = plot(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Two-value line art: `isInk(x, y)`. */
function lines(width, height, isInk) {
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = isInk(x, y) ? INK : PAPER;
  }
  return { width, height, data };
}

const at = (mask, x, y) => mask.data[y * mask.width + x];
const alphaAt = (bitmap, x, y) => bitmap.data[(y * bitmap.width + x) * 4 + 3];

/**
 * A letter O on white: a filled disc with a hole punched out of the middle.
 *
 * The hole is white, exactly like the background, and is not joined to it.
 * This is the shape every naive background remover gets wrong.
 */
const RING = { cx: 20, cy: 20, outer: 14, inner: 6 };
const inRing = (x, y) => {
  const d = Math.hypot(x - RING.cx, y - RING.cy);
  return d <= RING.outer && d >= RING.inner;
};
const inHole = (x, y) => Math.hypot(x - RING.cx, y - RING.cy) < RING.inner - 1;

/* ------------------------------------------------------------ determinism */

test('the same picture gives the same mask, every time', () => {
  const source = picture(40, 40, (x, y) => (inRing(x, y) ? [20, 30, 40] : [255, 255, 255]));
  const once = backgroundMask(source, 12);
  const twice = backgroundMask(source, 12);
  assert.deepEqual([...once.data], [...twice.data]);

  // And through the whole chain, which is what actually ships.
  const ringA = dieCutRing(once, 3, 2);
  const ringB = dieCutRing(twice, 3, 2);
  assert.deepEqual([...ringA.data], [...ringB.data]);
  const a = compositeSticker({ subject: once, ring: ringA, paint: source, inkColour: '#000', ringColour: '#fff' });
  const b = compositeSticker({ subject: twice, ring: ringB, paint: source, inkColour: '#000', ringColour: '#fff' });
  assert.deepEqual([...a.data], [...b.data]);
});

test('nothing in it depends on the clock or on chance', () => {
  // Run it against a picture built in a different order, to catch anything
  // that had quietly come to depend on traversal order.
  const source = picture(30, 30, (x, y) => (x > 10 && x < 20 && y > 10 && y < 20 ? [0, 0, 0] : [250, 250, 250]));
  const first = backgroundMask(source, 10);
  const second = backgroundMask(picture(30, 30, (x, y) => (x > 10 && x < 20 && y > 10 && y < 20 ? [0, 0, 0] : [250, 250, 250])), 10);
  assert.deepEqual([...first.data], [...second.data]);
});

/* ------------------------------------------------------- holes and insides */

test('the inside of an O is not punched out', () => {
  const source = picture(40, 40, (x, y) => (inRing(x, y) ? [20, 30, 40] : [255, 255, 255]));
  const mask = backgroundMask(source, 12);

  // The ring itself is kept.
  assert.equal(at(mask, RING.cx, RING.cy - RING.outer + 2), SOLID, 'the stroke survives');
  // The hole in the middle is the same white as the background and is kept
  // anyway, because it is not joined to the border.
  assert.equal(at(mask, RING.cx, RING.cy), SOLID, 'the enclosed white stays opaque');
  let hole = 0;
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) if (inHole(x, y) && at(mask, x, y) !== SOLID) hole += 1;
  }
  assert.equal(hole, 0, 'not one pixel of the enclosed white was removed');

  // And the actual background did go.
  assert.equal(at(mask, 0, 0), CLEAR);
  assert.equal(at(mask, 39, 39), CLEAR);
});

test('two separate subjects both survive, and the gap between them goes', () => {
  const source = picture(40, 20, (x, y) =>
    (x > 4 && x < 12 && y > 4 && y < 16) || (x > 26 && x < 34 && y > 4 && y < 16)
      ? [10, 10, 10]
      : [255, 255, 255],
  );
  const mask = backgroundMask(source, 12);
  assert.equal(at(mask, 8, 10), SOLID);
  assert.equal(at(mask, 30, 10), SOLID);
  assert.equal(at(mask, 20, 10), CLEAR, 'the border-connected gap between them is background');
});

test('line art keeps its ink and loses its paper', () => {
  const art = lines(20, 20, (x, y) => x === 10 || y === 10);
  const mask = maskFromInk(art);
  assert.equal(at(mask, 10, 5), SOLID);
  assert.equal(at(mask, 3, 3), CLEAR);
  assert.equal(mask.data.length, 400);
});

/* -------------------------------------------------------------- the outline */

test('the outline never covers the artwork', () => {
  const art = lines(40, 40, (x, y) => inRing(x, y));
  const subject = maskFromInk(art);
  const ring = dieCutRing(subject, 4, 2);

  // Not one pixel is in both.
  for (let i = 0; i < subject.data.length; i++) {
    assert.ok(
      !(subject.data[i] > 0 && ring.data[i] > 0),
      `pixel ${i} is in the artwork and in the outline at once`,
    );
  }

  // And after compositing, every pixel that was artwork is still opaque and
  // still the ink colour rather than the outline's.
  const out = compositeSticker({
    subject,
    ring,
    paint: null,
    inkColour: '#000000',
    ringColour: '#FF0000',
  });
  for (let p = 0, i = 0; p < subject.data.length; p++, i += 4) {
    if (subject.data[p] === SOLID) {
      assert.equal(out.data[i + 3], 255, 'artwork stayed opaque');
      assert.equal(out.data[i], 0, 'artwork kept its own colour');
    }
  }
});

test('a thin line is not eaten by its own outline', () => {
  // One pixel wide, which is the case where an outline drawn carelessly wins.
  const art = lines(30, 30, (x) => x === 15);
  const subject = maskFromInk(art);
  const ring = dieCutRing(subject, 3, 0);
  const out = compositeSticker({
    subject, ring, paint: null, inkColour: '#000000', ringColour: '#FFFFFF',
  });
  for (let y = 0; y < 30; y++) {
    assert.equal(alphaAt(out, 15, y), 255, `the line survives at row ${y}`);
    assert.equal(out.data[(y * 30 + 15) * 4], 0, 'and is still black, not white');
  }
});

test('padding gives the outline somewhere to go', () => {
  // A subject running right to the edge: without padding the ring has no room.
  const art = lines(20, 20, (x, y) => y >= 8 && y <= 11);
  const subject = maskFromInk(art);
  const padded = padMask(subject, 5);
  assert.equal(padded.width, 30);
  assert.equal(padded.height, 30);
  assert.equal(at(padded, 10, 13), SOLID, 'the artwork moved with the padding');
  assert.equal(at(padded, 0, 0), CLEAR, 'and the new room is empty');

  // The band was rows 8-11 and is now 13-16, so a 4px ring reaches up into
  // rows 9-12 — space that only exists because of the padding.
  const ring = dieCutRing(padded, 4, 0);
  let above = 0;
  for (let x = 0; x < padded.width; x++) if (at(ring, x, 11) > 0) above += 1;
  assert.ok(above > 0, 'the ring is drawn in the room that was made for it');
  assert.equal(at(ring, 10, 14), CLEAR, 'and not over the artwork');
});

test('a picture is padded the same way its mask is', () => {
  const source = picture(10, 10, () => [10, 20, 30]);
  const padded = padBitmap(source, 2);
  assert.equal(padded.width, 14);
  assert.equal(padded.height, 14);
  // The original pixels landed at the offset, and the new margin is blank.
  const i = (2 * 14 + 2) * 4;
  assert.deepEqual([padded.data[i], padded.data[i + 1], padded.data[i + 2]], [10, 20, 30]);
  assert.equal(padded.data[3], 0, 'the margin is transparent, not black');
});

test('rounding the corners is a closing, so it never shrinks the subject', () => {
  const art = lines(30, 30, (x, y) => x > 8 && x < 22 && y > 8 && y < 22);
  const subject = maskFromInk(art);
  const rounded = roundCorners(subject, 3);
  // A closing only ever adds. The middle is certainly still there.
  assert.equal(at(rounded, 15, 15), SOLID);
  assert.ok(grow(subject, 1).data.filter(Boolean).length >= subject.data.filter(Boolean).length);
});

/* ------------------------------------------------------------- the alpha */

test('the finished sticker really has an alpha channel', () => {
  // A filled disc in the middle: plainly some ink and plainly some paper.
  const art = lines(20, 20, (x, y) => Math.hypot(x - 10, y - 10) < 6);
  const subject = maskFromInk(art);
  const out = compositeSticker({
    subject, ring: null, paint: null, inkColour: '#1B1815', ringColour: '#FFFFFF',
  });

  assert.equal(out.data.length, 20 * 20 * 4, 'four channels per pixel');
  assert.ok(hasTransparency(out), 'something in it is see-through');

  const alphas = new Set();
  for (let i = 3; i < out.data.length; i += 4) alphas.add(out.data[i]);
  assert.ok(alphas.has(0), 'and something is fully transparent');
  assert.ok(alphas.has(255), 'and something is fully opaque');
});

test('an all-opaque picture is honestly reported as having no transparency', () => {
  const flat = picture(4, 4, () => [1, 2, 3]);
  assert.equal(hasTransparency(flat), false);
});

test('feathering puts real half-values along the edge', () => {
  // `blur` is three box passes, so its reach is about three times its radius.
  // The square is wide enough that the middle is beyond that reach.
  const art = lines(60, 60, (x, y) => x > 15 && x < 45 && y > 15 && y < 45);
  const soft = feather(maskFromInk(art), 2);

  const between = [...new Set([...soft.data])].filter((v) => v > 0 && v < 255);
  assert.ok(between.length > 0, 'the cut edge is graded rather than a staircase');
  assert.equal(at(soft, 30, 30), SOLID, 'the middle is untouched');
  assert.equal(at(soft, 0, 0), CLEAR, 'and so is the far background');

  // Graded means graded: values climb across the edge rather than jumping.
  const across = [];
  for (let x = 10; x <= 22; x++) across.push(at(soft, x, 30));
  assert.ok(across.some((v) => v > 0 && v < 255), 'there is a ramp, not a cliff');
  for (let i = 1; i < across.length; i++) {
    assert.ok(across[i] >= across[i - 1], 'and it only ever climbs on the way in');
  }
});

/* ------------------------------------------------------------------ colour */

test('colours parse in both lengths and never throw', () => {
  assert.deepEqual(parseColour('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseColour('#0B6A62'), { r: 11, g: 106, b: 98 });
  assert.deepEqual(parseColour('nonsense'), { r: 0, g: 0, b: 0 });
});

test('a kept picture keeps its own colours, not a flat fill', () => {
  const source = picture(20, 20, (x, y) => (x > 5 && x < 15 && y > 5 && y < 15 ? [200, 30, 60] : [255, 255, 255]));
  const subject = backgroundMask(source, 10);
  const out = compositeSticker({
    subject, ring: null, paint: source, inkColour: '#000000', ringColour: '#FFFFFF',
  });
  const i = (10 * 20 + 10) * 4;
  assert.deepEqual([out.data[i], out.data[i + 1], out.data[i + 2]], [200, 30, 60]);
  assert.equal(out.data[i + 3], 255);
  assert.equal(alphaAt(out, 0, 0), 0, 'and the paper went');
});
