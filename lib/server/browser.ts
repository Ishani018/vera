import 'server-only';
import { existsSync } from 'node:fs';
import type { Browser } from 'puppeteer-core';
import { acquireRenderSlot } from './renderQueue';

/**
 * Finds a Chromium to print with.
 *
 * Order matters. A real Chrome on the machine is preferred because it is the
 * same engine the preview runs in. @sparticuz/chromium is the serverless
 * fallback — it is what makes the export work on Vercel, where no browser is
 * installed. If neither is available the caller is expected to fall back to
 * printing from the user's own browser, which produces the same PDF because it
 * is the same Paged.js output.
 */

export class BrowserUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserUnavailableError';
  }
}

const LOCAL_PATHS = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((p): p is string => Boolean(p));

const BASE_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--font-render-hinting=none',
];

export type LaunchedBrowser = {
  browser: Browser;
  /** Which binary was chosen. */
  via: string;
  /** Which engine it turned out to be, e.g. "Chrome/141.0.7390.37".
   *  Two Chrome builds do not lay out or subset identically, so a PDF is only
   *  comparable with another from the same engine. */
  engine: string;
};

/**
 * Every launch takes a slot from the render queue, and gives it back when the
 * browser goes away.
 *
 * Here rather than in the export routes because this is the one line every
 * render already goes through, and because the routes are not to be touched.
 * Tied to `disconnected` rather than to the caller's `close()` so that a
 * browser that crashes returns its slot too — a leaked slot is a machine that
 * renders one fewer thing for the rest of its life.
 */
async function withSlot(make: () => Promise<LaunchedBrowser>): Promise<LaunchedBrowser> {
  const release = await acquireRenderSlot();
  try {
    const launched = await make();
    launched.browser.on('disconnected', release);
    return launched;
  } catch (error) {
    release();
    throw error;
  }
}

export async function launchBrowser(): Promise<LaunchedBrowser> {
  const puppeteer = (await import('puppeteer-core')).default;

  for (const executablePath of LOCAL_PATHS) {
    if (!existsSync(executablePath)) continue;
    return withSlot(async () => {
      const browser = await puppeteer.launch({ executablePath, args: BASE_ARGS });
      return { browser, via: executablePath, engine: await browser.version() };
    });
  }

  try {
    const chromium = (await import('@sparticuz/chromium')).default;
    // Printing needs no WebGL, and skipping the graphics stack keeps the cold
    // start and the unpacked size down.
    chromium.setGraphicsMode = false;
    const executablePath = await chromium.executablePath();
    if (executablePath) {
      return await withSlot(async () => {
        const browser = await puppeteer.launch({
          executablePath,
          args: [...chromium.args, ...BASE_ARGS],
        });
        return { browser, via: '@sparticuz/chromium', engine: await browser.version() };
      });
    }
  } catch (error) {
    // A queue refusal is an answer, not a missing browser: it must not fall
    // through to "install a Chromium", which is neither true nor actionable.
    if (error instanceof Error && error.name === 'RenderBusyError') throw error;
    /* not installed, or not runnable here — fall through to the error below */
  }

  throw new BrowserUnavailableError(
    'No Chromium available to render the PDF on the server. Use "Print to PDF" in ' +
      'the export panel instead — it prints the same Paged.js output from your own ' +
      'browser. To enable server-side export, install @sparticuz/chromium or set ' +
      'CHROME_PATH to a Chrome or Chromium binary.',
  );
}
