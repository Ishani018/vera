import 'server-only';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { Page } from 'puppeteer-core';

import { padToEven } from '../kdp';
import { projectFamilies } from '../fonts';
import { buildBookHtml } from '../render/bookHtml';
import { buildCoverHtml } from '../render/coverHtml';
import { RUNTIME_SCRIPT } from '../render/runtime';
import type { Project } from '../types';
import { launchBrowser } from './browser';
import { embedGoogleFonts } from './fontEmbed';

const require = createRequire(import.meta.url);

let pagedJsSource: string | null = null;

/** The Paged.js polyfill, read from node_modules and injected as a script. */
async function loadPagedJs(): Promise<string> {
  if (pagedJsSource) return pagedJsSource;
  const path = require.resolve('pagedjs/dist/paged.polyfill.js');
  pagedJsSource = await readFile(path, 'utf8');
  return pagedJsSource;
}

async function paginate(page: Page, html: string, pagedJs: string): Promise<number> {
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: pagedJs });
  await page.addScriptTag({ content: RUNTIME_SCRIPT });
  await page.waitForFunction('document.documentElement.dataset.vcReady', { timeout: 120_000 });
  const error = await page.evaluate(() => window.__VC_ERROR__ || null);
  if (error) throw new Error(`Paged.js failed: ${error}`);
  return (await page.evaluate(() => window.__VC_PAGE_COUNT__ || 0)) as number;
}

export type InteriorResult = {
  pdf: Uint8Array;
  pageCount: number;
  paddedPages: number;
  fontsEmbedded: string[];
  fontsFailed: string[];
  via: string;
};

/**
 * Lays the book out once to learn its length, then — only if that length is
 * odd — lays it out again with one blank page appended. KDP requires an even
 * page count, and the count is not knowable before pagination, so the second
 * pass is unavoidable rather than wasteful.
 */
export async function renderInteriorPdf(project: Project): Promise<InteriorResult> {
  const families = projectFamilies(project);
  const fonts = await embedGoogleFonts(families);
  const pagedJs = await loadPagedJs();
  const { browser, via } = await launchBrowser();

  try {
    const page = await browser.newPage();
    const render = (padPages: number) =>
      buildBookHtml(project, {
        mode: 'export',
        fontStyle: fonts.style,
        pagedJsSrc: '',
        guides: { margins: false, bleed: false, safe: false, gutter: false },
        padPages,
      });

    let pageCount = await paginate(page, render(0), pagedJs);
    let paddedPages = 0;

    if (pageCount % 2 !== 0) {
      paddedPages = padToEven(pageCount) - pageCount;
      pageCount = await paginate(page, render(paddedPages), pagedJs);
    }

    const pdf = await page.pdf({
      printBackground: true,
      // Honour the @page size from the stylesheet rather than a paper preset:
      // the trim size is the page size, and no crop marks are wanted.
      preferCSSPageSize: true,
    });

    return {
      pdf,
      pageCount,
      paddedPages,
      fontsEmbedded: fonts.embedded,
      fontsFailed: fonts.failed,
      via,
    };
  } finally {
    await browser.close();
  }
}

export type CoverResult = {
  pdf: Uint8Array;
  widthIn: number;
  heightIn: number;
  spineIn: number;
  via: string;
};

export async function renderCoverPdf(project: Project, pageCount: number): Promise<CoverResult> {
  const { coverLayout } = await import('../render/coverLayout');
  const evenPages = padToEven(pageCount);
  const layout = coverLayout(project, evenPages);

  const families = [...new Set(project.cover.textBoxes.map((b) => b.font.family))];
  const fonts = await embedGoogleFonts(families);
  const { browser, via } = await launchBrowser();

  try {
    const page = await browser.newPage();
    const html = buildCoverHtml(project, {
      pageCount: evenPages,
      fontStyle: fonts.style,
      guides: false,
    });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');

    const pdf = await page.pdf({
      printBackground: true,
      width: `${layout.dimensions.width}in`,
      height: `${layout.dimensions.height}in`,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      pageRanges: '1',
    });

    return {
      pdf,
      widthIn: layout.dimensions.width,
      heightIn: layout.dimensions.height,
      spineIn: layout.dimensions.spine,
      via,
    };
  } finally {
    await browser.close();
  }
}
