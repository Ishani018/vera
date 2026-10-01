import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { runLineArt, toBitmap } from '../lib/lineart/pipeline.ts';
import { applySwaps } from '../lib/stickers/recolour.ts';
import { cutLine, cutLineSvg } from '../lib/stickers/cutline.ts';
import { DEFAULT_LINE_ART } from '../lib/projects.ts';

/**
 * The export, pinned to the pixel.
 *
 * Everything here is the maths the exported sticker is made of: the trace, the
 * colour swaps and the cut line. A change in any of it changes the file
 * somebody sells, so these digests exist to make that change impossible to
 * ship by accident — including as a side effect of work on the *preview*,
 * which shares this code and is allowed to get faster but never to alter it.
 *
 * If one of these fails, the question is not "what is the new digest" but
 * "which pixels moved, and was that intended". The pictures are generated
 * arithmetically, so the test needs no fixtures and nothing can drift
 * underneath it.
 */

const digest = (bytes) => createHash('sha256').update(Buffer.from(bytes.buffer ?? bytes)).digest('hex').slice(0, 16);

/** A fixed picture: a soft disc, a hard square and a thin stroke, on a ramp. */
function picture(width = 160, height = 120) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      // A lighting ramp across the frame, so the background is never flat.
      let value = 200 + Math.round((x / width) * 40) - Math.round((y / height) * 20);
      const disc = Math.hypot(x - 48, y - 56);
      if (disc < 26) value = 60 + Math.round(disc * 2);
      if (x > 96 && x < 136 && y > 28 && y < 68) value = 30;
      if (y > 92 && y < 95 && x > 16 && x < 144) value = 20;
      data[at] = value;
      data[at + 1] = value;
      data[at + 2] = Math.max(0, value - 12);
      data[at + 3] = 255;
    }
  }
  return { width, height, data };
}

const SETTINGS = { ...DEFAULT_LINE_ART, detail: 55, thickness: 40, cleanup: 35, smoothing: 50 };

test('the trace gives the same pixels it always has', () => {
  const traced = runLineArt(picture(), SETTINGS);
  assert.equal(traced.width, 160);
  assert.equal(traced.height, 120);
  assert.equal(digest(traced.data), 'a90da66532903650');
});

test('every mode traces to its own fixed picture', () => {
  const modes = ['threshold', 'edges'];
  const digests = modes.map((mode) => digest(runLineArt(picture(), { ...SETTINGS, mode }).data));
  assert.deepEqual(digests, ['a90da66532903650', '9a4a12e78c5dc4b1']);
  assert.notEqual(digests[0], digests[1], 'two modes that agree are one mode');
});

test('the traced picture comes back as pure black on pure white', () => {
  const bitmap = toBitmap(runLineArt(picture(), SETTINGS));
  const values = new Set(bitmap.data.filter((_, i) => i % 4 !== 3));
  assert.deepEqual([...values].sort((a, b) => a - b), [0, 255]);
  assert.equal(digest(bitmap.data), 'a5e996807f62a54e');
});

test('a colour swap gives the same pixels it always has', () => {
  const swapped = applySwaps(picture(64, 64), [
    { from: '#c8c8bc', to: '#E8B4B8', tolerance: 14 },
    { from: '#3c3c30', to: '#1B1815', tolerance: 20 },
  ]);
  assert.equal(digest(swapped.data), '5fb949594cdb4ee9');
});

test('a picture with no swaps is handed back untouched, byte for byte', () => {
  const source = picture(32, 32);
  assert.equal(applySwaps(source, []), source);
});

test('the cut line follows the same path it always has', () => {
  const width = 64;
  const height = 64;
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const r = Math.hypot(x - 32, y - 32);
      // A ring: solid between the two radii, so the trace has a hole to wind
      // the other way round.
      data[y * width + x] = r < 26 && r > 10 ? 255 : 0;
    }
  }
  const cut = cutLine({ width, height, data });
  assert.equal(cut.loops, 2, 'an outline and the hole inside it');
  assert.equal(cut.width, width);
  assert.equal(digest(new TextEncoder().encode(cutLineSvg(cut))), '3c0e9615cb66ab31');
});
