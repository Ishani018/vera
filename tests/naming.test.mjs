import assert from 'node:assert/strict';
import test from 'node:test';

import { firstWords, nameFor } from '../lib/home/naming.ts';

/**
 * A list of your own work should never say "Untitled" four times.
 *
 * These are the awkward cases rather than the happy one: the happy one is that
 * somebody typed a name and it is used.
 */

const entry = (over = {}) => ({
  key: 'k',
  stickers: 0,
  projectId: null,
  kind: 'design',
  bookKind: null,
  name: '',
  type: 'Instagram post',
  at: Date.UTC(2026, 9, 1, 12),
  thumb: { width: 100, height: 100, background: '#fff', items: [] },
  ...over,
});

const text = (value) => ({
  kind: 'text', x: 0, y: 0, width: 10, text: value, sizePt: 12, lineHeight: 1.2,
  color: '#000', weight: 400, italic: false, align: 'left', rotate: 0,
  family: 'x', fallback: 'serif',
});

test('a name somebody gave it wins over everything', () => {
  assert.equal(nameFor(entry({ name: 'Harbour Lights' })), 'Harbour Lights');
  // Even when there is text on the board that says otherwise.
  assert.equal(nameFor(entry({ name: 'Harbour Lights', thumb: { items: [text('Other')] } })), 'Harbour Lights');
});

test('a name of only spaces is not a name', () => {
  assert.equal(nameFor(entry({ name: '   ', thumb: { items: [text('Salt and Small Hours')] } })),
    'Salt and Small Hours');
});

test('an unnamed design is called after the first words on it', () => {
  assert.equal(nameFor(entry({ thumb: { items: [text('Salt and Small Hours')] } })), 'Salt and Small Hours');
});

test('the first *text* item, not the first item of any kind', () => {
  const items = [{ kind: 'picture', x: 0, y: 0, width: 1, height: 1, assetId: 'a', rotate: 0, radius: 0, fit: 'cover' }, text('The Fox')];
  assert.equal(nameFor(entry({ thumb: { items } })), 'The Fox');
});

test('punctuation on its own is not a name', () => {
  // Somebody typing a dash into a text box has not titled anything.
  assert.equal(nameFor(entry({ thumb: { items: [text('—'), text('Real Title')] } })), 'Real Title');
  assert.equal(firstWords('!!!'), null);
  assert.equal(firstWords('   '), null);
});

test('a long heading is cut at a word, not mid-syllable', () => {
  const long = 'The Complete and Unabridged History of Small Harbours';
  const got = nameFor(entry({ thumb: { items: [text(long)] } }));
  assert.ok(got.length <= 33, got);
  assert.ok(got.endsWith('…'), got);
  assert.ok(!got.includes('  '), got);
  // It broke at a space rather than inside a word.
  assert.ok(long.startsWith(got.slice(0, -1)), got);
});

test('one very long word is still cut, rather than running away', () => {
  const got = firstWords('Supercalifragilisticexpialidociousandthensome');
  assert.ok(got.length <= 33, got);
  assert.ok(got.endsWith('…'));
});

test('newlines and runs of space collapse', () => {
  assert.equal(firstWords('  Two\n\n  Lines  '), 'Two Lines');
});

test('a board with no words is named after what is on it', () => {
  assert.equal(nameFor(entry({ stickers: 1 })), 'One sticker');
  assert.equal(nameFor(entry({ stickers: 4 })), '4 stickers');
});

test('and an empty one gets a date, which at least differs from the row above', () => {
  const now = Date.UTC(2026, 9, 3, 9);
  assert.equal(nameFor(entry({ at: Date.UTC(2026, 9, 1, 12) }), now), 'Draft, 1 October');
  assert.equal(nameFor(entry({ at: Date.UTC(2026, 9, 3, 1) }), now), 'Draft, today');
});

test('never, under any circumstances, "Untitled"', () => {
  const awkward = [
    entry(),
    entry({ name: '' }),
    entry({ name: '  ' }),
    entry({ thumb: { items: [] } }),
    entry({ thumb: undefined }),
    entry({ thumb: { items: [text('')] } }),
    entry({ thumb: { items: [text('   ')] } }),
    entry({ stickers: 0, name: null }),
  ];
  for (const one of awkward) {
    const got = nameFor(one);
    assert.ok(got && got.trim().length > 0, JSON.stringify(one));
    assert.ok(!/untitled/i.test(got), got);
  }
});
