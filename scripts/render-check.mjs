/**
 * Renders the seeded book through Paged.js in real Chromium and reports what
 * came back: page count, printed folios, which pages Paged.js tagged, and where
 * the "(continued)" markers landed. Writes a PDF and a few page PNGs so the
 * result can be looked at, not just counted.
 *
 *   npm run check:render
 *
 * Set CHROME_PATH to point at a Chromium build if the default is not present.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

import { createProject } from '../lib/defaults.ts';
import { buildBookHtml } from '../lib/render/bookHtml.ts';
import { RUNTIME_SCRIPT } from '../lib/render/runtime.ts';
import { buildSamplePoems } from '../lib/samples.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, '.render-check');
const CHROME =
  process.env.CHROME_PATH ||
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  '/opt/pw-browsers/chromium';

const project = createProject({
  name: 'Render Check',
  meta: {
    title: 'Render Check',
    subtitle: 'a layout probe',
    author: 'Versecraft',
    publisher: '',
    isbn: '978-0-000000-0-0',
    year: String(new Date().getFullYear()),
    copyrightExtra: '',
  },
});
project.poems = buildSamplePoems();
project.toc.firstLineIndex = true;
project.layout.verticalCenterShortPoems = true;
project.border.enabled = true;

const html = buildBookHtml(project, {
  mode: 'export',
  fontStyle: '',
  pagedJsSrc: '',
  guides: { margins: false, bleed: false, safe: false, gutter: false },
  padPages: 0,
});

await mkdir(OUT, { recursive: true });
await writeFile(resolve(OUT, 'book.html'), html);

const paged = await readFile(resolve(ROOT, 'node_modules/pagedjs/dist/paged.polyfill.js'), 'utf8');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('[page error]', e.message));

await page.setContent(html, { waitUntil: 'domcontentloaded' });
await page.addScriptTag({ content: paged });
await page.addScriptTag({ content: RUNTIME_SCRIPT });
await page.waitForFunction('document.documentElement.dataset.vcReady', { timeout: 90000 });

const report = await page.evaluate(() => {
  const pages = [...document.querySelectorAll('.pagedjs_page')];
  return {
    error: window.__VC_ERROR__ || null,
    pageCount: pages.length,
    folios: (window.__VC_PAGES__ || []).map((p) => (p.blank ? '·' : p.label)).join(' '),
    tagged: pages
      .map((p, i) => {
        const tags = [...p.classList].filter((c) => c.startsWith('vc-'));
        return tags.length ? `${i}:${tags.join('+')}` : null;
      })
      .filter(Boolean),
    continued: [...document.querySelectorAll('.vc-continued')].map((e) => e.textContent),
    tocNumbers: [...document.querySelectorAll('.toc-entry')].map(
      (a) => `${a.textContent.trim().slice(0, 28)} → ${a.style.getPropertyValue('--vc-target')}`,
    ),
  };
});

console.log(`pages      ${report.pageCount}`);
console.log(`folios     ${report.folios}`);
console.log(`continued  ${report.continued.join(' | ') || '(none)'}`);
console.log('tagged     ' + report.tagged.join('\n           '));
console.log('toc        ' + report.tocNumbers.join('\n           '));
if (report.error) console.error('ERROR', report.error);

await page.pdf({
  path: resolve(OUT, 'book.pdf'),
  printBackground: true,
  preferCSSPageSize: true,
});

const els = await page.$$('.pagedjs_page');
for (const i of [0, 6, 7, 8, 9]) {
  if (els[i]) await els[i].screenshot({ path: resolve(OUT, `page-${i}.png`) });
}

await browser.close();
console.log(`\nwrote ${OUT}/book.pdf and page PNGs`);
process.exit(report.error ? 1 : 0);
