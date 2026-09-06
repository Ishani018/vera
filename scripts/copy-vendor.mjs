// Copies the Paged.js polyfill out of node_modules into public/vendor so the
// preview iframe can load it with a plain <script src>. Runs on predev/prebuild.
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const files = [
  ['node_modules/pagedjs/dist/paged.polyfill.js', 'public/vendor/paged.polyfill.js'],
];

for (const [from, to] of files) {
  const src = resolve(root, from);
  const dest = resolve(root, to);
  if (!existsSync(src)) {
    console.warn(`[copy-vendor] missing ${from} — run npm install first`);
    continue;
  }
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  console.log(`[copy-vendor] ${from} -> ${to}`);
}
