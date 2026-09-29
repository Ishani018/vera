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
