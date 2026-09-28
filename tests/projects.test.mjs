import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createColoringBook,
  isColoring,
  isPoetry,
  migrateProject,
  needsRewrite,
} from '../lib/projects.ts';
import { createProject } from '../lib/defaults.ts';

/**
 * The promise this file exists to keep: a book saved before the studio had two
 * kinds still opens, unchanged, as the poetry book it always was.
 */

const legacy = () => ({
  id: 'proj_old',
  name: 'My Collection',
  createdAt: 1,
  updatedAt: 2,
  meta: { title: 'My Collection', subtitle: '', author: 'A', publisher: '', isbn: '', year: '2024', copyrightExtra: '' },
  trim: { trimId: '5.5x8.5', bleed: false, paper: 'cream' },
  margins: { inside: 0.75, outside: 0.6, top: 0.75, bottom: 0.7 },
  layout: { poemStart: 'newPage' },
  typography: { body: { family: 'EB Garamond' } },
  border: { enabled: false },
  ornament: { betweenPoems: false },
  headers: { verso: 'bookTitle' },
  toc: { enabled: true },
  frontMatter: [{ id: 'm1', kind: 'title', enabled: true }],
  backMatter: [],
  cover: { backgroundColor: '#fff', textBoxes: [] },
  // The oldest shape of all: two arrays, before contents existed.
  sections: [{ id: 's0', title: 'One', subtitle: '', order: 0 }],
  poems: [
    { id: 'p1', title: 'Tideline', body: 'a line', sectionId: 's0', order: 1 },
    { id: 'p0', title: 'Loose', body: 'another', sectionId: null, order: 0 },
  ],
});

test('a book saved before the studio had two kinds opens as poetry', () => {
  const project = migrateProject(legacy());
  assert.equal(project.kind, 'poetry');
  assert.ok(isPoetry(project));
  assert.ok(!isColoring(project));
});

test('nothing about an existing poetry book is lost or altered on the way through', () => {
  const before = legacy();
  const after = migrateProject(before);

  // Every field the book already had survives untouched.
  for (const key of ['id', 'name', 'createdAt', 'updatedAt', 'meta', 'trim', 'margins',
    'layout', 'typography', 'border', 'ornament', 'headers', 'toc', 'frontMatter',
    'backMatter', 'cover']) {
    assert.deepEqual(after[key], before[key], `${key} changed`);
  }
  // And the two old arrays are flattened in the order the book printed in.
  assert.deepEqual(after.contents.map((i) => i.id), ['p0', 's0', 'p1']);
});

test('the two old arrays are dropped, not carried along beside contents', () => {
  const after = migrateProject(legacy());
  assert.equal('poems' in after, false, 'a dead array would be re-saved on every autosave');
  assert.equal('sections' in after, false);
});

test('an old record is recognised as needing to be written back', () => {
  assert.equal(needsRewrite(legacy()), true);
  assert.equal(needsRewrite({ ...legacy(), kind: 'poetry' }), true, 'still has poems/sections');
  assert.equal(needsRewrite(createProject()), false);
  assert.equal(needsRewrite(createColoringBook()), false);
});

test('a project already carrying a kind is left alone', () => {
  const fresh = createProject({ name: 'New' });
  assert.equal(fresh.kind, 'poetry');
  const again = migrateProject(fresh);
  assert.equal(again.kind, 'poetry');
  assert.deepEqual(again.contents, fresh.contents);
});

test('migrating is idempotent, so opening a book twice cannot change it', () => {
  const once = migrateProject(legacy());
  const twice = migrateProject(once);
  assert.deepEqual(twice, once);
});

// --- coloring books ----------------------------------------------------------

test('a new coloring book is square, bleeds, and prints on white', () => {
  const book = createColoringBook('Garden');
  assert.equal(book.kind, 'coloring');
  assert.equal(book.trim.trimId, '8.5x8.5');
  assert.equal(book.trim.bleed, true);
  assert.equal(book.trim.paper, 'white');
  assert.deepEqual(book.pages, []);
  assert.equal(book.coloring.singleSided, true, 'a blank back is the point of the format');
});

test('a coloring book carries the shared half every book needs to print', () => {
  const book = createColoringBook();
  for (const key of ['meta', 'trim', 'margins', 'frontMatter', 'backMatter', 'cover']) {
    assert.ok(book[key] !== undefined, `${key} is missing, so the cover or export would break`);
  }
});

test('a coloring book missing its settings comes back with them filled in', () => {
  const book = migrateProject({ kind: 'coloring', id: 'c1', name: 'X' });
  assert.deepEqual(book.pages, []);
  assert.equal(book.coloring.lineArt.mode, 'threshold');
  assert.equal(typeof book.coloring.lineArt.detail, 'number');
});

test('the two kinds are told apart by their own field, never by guessing', () => {
  assert.ok(isColoring(createColoringBook()));
  assert.ok(isPoetry(migrateProject(legacy())));
});
