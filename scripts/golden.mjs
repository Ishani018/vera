/**
 * Golden-file checks for the two PDF pipelines.
 *
 * Run before and after any refactor that could move type or pictures on a page:
 *
 *   npm run golden           compare against the recorded goldens
 *   npm run golden:update    re-record them (only when a change is intended)
 *
 * It does not compare PDF bytes. Chromium writes a creation date into every
 * file and is under no obligation to order its objects the same way twice, so
 * a byte comparison would fail for reasons that have nothing to do with this
 * code. What it compares instead is the structure that decides whether a book
 * prints correctly: how many pages, how big each one is, which fonts are
 * embedded and as what, which images are present at what size, and — the part
 * a refactor actually threatens — where everything was drawn.
 *
 * Two deliberate properties:
 *
 * - It goes through the real API routes rather than calling the renderer
 *   directly, because `lib/server/renderPdf.ts` imports `server-only` and
 *   cannot be loaded outside Next at all. Driving the routes also means font
 *   embedding, Paged.js injection and page padding are all under test, which
 *   they would not be otherwise.
 *
 * - It runs each fixture through `migrateProject` first, exactly as opening a
 *   saved book does. So a stored fixture in today's shape keeps working after
 *   a migration is added, and the PDF it produces has to come out unchanged.
 *   That is the whole point of having this before the units change.
 */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tests', 'golden');
const BASE = process.env.GOLDEN_BASE_URL || 'http://127.0.0.1:3000';
const UPDATE = process.argv.includes('--update');

const { migrateProject } = await import(join(ROOT, 'lib', 'projects.ts'));

/* ----------------------------------------------------------- reading a PDF */

/** Every stream in the file that can be inflated, in the order it appears. */
function streams(pdf) {
  const out = [];
  const marker = Buffer.from('stream');
  let at = 0;
  for (;;) {
    const found = pdf.indexOf(marker, at);
    if (found === -1) break;
    at = found + marker.length;
    // The keyword is followed by CRLF or LF, and nothing else.
    let start = at;
    if (pdf[start] === 0x0d) start += 1;
    if (pdf[start] === 0x0a) start += 1;
    else if (pdf[start - 1] !== 0x0a) continue;
    const end = pdf.indexOf(Buffer.from('endstream'), start);
    if (end === -1) break;
    try {
      out.push(inflateSync(pdf.subarray(start, end)));
    } catch {
      /* Not deflated — an image or a font program. Its presence is recorded
         elsewhere; only the drawing instructions are wanted here. */
    }
  }
  return out;
}

const round = (n, places = 2) => Number(Number(n).toFixed(places));

/**
 * Where things were put on the page.
 *
 * Every text matrix and every transform carries a translation, and between
 * them they say where each line of type and each picture ended up. Rounded to
 * a hundredth of a point — far finer than anything visible, far coarser than
 * the noise in a floating-point pipeline.
 */
function placements(text) {
  const out = [];
  const matrix = /(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (cm|Tm)\b/g;
  for (const m of text.matchAll(matrix)) {
    out.push(`${m[7]}:${round(m[5])},${round(m[6])}`);
  }
  for (const m of text.matchAll(/(-?[\d.]+) (-?[\d.]+) (Td|TD)\b/g)) {
    out.push(`${m[3]}:${round(m[1])},${round(m[2])}`);
  }
  return out;
}

function fingerprint(pdf) {
  const raw = pdf.toString('latin1');

  const boxes = [...raw.matchAll(/\/MediaBox\s*\[\s*([\d.\s-]+?)\]/g)].map((m) => {
    const [, , w, h] = m[1].trim().split(/\s+/).map(Number);
    return `${round(w / 72, 4)}x${round(h / 72, 4)}in`;
  });

  // The subset prefix is six arbitrary letters; the family is the part that
  // matters and the part a regression would change.
  const fonts = [...new Set(
    [...raw.matchAll(/\/BaseFont\s*\/(?:[A-Z]{6}\+)?([A-Za-z0-9\-,#]+)/g)].map((m) => m[1]),
  )].sort();

  const images = [...raw.matchAll(/\/Subtype\s*\/Image([\s\S]{0,400}?)(?:stream|endobj)/g)]
    .map((m) => {
      const w = /\/Width\s+(\d+)/.exec(m[1]);
      const h = /\/Height\s+(\d+)/.exec(m[1]);
      const f = /\/Filter\s*\/(\w+)/.exec(m[1]);
      return w && h ? `${w[1]}x${h[1]}/${f ? f[1] : 'raw'}` : null;
    })
    .filter(Boolean)
    .sort();

  const body = streams(pdf).map((s) => s.toString('latin1'));
  const drawing = body.filter((s) => / (Tj|TJ|Do)\b/.test(s));
  const where = drawing.flatMap(placements);

  return {
    pages: (raw.match(/\/Type\s*\/Page[^s]/g) || []).length || boxes.length,
    mediaBoxes: [...new Set(boxes)].sort(),
    fonts,
    embeddedFontPrograms: (raw.match(/\/FontFile\d?\b/g) || []).length,
    images,
    glyphRuns: drawing.reduce((n, s) => n + (s.match(/ (Tj|TJ)\b/g) || []).length, 0),
    // Every XObject invocation, not only images: `Do` also draws forms, which
    // is what the poetry book's four turn out to be. Named for what it counts,
    // because a diagnostic with a misleading name costs more than no diagnostic.
    xobjectDraws: drawing.reduce((n, s) => n + (s.match(/ Do\b/g) || []).length, 0),
    placements: where.length,
    // The positions themselves, as one digest. A diff here means something
    // moved; the number above says roughly how much is being looked at.
    placementDigest: createHash('sha256').update(where.join('|')).digest('hex').slice(0, 16),
  };
}

/* ------------------------------------------------------------- the server */

async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await reachable(BASE)) {
    // Said out loud because it changes what the run proves: a server already up
    // has a warm font cache, so this run did not re-fetch anything. Two runs
    // agreeing against one warm server is a weaker claim than two cold ones.
    console.log(`using the server already listening at ${BASE} (warm)`);
    return null;
  }
  if (process.env.GOLDEN_BASE_URL) {
    throw new Error(`Nothing is listening at ${BASE}.`);
  }
  process.stdout.write('starting a dev server… ');
  // Its own process group, because `npm run dev` spawns `next dev` as a
  // grandchild: killing the child alone leaves the server running and the next
  // run silently reuses it, which is how this leaked one the first time.
  const child = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await reachable(BASE)) {
      process.stdout.write('up\n');
      return child;
    }
  }
  stop(child);
  throw new Error('the dev server did not come up within a minute');
}

/** Takes the whole group down, not just the process we happen to hold. */
function stop(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

async function renderPdf(route, body) {
  const res = await fetch(`${BASE}/api/export/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`/api/export/${route} returned ${res.status}: ${detail.slice(0, 300)}`);
  }
  const failed = res.headers.get('x-versecraft-fonts-failed');
  return {
    pdf: Buffer.from(await res.arrayBuffer()),
    // Only the interior route reports this. The check below does not depend on
    // it, and catches the cover too.
    failed: failed && failed !== 'none' ? failed : null,
    // What the route says it made, before Chromium's page-size quantisation
    // rounds it. A media box alone cannot tell an intended size from a rounded
    // one, and on a cover the intended size is the thing that matters.
    reported: {
      size: res.headers.get('x-versecraft-cover-size'),
      spine: res.headers.get('x-versecraft-spine'),
      pages: res.headers.get('x-versecraft-pages'),
      padded: res.headers.get('x-versecraft-padded'),
    },
  };
}

/* ------------------------------------------------------------------- runs */

const CASES = [
  {
    name: 'cover',
    route: 'cover',
    body: (f) => ({ project: migrateProject(f.project), pageCount: f.pageCount, assets: f.assets }),
  },
  {
    name: 'poetry',
    route: 'interior',
    body: (f) => ({ project: migrateProject(f.project), assets: f.assets }),
  },
];

function compare(name, got, want) {
  const problems = [];
  for (const key of Object.keys(want)) {
    const a = JSON.stringify(got[key]);
    const b = JSON.stringify(want[key]);
    if (a !== b) problems.push(`  ${key}\n    was: ${b}\n    now: ${a}`);
  }
  if (!problems.length) return true;
  console.log(`\n✗ ${name} changed:\n${problems.join('\n')}`);
  return false;
}

let server = null;
let failures = 0;
try {
  server = await ensureServer();

  for (const kase of CASES) {
    const fixture = JSON.parse(readFileSync(join(DIR, `${kase.name}.fixture.json`), 'utf8'));
    const { pdf, failed, reported } = await renderPdf(kase.route, kase.body(fixture));
    const got = { ...fingerprint(pdf), reported };

    // Fonts are fetched from Google over the network at render time. When that
    // fails the book prints in a substituted face, which moves every measurement
    // in the fingerprint at once — so it has to be its own kind of wrong,
    // loudly, and must never be allowed to read as a regression in the code
    // under test. Checked on the outcome rather than on the route's report of
    // it, because only one of the two routes reports it.
    const substituted = got.glyphRuns > 0 && got.embeddedFontPrograms === 0;
    if (failed || substituted) {
      throw new Error(
        `fonts did not make it into the ${kase.name} PDF` +
          (failed ? ` (${failed})` : ' — no embedded font programs at all') +
          `. That is a network problem, not a regression, so nothing was checked.`,
      );
    }

    const path = join(DIR, `${kase.name}.golden.json`);

    if (UPDATE || !existsSync(path)) {
      writeFileSync(path, JSON.stringify(got, null, 2) + '\n');
      console.log(`· ${kase.name}: recorded (${got.pages} pages, ${pdf.length} bytes)`);
      continue;
    }

    const want = JSON.parse(readFileSync(path, 'utf8'));
    if (compare(kase.name, got, want)) {
      console.log(
        `✓ ${kase.name}: ${got.pages} pages, ${got.mediaBoxes.join(' ')}, ` +
          `${got.fonts.length} font(s), ${got.glyphRuns} glyph runs, ` +
          `${got.placements} placements, digest ${got.placementDigest}`,
      );
    } else {
      failures += 1;
    }
  }
} finally {
  if (server) stop(server);
}

if (failures) {
  console.log(
    `\n${failures} golden(s) changed. If that was intended, re-record with ` +
      `\`npm run golden:update\` and say why in the commit.`,
  );
  process.exit(1);
}
console.log('\nall goldens match');
