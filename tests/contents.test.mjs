import assert from 'node:assert/strict';
import test from 'node:test';

import {
  endOfSection,
  insertIntoSection,
  migrateContents,
  moveToSection,
  poemsOf,
  sectionOfItem,
} from '../lib/contents.ts';

const poem = (id) => ({ kind: 'poem', id, title: id, body: '', epigraph: '', dedication: '' });
const part = (id) => ({ kind: 'section', id, title: id, subtitle: '' });
const ids = (contents) => contents.map((item) => item.id);

// --- migrating off the two arrays -------------------------------------------

// The poet has already read a proof of the old layout, so the flattened list
// has to reproduce it exactly rather than merely produce something reasonable.
test('a legacy project keeps the reading order it was laid out in', () => {
  const contents = migrateContents({
    sections: [
      { id: 's1', title: 'Two', subtitle: '', order: 1 },
      { id: 's0', title: 'One', subtitle: '', order: 0 },
    ],
    poems: [
      { id: 'p2', title: 'B', body: '', sectionId: 's0', order: 2 },
      { id: 'p0', title: 'Loose', body: '', sectionId: null, order: 0 },
      { id: 'p1', title: 'A', body: '', sectionId: 's0', order: 1 },
      { id: 'p3', title: 'C', body: '', sectionId: 's1', order: 3 },
    ],
  });
  assert.deepEqual(ids(contents), ['p0', 's0', 'p1', 'p2', 's1', 'p3']);
  assert.deepEqual(
    contents.map((i) => i.kind),
    ['poem', 'section', 'poem', 'poem', 'section', 'poem'],
  );
});

test('a poem whose part was deleted lands before the first part, as it used to', () => {
  const contents = migrateContents({
    sections: [{ id: 's0', title: 'One', subtitle: '', order: 0 }],
    poems: [
      { id: 'orphan', title: 'X', body: '', sectionId: 'gone', order: 1 },
      { id: 'kept', title: 'Y', body: '', sectionId: 's0', order: 0 },
    ],
  });
  assert.deepEqual(ids(contents), ['orphan', 's0', 'kept']);
});

test('migrating an already-migrated project leaves it alone', () => {
  const contents = [poem('a'), part('s0'), poem('b')];
  assert.deepEqual(ids(migrateContents({ contents })), ['a', 's0', 'b']);
});

test('per-poem settings survive the migration', () => {
  const [item] = migrateContents({
    poems: [{ id: 'p', title: 'T', body: 'x', align: 'center', sampleKey: 'vc:1', order: 0 }],
  });
  assert.equal(item.align, 'center');
  assert.equal(item.sampleKey, 'vc:1');
});

// A project file can be hand-edited or truncated, so nothing in it is trusted.
test('junk in a project file is dropped rather than carried into the book', () => {
  const contents = migrateContents({ contents: [null, 'nonsense', 7, poem('good')] });
  assert.deepEqual(ids(contents), ['good']);
});

test('a poem missing every field still comes back as a usable poem', () => {
  const [item] = migrateContents({ contents: [{ kind: 'poem' }] });
  assert.equal(item.kind, 'poem');
  assert.deepEqual([item.title, item.body, item.epigraph, item.dedication], ['', '', '', '']);
  assert.ok(item.id.length > 0, 'an item with no id cannot be dragged or selected');
});

// --- membership by position --------------------------------------------------

test('a poem belongs to the last part before it', () => {
  const project = { contents: [poem('loose'), part('s0'), poem('a'), part('s1'), poem('b')] };
  assert.equal(sectionOfItem(project, 'loose'), null);
  assert.equal(sectionOfItem(project, 'a').id, 's0');
  assert.equal(sectionOfItem(project, 'b').id, 's1');
});

test('a part run ends at the next part, and the loose run ends at the first one', () => {
  const contents = [poem('loose'), part('s0'), poem('a'), poem('b'), part('s1')];
  assert.equal(endOfSection(contents, null), 1);
  assert.equal(endOfSection(contents, 's0'), 4);
  assert.equal(endOfSection(contents, 's1'), 5);
});

test('a part that is not there puts things at the end, not at the front', () => {
  const contents = [poem('a'), part('s0')];
  assert.equal(endOfSection(contents, 'gone'), 2);
});

test('importing into a part appends to that part, not to the book', () => {
  const contents = [part('s0'), poem('a'), part('s1'), poem('b')];
  insertIntoSection(contents, [poem('new')], 's0');
  assert.deepEqual(ids(contents), ['s0', 'a', 'new', 's1', 'b']);
});

test('importing with no part chosen goes before the first part', () => {
  const contents = [poem('a'), part('s0'), poem('b')];
  insertIntoSection(contents, [poem('new')], null);
  assert.deepEqual(ids(contents), ['a', 'new', 's0', 'b']);
});

test('moving a poem to a part takes it out of the one it was in', () => {
  const contents = [part('s0'), poem('a'), part('s1'), poem('b')];
  moveToSection(contents, 'a', 's1');
  assert.deepEqual(ids(contents), ['s0', 's1', 'b', 'a']);
  assert.deepEqual(poemsOf({ contents }).map((p) => p.id), ['b', 'a']);
});

// Removing then inserting is two edits to one array; computing the destination
// before the removal would put a poem one place too far along.
test('moving a poem later within its own part does not drift', () => {
  const contents = [part('s0'), poem('a'), poem('b'), part('s1')];
  moveToSection(contents, 'a', 's0');
  assert.deepEqual(ids(contents), ['s0', 'b', 'a', 's1']);
});

test('moving a poem that is not there changes nothing', () => {
  const contents = [part('s0'), poem('a')];
  moveToSection(contents, 'ghost', null);
  assert.deepEqual(ids(contents), ['s0', 'a']);
});

// --- plates ------------------------------------------------------------------

test('a plate in a project file comes back with every field filled in', () => {
  const [item] = migrateContents({ contents: [{ kind: 'illustration', id: 'p1' }] });
  assert.equal(item.kind, 'illustration');
  assert.deepEqual(
    [item.assetId, item.fit, item.startsRecto, item.facingBlank, item.naturalWidth],
    ['', 'contain', false, false, 0],
  );
});

test('an unknown fit falls back to sitting inside the margins', () => {
  const [item] = migrateContents({ contents: [{ kind: 'illustration', id: 'p', fit: 'wat' }] });
  assert.equal(item.fit, 'contain');
});

test('plates belong to parts and move between them like poems do', () => {
  const contents = [
    part('s0'),
    { kind: 'illustration', id: 'plate', title: '', caption: '', assetId: '', naturalWidth: 0, naturalHeight: 0, fit: 'contain', startsRecto: false, facingBlank: false },
    part('s1'),
    poem('b'),
  ];
  assert.equal(sectionOfItem({ contents }, 'plate').id, 's0');
  moveToSection(contents, 'plate', 's1');
  assert.deepEqual(ids(contents), ['s0', 's1', 'b', 'plate']);
});

test('poemsOf counts poems only, not the plates between them', () => {
  const contents = migrateContents({
    contents: [poem('a'), { kind: 'illustration', id: 'p' }, poem('b')],
  });
  assert.deepEqual(poemsOf({ contents }).map((x) => x.id), ['a', 'b']);
});
