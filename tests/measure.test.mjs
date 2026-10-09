import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { FULL_DECODE_PIXELS, MOST_PIXELS, sizeOf, targetSize } from '../lib/lab/measure.ts';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/**
 * The header reader, against the real files in this repository.
 *
 * Every picture the app ships is decoded here with a proper PNG reader and the
 * answer compared with what `sizeOf` says from the first 64 bytes. A header
 * parser that is subtly wrong is worse than none at all: the worker would ask
 * the decoder for the wrong shape and hand the engine a squashed picture.
 */

/** The width and height out of a PNG's IHDR, read independently of lib/lab/measure. */
function pngSizeIndependently(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0), 0x89504e47, 'not a PNG');
  assert.equal(view.getUint32(12), 0x49484452, 'IHDR is not the first chunk');
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

test('it reads the size of every PNG the app ships, from 64 bytes', () => {
  const folders = ['starter/lines', 'public/lab-samples'];
  let seen = 0;
  for (const folder of folders) {
    let names;
    try {
      names = readdirSync(join(ROOT, folder)).filter((n) => n.endsWith('.png'));
    } catch {
      continue;
    }
    for (const name of names) {
      const bytes = readFileSync(join(ROOT, folder, name));
      const expected = pngSizeIndependently(bytes);
      // Only the header is handed over, which is all the worker reads.
      assert.deepEqual(sizeOf(bytes.subarray(0, 64)), expected, `${folder}/${name}`);
      seen += 1;
    }
  }
  assert.ok(seen >= 8, `expected a few pictures to check, saw ${seen}`);
});

test('a GIF, a lossless WebP and an extended WebP are read', () => {
  // Smallest valid headers, built here so the test owns its own inputs.
  const gif = Buffer.from('474946383961' + '2003' + '7002' + '00'.repeat(2), 'hex');
  assert.deepEqual(sizeOf(gif), { width: 800, height: 624 });

  const vp8l = Buffer.alloc(30);
  vp8l.write('RIFF', 0, 'ascii');
  vp8l.write('WEBP', 8, 'ascii');
  vp8l.write('VP8L', 12, 'ascii');
  vp8l.writeUInt8(0x2f, 20);
  // 14 bits of (width - 1), then 14 of (height - 1): 640 x 480.
  vp8l.writeUInt32LE((639 & 0x3fff) | ((479 & 0x3fff) << 14), 21);
  assert.deepEqual(sizeOf(vp8l), { width: 640, height: 480 });

  const vp8x = Buffer.alloc(30);
  vp8x.write('RIFF', 0, 'ascii');
  vp8x.write('WEBP', 8, 'ascii');
  vp8x.write('VP8X', 12, 'ascii');
  vp8x.writeUIntLE(1919, 24, 3);
  vp8x.writeUIntLE(1079, 27, 3);
  assert.deepEqual(sizeOf(vp8x), { width: 1920, height: 1080 });
});

test('a JPEG start-of-frame is found past the markers that are not frames', () => {
  const parts = [
    'ffd8', // SOI
    'ffe000104a46494600010100000100010000', // APP0/JFIF, length 16
    'ffdb0043' + '00'.repeat(65), // DQT, length 67
    'ffc4000a' + '00'.repeat(8), // DHT — 0xC4 shares the 0xC0 block but is NOT a frame
    'ffc0001108' + '04b0' + '0640' + '03012200', // SOF0: 1200 high, 1600 wide
  ];
  assert.deepEqual(sizeOf(Buffer.from(parts.join(''), 'hex')), { width: 1600, height: 1200 });
});

test('bytes that are not a picture, or claim an impossible size, read as null', () => {
  assert.equal(sizeOf(Buffer.from('hello, this is not an image at all')), null);
  assert.equal(sizeOf(Buffer.alloc(0)), null);
  // A PNG header that says the picture is zero wide.
  const zero = Buffer.alloc(24);
  zero.writeUInt32BE(0x89504e47, 0);
  zero.writeUInt32BE(0x49484452, 12);
  zero.writeUInt32BE(0, 16);
  zero.writeUInt32BE(100, 20);
  assert.equal(sizeOf(zero), null);
});

test('a truncated header is null rather than a wrong answer', () => {
  const bytes = readFileSync(join(ROOT, 'starter/lines/cat.png'));
  for (const cut of [4, 8, 12, 20, 23]) {
    assert.equal(sizeOf(bytes.subarray(0, cut)), null, `${cut} bytes should not be enough`);
  }
  assert.ok(sizeOf(bytes.subarray(0, 24)), '24 bytes is a whole IHDR and should be enough');
});

test('the decode target shrinks to the long edge and never enlarges', () => {
  // Landscape, portrait and square all pin the LONG edge, not the width.
  assert.deepEqual(targetSize({ width: 8000, height: 6000 }, 1400), { width: 1400, height: 1050 });
  assert.deepEqual(targetSize({ width: 6000, height: 8000 }, 1400), { width: 1050, height: 1400 });
  assert.deepEqual(targetSize({ width: 900, height: 900 }, 300), { width: 300, height: 300 });

  // Smaller than asked for: left exactly alone. Enlarging in the decoder would
  // blur the picture and charge many times the memory for it.
  assert.deepEqual(targetSize({ width: 200, height: 120 }, 1400), { width: 200, height: 120 });

  // Never zero, however extreme the aspect.
  const sliver = targetSize({ width: 10000, height: 3 }, 300);
  assert.ok(sliver.height >= 1, 'a one-pixel-tall target is still a picture');
});

test('the decode target is the saving it claims to be', () => {
  // The case the change exists for: a 48-megapixel photograph at canvas size.
  const before = 8000 * 6000 * 4;
  const after = (({ width, height }) => width * height * 4)(targetSize({ width: 8000, height: 6000 }, 1400));
  assert.ok(before / after > 30, `expected a big saving, got ${(before / after).toFixed(1)}x`);
  assert.ok(MOST_PIXELS > 8000 * 6000, 'a normal camera must not hit the cap');
});

test('the full-decode budget leaves normal cameras on the path they were always on', () => {
  // The whole point of the budget: a picture under it is decoded exactly as the
  // Lab has always decoded it, so its drawing does not change. These are the
  // sizes people actually bring.
  const common = [
    ['12 MP phone', 4032, 3024],
    ['24 MP mirrorless', 6000, 4000],
    ['4K screenshot', 3840, 2160],
    ['A4 at 300 dpi', 3508, 2480],
  ];
  for (const [what, w, h] of common) {
    assert.ok(w * h <= FULL_DECODE_PIXELS, `${what} (${w}x${h}) should decode whole`);
  }

  // And the sizes that genuinely cannot be decoded whole.
  const huge = [
    ['48 MP phone', 8000, 6000],
    ['100 MP medium format', 11648, 8736],
  ];
  for (const [what, w, h] of huge) {
    assert.ok(w * h > FULL_DECODE_PIXELS, `${what} (${w}x${h}) should be shrunk on the way in`);
  }

  // 128 MB of RGBA. Stated here so changing it is a decision, not a typo.
  assert.equal(FULL_DECODE_PIXELS * 4, 128_000_000);
  assert.ok(MOST_PIXELS > FULL_DECODE_PIXELS, 'the hard cap is above the budget');
});
