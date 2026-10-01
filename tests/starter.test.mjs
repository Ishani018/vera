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
