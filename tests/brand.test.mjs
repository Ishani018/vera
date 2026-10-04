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
