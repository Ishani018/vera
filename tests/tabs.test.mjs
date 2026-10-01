import test from 'node:test';
import assert from 'node:assert/strict';

import { STICKER_TABS, tabFor } from '../lib/stickers/tabs.ts';

test('there are four places and each has a label short enough to read', () => {
  assert.equal(STICKER_TABS.length, 4);
  for (const tab of STICKER_TABS) {
    assert.ok(tab.label.split(' ').length <= 3, tab.label);
    assert.ok(tab.title.length > 10, `${tab.label} has no tooltip worth having`);
  }
});

test('every tab has its own page', () => {
  assert.equal(new Set(STICKER_TABS.map((t) => t.href)).size, 4);
});

test('each page knows which tab it is in', () => {
  assert.equal(tabFor('/stickers'), '/stickers');
  assert.equal(tabFor('/stickers/sheet'), '/stickers/sheet');
  assert.equal(tabFor('/stickers/packs'), '/stickers/packs');
  assert.equal(tabFor('/stickers/sources'), '/stickers/sources');
});

test('a page under one of them is still in that tab', () => {
  assert.equal(tabFor('/stickers/packs/autumn'), '/stickers/packs');
});

test('the studio owns anything the others do not name', () => {
  // Otherwise /stickers would light up on every page, since they all start
  // with it, and the bar would never say where you are.
  assert.equal(tabFor('/stickers/anything-new'), '/stickers');
});
