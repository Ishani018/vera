import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkBytes, checkFolder, checkManifest, LIMITS } from '../lib/starter/manifest.ts';
import { zipBytes } from '../lib/stickers/zip.ts';

/**
 * Checks every starter pack and builds one zip each.
 *
 * It refuses rather than warns. A pack with one unaccounted-for picture in it
 * is not a pack with a note attached — it is a pack that does not get built,
 * because the whole value of this folder is that everything in it has a source,
 * an author and a licence somebody looked at.
 *
 * Every problem in every pack is reported in one go. Fixing these is a
 * sitting-down job, and being told about them one at a time is six rounds of
 * something that could have been one.
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SOURCE = join(ROOT, 'starter');
const OUT = join(SOURCE, 'dist');

const IMAGE = /\.(png|jpe?g|webp)$/i;
const grey = (s) => `\u001b[2m${s}\u001b[0m`;
const red = (s) => `\u001b[31m${s}\u001b[0m`;
const green = (s) => `\u001b[32m${s}\u001b[0m`;

if (!existsSync(SOURCE)) {
  console.log(`No ${grey('starter/')} folder — nothing to build.`);
  process.exit(0);
}

const packs = readdirSync(SOURCE, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'dist')
  .map((entry) => entry.name)
  .sort();

if (!packs.length) {
  console.log(`No packs in ${grey('starter/')} yet. See ${grey('starter/README.md')}.`);
  process.exit(0);
}

const problems = [];
const built = [];

for (const pack of packs) {
  const folder = join(SOURCE, pack);
  const manifestAt = join(folder, 'manifest.json');

  if (!existsSync(manifestAt)) {
    problems.push({ where: pack, why: 'no manifest.json' });
    continue;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestAt, 'utf8'));
  } catch (error) {
    problems.push({ where: `${pack}/manifest.json`, why: `will not parse — ${error.message}` });
    continue;
  }

  const found = checkManifest(manifest, pack);
  problems.push(...found);

  // Checked even when the manifest has problems of its own. A pack with a bad
  // licence *and* an unlisted picture must be told about both: fixing the
  // licence and being told about the picture on the next run is the sort of
  // thing that makes people stop reading the output.
  const onDisk = readdirSync(folder).filter((name) => IMAGE.test(name));
  const mismatched = Array.isArray(manifest.items)
    ? checkFolder(manifest.items, onDisk, pack)
    : [];
  problems.push(...mismatched);
  if (found.length || mismatched.length) continue;

  // The bytes themselves: a real picture, not truncated, within the limits.
  const entries = [];
  let total = 0;
  let bad = false;
  for (const item of manifest.items) {
    const bytes = new Uint8Array(readFileSync(join(folder, item.file)));
    const wrong = checkBytes(item.file, bytes, pack);
    if (wrong.length) {
      problems.push(...wrong);
      bad = true;
      continue;
    }
    total += bytes.length;
    entries.push({ name: `images/${item.file}`, bytes });
  }
  if (bad) continue;
  if (total > LIMITS.packBytes) {
    problems.push({
      where: pack,
      why: `${(total / 1024 / 1024).toFixed(1)} MB of pictures, and ${LIMITS.packBytes / 1024 / 1024} MB is the limit`,
    });
    continue;
  }

  // The manifest travels inside the zip, so provenance cannot be separated
  // from the pictures it is about by anybody moving one file and not the other.
  entries.unshift({
    name: 'manifest.json',
    bytes: new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
  });

  mkdirSync(OUT, { recursive: true });
  const zip = zipBytes(entries);
  const at = join(OUT, `${pack}.zip`);
  writeFileSync(at, Buffer.from(zip));
  built.push({ pack, items: manifest.items.length, bytes: zip.length });
}

/* Both halves of the report, always, so a run says what happened rather than
   only what went wrong. A build that silently says nothing about the pack you
   were worried about is a build you have to go and check. */

if (built.length) {
  console.log(green(`\nBuilt ${built.length} ${built.length === 1 ? 'pack' : 'packs'}:\n`));
  for (const { pack, items, bytes } of built) {
    console.log(`  ✓ ${pack}.zip  ${grey(`${items} stickers, ${(bytes / 1024).toFixed(0)} KB`)}`);
  }
  console.log(grey('\n  In starter/dist/, each with its manifest inside it.'));
}

const refused = [...new Set(problems.map((p) => p.where.split('/')[0]))];
if (problems.length) {
  console.error(red(`\nRejected ${refused.length} ${refused.length === 1 ? 'pack' : 'packs'}, for ${problems.length} ${problems.length === 1 ? 'reason' : 'reasons'}:\n`));
  for (const { where, why } of problems) console.error(`  ✗ ${where}\n      ${grey(why)}`);
  console.error(red(`\n  Nothing was built for ${refused.join(', ')}.\n`));
  process.exit(1);
}

console.log(green('\n  Every item checked for a CC0 or public-domain licence.\n'));
