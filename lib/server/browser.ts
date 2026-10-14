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
  '/usr/bin/google-chrome-unstable',
  '/usr/bin/brave-browser',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Arc.app/Contents/MacOS/Arc',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
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

export async function launchBrowser(): Promise<LaunchedBrowser> {
  const puppeteer = (await import('puppeteer-core')).default;

  for (const executablePath of LOCAL_PATHS) {
    if (!existsSync(executablePath)) continue;
    try {
      const browser = await puppeteer.launch({ executablePath, args: BASE_ARGS });
      return { browser, via: executablePath, engine: await browser.version() };
    } catch (err) {
      console.warn(`[PDF Export] Could not launch local browser at ${executablePath}:`, err);
    }
  }

  try {
    const path = (await import('node:path')).default;
    const chromium = (await import('@sparticuz/chromium')).default;
    // Printing needs no WebGL, and skipping the graphics stack keeps the cold
    // start and the unpacked size down.
    chromium.setGraphicsMode = false;

    // Check potential locations for the brotli bin folder in serverless environments
    const binCandidates = [
      process.env.SPARTICUZ_BIN_PATH,
      path.join(process.cwd(), 'node_modules/@sparticuz/chromium/bin'),
      path.join(process.cwd(), '.next/server/node_modules/@sparticuz/chromium/bin'),
      path.join(process.cwd(), '.next/standalone/node_modules/@sparticuz/chromium/bin'),
      '/var/task/node_modules/@sparticuz/chromium/bin',
    ].filter((p): p is string => Boolean(p && existsSync(p)));

    let executablePath: string | undefined;
    if (binCandidates.length > 0) {
      executablePath = await chromium.executablePath(binCandidates[0]);
    } else {
      executablePath = await chromium.executablePath();
    }

    if (executablePath) {
      const browser = await puppeteer.launch({
        executablePath,
        args: [...chromium.args, ...BASE_ARGS],
        headless: 'shell',
      });
      return { browser, via: '@sparticuz/chromium', engine: await browser.version() };
    }
  } catch (err) {
    console.error('[PDF Export] Failed to launch @sparticuz/chromium:', err);
  }

  throw new BrowserUnavailableError(
    'No Chromium available to render the PDF on the server. Use "Print to PDF" in ' +
      'the export panel instead — it prints the same Paged.js output from your own ' +
      'browser. To enable server-side export, install @sparticuz/chromium or set ' +
      'CHROME_PATH to a Chrome or Chromium binary.',
  );
}
