import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  LIMITS,
  extensionFor,
  fileNameFor,
  manifestFor,
  packNameFor,
  paceFor,
  parseAsk,
  readCommons,
  readSmithsonian,
} from '../lib/starter/fetch.ts';

/**
 * Fetches public-domain pictures from two official APIs and writes a pack.
 *
 * It runs on your own computer, never in the app, and it never scrapes: both
 * sources are asked through their documented APIs and both are read for their
 * *own* licence field. Nothing is kept on the strength of the search query, the
 * collection it came from, or how old it looks.
 *
 * Every decision this makes lives in `lib/starter/fetch.ts` and is tested
 * against saved sample responses. This file is the part that cannot be tested
 * without a network: the asking, the downloading and the writing.
 *
 *   npm run starter:fetch commons "botanical illustration" 20
 *   npm run starter:fetch smithsonian "herbarium" 40
 *
 * Then `npm run starter:build`, which checks every item again — licence, real
 * image, size, duplicates — and only then makes the zip.
 */

const grey = (s) => `\u001b[2m${s}\u001b[0m`;
const red = (s) => `\u001b[31m${s}\u001b[0m`;
const green = (s) => `\u001b[32m${s}\u001b[0m`;

/** Who we are, which both APIs ask for and one of them enforces. */
const AGENT =
  'IsnaevyStarterFetch/1.0 (local sticker pack builder; https://github.com/Ishani018/book)';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const stop = (message) => {
  console.error(red(message));
  process.exit(1);
};

const asked = parseAsk(process.argv.slice(2));
if ('problem' in asked) stop(asked.problem);
const { source, query, count } = asked.ask;

/** The whole run shares one clock, so the rate limit is a rate, not a pause. */
const startedAt = Date.now();
let requests = 0;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function paced(url, options = {}) {
  const due = startedAt + paceFor(requests++);
  const now = Date.now();
  if (due > now) await wait(due - now);
  const response = await fetch(url, {
    ...options,
    headers: { 'User-Agent': AGENT, ...(options.headers ?? {}) },
  });
  return response;
}

/** A refusal from the far end is a stop, not a retry loop. */
async function askJson(url, what, { needsKey = false } = {}) {
  let response;
  try {
    response = await paced(url);
  } catch (error) {
    stop(`${what} could not be reached: ${error.message}`);
  }
  if (response.status === 429) {
    stop(`${what} is rate-limiting this (429). Wait a few minutes and ask for fewer.`);
  }
  if (response.status === 401 || response.status === 403) {
    stop(
      `${what} refused the request (${response.status}).` +
        (needsKey
          ? ' Check the API key in SMITHSONIAN_API_KEY.'
          : ' It needs no key, so this is a block between you and it — a proxy,' +
            ' a firewall, or a User-Agent it will not accept.'),
    );
  }
  if (!response.ok) stop(`${what} answered ${response.status} ${response.statusText}.`);
  try {
    return await response.json();
  } catch {
    stop(`${what} answered with something that is not JSON.`);
  }
}

/* ------------------------------------------------------------- the search */

async function searchCommons() {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
    '&generator=search&gsrnamespace=6&gsrlimit=' +
    Math.min(50, count * 3) +
    '&gsrsearch=' +
    encodeURIComponent(query) +
    '&prop=imageinfo&iiprop=url|extmetadata|size' +
    '&iiextmetadatafilter=LicenseShortName|Artist|Categories|ObjectName';
  return readCommons(await askJson(url, 'Wikimedia Commons'));
}

async function searchSmithsonian() {
  const key = process.env.SMITHSONIAN_API_KEY ?? process.env.SI_API_KEY;
  if (!key) {
    stop(
      'No Smithsonian API key. Get a free one at https://api.data.gov/signup/ and put it in\n' +
        '  export SMITHSONIAN_API_KEY=…\n' +
        'It is read from the environment and never written into this repository.',
    );
  }
  const url =
    'https://api.si.edu/openaccess/api/v1.0/search?q=' +
    encodeURIComponent(`${query} AND online_media_type:"Images"`) +
    `&rows=${Math.min(100, count * 3)}&api_key=${encodeURIComponent(key)}`;
  return readSmithsonian(await askJson(url, 'the Smithsonian Open Access API', { needsKey: true }));
}

/* ------------------------------------------------------------ the fetching */

const pack = packNameFor(query);
const folder = join(ROOT, 'starter', pack);
if (existsSync(folder) && readdirSync(folder).length) {
  stop(
    `starter/${pack} already exists and is not empty.\n` +
      'Move it or delete it first — this never writes over a pack you already have.',
  );
}

console.log(`Asking ${grey(source)} for ${grey(query)} — up to ${count}, ${LIMITS.perSecond}/s.`);
const { kept, skipped } = source === 'commons' ? await searchCommons() : await searchSmithsonian();

if (!kept.length) {
  console.log(`\nNothing was keepable out of ${kept.length + skipped.length} results.`);
  for (const one of skipped.slice(0, 20)) console.log(`  ${red('skipped')} ${one.title} — ${one.why}`);
  process.exit(1);
}

mkdirSync(folder, { recursive: true });
const taken = new Set();
const written = [];
const failed = [];

for (const found of kept.slice(0, count)) {
  let response;
  try {
    response = await paced(found.fileUrl);
  } catch (error) {
    failed.push({ title: found.title, why: error.message });
    continue;
  }
  if (!response.ok) {
    failed.push({ title: found.title, why: `the file answered ${response.status}` });
    continue;
  }
  const extension = extensionFor(found.fileUrl, response.headers.get('content-type'));
  if (!extension) {
    // SVG, TIFF, PDF and anything else the app cannot open as a sticker.
    failed.push({ title: found.title, why: `not a PNG, JPEG or WebP (${response.headers.get('content-type')})` });
    continue;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 10 * 1024 * 1024) {
    failed.push({ title: found.title, why: `${(bytes.length / 1024 / 1024).toFixed(1)} MB, over the 10 MB limit` });
    continue;
  }
  const file = fileNameFor(found, extension, taken);
  writeFileSync(join(folder, file), bytes);
  written.push({ found, file });
  console.log(`  ${green('kept')} ${file}  ${grey(found.licence)}`);
}

if (!written.length) {
  console.log(red('\nNothing could be downloaded.'));
  for (const one of failed) console.log(`  ${one.title} — ${one.why}`);
  process.exit(1);
}

const manifest = manifestFor(pack, written, source, query);
writeFileSync(join(folder, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\n${green(`${written.length} written to starter/${pack}/`)}`);
if (skipped.length) {
  console.log(grey(`\n${skipped.length} skipped:`));
  for (const one of skipped.slice(0, 20)) console.log(grey(`  ${one.title} — ${one.why}`));
  if (skipped.length > 20) console.log(grey(`  …and ${skipped.length - 20} more`));
}
if (failed.length) {
  console.log(red(`\n${failed.length} could not be downloaded:`));
  for (const one of failed) console.log(`  ${one.title} — ${one.why}`);
}
console.log(
  `\nNow run ${grey('npm run starter:build')} — it checks every item again before making the zip.\n` +
    'Read the licence on the page each manifest row links to before you sell anything made from it.',
);
