import test from 'node:test';
import assert from 'node:assert/strict';

import { SHEET, STICKER_TABS, tabFor } from '../lib/stickers/tabs.ts';

test('there are three places and each has a label of one word', () => {
  assert.equal(STICKER_TABS.length, 3);
  for (const tab of STICKER_TABS) {
    assert.equal(tab.label.split(' ').length, 1, tab.label);
    assert.ok(tab.title.length > 10, `${tab.label} has no tooltip worth having`);
  }
});

test('every tab has its own page', () => {
  assert.equal(new Set(STICKER_TABS.map((t) => t.href)).size, 3);
});

test('each page knows which tab it is in', () => {
  assert.equal(tabFor('/stickers'), '/stickers');
  assert.equal(tabFor('/stickers/packs'), '/stickers/packs');
  assert.equal(tabFor('/stickers/library'), '/stickers/library');
});

test('the sheet is a page, not a tab, and reads as part of Make', () => {
  // You arrive there holding a selection, from the hub. Being its own tab made
  // it the one place in the bar nobody could use without going elsewhere first.
  assert.ok(!STICKER_TABS.some((tab) => tab.href === SHEET));
  assert.equal(tabFor(SHEET), '/stickers');
});

test('a page under one of them is still in that tab', () => {
  assert.equal(tabFor('/stickers/packs/autumn'), '/stickers/packs');
});

test('the studio owns anything the others do not name', () => {
  // Otherwise /stickers would light up on every page, since they all start
  // with it, and the bar would never say where you are.
  assert.equal(tabFor('/stickers/anything-new'), '/stickers');
});
