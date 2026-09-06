// Never let this reach a client bundle: it inlines megabytes of font data.
import 'server-only';
import { googleFontsHref } from '../fonts';

/**
 * Fetches the Google Fonts stylesheet for a set of families and inlines every
 * font file it references as a data URI.
 *
 * Two reasons this is worth the round trips. Headless Chromium in a serverless
 * sandbox often cannot reach fonts.gstatic.com, and a book that silently prints
 * in a fallback face is worse than one that fails loudly. And a PDF produced
 * from inlined faces embeds subsets of exactly the faces that were used, which
 * is what KDP wants.
 *
 * The Chrome user agent matters: Google serves woff2 only to browsers that
 * advertise support, and hands everyone else much larger ttf files.
 */

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const cache = new Map<string, string>();

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': CHROME_UA },
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
  families: string[],
  { timeoutMs = 12000 }: { timeoutMs?: number } = {},
): Promise<EmbedResult> {
  const href = googleFontsHref(families);
  if (!href) return { style: '', embedded: [], failed: [] };

  const cached = cache.get(href);
  if (cached) return { style: cached, embedded: families, failed: [] };

  let css: string;
  try {
    const res = await fetchWithTimeout(href, timeoutMs);
    if (!res.ok) throw new Error(`Google Fonts responded ${res.status}`);
    css = await res.text();
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
  cache.set(href, style);

  const embedded = families.filter((f) => css.includes(f.replace(/ /g, ' ')));
  return { style, embedded, failed: families.filter((f) => !embedded.includes(f)) };
}

function stripUnresolved(css: string): string {
  return css
    .split('@font-face')
    .filter((block, i) => i === 0 || !/url\(https:\/\//.test(block))
    .join('@font-face');
}
