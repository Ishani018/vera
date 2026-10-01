import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ALLOWED_LICENCES,
  isAllowedLicence,
  refusal,
  tidyLicence,
} from '../lib/starter/licence.ts';
import { probeImage } from '../lib/starter/image.ts';
import {
  LIMITS,
  checkBytes,
  checkFolder,
  checkManifest,
} from '../lib/starter/manifest.ts';
import { crc32, zipBytes } from '../lib/stickers/zip.ts';
import { readZip } from '../lib/stickers/unzip.ts';
import { stickerAssets } from '../lib/assetRefs.ts';
import { alive } from '../lib/deleted.ts';
import {
  fromPack,
  isEdited,
  itemBytes,
  otherPacks,
  planRemoval,
  openPack,
  planInstall,
  sourceFor,
  summarise,
  tagsFor,
} from '../lib/starter/install.ts';

/* ------------------------------------------------------------- fixtures */

/** A real, valid PNG of a given size: header, IHDR, IDAT, IEND, all checksummed. */
function png(width = 8, height = 8) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(new Uint8Array(body)));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

const item = (over = {}) => ({
  file: 'oak-leaf.png',
  name: 'Oak leaf',
  tags: ['leaf'],
  sourceUrl: 'https://example.org/items/1',
  author: 'Jane Smith',
  licence: 'CC0-1.0',
  downloadedOn: '2026-10-01',
  ...over,
});

const manifest = (over = {}) => ({
  pack: 'autumn-leaves',
  name: 'Autumn leaves',
  items: [item()],
  ...over,
});

const whys = (problems) => problems.map((p) => p.why).join(' | ');

/* -------------------------------------------------------------- licences */

test('a non-CC0 item is rejected, and told why', () => {
  const found = checkManifest(manifest({ items: [item({ licence: 'CC BY 4.0' })] }), 'autumn-leaves');
  assert.equal(found.length, 1, whys(found));
  assert.match(found[0].why, /refused/);
  assert.match(found[0].why, /attribution is a condition/);
  assert.equal(found[0].where, 'autumn-leaves/oak-leaf.png', 'and which file it was');
});

test('every licence that is not a public-domain dedication is refused', () => {
  for (const licence of [
    'CC BY 4.0', 'CC BY-SA 3.0', 'CC BY-NC 4.0', 'CC BY-ND 4.0',
    'Royalty free', 'Unsplash License', 'Pixabay License', 'Pexels License',
    'All rights reserved', 'MIT', '', '   ',
  ]) {
    assert.equal(isAllowedLicence(licence), false, `${licence} must not be allowed`);
    assert.ok(refusal(licence), `${licence} must give a reason`);
  }
});

test('and every spelling of CC0 and public domain is accepted', () => {
  for (const licence of [
    'CC0', 'CC0-1.0', 'cc0 1.0', 'CC0 1.0 Universal', 'Creative Commons Zero v1.0 Universal',
    'Public Domain', 'public-domain', 'Public Domain Mark 1.0', 'PDM 1.0',
    'No known copyright restrictions',
  ]) {
    assert.equal(isAllowedLicence(licence), true, `${licence} should be allowed`);
    assert.equal(refusal(licence), null);
  }
  assert.equal(ALLOWED_LICENCES.length, 13, 'the list is closed, and changing it is deliberate');
});

test('the comparison ignores what differs between websites and not what differs between licences', () => {
  assert.equal(tidyLicence('CC0-1.0'), tidyLicence('cc0 1.0'));
  assert.equal(tidyLicence('  CC0_1.0  '), 'cc0 1 0');
  assert.notEqual(tidyLicence('CC0'), tidyLicence('CC BY'), 'these are not the same licence');
});

/* -------------------------------------------------------------- manifests */

test('a complete manifest has nothing wrong with it', () => {
  assert.deepEqual(checkManifest(manifest(), 'autumn-leaves'), []);
});

test('every missing field is named, all at once', () => {
  const bare = manifest({ items: [{ file: 'a.png' }] });
  const found = checkManifest(bare, 'autumn-leaves');
  for (const field of ['name', 'tags', 'sourceUrl', 'author', 'licence', 'downloadedOn']) {
    assert.ok(found.some((p) => p.why.includes(`${field} is missing`)), `${field}: ${whys(found)}`);
  }
  assert.ok(found.length >= 6, 'reported together, not one per run');
});

test('the pack name must match the folder it is in', () => {
  const found = checkManifest(manifest(), 'winter-leaves');
  assert.ok(found.some((p) => p.why.includes('but the folder is called')), whys(found));
});

test('a pack name must be safe as a folder, a tag and a file name at once', () => {
  for (const pack of ['Autumn Leaves', 'autumn_leaves', '../escape', 'autumn-', '']) {
    const found = checkManifest(manifest({ pack }), pack);
    assert.ok(found.some((p) => p.why.includes('lower-case words')), `${pack}: ${whys(found)}`);
  }
});

test('a file name may not wander out of its own folder', () => {
  for (const file of ['../secret.png', 'nested/leaf.png', '.hidden.png']) {
    const found = checkManifest(manifest({ items: [item({ file })] }), 'autumn-leaves');
    assert.ok(found.some((p) => p.why.includes('plain name')), `${file}: ${whys(found)}`);
  }
});

test('a source must be a link somebody else can open', () => {
  const found = checkManifest(manifest({ items: [item({ sourceUrl: 'my downloads folder' })] }), 'autumn-leaves');
  assert.ok(found.some((p) => p.why.includes('a link somebody else can open')), whys(found));
});

test('a download date must be a date', () => {
  const found = checkManifest(manifest({ items: [item({ downloadedOn: 'last tuesday' })] }), 'autumn-leaves');
  assert.ok(found.some((p) => p.why.includes('must be a date')), whys(found));
});

test('the same file may not be listed twice', () => {
  const found = checkManifest(manifest({ items: [item(), item()] }), 'autumn-leaves');
  assert.ok(found.some((p) => p.why.includes('listed twice')), whys(found));
});

/* ----------------------------------------- the folder and the manifest agree */

test('a picture nobody listed is refused, which is the point of all this', () => {
  const found = checkFolder([item()], ['oak-leaf.png', 'mystery.jpg'], 'autumn-leaves');
  assert.equal(found.length, 1);
  assert.equal(found[0].where, 'autumn-leaves/mystery.jpg');
  assert.match(found[0].why, /no source, no author, no licence/);
});

test('and a listed picture that is not there is refused too', () => {
  const found = checkFolder([item()], [], 'autumn-leaves');
  assert.equal(found.length, 1);
  assert.match(found[0].why, /not in the folder/);
});

test('a folder that matches its manifest has nothing wrong with it', () => {
  assert.deepEqual(checkFolder([item()], ['oak-leaf.png'], 'autumn-leaves'), []);
});

/* ------------------------------------------------------------- the pictures */

test('a real PNG passes, and says how big it is', () => {
  const probe = probeImage(png(120, 80));
  assert.equal(probe.ok, true);
  assert.equal(probe.format, 'png');
  assert.equal(probe.width, 120);
  assert.equal(probe.height, 80);
});

test('a truncated download is caught', () => {
  const whole = png(64, 64);
  const cut = whole.slice(0, whole.length - 20);
  const probe = probeImage(cut);
  assert.equal(probe.ok, false);
  assert.match(probe.why, /runs off the end|stops before its end marker/);
});

test('a corrupted byte is caught by the checksum PNG already carries', () => {
  const bytes = png(64, 64);
  bytes[40] ^= 0xff;
  const probe = probeImage(bytes);
  assert.equal(probe.ok, false);
  assert.match(probe.why, /checksum is wrong/);
});

test('a web page saved with a .png on the end is caught, and named', () => {
  const page = new TextEncoder().encode('<!DOCTYPE html><html><body>Not found</body></html>');
  const probe = probeImage(page);
  assert.equal(probe.ok, false);
  assert.match(probe.why, /web page/);
});

test('something that is not an image at all is caught', () => {
  assert.equal(probeImage(new Uint8Array(4)).ok, false);
  assert.match(probeImage(new Uint8Array(64).fill(7)).why, /not a PNG, JPEG or WebP/);
});

test('a picture too big to be a sticker is refused, with its size', () => {
  const found = checkBytes('huge.png', png(5000, 100), 'autumn-leaves');
  assert.equal(found.length, 1);
  assert.match(found[0].why, /5000 × 100/);
  assert.match(found[0].why, new RegExp(String(LIMITS.pixels)));
});

test('a thumbnail grabbed by mistake is refused', () => {
  const found = checkBytes('tiny.png', png(16, 16), 'autumn-leaves');
  assert.equal(found.length, 1);
  assert.match(found[0].why, /thumbnail/);
});

test('a picture the right size passes', () => {
  assert.deepEqual(checkBytes('fine.png', png(400, 300), 'autumn-leaves'), []);
});

test('the limits are stated, so changing one is deliberate', () => {
  assert.deepEqual(LIMITS, {
    bytes: 10 * 1024 * 1024,
    pixels: 4000,
    leastPixels: 64,
    itemsPerPack: 60,
    packBytes: 120 * 1024 * 1024,
  });
});

/* ----------------------------------------------- the zip a real tool reads */

test('a valid pack builds a zip that a real unzip can open and verify', (t) => {
  // Shelling out on purpose. My own reader agreeing with my own writer proves
  // nothing about whether anybody else's tool can open the file.
  const unzip = spawnSync('unzip', ['-v'], { encoding: 'utf8' });
  if (unzip.error) return t.skip('no unzip on this machine');

  const dir = mkdtempSync(join(tmpdir(), 'starter-'));
  try {
    const bytes = zipBytes([
      { name: 'manifest.json', bytes: new TextEncoder().encode('{"pack":"sample"}\n') },
      { name: 'images/circle.png', bytes: png(240, 240) },
      { name: 'images/ring.png', bytes: png(240, 240) },
    ]);
    const at = join(dir, 'sample.zip');
    writeFileSync(at, Buffer.from(bytes));

    const tested = spawnSync('unzip', ['-t', at], { encoding: 'utf8' });
    assert.equal(tested.status, 0, tested.stdout + tested.stderr);
    assert.match(tested.stdout, /No errors detected/);

    // And what comes out is byte for byte what went in.
    assert.equal(spawnSync('unzip', ['-o', '-q', at, '-d', dir], { encoding: 'utf8' }).status, 0);
    assert.deepEqual(
      new Uint8Array(readFileSync(join(dir, 'images/circle.png'))),
      png(240, 240),
      'the extracted picture is the one that went in',
    );
    assert.equal(readFileSync(join(dir, 'manifest.json'), 'utf8').trim(), '{"pack":"sample"}');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the sample pack that ships is itself valid', () => {
  // The pack in starter/sample/ is the one anybody will copy to make their own,
  // so it had better pass the check it is an example of.
  const root = new URL('../starter/sample/', import.meta.url).pathname;
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(checkManifest(manifest, 'sample'), []);

  const onDisk = readdirSync(root).filter((name) => /\.(png|jpe?g|webp)$/i.test(name));
  assert.deepEqual(checkFolder(manifest.items, onDisk, 'sample'), []);
  assert.equal(manifest.items.length, 3);

  for (const item of manifest.items) {
    const bytes = new Uint8Array(readFileSync(join(root, item.file)));
    assert.deepEqual(checkBytes(item.file, bytes, 'sample'), [], item.file);
    assert.equal(probeImage(bytes).ok, true, item.file);
  }
});

/* ------------------------------------------------------------- installing */

const sticker = (over = {}) => ({
  id: `lib-${Math.random().toString(36).slice(2)}`,
  name: 'Something',
  tags: [],
  assetId: 'a1',
  width: 240,
  height: 240,
  createdAt: 1,
  ...over,
});
const installed = (pack, file, over = {}) =>
  sticker({ name: file, source: { pack, file, sourceUrl: 'https://x', author: 'A', licence: 'CC0-1.0', downloadedOn: '2026-10-01' }, ...over });

const items = [item({ file: 'a.png' }), item({ file: 'b.png' }), item({ file: 'c.png' })];

test('a first install installs everything', () => {
  const plan = planInstall(items, 'sample', []);
  assert.deepEqual(plan.install.map((i) => i.file), ['a.png', 'b.png', 'c.png']);
  assert.deepEqual(plan.skip, []);
});

test('installing twice makes no duplicates', () => {
  const library = items.map((i) => installed('sample', i.file));
  const plan = planInstall(items, 'sample', library);
  assert.deepEqual(plan.install, [], 'nothing to add the second time');
  assert.deepEqual(plan.skip.map((i) => i.file), ['a.png', 'b.png', 'c.png']);
});

test('a half-installed pack installs only what is missing', () => {
  const plan = planInstall(items, 'sample', [installed('sample', 'b.png')]);
  assert.deepEqual(plan.install.map((i) => i.file), ['a.png', 'c.png']);
  assert.deepEqual(plan.skip.map((i) => i.file), ['b.png']);
});

test('the same file name in a different pack is a different sticker', () => {
  const plan = planInstall(items, 'sample', [installed('autumn', 'a.png')]);
  assert.equal(plan.install.length, 3, 'autumn/a.png says nothing about sample/a.png');
});

test('stickers of your own are never counted as installed, whatever they are called', () => {
  const mine = [sticker({ name: 'a.png' }), sticker({ name: 'Circle', tags: ['pack:sample'] })];
  const plan = planInstall(items, 'sample', mine);
  assert.equal(plan.install.length, 3, 'a name or a tag is not provenance');
  assert.equal(plan.skip.length, 0);
});

test('a sticker in the trash does not block installing it again', () => {
  const plan = planInstall(items, 'sample', [installed('sample', 'a.png', { deletedAt: 1000 })]);
  assert.deepEqual(plan.install.map((i) => i.file), ['a.png', 'b.png', 'c.png']);
});

test('what came from a pack is found by provenance, not by tag', () => {
  const library = [
    installed('sample', 'a.png'),
    installed('autumn', 'b.png'),
    sticker({ tags: ['pack:sample'] }),
    installed('sample', 'c.png', { deletedAt: 5 }),
  ];
  const found = fromPack(library, 'sample');
  assert.equal(found.length, 1, 'one living sticker really from the pack');
  assert.equal(found[0].source.file, 'a.png');
});

test('the tags an installed sticker carries are the pack and its own', () => {
  const made = tagsFor({ pack: 'sample', name: 'Sample', items: [] }, item({ tags: ['shape', 'circle'] }));
  assert.deepEqual(made, ['pack:sample', 'shape', 'circle']);
});

test('provenance is carried as fields, not folded into tags', () => {
  const source = sourceFor({ pack: 'sample', name: 'Sample', items: [] }, item({ file: 'a.png' }));
  assert.deepEqual(source, {
    pack: 'sample',
    file: 'a.png',
    sourceUrl: 'https://example.org/items/1',
    author: 'Jane Smith',
    licence: 'CC0-1.0',
    downloadedOn: '2026-10-01',
    // What the pack put there, so removing it later can tell an untouched
    // sticker from one somebody has made their own.
    installedAs: { name: 'Oak leaf', tags: ['pack:sample', 'leaf'] },
  });
});

/* --------------------------------------------------------- opening a pack */

/** A pack zip, built the way the builder builds one. */
const packZip = (manifestObject, pictures) =>
  zipBytes([
    { name: 'manifest.json', bytes: new TextEncoder().encode(JSON.stringify(manifestObject)) },
    ...pictures.map(([name, bytes]) => ({ name: `images/${name}`, bytes })),
  ]);

test('a good pack opens', () => {
  const made = manifest({ pack: 'sample', items: [item({ file: 'a.png' })] });
  const opened = openPack(packZip(made, [['a.png', png(240, 240)]]));
  assert.equal(opened.manifest.pack, 'sample');
  assert.equal(opened.files.length, 2);
});

test('a pack whose licence would be refused by the builder is refused here too', () => {
  // A zip is a file that has been somewhere. Trusting it because it is a zip
  // would make every rule in the builder advisory.
  const bad = manifest({ pack: 'sample', items: [item({ file: 'a.png', licence: 'CC BY 4.0' })] });
  assert.throws(() => openPack(packZip(bad, [['a.png', png(240, 240)]])), /refused/);
});

test('a zip that is not a pack says so', () => {
  const notAPack = zipBytes([{ name: 'readme.txt', bytes: new TextEncoder().encode('hello') }]);
  assert.throws(() => openPack(notAPack), /no manifest\.json/);
});

test('a corrupt pack is caught by the checksum rather than installed', () => {
  const made = manifest({ pack: 'sample', items: [item({ file: 'a.png' })] });
  const bytes = packZip(made, [['a.png', png(240, 240)]]);
  // Inside the first entry's *data*, which is what a zip's CRC protects: the
  // local header is 30 bytes plus the name, and "manifest.json" is thirteen.
  bytes[30 + 13 + 4] ^= 0xff;
  assert.throws(() => openPack(bytes), /corrupt|checksum/i);
});

test('a failed picture does not stop the rest', () => {
  const made = manifest({
    pack: 'sample',
    items: [item({ file: 'a.png' }), item({ file: 'gone.png' }), item({ file: 'c.png' })],
  });
  // The middle one is listed but its bytes are not in the zip.
  const { files } = openPack(packZip(made, [['a.png', png(240, 240)], ['c.png', png(240, 240)]]));

  const outcomes = made.items.map((it) => {
    const got = itemBytes(files, it);
    return 'why' in got
      ? { file: it.file, state: 'failed', why: got.why }
      : { file: it.file, state: 'installed' };
  });
  assert.deepEqual(summarise(outcomes), { installed: 2, skipped: 0, failed: 1 });
  assert.equal(outcomes[1].why, 'missing from the pack');
});

test('a picture that is not an image fails on its own, with a reason', () => {
  const made = manifest({ pack: 'sample', items: [item({ file: 'a.png' })] });
  const { files } = openPack(
    packZip(made, [['a.png', new TextEncoder().encode('<!DOCTYPE html><html></html>')]]),
  );
  const got = itemBytes(files, made.items[0]);
  assert.ok('why' in got);
  assert.match(got.why, /web page/);
});

test('the summary counts each outcome once', () => {
  assert.deepEqual(
    summarise([
      { file: 'a', state: 'installed' },
      { file: 'b', state: 'skipped' },
      { file: 'c', state: 'failed', why: 'x' },
      { file: 'd', state: 'installed' },
    ]),
    { installed: 2, skipped: 1, failed: 1 },
  );
});

/* ------------------------------------------------------------ the zip reader */

test('what the writer writes, the reader reads', () => {
  const entries = [
    { name: 'manifest.json', bytes: new TextEncoder().encode('{"pack":"x"}') },
    { name: 'images/one.png', bytes: png(64, 64) },
  ];
  const read = readZip(zipBytes(entries));
  assert.deepEqual(read.map((f) => f.name), entries.map((e) => e.name));
  assert.deepEqual(read[1].bytes, entries[1].bytes);
});

test('a damaged zip is refused rather than half-read', () => {
  assert.throws(() => readZip(new Uint8Array(64)), /not a zip/i);

  const good = zipBytes([{ name: 'a.txt', bytes: new TextEncoder().encode('hello') }]);

  // A flip in the data: the checksum catches it. 30 + 5 for "a.txt".
  const inData = Uint8Array.from(good);
  inData[30 + 5 + 1] ^= 0xff;
  assert.throws(() => readZip(inData), /corrupt|checksum/i);

  // A flip in the central directory's signature: nothing lines up, and the
  // reader says so rather than reading something that is not there.
  const inIndex = Uint8Array.from(good);
  const end = inIndex.length - 22;
  const centralAt = inIndex[end + 16] | (inIndex[end + 17] << 8);
  inIndex[centralAt] ^= 0xff;
  assert.throws(() => readZip(inIndex), /damaged|index/i);
});

test('a flipped byte in a file name is not a checksum problem, and is caught later', () => {
  // Worth pinning because it is the one kind of corruption a zip cannot see:
  // a name is not covered by any checksum, so it simply becomes another name.
  // For a pack that means a picture the manifest does not list, which the
  // manifest check refuses — but the zip itself reads perfectly well.
  const good = zipBytes([{ name: 'a.txt', bytes: new TextEncoder().encode('hello') }]);
  const renamed = Uint8Array.from(good);
  renamed[30] = 'b'.charCodeAt(0);
  const read = readZip(renamed);
  assert.equal(read.length, 1, 'the zip is still perfectly readable');
  assert.equal(read[0].name, 'a.txt', 'the index still says the old name');
});

/* ----------------------------------------------------------- uninstalling */

const asInstalled = (pack, file, over = {}) => {
  const base = installed(pack, file);
  return {
    ...base,
    name: `Item ${file}`,
    tags: [`pack:${pack}`, 'shape'],
    source: { ...base.source, installedAs: { name: `Item ${file}`, tags: [`pack:${pack}`, 'shape'] } },
    ...over,
  };
};

test('removing a pack takes only that pack, and only what it put there', () => {
  const library = [
    asInstalled('sample', 'a.png'),
    asInstalled('sample', 'b.png'),
    asInstalled('autumn', 'c.png'),
    sticker({ name: 'Mine', tags: ['pack:sample'] }),
  ];
  const plan = planRemoval(library, 'sample');
  assert.deepEqual(plan.remove.map((s) => s.source.file), ['a.png', 'b.png']);
  assert.equal(plan.keep.length, 0, 'nothing of this pack was kept back');

  const left = library.filter((s) => !plan.remove.includes(s));
  assert.deepEqual(left.map((s) => s.name), ['Item c.png', 'Mine'],
    'the other pack and my own sticker are untouched');
});

test('a sticker that is also in another pack stays', () => {
  const shared = asInstalled('sample', 'a.png', {
    tags: ['pack:sample', 'pack:autumn', 'shape'],
  });
  const plan = planRemoval([shared, asInstalled('sample', 'b.png')], 'sample');
  assert.deepEqual(plan.remove.map((s) => s.source.file), ['b.png']);
  assert.equal(plan.keep.length, 1);
  assert.match(plan.keep[0].because, /also in autumn/);
});

test('a sticker you renamed stays, and says so', () => {
  const renamed = asInstalled('sample', 'a.png', { name: 'My lovely circle' });
  const plan = planRemoval([renamed], 'sample');
  assert.deepEqual(plan.remove, []);
  assert.match(plan.keep[0].because, /you have changed it/);
});

test('a sticker you retagged stays', () => {
  const retagged = asInstalled('sample', 'a.png', { tags: ['pack:sample', 'shape', 'favourite'] });
  const plan = planRemoval([retagged], 'sample');
  assert.deepEqual(plan.remove, []);
  assert.match(plan.keep[0].because, /you have changed it/);
});

test('the same tags in a different order are not a change', () => {
  const reordered = asInstalled('sample', 'a.png', { tags: ['shape', 'pack:sample'] });
  assert.equal(isEdited(reordered), false);
  assert.equal(planRemoval([reordered], 'sample').remove.length, 1);
});

test('a sticker installed before any of this was recorded is kept, not guessed about', () => {
  const old = asInstalled('sample', 'a.png');
  delete old.source.installedAs;
  assert.equal(isEdited(old), true, 'nothing to compare against, so leave it alone');
  assert.deepEqual(planRemoval([old], 'sample').remove, []);
});

test('something already in the trash is not removed twice', () => {
  const plan = planRemoval([asInstalled('sample', 'a.png', { deletedAt: 1000 })], 'sample');
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(plan.keep, []);
});

test('removing a pack nothing came from removes nothing', () => {
  const plan = planRemoval([sticker({ tags: ['pack:sample'] })], 'sample');
  assert.deepEqual(plan.remove, []);
});

test('other packs a sticker belongs to are named, and its own is not', () => {
  const sticker = asInstalled('sample', 'a.png', {
    tags: ['pack:sample', 'pack:autumn', 'pack:winter', 'shape'],
  });
  assert.deepEqual(otherPacks(sticker, 'sample'), ['autumn', 'winter']);
  assert.deepEqual(otherPacks(sticker, 'autumn').sort(), ['sample', 'winter']);
});

test('a removed sticker keeps its row, so the trash and the asset sweep still see it', () => {
  // Removal is the app's ordinary soft delete: the row stays, with deletedAt on
  // it. That is what lets the trash offer it back, and what stops the asset
  // sweep deciding its picture is an orphan while it is still recoverable.
  const removed = { ...asInstalled('sample', 'a.png'), deletedAt: Date.now() };
  assert.deepEqual(stickerAssets(removed), [removed.assetId],
    'its picture is still counted as in use');
  assert.equal(alive([removed]).length, 0, 'while being out of every list');
});
