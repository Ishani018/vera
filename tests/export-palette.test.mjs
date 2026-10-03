import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { PALETTES, colourAt, MUST_READ } from '../lib/theme.ts';

/**
 * The palette is chrome, and chrome never reaches a file.
 *
 * Someone picks Night because the room is dark. The sticker they export that
 * evening has to be the same bytes as the one they exported at lunchtime in
 * Press proof — otherwise the palette is not a preference, it is an edit to
 * everything they have ever made.
 *
 * The end-to-end half of this is the two-palette export check in
 * `scripts/export-digest.mjs`, which drives a real browser, exports the fixed
 * picture under two palettes and compares the downloaded bytes. What is checked
 * here is the half that can be checked without a browser, and it is the half
 * that actually goes wrong: whether any colour that ends up *in* a file is
 * reachable from the palette at all.
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(path) ? [path] : [];
  });

/**
 * The modules that decide what goes into an exported file.
 *
 * If one of these ever reads `lib/theme.ts`, a palette could change a sticker,
 * a PDF or a sheet — so the import itself is the thing to forbid, rather than
 * trying to prove the absence of an effect afterwards.
 */
const MAKES_FILES = [
  'lib/render',
  'lib/lineart',
  'lib/stickers',
  'lib/cover',
  'lib/exportClient.ts',
  'app/api',
];

test('nothing that makes a file can even see the palette', () => {
  const offenders = [];
  for (const where of MAKES_FILES) {
    const full = join(ROOT, where);
    let files;
    try {
      files = statSync(full).isDirectory() ? walk(full) : [full];
    } catch {
      continue;
    }
    for (const path of files) {
      const source = readFileSync(path, 'utf8');
      if (/from '[^']*\/theme'|from '@\/lib\/theme'/.test(source)) {
        offenders.push(path.slice(ROOT.length + 1));
      }
    }
  }
  assert.deepEqual(offenders, [], 'these reach the palette and also write files');
});

test('no palette colour is a colour an export is drawn in', () => {
  /*
    The defaults that do end up in files — a sticker's ink, the white of a
    die-cut outline, a cover's starting text colour — are written where they are
    used, deliberately, so that they cannot move with the chrome. This catches
    the reverse mistake: a palette value that happens to equal one of them,
    which would make the two look linked and invite somebody to "tidy" them into
    one place.
  */
  const dataDefaults = new Set(['#1B1815', '#FFFFFF', '#E8B4B8', '#D14B4B', '#1a1a1a', '#ffffff']);
  const clashes = [];
  for (const palette of PALETTES) {
    for (const [role, value] of Object.entries(palette)) {
      if (typeof value !== 'string' || !value.startsWith('#')) continue;
      // `sheet` is white on purpose and means "a sheet of paper", which is the
      // same idea the export's white is. It is the one allowed overlap.
      if (role === 'sheet') continue;
      if (dataDefaults.has(value) && palette.id !== 'press-proof') {
        clashes.push(`${palette.id}.${role} = ${value}`);
      }
    }
  }
  assert.deepEqual(clashes, []);
});

test('the sweep itself is palette-complete, so no palette ships unchecked', () => {
  // A palette added without being added to the sweep is a palette nobody has
  // checked. This is cheap insurance that the loop really runs six times.
  const seen = new Set();
  for (const palette of PALETTES) {
    for (const pair of MUST_READ) seen.add(`${palette.id}:${pair.what}`);
  }
  assert.equal(seen.size, PALETTES.length * MUST_READ.length);
  // And that every pair resolves to a real colour in every palette — an
  // unresolved name would come back undefined and silently pass the sweep.
  for (const palette of PALETTES) {
    for (const pair of MUST_READ) {
      for (const name of [pair.text, pair.on]) {
        assert.match(colourAt(palette, name) ?? '', /^#[0-9A-Fa-f]{6}$/, `${palette.id}: ${name}`);
      }
    }
  }
});
