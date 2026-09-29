import 'server-only';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from 'puppeteer-core';

import { padToEven } from '../kdp';
import { buildBookHtml } from '../render/bookHtml';
import { buildColoringHtml } from '../render/coloringHtml';
import { buildCoverHtml } from '../render/coverHtml';
import { RUNTIME_SCRIPT } from '../render/runtime';
import type { AnyProject, CoverSpec, CoverableBook, FontSpec, FontedBook } from '../types';
import { launchBrowser } from './browser';
import { embedGoogleFonts } from './fontEmbed';

let pagedJsSource: string | null = null;

/**
 * The Paged.js polyfill, read off disk and injected as a script tag.
 *
 * It cannot be imported: pagedjs's `exports` map does not expose the dist file,
 * and bundling a 900KB polyfill into the route would be wasteful when the same
 * file is already served to the preview from /vendor. next.config.mjs traces
 * both locations into the deployed function.
 */
const PAGEDJS_CANDIDATES = [
  'node_modules/pagedjs/dist/paged.polyfill.js',
  'public/vendor/paged.polyfill.js',
];

async function loadPagedJs(): Promise<string> {
  if (pagedJsSource) return pagedJsSource;
  for (const candidate of PAGEDJS_CANDIDATES) {
    const path = join(process.cwd(), candidate);
    if (existsSync(path)) {
      pagedJsSource = await readFile(path, 'utf8');
      return pagedJsSource;
    }
  }
  throw new Error(
    'Could not find the Paged.js polyfill on disk. Run `npm install`, or use ' +
      '"Print to PDF" in the export panel to print from the browser instead.',
  );
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
  engine: string;
};

/**
 * Lays the book out once to learn its length, then — only if that length is
 * odd — lays it out again with one blank page appended. KDP requires an even
 * page count, and the count is not knowable before pagination, so the second
 * pass is unavoidable rather than wasteful.
 */
export async function renderInteriorPdf(
  project: AnyProject,
  assets: Record<string, string> = {},
): Promise<InteriorResult> {
  const fonts = await embedGoogleFonts(project);
  const pagedJs = await loadPagedJs();
  const { browser, via, engine } = await launchBrowser();

  try {
    const page = await browser.newPage();
    // The two kinds of book have different renderers and the same everything
    // else: the same Paged.js, the same two-pass parity check, the same
    // embedded fonts, the same printed PDF.
    const render = (padPages: number) => {
      const options = {
        mode: 'export' as const,
        fontStyle: fonts.style,
        pagedJsSrc: '',
        guides: { margins: false, bleed: false, safe: false, gutter: false },
        padPages,
        assets,
      };
      return project.kind === 'coloring'
        ? buildColoringHtml(project, options)
        : buildBookHtml(project, options);
    };

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
      engine,
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
  engine: string;
};

export async function renderCoverPdf(
  project: CoverableBook & FontedBook,
  pageCount: number,
  assets: Record<string, string> = {},
): Promise<CoverResult> {
  const { coverLayout } = await import('../render/coverLayout');
  const evenPages = padToEven(pageCount);
  const layout = coverLayout(project, evenPages);

  const fonts = await embedGoogleFonts(project);
  const { browser, via, engine } = await launchBrowser();

  try {
    const page = await browser.newPage();
    const html = buildCoverHtml(project, {
      pageCount: evenPages,
      fontStyle: fonts.style,
      guides: false,
      assets,
    });
    // The cover is one page with inlined fonts and a data-URI image, so once
    // the document has loaded and the faces have settled there is nothing left
    // to wait for.
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluateHandle('document.fonts.ready');

    const pdf = await page.pdf({
      printBackground: true,
      // The @page rule in the cover stylesheet already carries the exact size.
      // Passing width/height here instead goes through a pixel conversion that
      // lands a fraction of a point off, and a cover has to be exact.
      preferCSSPageSize: true,
      pageRanges: '1',
    });

    return {
      pdf,
      widthIn: layout.dimensions.width,
      heightIn: layout.dimensions.height,
      spineIn: layout.dimensions.spine,
      via,
      engine,
    };
  } finally {
    await browser.close();
  }
}

/* ------------------------------------------------------------ a board, rendered */

export type BoardResult = {
  bytes: Uint8Array;
  /** What the file is, so the caller can name and serve it. */
  contentType: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
  via: string;
  engine: string;
  fontsFailed: string[];
};

export type BoardRequest = {
  presetId: string;
  assets?: Record<string, string>;
  cover: CoverSpec;
  typography: Record<string, FontSpec>;
  title: string;
  format: 'png' | 'jpg' | 'pdf';
  /**
   * How much of it to make, in whichever terms the board is stated in.
   *
   * A screen board is a number of pixels and this is a multiple of them: 1 is
   * Instagram's 1080 square, 2 is the same design at 2160 for a retina
   * screen. A printed board is a number of inches and this is dots per inch.
   *
   * Asking a screen board for 300 DPI is the mistake this exists to prevent —
   * it produces a 3375 pixel square, three times what the platform asked for,
   * which the platform then throws away.
   */
  scale?: number;
  dpi?: number;
};

/** A CSS pixel is a ninety-sixth of an inch, and a point a seventy-second. */
const CSS_PX_PER_PT = 96 / 72;


/**
 * Anything that is not a book: a post, a pin, a postcard, a bookmark.
 *
 * Screen boards come out as pixels and printed ones as a PDF, but both go
 * through the same page and the same browser as a cover does, so a postcard is
 * laid out by the machinery that has already been made to get a cover right.
 *
 * The raster is taken with a device scale rather than by resizing afterwards,
 * so the type is rendered at the final size instead of being drawn small and
 * enlarged. It is the difference between crisp lettering and soft lettering,
 * and it costs nothing.
 */
export async function renderBoard(request: BoardRequest): Promise<BoardResult> {
  const { boardFor, outputSize, presetById } = await import('../presets');
  const { buildBoardHtml } = await import('../render/coverHtml');

  const preset = presetById(request.presetId);
  if (!preset) throw new Error(`No such size: ${request.presetId}`);
  const board = boardFor(preset);

  const fonts = await embedGoogleFonts({
    typography: request.typography,
    cover: request.cover,
  });
  const { browser, via, engine } = await launchBrowser();

  try {
    const page = await browser.newPage();

    // Worked out next door, where it can be tested — this arithmetic is the
    // part that was wrong first time round.
    const size = outputSize(preset, { scale: request.scale, dpi: request.dpi });
    const { cssWidth, cssHeight, shotScale } = size;

    await page.setViewport({ width: cssWidth, height: cssHeight, deviceScaleFactor: 1 });

    const html = buildBoardHtml(board, request.cover, {
      title: request.title,
      fontStyle: fonts.style,
      guides: false,
      assets: request.assets,
    });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluateHandle('document.fonts.ready');

    if (request.format === 'pdf') {
      const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, pageRanges: '1' });
      return {
        bytes: pdf,
        contentType: 'application/pdf',
        widthPx: cssWidth,
        heightPx: cssHeight,
        dpi: 72,
        via,
        engine,
        fontsFailed: fonts.failed,
      };
    }

    const shot = await page.screenshot({
      type: request.format === 'jpg' ? 'jpeg' : 'png',
      quality: request.format === 'jpg' ? 92 : undefined,
      // Scaled in the capture rather than afterwards, so the type is rendered
      // at the size it ends up rather than drawn small and enlarged.
      clip: { x: 0, y: 0, width: cssWidth, height: cssHeight, scale: shotScale },
      captureBeyondViewport: true,
      omitBackground: false,
    });

    return {
      bytes: shot,
      contentType: request.format === 'jpg' ? 'image/jpeg' : 'image/png',
      widthPx: size.widthPx,
      heightPx: size.heightPx,
      dpi: size.dpi,
      via,
      engine,
      fontsFailed: fonts.failed,
    };
  } finally {
    await browser.close();
  }
}
