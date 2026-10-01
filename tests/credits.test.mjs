import test from 'node:test';
import assert from 'node:assert/strict';

import {
  creditsOf,
  creditsText,
  packCounts,
  searchCredits,
} from '../lib/starter/credits.ts';

/** A library row, with only what the credits care about. */
const sticker = (id, source, extra = {}) => ({
  id,
  name: `Name ${id}`,
  tags: [],
  assetId: `asset-${id}`,
  width: 240,
  height: 240,
  createdAt: 1,
  ...(source ? { source } : {}),
  ...extra,
});

const source = (pack, file, extra = {}) => ({
  pack,
  file,
  sourceUrl: `https://example.invalid/${pack}/${file}`,
  author: 'A Person',
  licence: 'CC0-1.0',
  downloadedOn: '2026-01-02',
  ...extra,
});

test('only stickers from a pack are listed', () => {
  const credits = creditsOf([
    sticker('a', source('sample', 'circle.png')),
    sticker('b', null),
    sticker('c', source('lines', 'leaf.png')),
  ]);
  assert.deepEqual(
    credits.map((c) => c.id),
    ['c', 'a'],
  );
});

test('a sticker you drew yourself is never listed', () => {
  assert.equal(creditsOf([sticker('mine', null)]).length, 0);
});

test('a sticker in the trash is not credited', () => {
  const credits = creditsOf([
    sticker('gone', source('sample', 'circle.png'), { deletedAt: Date.now() }),
    sticker('here', source('sample', 'ring.png')),
  ]);
  assert.deepEqual(
    credits.map((c) => c.file),
    ['ring.png'],
  );
});

test('the order is by pack then file, so the file does not shuffle between exports', () => {
  const credits = creditsOf([
    sticker('1', source('sample', 'star.png')),
    sticker('2', source('lines', 'tree.png')),
    sticker('3', source('sample', 'circle.png')),
    sticker('4', source('lines', 'apple.png')),
  ]);
  assert.deepEqual(
    credits.map((c) => `${c.pack}/${c.file}`),
    ['lines/apple.png', 'lines/tree.png', 'sample/circle.png', 'sample/star.png'],
  );
});

test('every field travels from the sticker to its credit', () => {
  const [credit] = creditsOf([
    sticker(
      'a',
      source('sample', 'circle.png', {
        author: 'Someone Else',
        licence: 'Public Domain Mark 1.0',
        downloadedOn: '2025-12-31',
      }),
    ),
  ]);
  assert.equal(credit.name, 'Name a');
  assert.equal(credit.pack, 'sample');
  assert.equal(credit.file, 'circle.png');
  assert.equal(credit.author, 'Someone Else');
  assert.equal(credit.licence, 'Public Domain Mark 1.0');
  assert.equal(credit.sourceUrl, 'https://example.invalid/sample/circle.png');
  assert.equal(credit.downloadedOn, '2025-12-31');
});

test('a renamed sticker is credited under the name you gave it', () => {
  // The source says what it was called when it arrived; the list is a list of
  // what you have, so it uses the name that is actually on the sticker now.
  const [credit] = creditsOf([
    sticker('a', source('sample', 'circle.png', { installedAs: { name: 'Circle', tags: [] } }), {
      name: 'My lovely circle',
    }),
  ]);
  assert.equal(credit.name, 'My lovely circle');
});

test('packs are counted', () => {
  const credits = creditsOf([
    sticker('1', source('sample', 'a.png')),
    sticker('2', source('sample', 'b.png')),
    sticker('3', source('lines', 'c.png')),
  ]);
  assert.deepEqual(packCounts(credits), [
    { pack: 'lines', count: 1 },
    { pack: 'sample', count: 2 },
  ]);
});

const four = creditsOf([
  sticker('1', source('sample', 'circle.png', { author: 'Ada Lovelace' })),
  sticker('2', source('sample', 'ring.png', { licence: 'Public Domain' })),
  sticker('3', source('lines', 'leaf.png', { author: 'Ada Lovelace' })),
  sticker('4', source('lines', 'tree.png')),
]);

test('search matches the name', () => {
  assert.deepEqual(
    searchCredits(four, 'Name 3', null).map((c) => c.id),
    ['3'],
  );
});

test('search matches the author, the licence, the file and the link', () => {
  assert.deepEqual(
    searchCredits(four, 'ada', null)
      .map((c) => c.id)
      .sort(),
    ['1', '3'],
  );
  assert.deepEqual(
    searchCredits(four, 'public domain', null).map((c) => c.id),
    ['2'],
  );
  assert.deepEqual(
    searchCredits(four, 'leaf.png', null).map((c) => c.id),
    ['3'],
  );
  assert.deepEqual(
    searchCredits(four, 'example.invalid/lines', null)
      .map((c) => c.id)
      .sort(),
    ['3', '4'],
  );
});

test('search ignores case and surrounding space', () => {
  assert.deepEqual(
    searchCredits(four, '   ADA   ', null)
      .map((c) => c.id)
      .sort(),
    ['1', '3'],
  );
});

test('an empty search shows everything, not nothing', () => {
  assert.equal(searchCredits(four, '', null).length, 4);
  assert.equal(searchCredits(four, '   ', null).length, 4);
});

test('the pack filter narrows to one pack', () => {
  assert.deepEqual(
    searchCredits(four, '', 'lines')
      .map((c) => c.id)
      .sort(),
    ['3', '4'],
  );
});

test('the pack filter and the search apply together', () => {
  assert.deepEqual(
    searchCredits(four, 'ada', 'lines').map((c) => c.id),
    ['3'],
  );
  assert.deepEqual(searchCredits(four, 'ada', 'nothing-like-this'), []);
});

test('the credits file names every item under its pack', () => {
  const text = creditsText(four, new Date('2026-03-04T00:00:00Z'));
  assert.match(text, /^Sources and licences$/m);
  assert.match(text, /Listed 2026-03-04\. 4 items\./);
  assert.match(text, /^lines \(2\)$/m);
  assert.match(text, /^sample \(2\)$/m);
  for (const credit of four) {
    assert.ok(text.includes(credit.name), `missing ${credit.name}`);
    assert.ok(text.includes(credit.sourceUrl), `missing ${credit.sourceUrl}`);
    assert.ok(text.includes(credit.file), `missing ${credit.file}`);
  }
  assert.ok(text.includes('Ada Lovelace'));
  assert.ok(text.includes('Public Domain'));
});

test('the credits file says attribution is not required, since that is the point of CC0', () => {
  assert.match(creditsText(four), /none of it requires attribution/);
});

test('the credits file ends with exactly one newline, so it appends cleanly', () => {
  const text = creditsText(four);
  assert.ok(text.endsWith('\n'));
  assert.ok(!text.endsWith('\n\n'));
});

test('one item is one item, not 1 items', () => {
  assert.match(creditsText(four.slice(0, 1)), /1 item\./);
});

test('an empty library still makes a readable file', () => {
  const text = creditsText([], new Date('2026-03-04T00:00:00Z'));
  assert.match(text, /0 items\./);
  assert.ok(text.endsWith('\n'));
});

test('the file groups by pack rather than repeating a pack heading', () => {
  const text = creditsText(
    creditsOf([
      sticker('1', source('sample', 'a.png')),
      sticker('2', source('lines', 'b.png')),
      sticker('3', source('sample', 'c.png')),
    ]),
  );
  assert.equal(text.match(/^sample \(2\)$/gm)?.length, 1);
  assert.equal(text.match(/^lines \(1\)$/gm)?.length, 1);
  // lines before sample, matching what the screen shows.
  assert.ok(text.indexOf('lines (1)') < text.indexOf('sample (2)'));
});

import { packSummaries } from '../lib/starter/credits.ts';

test('an installed pack is summarised from its stickers', () => {
  const credits = creditsOf([
    sticker('1', source('sample', 'a.png', { author: 'Ada' })),
    sticker('2', source('sample', 'b.png', { author: 'Grace', downloadedOn: '2026-02-02' })),
    sticker('3', source('lines', 'c.png')),
  ]);
  const [lines, sample] = packSummaries(credits);
  assert.equal(lines.pack, 'lines');
  assert.equal(sample.count, 2);
  assert.deepEqual(sample.authors, ['Ada', 'Grace']);
  assert.deepEqual(sample.licences, ['CC0-1.0']);
  assert.deepEqual(sample.sources, ['https://example.invalid/sample/a.png', 'https://example.invalid/sample/b.png']);
  assert.equal(sample.added, '2026-02-02', 'the newest download date in it');
});

test('a pack with two licences in it says both, rather than picking one', () => {
  const credits = creditsOf([
    sticker('1', source('mixed', 'a.png', { licence: 'CC0-1.0' })),
    sticker('2', source('mixed', 'b.png', { licence: 'Public Domain Mark 1.0' })),
    sticker('3', source('mixed', 'c.png', { licence: 'CC0-1.0' })),
  ]);
  assert.deepEqual(packSummaries(credits)[0].licences, ['CC0-1.0', 'Public Domain Mark 1.0']);
});

test('a summary carries four ids for a collage, however many are in the pack', () => {
  const credits = creditsOf(
    Array.from({ length: 9 }, (_, n) => sticker(`s${n}`, source('big', `f${n}.png`))),
  );
  assert.equal(packSummaries(credits)[0].count, 9);
  assert.equal(packSummaries(credits)[0].ids.length, 4);
});

test('an empty library has no packs, rather than one empty one', () => {
  assert.deepEqual(packSummaries([]), []);
});
