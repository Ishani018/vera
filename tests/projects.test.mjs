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

/* ------------------------------------------------- inches to points (schema 2) */

const inchCover = () => ({
  id: 'old', kind: 'poetry', name: 'Old', createdAt: 0, updatedAt: 0,
  meta: { title: 'Old', author: 'A', subtitle: '', year: '2020', copyrightExtra: '' },
  trim: { trimId: '5.5x8.5', bleed: false, paper: 'cream' },
  margins: { inside: 0.75, outside: 0.6, top: 0.75, bottom: 0.7 },
  contents: [],
  cover: {
    backgroundColor: '#fff', backColor: '#fff', spineColor: '#fff',
    frontImage: null, imageSpansWrap: false, showBarcodeZone: true,
    textBoxes: [{ id: 't', panel: 'front', text: 'Title', x: 0.6, y: 1.2, widthIn: 4,
      rotate: 0, curve: 0, font: { family: 'EB Garamond', fallback: 'serif', weight: 400,
      italic: false, sizePt: 24, lineHeight: 1.2, letterSpacingEm: 0, transform: 'none',
      align: 'center', color: '#000' } }],
    stickers: [{ id: 's', assetId: 'a', naturalWidth: 600, naturalHeight: 300,
      x: 2, y: 3, widthIn: 2, heightIn: 1, rotate: 0, cornerRadius: 0,
      border: null, shadow: false, arc: 0, name: 'Badge' }],
  },
});

test('a cover saved in inches comes back in points', () => {
  const out = migrateProject(inchCover());
  const [box] = out.cover.textBoxes;
  const [sticker] = out.cover.stickers;

  assert.equal(box.x, 43.2);
  assert.equal(box.y, 86.4);
  assert.equal(box.width, 288);
  assert.equal(sticker.x, 144);
  assert.equal(sticker.y, 216);
  assert.equal(sticker.width, 144);
  assert.equal(sticker.height, 72);
  assert.equal(out.schema, 2);
});

test('the old field names do not survive, so nothing can read them by accident', () => {
  const out = migrateProject(inchCover());
  assert.ok(!('widthIn' in out.cover.textBoxes[0]));
  assert.ok(!('widthIn' in out.cover.stickers[0]));
  assert.ok(!('heightIn' in out.cover.stickers[0]));
});

test('converting twice would put everything off the page, so it happens once', () => {
  // Nothing in the numbers says which unit they are already in, so a second
  // pass is unrecoverable. The schema on the record is what prevents it.
  const once = migrateProject(inchCover());
  const twice = migrateProject(structuredClone(once));
  assert.deepEqual(twice.cover.textBoxes[0], once.cover.textBoxes[0]);
  assert.deepEqual(twice.cover.stickers[0], once.cover.stickers[0]);
});

test('a book made today is already in points and is left alone', () => {
  const fresh = createProject({ name: 'New' });
  fresh.cover.textBoxes = [{ ...inchCover().cover.textBoxes[0], x: 43.2, y: 86.4, width: 288 }];
  delete fresh.cover.textBoxes[0].widthIn;
  const out = migrateProject(structuredClone(fresh));
  assert.equal(out.cover.textBoxes[0].x, 43.2);
  assert.equal(out.cover.textBoxes[0].width, 288);
});

test('a book in inches is flagged for rewriting, and one in points is not', () => {
  assert.equal(needsRewrite(inchCover()), true);
  assert.equal(needsRewrite(migrateProject(inchCover())), false);
});

test('a coloring book saved in inches converts too', () => {
  const old = { ...inchCover(), kind: 'coloring', pages: [], coloring: {}, typography: {} };
  const out = migrateProject(old);
  assert.equal(out.cover.stickers[0].width, 144);
  assert.equal(out.schema, 2);
});
