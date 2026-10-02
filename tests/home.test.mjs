import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOME_FILTERS,
  badgeFor,
  cleanUpLine,
  emptyDesigns,
  filterEntries,
  inFilter,
  isEmptyDesign,
  searchEntries,
} from '../lib/home.ts';

/** A library row, with only what the front page looks at. */
const entry = (over = {}) => ({
  key: 'k',
  projectId: null,
  kind: 'design',
  bookKind: null,
  name: 'A thing',
  type: 'Instagram post · 1080 × 1080 px',
  at: 1,
  stickers: 0,
  thumb: { width: 100, height: 100, background: '#fff', items: [] },
  ...over,
});

const withItems = (n) => ({
  width: 100,
  height: 100,
  background: '#fff',
  items: Array.from({ length: n }, () => ({ kind: 'text' })),
});

test('every chip the front page shows has a rule behind it', () => {
  assert.deepEqual(HOME_FILTERS.map((f) => f.id), ['all', 'books', 'covers', 'posts', 'print', 'stickers']);
});

test('All is everything, including a book and an empty design', () => {
  const rows = [entry(), entry({ kind: 'poetry' })];
  assert.equal(filterEntries(rows, 'all').length, 2);
});

test('Books is the books, not the boards', () => {
  const rows = [entry({ kind: 'poetry' }), entry({ kind: 'coloring' }), entry({ presetId: 'bookmark' })];
  assert.deepEqual(filterEntries(rows, 'books').map((e) => e.kind), ['poetry', 'coloring']);
});

test('Covers is a book whose cover has something on it', () => {
  const blank = entry({ kind: 'poetry', name: 'Blank' });
  const made = entry({ kind: 'poetry', name: 'Made', thumb: withItems(2) });
  assert.deepEqual(filterEntries([blank, made], 'covers').map((e) => e.name), ['Made']);
});

test('a book can be under Books and under Covers at once', () => {
  // Its cover is the front of it, not a separate thing, so both are true.
  const made = entry({ kind: 'poetry', thumb: withItems(1) });
  assert.ok(inFilter(made, 'books'));
  assert.ok(inFilter(made, 'covers'));
});

test('Posts and Print follow the board the design was made at', () => {
  const rows = [
    entry({ name: 'post', presetId: 'instagram-post' }),
    entry({ name: 'story', presetId: 'instagram-story' }),
    entry({ name: 'pin', presetId: 'pinterest-pin' }),
    entry({ name: 'card', presetId: 'postcard-a6' }),
    entry({ name: 'mark', presetId: 'bookmark' }),
  ];
  assert.deepEqual(filterEntries(rows, 'posts').map((e) => e.name), ['post', 'story', 'pin']);
  assert.deepEqual(filterEntries(rows, 'print').map((e) => e.name), ['card', 'mark']);
});

test('a design whose size is unknown falls under neither, rather than both', () => {
  const odd = entry({ presetId: 'something-that-went-away' });
  assert.equal(inFilter(odd, 'posts'), false);
  assert.equal(inFilter(odd, 'print'), false);
  assert.equal(inFilter(odd, 'all'), true);
});

test('Stickers is anything with a sticker on it, book or board', () => {
  const rows = [
    entry({ name: 'plain' }),
    entry({ name: 'stuck', stickers: 3 }),
    entry({ name: 'book', kind: 'poetry', stickers: 1 }),
  ];
  assert.deepEqual(filterEntries(rows, 'stickers').map((e) => e.name), ['stuck', 'book']);
});

test('the badge is short enough to sit in a corner', () => {
  assert.equal(badgeFor(entry({ kind: 'poetry' })), 'Book');
  assert.equal(badgeFor(entry({ kind: 'coloring' })), 'Colouring');
  assert.equal(badgeFor(entry({ presetId: 'instagram-post' })), 'IG post');
  assert.equal(badgeFor(entry({ presetId: 'bookmark' })), 'Bookmark');
  assert.equal(badgeFor(entry({ presetId: 'gone' })), 'Design');
  for (const row of [entry({ kind: 'poetry' }), entry({ presetId: 'instagram-story' })]) {
    assert.ok(badgeFor(row).length <= 12, badgeFor(row));
  }
});

test('search looks at the name, the detail line and the badge', () => {
  const rows = [
    entry({ name: 'Autumn launch', presetId: 'instagram-post' }),
    entry({ name: 'Winter', presetId: 'bookmark', type: 'Bookmark · 2 × 6 in' }),
    entry({ name: 'My poems', kind: 'poetry', type: 'Poetry book · 4 poems' }),
  ];
  assert.deepEqual(searchEntries(rows, 'autumn').map((e) => e.name), ['Autumn launch']);
  assert.deepEqual(searchEntries(rows, 'bookmark').map((e) => e.name), ['Winter']);
  assert.deepEqual(searchEntries(rows, 'poem').map((e) => e.name), ['My poems']);
  assert.deepEqual(searchEntries(rows, 'IG').map((e) => e.name), ['Autumn launch']);
});

test('search ignores case and surrounding space, and empty shows everything', () => {
  const rows = [entry({ name: 'Autumn' }), entry({ name: 'Winter' })];
  assert.equal(searchEntries(rows, '   AUTUMN ').length, 1);
  assert.equal(searchEntries(rows, '').length, 2);
  assert.equal(searchEntries(rows, '   ').length, 2);
});

test('an empty design is a design with nothing on it', () => {
  assert.equal(isEmptyDesign(entry()), true);
  assert.equal(isEmptyDesign(entry({ thumb: withItems(1) })), false);
});

test('a book is never counted as empty, however little is in it', () => {
  // A book with no poems yet is a book somebody is about to write.
  assert.equal(isEmptyDesign(entry({ kind: 'poetry' })), false);
  assert.equal(isEmptyDesign(entry({ kind: 'coloring' })), false);
});

test('the clean-up names one and counts many', () => {
  assert.equal(cleanUpLine([]), 'Nothing empty to clear up.');
  assert.match(cleanUpLine([entry({ name: 'Untitled post' })]), /^Untitled post has nothing on it/);
  assert.match(cleanUpLine([entry(), entry(), entry()]), /^3 designs have nothing on them/);
});

test('a design with no name still reads as a sentence', () => {
  assert.match(cleanUpLine([entry({ name: '' })]), /^One design has nothing on it/);
});

test('the empty ones are picked out of a mixed list', () => {
  const rows = [
    entry({ name: 'blank' }),
    entry({ name: 'full', thumb: withItems(3) }),
    entry({ name: 'book', kind: 'poetry' }),
    entry({ name: 'blank two' }),
  ];
  assert.deepEqual(emptyDesigns(rows).map((e) => e.name), ['blank', 'blank two']);
});

import { copyName } from '../lib/designs.ts';

test('a copy is named so you can tell it from the original', () => {
  assert.equal(copyName('Autumn post'), 'Autumn post copy');
  assert.equal(copyName('Autumn post copy'), 'Autumn post copy 2');
  assert.equal(copyName('Autumn post copy 2'), 'Autumn post copy 3');
  assert.equal(copyName(''), 'Design copy');
  assert.equal(copyName('   '), 'Design copy');
});

test('a name that merely ends in the word copy is not mistaken for one', () => {
  // "Photocopy" is a name, not a copy of "Photo".
  assert.equal(copyName('Photocopy'), 'Photocopy copy');
});

import { categoryOf } from '../lib/home.ts';

test('a card wears the colour of what it is', () => {
  assert.equal(categoryOf(entry({ kind: 'poetry' })), 'books');
  assert.equal(categoryOf(entry({ kind: 'coloring' })), 'books');
  assert.equal(categoryOf(entry({ presetId: 'instagram-post' })), 'social');
  assert.equal(categoryOf(entry({ presetId: 'pinterest-pin' })), 'social');
  assert.equal(categoryOf(entry({ presetId: 'postcard-a6' })), 'print');
  assert.equal(categoryOf(entry({ presetId: 'bookmark' })), 'print');
});

test('a design whose size has gone still wears a colour', () => {
  // An uncoloured badge in a grid of coloured ones reads as a fault.
  assert.equal(categoryOf(entry({ presetId: 'something-that-went-away' })), 'covers');
  assert.equal(categoryOf(entry({ presetId: undefined })), 'covers');
});
