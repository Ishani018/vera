import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { BRAND, resolveBrand } from '../lib/brand.ts';

const ROOT = new URL('..', import.meta.url).pathname;

/** Every .ts and .tsx file under the given folders, as paths relative to the repo root. */
function sources(...folders) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(relative(ROOT, full));
    }
  };
  for (const folder of folders) walk(join(ROOT, folder));
  return out;
}
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

/* ---------------------------------------------------------------- the config */

test('Vera is the product, Isnaevy is the studio, and the site defaults to vera.isnaevy.com', () => {
  const brand = resolveBrand({});
  assert.equal(brand.product, 'Vera');
  assert.equal(brand.studio, 'Isnaevy');
  assert.equal(brand.byline, 'by Isnaevy');
  assert.equal(brand.siteUrl, 'https://vera.isnaevy.com');
  assert.equal(brand.studioUrl, 'https://isnaevy.com');
});

test('the site URL comes from NEXT_PUBLIC_SITE_URL, trimmed, with no trailing slash; blank means the default', () => {
  assert.equal(resolveBrand({ NEXT_PUBLIC_SITE_URL: ' https://staging.example.com/ ' }).siteUrl, 'https://staging.example.com');
  assert.equal(resolveBrand({ NEXT_PUBLIC_SITE_URL: '' }).siteUrl, 'https://vera.isnaevy.com');
  assert.equal(resolveBrand({ NEXT_PUBLIC_STUDIO_URL: 'https://example.org//' }).studioUrl, 'https://example.org');
});

test('changing the env never changes the names, only the addresses', () => {
  const brand = resolveBrand({ NEXT_PUBLIC_SITE_URL: 'https://x.test', NEXT_PUBLIC_STUDIO_URL: 'https://y.test' });
  assert.equal(brand.product, 'Vera');
  assert.equal(brand.studio, 'Isnaevy');
  assert.equal(BRAND.product, 'Vera');
});

/* ------------------------------------------------------------ single source */

// The one place a name may be written out besides the config: an HTTP User-Agent, which identifies a program to a
// server and is never shown to a person.
const ALLOWED_LITERALS = new Set(['lib/brand.ts', 'lib/graphics/policy.ts']);

test('no file in app/, components/ or lib/ writes the product or studio name itself', () => {
  const offenders = [];
  for (const path of sources('app', 'components', 'lib')) {
    if (ALLOWED_LITERALS.has(path)) continue;
    const text = read(path);
    for (const name of ['Vera', 'Isnaevy']) if (new RegExp(`\\b${name}\\b`).test(text)) offenders.push(`${path}: "${name}"`);
  }
  assert.deepEqual(offenders, [], 'read it from lib/brand.ts instead');
});

test('the files that show the brand all read it from the config', () => {
  for (const path of ['components/Wordmark.tsx', 'components/Landing.tsx', 'app/layout.tsx', 'app/opengraph-image.tsx'])
    assert.match(read(path), /from '@\/lib\/brand'/, path);
});

test('only screen and download-name code imports the brand: nothing that makes a book, a cover or a PDF', () => {
  const importers = sources('app', 'components', 'lib')
    .filter((path) => path !== 'lib/brand.ts' && /from '(@\/lib\/brand|\.\/brand|\.\.\/lib\/brand)'/.test(read(path)))
    .sort();
  assert.deepEqual(importers, [
    'app/layout.tsx', 'app/opengraph-image.tsx', 'components/Landing.tsx', 'components/Wordmark.tsx',
    'lib/backup.ts', 'lib/exportClient.ts',
  ]);
});

/* ------------------------------------------------- what must never be renamed */

test('every storage name is the one it was created with, so nobody loses saved work', () => {
  const all = sources('app', 'components', 'lib').map(read).join('\n');
  assert.match(read('lib/db.ts'), /super\('versecraft'\)/, 'IndexedDB database name');
  for (const key of [
    'versecraft:activeProjectId', 'versecraft:recentColours', 'versecraft:walkthrough',
    'isnaevy:theme', 'isnaevy:palette-custom',
  ]) assert.ok(all.includes(`'${key}'`), `${key} is still used, under that name`);
});

/* ---------------------------------------------------------- the wordmark font */

test('the wordmark font is ours: small woff2 and woff files, and the licence travels with them', () => {
  const woff2 = readFileSync(join(ROOT, 'public/fonts/wordmark-display-latin.woff2'));
  const woff = readFileSync(join(ROOT, 'public/fonts/wordmark-display-latin.woff'));
  assert.equal(woff2.subarray(0, 4).toString(), 'wOF2');
  assert.equal(woff.subarray(0, 4).toString(), 'wOFF');
  assert.ok(woff2.length < 30_000, `woff2 is ${woff2.length} bytes`);
  const licence = read('public/fonts/AbrilFatface-OFL.txt');
  assert.match(licence, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(licence, /TypeTogether/);
  const doc = read('docs/BRAND.md');
  assert.match(doc, /Abril Fatface/);
  assert.match(doc, /SIL Open Font Licen[cs]e/);
  assert.match(doc, /github\.com\/google\/fonts\/tree\/main\/ofl\/abrilfatface/);
  assert.match(doc, /2026-10-04/);
});

test('the page loads the wordmark face from /fonts and never asks Google for it', () => {
  const layout = read('app/layout.tsx');
  assert.match(layout, /rel="preload" href="\/fonts\/wordmark-display-latin\.woff2"/);
  const googleUrl = layout.slice(layout.indexOf('fonts.googleapis.com'), layout.indexOf("'&display=swap'"));
  assert.doesNotMatch(googleUrl, /Abril|Great/i, 'the Google request names no wordmark face');
  assert.match(read('app/globals.css'), /font-family: 'Wordmark Display';\s*src: url\('\/fonts\/wordmark-display-latin\.woff2'\)/);
  assert.match(read('lib/theme.ts'), /wordmark: "'Wordmark Display', Georgia/);
});

test('the old script face is gone from the app, so nothing can quietly load it again', () => {
  const offenders = [];
  for (const path of [...sources('app', 'components', 'lib', 'scripts'), 'app/tokens.css', 'app/globals.css', 'app/surfaces.css', 'scripts/topbar-check.mjs']) {
    try {
      if (/Great[ +]Vibes|font-script/.test(read(path))) offenders.push(path);
    } catch { /* a folder with no such file */ }
  }
  assert.deepEqual(offenders, []);
});

test('the header wordmark is coloured by a token that is dark in Night, and sized as before', () => {
  const source = read('components/Wordmark.tsx');
  assert.match(source, /text-outline/, 'outline is near-black in every palette, Night included');
  assert.doesNotMatch(source, /text-ink-900/, 'ink-900 is nearly white in Night, on a white bar');
  assert.match(source, /text-\[34px\] leading-\[38px\]/, 'the size and line box the bar was built around');
  assert.match(source, /var\(--font-wordmark\)/);
});

test('the favicon is outlines only: a path, no text and no font', () => {
  const icon = read('app/icon.svg');
  assert.match(icon, /<path[^>]* d="M[^"]+"/);
  assert.doesNotMatch(icon, /<text|font-family|@font-face|<image/);
  assert.match(icon, /viewBox="0 0 32 32"/);
});

test('the social image reads its fonts from disk, so a build needs no network', () => {
  const source = read('app/opengraph-image.tsx');
  assert.match(source, /public', 'fonts', 'wordmark-display-latin\.woff'/);
  assert.doesNotMatch(source, /fetch\(|https?:\/\/fonts\./);
});
