import assert from 'node:assert/strict';
import test from 'node:test';

import { PALETTE, isHex, normaliseHex } from '../lib/palette.ts';

test('every colour in the palette is a hex code, and no two are the same', () => {
  assert.equal(PALETTE.length, 24);
  for (const colour of PALETTE) {
    assert.ok(isHex(colour.hex), `${colour.name}: ${colour.hex}`);
    assert.equal(colour.hex, normaliseHex(colour.hex), `${colour.name} is not normalised`);
    assert.ok(colour.name, colour.hex);
  }
  const seen = new Set(PALETTE.map((c) => c.hex));
  assert.equal(seen.size, PALETTE.length, 'the same colour is offered twice');
});

test('a short hex is the same colour as its long form', () => {
  assert.equal(normaliseHex('#abc'), '#AABBCC');
  assert.equal(normaliseHex('#AaBbCc'), '#AABBCC');
  // Leading and trailing space is what a paste brings with it.
  assert.equal(normaliseHex('  #0b6a62 '), '#0B6A62');
});

test('what is not a colour is refused', () => {
  for (const bad of ['', '#', '#12', '#12345', 'rgb(0,0,0)', 'teal', '#gggggg', '0B6A62']) {
    assert.equal(isHex(bad), false, JSON.stringify(bad));
  }
});

/* ---------------------------------------------- the colours in a picture */

import { paletteOf } from '../lib/stickers/palette.ts';

/** A bitmap of named bands, so what should come out is known in advance. */
const banded = (bands, size = 300) => {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const band = bands[Math.min(bands.length - 1, Math.floor((y / size) * bands.length))];
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      data[i] = band[0];
      data[i + 1] = band[1];
      data[i + 2] = band[2];
      data[i + 3] = band[3] ?? 255;
    }
  }
  return { width: size, height: size, data };
};

test('the colours of a picture come back, commonest first', () => {
  const picture = banded([
    [220, 40, 40],
    [220, 40, 40],
    [40, 90, 220],
  ]);
  const found = paletteOf(picture);
  assert.equal(found[0], '#DC2828');
  assert.ok(found.includes('#285ADC'), found.join(' '));
});

test('two colours that look the same are offered once', () => {
  // Three reds a person could not tell apart: one swatch is the useful answer.
  const found = paletteOf(banded([[220, 40, 40], [222, 42, 41], [218, 38, 43]]));
  assert.equal(found.length, 1);
});

test('the transparent background is not a colour', () => {
  const found = paletteOf(banded([[0, 0, 0, 0], [30, 160, 90]]));
  assert.deepEqual(found, ['#1EA05A']);
});

test('no more than asked for comes back', () => {
  const many = Array.from({ length: 40 }, (_, i) => [(i * 37) % 256, (i * 91) % 256, (i * 53) % 256]);
  assert.ok(paletteOf(banded(many, 600), 6).length <= 6);
});

test('a picture of nothing has no colours', () => {
  assert.deepEqual(paletteOf(banded([[0, 0, 0, 0]])), []);
});
