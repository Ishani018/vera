// Never let this reach a client bundle: it inlines megabytes of font data.
import 'server-only';
import { projectFontsHrefs, projectSpecs } from '../fonts';
import type { FontedBook } from '../types';

/**
 * Fetches the Google Fonts stylesheet for a project and inlines every font file
 * it references as a data URI.
 *
 * Inlining rather than linking, because headless Chromium in a serverless
 * sandbox often cannot reach fonts.gstatic.com, and a book that silently prints
 * in a substituted face is worse than one that fails loudly.
 *
 * TTF rather than woff2, which looks backwards and is not. Google hands woff2
 * to any browser that advertises support, and for a family with a variable
 * version that woff2 *is* the variable font. Chromium cannot embed a
 * variable-font instance in a PDF: it gives up and writes Type3 glyph
 * procedures with no embedded font program, which is precisely what a print
 * service rejects. An old user agent gets static TTF files per weight, and
 * those come out of the PDF as properly embedded CIDFontType2 subsets. The
 * files are larger over the wire; the PDF is smaller and correct.
 */

const LEGACY_UA =
  'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8) AppleWebKit/533 (KHTML, like Gecko) Version/4 Safari/533';

const cache = new Map<string, string>();

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': LEGACY_UA },
    });
  } finally {
    clearTimeout(timer);
  }
}

export type EmbedResult = {
  /** A <style> block with @font-face rules whose sources are data URIs. */
  style: string;
  embedded: string[];
  /** Families that could not be fetched; they will fall back to a system face. */
  failed: string[];
};

export async function embedGoogleFonts(
  project: FontedBook,
  { timeoutMs = 20000 }: { timeoutMs?: number } = {},
): Promise<EmbedResult> {
  const families = [...new Set(projectSpecs(project).map((s) => s.family))].filter(Boolean);
  const hrefs = projectFontsHrefs(project);
  if (!hrefs.length) return { style: '', embedded: [], failed: [] };

  const key = hrefs.join('|');
  const cached = cache.get(key);
  if (cached) return { style: cached, embedded: families, failed: [] };

  let css: string;
  try {
    const sheets = await Promise.all(
      hrefs.map(async (href) => {
        const res = await fetchWithTimeout(href, timeoutMs);
        if (!res.ok) throw new Error(`Google Fonts responded ${res.status}`);
        return res.text();
      }),
    );
    css = sheets.join('\n');
  } catch {
    return { style: '', embedded: [], failed: families };
  }

  const urls = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((m) => m[1]))];
  const inlined = new Map<string, string>();

  // Font files are small and independent; fetching them in parallel keeps the
  // export from spending most of its time waiting.
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetchWithTimeout(url, timeoutMs);
        if (!res.ok) return;
        const buffer = Buffer.from(await res.arrayBuffer());
        const mime = url.endsWith('.woff2')
          ? 'font/woff2'
          : url.endsWith('.woff')
            ? 'font/woff'
            : 'font/ttf';
        inlined.set(url, `data:${mime};base64,${buffer.toString('base64')}`);
      } catch {
        /* a missing subset falls back to the next unicode-range */
      }
    }),
  );

  if (!inlined.size) return { style: '', embedded: [], failed: families };

  let out = css;
  for (const [url, dataUri] of inlined) {
    out = out.split(url).join(dataUri);
  }
  // Drop any face whose file could not be fetched, so Chromium does not stall
  // on a network request that is going to fail.
  const style = `<style>\n${stripUnresolved(out)}\n</style>`;
  cache.set(key, style);

  const embedded = families.filter((f) => css.includes(f.replace(/ /g, ' ')));
  return { style, embedded, failed: families.filter((f) => !embedded.includes(f)) };
}

function stripUnresolved(css: string): string {
  return css
    .split('@font-face')
    .filter((block, i) => i === 0 || !/url\(https:\/\//.test(block))
    .join('@font-face');
}
