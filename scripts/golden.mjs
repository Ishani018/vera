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
const { projectSpecs } = await import(join(ROOT, 'lib', 'fonts.ts'));

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
/** Half a point: finer than anything visible, coarser than floating-point noise. */
const half = (n) => Math.round(n * 2) / 2;

/* ---------------------------------------------------- reading the page tree */

/** Every `N 0 obj … endobj` in the file, by object number. */
function objects(raw) {
  const out = new Map();
  for (const m of raw.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) out.set(m[1], m[2]);
  return out;
}

/**
 * The pages, in the order the document says they come in.
 *
 * Not the order the streams happen to sit in the file: a page with nothing on
 * it has no content stream at all, so counting streams gets eleven where the
 * poetry book has eighteen pages. The `/Kids` array is the document's own
 * answer and the only one that lines up with what someone would see.
 */
function pagesInOrder(raw, objs) {
  // The tree is nested once a document gets long — Chromium balances it — so
  // reading one node's /Kids gives a handful of branches, not the pages. Taking
  // the first /Pages node found reported eight pages for an eighteen-page book.
  const catalog = [...objs].find(([, b]) => /\/Type\s*\/Catalog\b/.test(b));
  const rootRef = catalog && /\/Pages\s+(\d+) 0 R/.exec(catalog[1])?.[1];

  const out = [];
  const seen = new Set();
  const walk = (ref) => {
    if (!ref || seen.has(ref)) return;
    seen.add(ref);
    const body = objs.get(ref);
    if (!body) return;
    if (/\/Type\s*\/Pages\b/.test(body)) {
      const kids = /\/Kids\s*\[([\s\S]*?)\]/.exec(body);
      if (kids) for (const m of kids[1].matchAll(/(\d+) 0 R/g)) walk(m[1]);
      return;
    }
    if (/\/Type\s*\/Page\b/.test(body)) out.push(ref);
  };
  walk(rootRef);
  if (out.length) return out;

  // No usable tree: object order, which is right often enough to be useful.
  return [...objs].filter(([, b]) => /\/Type\s*\/Page\b/.test(b)).map(([n]) => n);
}

/** The inflated content of a page, following single or array /Contents. */
function pageContent(pdf, raw, objs, pageRef) {
  const body = objs.get(pageRef);
  if (!body) return null;
  const contents = /\/Contents\s*(?:\[([^\]]*)\]|(\d+) 0 R)/.exec(body);
  if (!contents) return '';
  const refs = contents[1]
    ? [...contents[1].matchAll(/(\d+) 0 R/g)].map((m) => m[1])
    : [contents[2]];
  return refs
    .map((ref) => {
      // Find where this object's stream begins in the raw file.
      const at = raw.indexOf(`\n${ref} 0 obj`);
      const head = at === -1 ? raw.indexOf(`${ref} 0 obj`) : at;
      if (head === -1) return '';
      const s0 = raw.indexOf('stream', head);
      if (s0 === -1) return '';
      let start = s0 + 'stream'.length;
      if (raw.charCodeAt(start) === 13) start += 1;
      if (raw.charCodeAt(start) === 10) start += 1;
      const end = raw.indexOf('endstream', start);
      try {
        return inflateSync(pdf.subarray(start, end)).toString('latin1');
      } catch {
        return '';
      }
    })
    .join('\n');
}

/* --------------------------------------------------------- where the ink is */

const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/**
 * The box the drawn things occupy on one page, in page points.
 *
 * The transforms have to be composed properly rather than read off raw,
 * because a `cm` operand is in whatever space its enclosing `q` established,
 * not in page space — collecting the numbers as they appear would mix several
 * coordinate systems into one meaningless box.
 *
 * Why a box and not the list of positions: a box is a fact about the document
 * and the list is a fact about the encoder. Chrome versions split a line of
 * type into different numbers of runs, which changes every position in the
 * list and none of the extent, because a split lands inside the line it splits.
 */
function inkBox(content) {
  if (!content) return null;
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let text = null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const note = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  const token = /(-?[\d.]+(?:\s+-?[\d.]+){5})\s+(cm|Tm)\b|\b(q|Q|BT|ET)\b|\/\w+\s+Do\b/g;
  for (const m of content.matchAll(token)) {
    if (m[2]) {
      const v = m[1].trim().split(/\s+/).map(Number);
      if (m[2] === 'cm') ctm = mul(v, ctm);
      else {
        text = mul(v, ctm);
        note(...apply(text, 0, 0));
      }
      continue;
    }
    if (m[3] === 'q') stack.push([...ctm]);
    else if (m[3] === 'Q') ctm = stack.pop() ?? ctm;
    else if (m[3] === 'ET') text = null;
    else if (m[0].endsWith('Do')) {
      // An XObject is drawn into the unit square, so its corners under the
      // current transform are its corners on the page.
      for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) note(...apply(ctm, x, y));
    }
  }

  if (minX === Infinity) return null;
  return [half(minX), half(minY), half(maxX), half(maxY)];
}

/**
 * Every translation in the drawing instructions, as written.
 *
 * Raw and unattributed, which is exactly why this belongs to the strict tier
 * and the ink box to the portable one: it is a faithful record of what the
 * encoder emitted, including how it chose to break the work up.
 */
function placements(text) {
  const out = [];
  for (const m of text.matchAll(
    /(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (cm|Tm)\b/g,
  )) {
    out.push(`${m[7]}:${round(m[5])},${round(m[6])}`);
  }
  for (const m of text.matchAll(/(-?[\d.]+) (-?[\d.]+) (Td|TD)\b/g)) {
    out.push(`${m[3]}:${round(m[1])},${round(m[2])}`);
  }
  return out;
}

/* ------------------------------------------------------------ fingerprints */

function fingerprint(pdf, declared) {
  const raw = pdf.toString('latin1');
  const objs = objects(raw);
  const refs = pagesInOrder(raw, objs);

  const boxes = [];
  for (const ref of refs) boxes.push(inkBox(pageContent(pdf, raw, objs, ref)));

  const mediaBoxes = [...raw.matchAll(/\/MediaBox\s*\[\s*([\d.\s-]+?)\]/g)].map((m) => {
    const [, , w, h] = m[1].trim().split(/\s+/).map(Number);
    return `${round(w / 72, 4)}x${round(h / 72, 4)}in`;
  });

  // The subset prefix is six arbitrary letters; the family is what matters.
  const embedded = [...new Set(
    [...raw.matchAll(/\/BaseFont\s*\/(?:[A-Z]{6}\+)?([A-Za-z0-9\-,#]+)/g)].map((m) => m[1]),
  )].sort();

  // A font belongs to a declared family when its PostScript name starts with
  // that family's name with the spaces taken out, which is how Google names them.
  const squashed = declared.map((f) => f.replace(/\s+/g, '').toLowerCase());
  const mine = (name) => squashed.some((f) => name.replace(/\s+/g, '').toLowerCase().startsWith(f));

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
    // Facts about the document. True on any machine, so compared on all of them.
    portable: {
      pages: refs.length,
      mediaBoxes: [...new Set(mediaBoxes)].sort(),
      appFonts: embedded.filter(mine),
      images,
      inkBoxes: boxes,
    },
    // Facts about the encoder as much as the document. Only meaningful against
    // the same engine, so only compared against it.
    strict: {
      glyphRuns: drawing.reduce((n, s) => n + (s.match(/ (Tj|TJ)\b/g) || []).length, 0),
      xobjectDraws: drawing.reduce((n, s) => n + (s.match(/ Do\b/g) || []).length, 0),
      embeddedFontPrograms: (raw.match(/\/FontFile\d?\b/g) || []).length,
      placements: where.length,
      placementDigest: createHash('sha256').update(where.join('|')).digest('hex').slice(0, 16),
    },
    // Not compared: asserted. A print PDF must carry what the book asked for
    // and nothing else.
    foreignFonts: embedded.filter((f) => !mine(f)),
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
    // Which engine drew it. Two Chrome builds neither subset fonts nor split
    // lines of type into runs the same way, so half the fingerprint is only
    // comparable against the engine that recorded it.
    engine: {
      engine: res.headers.get('x-versecraft-engine') || 'unknown',
      via: res.headers.get('x-versecraft-renderer') || 'unknown',
      platform: process.platform,
    },
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

function compare(name, tier, got, want) {
  const problems = [];
  for (const key of Object.keys(want)) {
    const a = JSON.stringify(got[key]);
    const b = JSON.stringify(want[key]);
    if (a !== b) problems.push(`    ${key}\n      was: ${b}\n      now: ${a}`);
  }
  if (!problems.length) return true;
  console.log(`\n✗ ${name} — ${tier} tier changed:\n${problems.join('\n')}`);
  return false;
}

const sameEngine = (a, b) =>
  Boolean(a && b) && a.engine === b.engine && a.via === b.via && a.platform === b.platform;

let server = null;
let failures = 0;
try {
  server = await ensureServer();

  for (const kase of CASES) {
    const fixture = JSON.parse(readFileSync(join(DIR, `${kase.name}.fixture.json`), 'utf8'));
    const { pdf, failed, reported, engine } = await renderPdf(kase.route, kase.body(fixture));
    // What the book itself asks for, which decides what may legitimately be
    // embedded in its PDF.
    const declared = [...new Set(projectSpecs(migrateProject(fixture.project)).map((f) => f.family))];
    const got = { ...fingerprint(pdf, declared), reported, recordedWith: engine };

    // Fonts are fetched from Google over the network at render time. When that
    // fails the book prints in a substituted face, which moves every measurement
    // in the fingerprint at once — so it has to be its own kind of wrong,
    // loudly, and must never be allowed to read as a regression in the code
    // under test. Checked on the outcome rather than on the route's report of
    // it, because only one of the two routes reports it.
    const substituted = got.strict.glyphRuns > 0 && got.strict.embeddedFontPrograms === 0;
    if (failed || substituted) {
      throw new Error(
        `fonts did not make it into the ${kase.name} PDF` +
          (failed ? ` (${failed})` : ' — no embedded font programs at all') +
          `. That is a network problem, not a regression, so nothing was checked.`,
      );
    }

    // A print PDF must carry the faces the book asked for and nothing else.
    // Anything else got there by falling back to whatever the machine happened
    // to have, which means the file is machine-dependent — and on a different
    // machine it would have been a different face.
    if (got.foreignFonts.length) {
      console.log(
        `\n✗ ${kase.name}: embeds ${got.foreignFonts.length} font(s) the book never asked for:\n` +
          `    ${got.foreignFonts.join(', ')}\n` +
          `    declared: ${declared.join(', ')}\n` +
          `    A face that arrived by fallback is whatever this machine had, so ` +
          `the PDF is not the same everywhere.`,
      );
      failures += 1;
    }

    const path = join(DIR, `${kase.name}.golden.json`);

    if (UPDATE || !existsSync(path)) {
      writeFileSync(path, JSON.stringify(got, null, 2) + '\n');
      console.log(
        `· ${kase.name}: recorded — ${got.portable.pages} pages, ${pdf.length} bytes, ` +
          `strict tier tied to ${engine.engine} on ${engine.platform}`,
      );
      continue;
    }

    const want = JSON.parse(readFileSync(path, 'utf8'));
    if (!want.portable) {
      throw new Error(
        `${kase.name}.golden.json was recorded before the fingerprint was split ` +
          `into tiers. Re-record it with \`npm run golden:update\` and say why.`,
      );
    }
    let ok = compare(kase.name, 'portable', got.portable, want.portable);

    if (sameEngine(engine, want.recordedWith)) {
      ok = compare(kase.name, 'strict', got.strict, want.strict) && ok;
    }

    if (ok) {
      const p = got.portable;
      console.log(
        `✓ ${kase.name}: ${p.pages} pages, ${p.mediaBoxes.join(' ')}, ` +
          `${p.appFonts.length} declared font(s), ${p.images.length} image(s), ` +
          `ink boxes match`,
      );
      if (sameEngine(engine, want.recordedWith)) {
        console.log(`    strict tier: ok — digest ${got.strict.placementDigest}`);
      } else {
        console.log(
          `    strict tier: skipped — recorded on ${want.recordedWith?.engine ?? '?'} ` +
            `(${want.recordedWith?.platform ?? '?'}), running ${engine.engine} (${engine.platform}). ` +
            `Glyph runs, font programs and exact positions depend on the engine, not the book.`,
        );
      }
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
