/**
 * The top bar fits, and the button that makes things is on the screen.
 *
 *   npm run check:topbar
 *
 * Needs a server on :3000 (`npm run build && npm start`). It reports which
 * build it found rather than refusing a development one: this measures a
 * layout invariant, not pixels, and both builds lay the bar out the same way.
 *
 * **Why this exists.** The bar is `StudioHeader`: a wordmark, a search box that
 * grows, and whatever the screen adds — on the home screen, the Create button,
 * pushed right with `ml-auto`. The header is `overflow-x-auto`, deliberately,
 * so that a bar too wide for the window scrolls instead of making the whole
 * page scroll sideways and dragging the work out from under the cursor.
 *
 * That choice has a sharp edge. If the bar ever does exceed its width, the item
 * that leaves the screen is the *last* one — which on the home screen is the
 * primary action. It would be clipped at the right edge of the window, present
 * in the DOM, measurable, and unreachable without scrolling a bar nobody
 * expects to scroll. Nothing in this repo noticed that:
 *
 * - the layout audit skips any element whose parent scrolls on purpose, which
 *   is exactly what this header does, so a clipped Create button was exempt;
 * - every browser check blocks Google Fonts, for determinism, so the wordmark
 *   has always been measured in a fallback face rather than the real one.
 *
 * So this one allows fonts and asks three questions the others do not, at three
 * widths: does the bar fit without scrolling, is the trailing action wholly
 * inside the window, and is it the thing you actually hit when you click it.
 *
 * It duplicates the server probe and browser lookup from `screen-golden.mjs`
 * rather than sharing them. That script is load-bearing — its goldens must not
 * move — and forty lines copied is a smaller risk than refactoring it.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.CHECK_BASE_URL || 'http://127.0.0.1:3000';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

/** The widths asked for: a laptop, a narrow window, and a wide one. */
const WIDTHS = [1280, 800, 1440];

function findBrowser() {
  const candidates = [
    process.env.GOLDEN_BROWSER,
    '/opt/pw-browsers/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error(`No browser found. Set GOLDEN_BROWSER. Looked in: ${candidates.join(', ')}`);
  return found;
}

async function mode() {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(20000) });
    const body = await res.json().catch(() => null);
    return typeof body?.mode === 'string' ? body.mode : 'unknown';
  } catch {
    return null;
  }
}

const found = await mode();
if (found === null) {
  console.error(`Nothing is answering at ${BASE}. Start one:\n\n    npm run build && npm start\n`);
  process.exit(1);
}
console.log(`driving ${BASE} (${found} build)`);

const browser = await puppeteer.launch({
  executablePath: findBrowser(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
/* Fonts allowed, unlike every other check here. That is the point. */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
const say = (line) => console.log('  ' + line);

for (const width of WIDTHS) {
  await page.setViewport({ width, height: 720 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await wait(1200);

  const seen = await page.evaluate(() => {
    const header = document.querySelector('header');
    if (!header) return { error: 'no header on the home screen' };
    const create = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Create');
    if (!create) return { error: 'no Create button on the home screen' };
    const box = create.getBoundingClientRect();
    const bar = header.getBoundingClientRect();
    const midX = Math.round(box.left + box.width / 2);
    const midY = Math.round(box.top + box.height / 2);
    const inWindow = midX >= 0 && midX <= window.innerWidth - 1;
    return {
      wordmark: Math.round((header.querySelector('a')?.getBoundingClientRect().width ?? 0)),
      wordmarkFont: document.fonts.check("34px 'Wordmark Display'"),
      barNeeds: header.scrollWidth,
      barHas: header.clientWidth,
      createLeft: Math.round(box.left),
      createRight: Math.round(box.right),
      pastWindow: Math.round(box.right - window.innerWidth),
      pastBar: Math.round(box.right - bar.right),
      // Hit-tested, not just measured: a button inside the window but under
      // something else is just as unreachable as one off the edge.
      hit: inWindow
        ? (document.elementFromPoint(midX, midY)?.closest('button')?.innerText ?? '').trim()
        : '(centre is off the window)',
    };
  });

  if (seen.error) {
    problems.push(`${width}: ${seen.error}`);
    continue;
  }

  say(
    `${width}: wordmark ${seen.wordmark}px (wordmark font ${seen.wordmarkFont ? 'loaded' : 'NOT loaded'}), ` +
      `bar needs ${seen.barNeeds} in ${seen.barHas}, Create ends at ${seen.createRight}`,
  );

  if (seen.barNeeds > seen.barHas + 1) {
    problems.push(`${width}: the top bar needs ${seen.barNeeds}px in ${seen.barHas}px, so it scrolls sideways`);
  }
  if (seen.pastWindow > 0) {
    problems.push(`${width}: the Create button ends ${seen.pastWindow}px past the right edge of the window`);
  }
  if (seen.pastBar > 0) {
    problems.push(`${width}: the Create button ends ${seen.pastBar}px past the right edge of the bar`);
  }
  if (seen.hit !== 'Create') {
    problems.push(`${width}: clicking the middle of the Create button would hit "${seen.hit}"`);
  }
}

await browser.close();

if (problems.length) {
  console.error('\nthe top bar does not fit:');
  for (const one of problems) console.error('  ' + one);
  process.exit(1);
}
console.log(`\nthe top bar fits at ${WIDTHS.join(', ')}, and Create is on the screen and clickable at each`);
