import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';

import {
  bookName,
  firstWords,
  isPlaceholder,
  nameFor,
  newCollectionTitle,
  newColouringBookTitle,
  pageName,
  plateName,
  poemName,
} from '../lib/home/naming.ts';

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

/* ------------------------------------------- books, collections and items */

test('a poem names itself by its first line', () => {
  assert.equal(poemName({ body: 'The sea is a quiet thing\nat four in the morning' }, 0), 'The sea is a quiet thing');
  // Its own title wins over its first line.
  assert.equal(poemName({ title: 'Low tide', body: 'The sea is quiet' }, 0), 'Low tide');
  // Only the FIRST line: running two together reads as a mistake, not a quote.
  assert.ok(!poemName({ body: 'Short\nsecond line here' }, 0).includes('second'));
});

test('a poem with nothing in it is called by its place in the book', () => {
  assert.equal(poemName({}, 0), 'Poem 1');
  assert.equal(poemName({ title: '   ', body: '\n\n' }, 6), 'Poem 7');
});

test('a picture and a plate have their own fallbacks', () => {
  assert.equal(pageName({}, 2), 'Picture 3');
  assert.equal(pageName({ title: 'The harbour' }, 2), 'The harbour');
  assert.equal(plateName({ caption: 'A boat at the quayside' }, 0), 'A boat at the quayside');
  assert.equal(plateName({}, 4), 'Plate 5');
});

test('a book takes its name from what is in it', () => {
  const book = {
    kind: 'poetry',
    contents: [{ kind: 'poem', title: 'Low tide', body: '' }, { kind: 'poem', title: '', body: '' }],
  };
  assert.equal(bookName(book), 'Low tide');
  // The collection's title beats the first poem.
  assert.equal(bookName({ ...book, meta: { title: 'Salt' } }), 'Salt');
  // And the name on the book beats everything.
  assert.equal(bookName({ ...book, name: 'For Mum', meta: { title: 'Salt' } }), 'For Mum');
});

test('a book of untitled poems says how many there are', () => {
  const book = { kind: 'poetry', contents: [{ kind: 'poem' }, { kind: 'poem' }, { kind: 'poem' }] };
  assert.equal(bookName(book), '3 poems');
  assert.equal(bookName({ kind: 'coloring', pages: [{}] }), '1 picture');
});

test('an empty book is called by its kind and the date', () => {
  const at = new Date('2026-10-03T09:00:00Z').getTime();
  assert.match(bookName({ kind: 'poetry', contents: [] }, at), /^Poetry book, /);
  assert.match(bookName({ kind: 'coloring', pages: [] }, at), /^Colouring book, /);
});

test('the placeholders this app used to write are not treated as names', () => {
  // Files saved before this change have "Untitled" written into them as though
  // somebody had chosen it. Showing it back is the bug, not a record.
  for (const old of ['Untitled', 'untitled collection', 'Untitled Coloring Book', ' UNTITLED ']) {
    assert.ok(isPlaceholder(old), `${old} should be a placeholder`);
  }
  assert.ok(!isPlaceholder('Untitled Symphony'), 'a real title was swallowed');
  assert.equal(bookName({ name: 'Untitled', kind: 'poetry', contents: [{ kind: 'poem', title: 'Low tide' }] }), 'Low tide');
  assert.equal(nameFor({ name: 'Untitled', stickers: 2, at: Date.now(), thumb: { items: [] } }), '2 stickers');
});

test('a new collection and a new colouring book are given dates, not placeholders', () => {
  const at = new Date('2026-10-03T09:00:00Z').getTime();
  assert.match(newCollectionTitle(at), /^Collection, /);
  assert.match(newColouringBookTitle(at), /^Colouring book, /);
  assert.ok(!isPlaceholder(newCollectionTitle(at)));
});

test('the app never stores or prints a placeholder as if it were a name', () => {
  // Looks for the placeholder as a VALUE — a quoted string that is one — not
  // for the word in prose. "An untitled poem gets no heading" is a sentence
  // about the idea; `name: 'Untitled'` is the bug.
  const root = new URL('../', import.meta.url);
  const walk = (dir) =>
    readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}${e.name}/`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}${e.name}`] : [],
    );
  // The renderer is the one place this is still allowed, because the hard
  // rules for this work forbid changing it. Nothing now stores an empty title
  // and then relies on it, so it should never fire — but it is still there.
  const allowed = new Set(['lib/render/runtime.ts']);
  const offenders = [];
  for (const file of [...walk('lib/'), ...walk('components/'), ...walk('app/')]) {
    if (file.endsWith('home/naming.ts') || allowed.has(file)) continue;
    // Comments stripped, so a note explaining Google's placeholder is not
    // mistaken for using it; and only name-shaped strings count, so the line
    // of advice that begins "Untitled poems still typeset..." is a sentence
    // about untitled poems rather than something being called one.
    const source = readFileSync(new URL(file, root), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');
    for (const [, quoted] of source.matchAll(/['"`](Untitled[^'"`]*)['"`]/g)) {
      if (quoted.length > 30) continue;
      offenders.push(`${file}: ${quoted}`);
    }
  }
  assert.deepEqual(offenders, []);
});
