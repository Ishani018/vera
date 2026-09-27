/**
 * Renders the same poems at several trim sizes and body sizes so a trim can be
 * chosen by looking rather than by guessing.
 *
 * Trim is the one decision that is expensive to change late: it reflows every
 * page, which renumbers the contents and moves every page break in the book.
 * The thing worth looking at is how often a line is too long for the measure
 * and has to wrap onto a turnover, because that is what a narrow trim does to
 * long-lined verse.
 *
 *   node --experimental-strip-types --import ./tests/ts-resolver.mjs \
 *     scripts/trim-compare.mjs --docx "/path/to/poems" [--poems 3] [--out .trim-compare]
 *
 * Also accepts --json <versecraft-project.json> instead of --docx.
 * Outputs one PDF per variant, a PNG of each variant's first page, and a
 * side-by-side contact sheet.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

import { createProject } from '../lib/defaults.ts';
import { projectFontsHrefs } from '../lib/fonts.ts';
import { DEFAULT_IMPORT_OPTIONS, docxHtmlToVerse, poemsFromFile } from '../lib/import.ts';
import { getTrim } from '../lib/kdp.ts';
import { buildBookHtml } from '../lib/render/bookHtml.ts';
import { pageGeometry } from '../lib/render/css.ts';
import { RUNTIME_SCRIPT } from '../lib/render/runtime.ts';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
}

const OUT = path.resolve(args.get('out') ?? '.trim-compare');
const WANTED = Number(args.get('poems') ?? 3);
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';

/** The four candidates: two poetry trims, two body sizes. */
const VARIANTS = [
  { id: '5.5x8.5-11.5pt', trimId: '5.5x8.5', sizePt: 11.5 },
  { id: '5.5x8.5-10.5pt', trimId: '5.5x8.5', sizePt: 10.5 },
  { id: '6x9-11.5pt', trimId: '6x9', sizePt: 11.5 },
  { id: '6x9-10.5pt', trimId: '6x9', sizePt: 10.5 },
];

const LEGACY_UA =
  'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8) AppleWebKit/533 (KHTML, like Gecko) Version/4 Safari/533';

/** Same static-TTF trick the export route uses; see SPECS.md on font embedding. */
async function inlineFonts(project) {
  const hrefs = projectFontsHrefs(project);
  try {
    const sheets = await Promise.all(
      hrefs.map((href) => fetch(href, { headers: { 'User-Agent': LEGACY_UA } }).then((r) => r.text())),
    );
    let css = sheets.join('\n');
    const urls = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((m) => m[1]))];
    await Promise.all(
      urls.map(async (url) => {
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        const mime = url.endsWith('.woff2') ? 'font/woff2' : url.endsWith('.woff') ? 'font/woff' : 'font/ttf';
        css = css.split(url).join(`data:${mime};base64,${buf.toString('base64')}`);
      }),
    );
    return { style: `<style>${css}</style>`, ok: true };
  } catch {
    return { style: '', ok: false };
  }
}

async function loadPoems() {
  if (args.get('json')) {
    const project = JSON.parse(await readFile(path.resolve(args.get('json')), 'utf8'));
    return (project.contents ?? project.poems ?? []).filter((i) => i.kind !== 'section');
  }
  const dir = path.resolve(args.get('docx') ?? '.');
  const mammoth = (await import('mammoth')).default;
  const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.docx')).sort();
  const poems = [];
  for (const file of files) {
    const { value: html } = await mammoth.convertToHtml(
      { buffer: await readFile(path.join(dir, file)) },
      { ignoreEmptyParagraphs: false },
    );
    const text = docxHtmlToVerse(html);
    for (const parsed of poemsFromFile({ name: file, text }, DEFAULT_IMPORT_OPTIONS)) {
      poems.push({
        kind: 'poem',
        id: `p${poems.length}`,
        title: parsed.title,
        body: parsed.body,
        epigraph: '',
        dedication: '',
      });
    }
  }
  return poems;
}

/** Ranks by how much of a poem is long-lined, which is what a trim decides. */
function longestLined(poems, n) {
  return [...poems]
    .map((poem) => {
      const lines = poem.body.split('\n').filter((l) => l.trim());
      const long = lines.filter((l) => l.length > 60).length;
      const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
      return { poem, score: long * 1000 + longest, long, longest, lines: lines.length };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

async function main() {
  if (!existsSync(CHROME)) throw new Error(`No Chromium at ${CHROME}; set CHROME_PATH.`);
  await mkdir(OUT, { recursive: true });

  const all = await loadPoems();
  if (!all.length) throw new Error('No poems found. Pass --docx <dir> or --json <project.json>.');
  const picked = longestLined(all, WANTED);

  console.log(`${all.length} poems available; comparing the ${picked.length} longest-lined:`);
  for (const p of picked) {
    console.log(`  ${p.poem.title.slice(0, 40).padEnd(42)} ${p.lines} lines, ${p.long} over 60 chars, longest ${p.longest}`);
  }
  console.log('');

  const pagedJs = await readFile('node_modules/pagedjs/dist/paged.polyfill.js', 'utf8');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const rows = [];
  const shots = [];

  for (const variant of VARIANTS) {
    const project = createProject({
      name: 'Trim comparison',
      meta: {
        title: 'Trim comparison',
        subtitle: '',
        author: '',
        publisher: '',
        isbn: '',
        year: '',
        copyrightExtra: '',
      },
    });
    project.contents = picked.map((p) => p.poem);
    project.trim.trimId = variant.trimId;
    project.typography.body.sizePt = variant.sizePt;
    // Keep the title proportional so the comparison is about the measure.
    project.typography.poemTitle.sizePt = variant.sizePt + 1.5;
    // Front matter and contents would only get in the way here.
    project.frontMatter = project.frontMatter.map((p) => ({ ...p, enabled: false }));
    project.backMatter = [];
    project.toc.enabled = false;

    const fonts = await inlineFonts(project);
    const html = buildBookHtml(project, {
      mode: 'export',
      fontStyle: fonts.style,
      pagedJsSrc: '',
      guides: { margins: false, bleed: false, safe: false, gutter: false },
      padPages: 0,
    });

    const geo = pageGeometry(project);
    const measureIn = geo.pageWidth - geo.contentInside - geo.contentOutside;

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    /**
     * Measured before Paged.js runs, deliberately. Once the book is paginated a
     * line that straddles a page break exists as two fragments, so counting
     * .poem-line afterwards counts some lines twice. Unpaginated, each line is
     * one element, and constraining the body to the text-block width gives it
     * exactly the measure it will have in the book.
     *
     * A line has wrapped when its rendered height exceeds one line box — and
     * every wrap is a turnover indent on the printed page.
     */
    const measured = await page.evaluate((widthIn) => {
      document.body.style.width = `${widthIn}in`;
      document.body.offsetHeight; // force layout at the new width
      const lines = [...document.querySelectorAll('.poem-line')];
      let wrapped = 0;
      let worst = 0;
      for (const line of lines) {
        const lh = parseFloat(getComputedStyle(line).lineHeight);
        const rows = Math.round(line.getBoundingClientRect().height / lh);
        if (rows > 1) wrapped += 1;
        worst = Math.max(worst, rows);
      }
      document.body.style.width = '';
      return { lines: lines.length, wrapped, worst };
    }, measureIn);

    await page.addScriptTag({ content: pagedJs });
    await page.addScriptTag({ content: RUNTIME_SCRIPT });
    await page.waitForFunction('document.documentElement.dataset.vcReady', { timeout: 120_000 });
    const pages = await page.evaluate(() => document.querySelectorAll('.pagedjs_page').length);

    const trim = getTrim(variant.trimId);
    rows.push({
      ...variant,
      ...measured,
      pages,
      measureIn,
      pct: measured.lines ? Math.round((measured.wrapped / measured.lines) * 100) : 0,
      trim: trim.label,
    });

    await page.pdf({
      path: path.join(OUT, `${variant.id}.pdf`),
      printBackground: true,
      preferCSSPageSize: true,
    });

    const first = (await page.$$('.pagedjs_page'))[0];
    const shot = path.join(OUT, `${variant.id}.png`);
    if (first) await first.screenshot({ path: shot });
    shots.push({ id: variant.id, file: `${variant.id}.png` });

    await page.close();
  }

  // A contact sheet: the same poem, four ways, side by side.
  const sheet = `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; background: #6f6f6f; font: 13px ui-sans-serif, system-ui, sans-serif; color: #fff; }
  .grid { display: flex; gap: 18px; padding: 20px; align-items: flex-start; }
  figure { margin: 0; flex: 1; }
  figcaption { padding: 6px 2px 10px; font-weight: 600; }
  img { width: 100%; display: block; box-shadow: 0 8px 26px rgba(0,0,0,.45); background: #fff; }
  .stat { font-weight: 400; opacity: .85; }
</style>
<div class="grid">
${shots
  .map((s) => {
    const row = rows.find((r) => r.id === s.id);
    return `<figure><figcaption>${s.id.replace('-', ' at ')}<br><span class="stat">${row.wrapped}/${row.lines} lines wrap (${row.pct}%) · ${row.pages} pp · measure ${row.measureIn.toFixed(2)}"</span></figcaption><img src="${s.file}"></figure>`;
  })
  .join('\n')}
</div>`;
  await writeFile(path.join(OUT, 'compare.html'), sheet);

  const sheetPage = await browser.newPage();
  await sheetPage.setViewport({ width: 2000, height: 1400, deviceScaleFactor: 1.5 });
  await sheetPage.goto(`file://${path.join(OUT, 'compare.html')}`, { waitUntil: 'networkidle0' });
  const grid = await sheetPage.$('.grid');
  await grid.screenshot({ path: path.join(OUT, 'compare.png') });
  await sheetPage.close();

  await browser.close();

  console.log(
    'variant'.padEnd(18) + 'measure'.padStart(9) + 'lines'.padStart(7) +
    'wrapped'.padStart(9) + 'wrap %'.padStart(8) + 'pages'.padStart(7) + 'worst'.padStart(8),
  );
  console.log('-'.repeat(66));
  for (const r of rows) {
    console.log(
      r.id.padEnd(18) +
        `${r.measureIn.toFixed(2)}"`.padStart(9) +
        String(r.lines).padStart(7) +
        String(r.wrapped).padStart(9) +
        `${r.pct}%`.padStart(8) +
        String(r.pages).padStart(7) +
        String(r.worst).padStart(8),
    );
  }
  console.log(`\nwrote ${OUT}/compare.png, compare.html, and four PDFs`);
}

await main();
