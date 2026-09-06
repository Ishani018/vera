import 'server-only';
import { existsSync } from 'node:fs';
import type { Browser } from 'puppeteer-core';

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

export type LaunchedBrowser = { browser: Browser; via: string };

export async function launchBrowser(): Promise<LaunchedBrowser> {
  const puppeteer = (await import('puppeteer-core')).default;

  for (const executablePath of LOCAL_PATHS) {
    if (!existsSync(executablePath)) continue;
    const browser = await puppeteer.launch({ executablePath, args: BASE_ARGS });
    return { browser, via: executablePath };
  }

  try {
    const chromium = (await import('@sparticuz/chromium')).default;
    // Printing needs no WebGL, and skipping the graphics stack keeps the cold
    // start and the unpacked size down.
    chromium.setGraphicsMode = false;
    const executablePath = await chromium.executablePath();
    if (executablePath) {
      const browser = await puppeteer.launch({
        executablePath,
        args: [...chromium.args, ...BASE_ARGS],
      });
      return { browser, via: '@sparticuz/chromium' };
    }
  } catch {
    /* not installed, or not runnable here — fall through to the error below */
  }

  throw new BrowserUnavailableError(
    'No Chromium available to render the PDF on the server. Use "Print to PDF" in ' +
      'the export panel instead — it prints the same Paged.js output from your own ' +
      'browser. To enable server-side export, install @sparticuz/chromium or set ' +
      'CHROME_PATH to a Chrome or Chromium binary.',
  );
}
