import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBackup, designAssetIds, readBackup } from '../lib/backup.ts';
import { createDesign, createProject } from '../lib/defaults.ts';
import { SCHEMA } from '../lib/schema.ts';

/** A design that belongs to no book, with a picture on it and a line of type. */
function standalone() {
  const design = createDesign('instagram-post', 'Launch day');
  design.id = 'dsn-standalone';
  design.createdAt = 1;
  design.cover.stickers.push({
    id: 'st-1',
    assetId: 'asset-picture',
    naturalWidth: 800,
    naturalHeight: 600,
    x: 90,
    y: 120,
    width: 240,
    height: 180,
    rotate: 12,
    cornerRadius: 0.1,
    border: null,
    shadow: false,
    arc: 30,
  });
  design.cover.textBoxes.push({
    id: 'tb-1',
    panel: 'board',
    text: 'Out now',
    x: 60,
    y: 480,
    width: 690,
    rotate: 0,
    curve: 18,
    font: {
      family: 'EB Garamond',
      fallback: 'serif',
      sizePt: 40,
      weight: 700,
      italic: false,
      letterSpacingEm: 0,
      lineHeight: 1.2,
      color: '#1b1815',
      align: 'center',
      transform: 'none',
    },
  });
  return { ...design, schema: SCHEMA, updatedAt: 2 };
}

const backupOf = (designs) =>
  buildBackup({
    project: createProject({ name: 'A Book' }),
    assets: { 'asset-picture': 'data:image/png;base64,AAAA' },
    stickers: [],
    templates: [],
    designs,
  });

test('a standalone design survives being written out and read back', () => {
  const design = standalone();
  const restored = readBackup(JSON.stringify(backupOf([design])));

  assert.equal(restored.designs.length, 1);
  // Compared whole: a backup that returns a design with one field quietly
  // missing is worse than one that fails to open, because it looks like it
  // worked. The curve, the arc and the corner radius are the fields most
  // likely to be dropped by a format change, and they are all in here.
  assert.deepEqual(restored.designs[0], design);
  assert.equal(restored.project.name, 'A Book');
  assert.deepEqual(restored.assets, { 'asset-picture': 'data:image/png;base64,AAAA' });
});

test('the pictures a design needs are named, so the bytes can travel with it', () => {
  const design = standalone();
  design.cover.frontImage = { assetId: 'asset-background', naturalWidth: 1, naturalHeight: 1, fit: 'cover' };
  assert.deepEqual(designAssetIds(design), ['asset-background', 'asset-picture']);
});

test('a backup made before standalone designs existed still opens', () => {
  const old = backupOf([]);
  delete old.designs;
  const restored = readBackup(JSON.stringify(old));
  assert.deepEqual(restored.designs, []);
  assert.equal(restored.project.name, 'A Book');
});

test('a backup made before assets were split out is the project itself', () => {
  const bare = createProject({ name: 'Very Old' });
  const restored = readBackup(JSON.stringify(bare));
  assert.equal(restored.project.name, 'Very Old');
  assert.deepEqual(restored.assets, {});
  assert.deepEqual(restored.designs, []);
});

test('a design stored before it carried a schema number is read as points', () => {
  const design = standalone();
  delete design.schema;
  delete design.updatedAt;
  const restored = readBackup(JSON.stringify(backupOf([design])));
  assert.equal(restored.designs[0].schema, SCHEMA);
  assert.equal(restored.designs[0].updatedAt, design.createdAt);
});

test('something that is not a project is refused rather than half-restored', () => {
  assert.throws(() => readBackup(JSON.stringify({ hello: 'world' })), /not an Isnaevy project/);
});

test('a backup taken from the front page carries every book, not just one', () => {
  const first = createProject({ name: 'Winter Poems' });
  const second = createProject({ name: 'Summer Poems' });
  second.id = 'proj-second';
  const design = standalone();

  const payload = buildBackup({
    projects: [first, second],
    assets: { 'asset-picture': 'data:image/png;base64,AAAA' },
    stickers: [],
    templates: [],
    designs: [design],
  });

  const restored = readBackup(JSON.stringify(payload));
  assert.equal(restored.projects.length, 2, 'both books come back');
  assert.deepEqual(
    restored.projects.map((book) => book.name),
    ['Winter Poems', 'Summer Poems'],
  );
  assert.equal(restored.designs.length, 1, 'and the designs belonging to no book');
  assert.equal(restored.assets['asset-picture'], 'data:image/png;base64,AAAA');
});

test('a copy of the app that predates many-book backups still opens one', () => {
  // The old reader looks at `project` and nothing else. Whatever else the
  // file has grown, that field has to keep holding a whole, openable book.
  const first = createProject({ name: 'Winter Poems' });
  const second = createProject({ name: 'Summer Poems' });
  second.id = 'proj-second';

  const payload = buildBackup({
    projects: [first, second],
    assets: {},
    stickers: [],
    templates: [],
    designs: [],
  });

  assert.equal(payload.project.name, 'Winter Poems');
  assert.ok(Array.isArray(payload.project.contents), 'and it is a real book, not a stub');
  assert.equal(readBackup(JSON.stringify(payload)).project.name, 'Winter Poems');
});

test('a one-book backup is unchanged in shape, so old files and new agree', () => {
  const payload = buildBackup({
    project: createProject({ name: 'Only One' }),
    assets: {},
    stickers: [],
    templates: [],
    designs: [],
  });

  // No `projects` key at all for a single book: the file a person gets from
  // inside a book is the file they always got.
  assert.equal('projects' in payload, false);
  const restored = readBackup(JSON.stringify(payload));
  assert.equal(restored.projects.length, 1);
  assert.equal(restored.projects[0].name, 'Only One');
});
