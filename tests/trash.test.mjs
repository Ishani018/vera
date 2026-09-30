import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBackup, readBackup } from '../lib/backup.ts';
import {
  alive,
  binned,
  daysLeft,
  expired,
  isDeleted,
  readableSize,
  withoutMark,
  TRASH_DAYS,
  DAY_MS,
} from '../lib/deleted.ts';
import { coverAssetIds, projectAssets } from '../lib/assetRefs.ts';
import { createDesign, createProject } from '../lib/defaults.ts';
import { SCHEMA } from '../lib/schema.ts';

const DAY = DAY_MS;

/* ------------------------------------------------------------- the marking */

test('a thing is in the trash only once it has been marked, and the mark comes off whole', () => {
  const book = createProject({ name: 'Winter Poems' });
  assert.equal(isDeleted(book), false, 'a new book is not deleted');

  const deleted = { ...book, deletedAt: 1_000 };
  assert.equal(isDeleted(deleted), true);

  const back = withoutMark(deleted);
  assert.equal(isDeleted(back), false);
  assert.equal('deletedAt' in back, false, 'the field goes, rather than being set to undefined');
  // Everything else is exactly as it was, which is what "restore" has to mean.
  assert.deepEqual(back, book);
});

test('deletedAt of zero would be a real time, not an absent one', () => {
  // The epoch is a legitimate timestamp and a falsy number. Anything testing
  // truthiness rather than type would quietly un-delete it.
  assert.equal(isDeleted({ deletedAt: 0 }), true);
  assert.equal(isDeleted({}), false);
  assert.equal(isDeleted(null), false);
  assert.equal(isDeleted(undefined), false);
});

test('alive and binned are exact complements', () => {
  const rows = [{ id: 'a' }, { id: 'b', deletedAt: 5 }, { id: 'c' }];
  assert.deepEqual(alive(rows).map((r) => r.id), ['a', 'c']);
  assert.deepEqual(binned(rows).map((r) => r.id), ['b']);
  assert.equal(alive(rows).length + binned(rows).length, rows.length);
});

/* --------------------------------------------------------------- the clock */

test('thirty days, counted down and then up', () => {
  const now = 1_000 * DAY;
  const justNow = { deletedAt: now };
  assert.equal(daysLeft(justNow, now), TRASH_DAYS);
  assert.equal(expired(justNow, now), false);

  const yesterday = { deletedAt: now - DAY };
  assert.equal(daysLeft(yesterday, now), TRASH_DAYS - 1);

  const lastDay = { deletedAt: now - (TRASH_DAYS * DAY - 1) };
  assert.equal(daysLeft(lastDay, now), 1, 'still here on the last day');
  assert.equal(expired(lastDay, now), false);

  const dueExactly = { deletedAt: now - TRASH_DAYS * DAY };
  assert.equal(daysLeft(dueExactly, now), 0);
  assert.equal(expired(dueExactly, now), true, 'thirty days means thirty, not thirty-one');

  const longGone = { deletedAt: now - 400 * DAY };
  assert.equal(daysLeft(longGone, now), 0, 'never negative');
  assert.equal(expired(longGone, now), true);
});

test('something that was never deleted is never expired', () => {
  assert.equal(expired({}, Date.now()), false);
  assert.equal(daysLeft({}, Date.now()), TRASH_DAYS);
});

/* -------------------------------------------------------------- the backup */

test('a deleted book never reaches a backup', () => {
  // The builder is handed a deleted book's launch kit, a deleted standalone
  // design, a deleted sticker and a deleted template — the shape a caller
  // that forgot to filter would produce.
  const project = createProject({ name: 'Winter Poems' });
  const keptDesign = { ...createDesign('instagram-post', 'Launch day'), id: 'dsn-kept' };
  const goneDesign = {
    ...createDesign('pinterest-pin', 'Old pin'),
    id: 'dsn-gone',
    deletedAt: 10,
  };
  project.designs = [keptDesign, goneDesign];

  const standalone = (id, deletedAt) => ({
    ...createDesign('instagram-post', id),
    id,
    schema: SCHEMA,
    createdAt: 1,
    updatedAt: 2,
    ...(deletedAt ? { deletedAt } : {}),
  });

  const payload = buildBackup({
    project,
    assets: {},
    stickers: [
      { id: 'lib-1', name: 'Keep', tags: [], assetId: 'a1', width: 1, height: 1, createdAt: 1 },
      {
        id: 'lib-2',
        name: 'Gone',
        tags: [],
        assetId: 'a2',
        width: 1,
        height: 1,
        createdAt: 1,
        deletedAt: 11,
      },
    ],
    templates: [
      { id: 'tpl-1', name: 'Keep', createdAt: 1, cover: project.cover },
      { id: 'tpl-2', name: 'Gone', createdAt: 1, cover: project.cover, deletedAt: 12 },
    ],
    designs: [standalone('dsn-live'), standalone('dsn-binned', 13)],
  });

  const written = JSON.stringify(payload);
  assert.equal(written.includes('dsn-gone'), false, 'a deleted launch-kit design is not written');
  assert.equal(written.includes('dsn-binned'), false, 'nor a deleted standalone design');
  assert.equal(written.includes('lib-2'), false, 'nor a deleted sticker');
  assert.equal(written.includes('tpl-2'), false, 'nor a deleted template');

  assert.deepEqual(payload.project.designs.map((d) => d.id), ['dsn-kept']);
  assert.deepEqual(payload.library.stickers.map((s) => s.id), ['lib-1']);
  assert.deepEqual(payload.library.templates.map((t) => t.id), ['tpl-1']);
  assert.deepEqual(payload.designs.map((d) => d.id), ['dsn-live']);

  // And reading it back finds nothing deleted either.
  const restored = readBackup(written);
  assert.equal(restored.designs.some(isDeleted), false);
  assert.equal(restored.project.designs.some(isDeleted), false);
});

test('a backup whose book is itself deleted is refused rather than restored', () => {
  const project = { ...createProject({ name: 'Gone' }), deletedAt: 99 };
  const text = JSON.stringify({ versecraft: 2, project, assets: {}, library: {}, designs: [] });
  assert.throws(() => readBackup(text), /had been deleted/);
});

/* ------------------------------------------------------------- the restore */

test('a restored book is intact, down to its pictures and its launch kit', () => {
  const project = createProject({ name: 'Winter Poems' });
  project.cover.frontImage = {
    assetId: 'ast-cover',
    naturalWidth: 1200,
    naturalHeight: 1800,
    fit: 'cover',
  };
  project.cover.stickers.push({
    id: 'cs-1',
    assetId: 'ast-badge',
    naturalWidth: 400,
    naturalHeight: 400,
    x: 10,
    y: 20,
    width: 100,
    height: 100,
    rotate: 0,
    cornerRadius: 0,
    border: null,
    shadow: false,
    arc: 0,
    name: 'Badge',
  });
  const design = createDesign('instagram-post', 'Launch day');
  design.cover.stickers.push({
    id: 'cs-2',
    assetId: 'ast-post',
    naturalWidth: 500,
    naturalHeight: 500,
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    rotate: 0,
    cornerRadius: 0,
    border: null,
    shadow: false,
    arc: 0,
    name: 'Post picture',
  });
  project.designs = [design];

  const before = structuredClone(project);
  const assetsBefore = projectAssets(project).sort();

  // Round trip: into the trash and straight back out.
  const binnedBook = { ...project, deletedAt: Date.now() };
  const restored = withoutMark(binnedBook);

  assert.deepEqual(restored, before, 'the record comes back byte for byte');
  assert.deepEqual(
    projectAssets(restored).sort(),
    assetsBefore,
    'and still refers to every picture it did before',
  );
  assert.ok(assetsBefore.includes('ast-cover'));
  assert.ok(assetsBefore.includes('ast-badge'));
  assert.ok(assetsBefore.includes('ast-post'), 'including its launch kit, which travels with it');
});

/* ------------------------------------------------ what the pictures are for */

test('the asset walk finds a cover image and its stickers', () => {
  const cover = {
    backgroundColor: '#fff',
    backColor: '#fff',
    spineColor: '#fff',
    imageSpansWrap: false,
    showBarcodeZone: true,
    textBoxes: [],
    frontImage: { assetId: 'front', naturalWidth: 10, naturalHeight: 10, fit: 'cover' },
    stickers: [{ assetId: 's1' }, { assetId: 's2' }],
  };
  assert.deepEqual(coverAssetIds(cover).sort(), ['front', 's1', 's2']);
  assert.deepEqual(coverAssetIds(undefined), []);
});

test('a cover with nothing on it refers to nothing', () => {
  const project = createProject({ name: 'Bare' });
  assert.deepEqual(projectAssets(project), []);
});

/* ------------------------------------------------------------------ sizing */

test('sizes are rounded the way a person reads them', () => {
  assert.equal(readableSize(0), '0 B');
  assert.equal(readableSize(512), '512 B');
  assert.equal(readableSize(2048), '2 KB');
  assert.equal(readableSize(5 * 1024 * 1024), '5.0 MB');
});
