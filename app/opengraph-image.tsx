import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { BRAND } from '@/lib/brand';
import { PRESS_PROOF } from '@/lib/theme';

/**
 * The picture a link to the site shows in a chat or a feed. Made at build time from the brand config, in the
 * default palette's paper and ink, taken from the palette itself rather than written out here.
 *
 * The product name is set in the wordmark face from `public/fonts` (the same file the header uses, as woff because the
 * renderer cannot read woff2), so building needs no network and nothing is fetched from Google.
 */
export const alt = `${BRAND.product}, ${BRAND.byline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const wordmark = await readFile(join(process.cwd(), 'public', 'fonts', 'wordmark-display-latin.woff'));
  // The renderer uses only the fonts it is given, so the small text needs one too. This is the sans Next itself
  // ships for exactly this job: already on disk, so still no network.
  const sans = await readFile(join(process.cwd(), 'node_modules', 'next', 'dist', 'compiled', '@vercel', 'og', 'noto-sans-v27-latin-regular.ttf'));
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: 96, background: PRESS_PROOF.paper50, color: PRESS_PROOF.ink900,
        }}
      >
        <div style={{ fontFamily: 'Wordmark Display', fontSize: 240, lineHeight: 1.05 }}>{BRAND.product}</div>
        <div style={{ fontFamily: 'Noto Sans', fontSize: 38, marginTop: 8, color: PRESS_PROOF.ink500 }}>{BRAND.byline}</div>
        <div style={{ fontFamily: 'Noto Sans', fontSize: 40, marginTop: 56, maxWidth: 900, lineHeight: 1.3 }}>
          The design tool for people who self-publish books.
        </div>
      </div>
    ),
    { ...size, fonts: [
      { name: 'Wordmark Display', data: wordmark, style: 'normal', weight: 400 },
      { name: 'Noto Sans', data: sans, style: 'normal', weight: 400 },
    ] },
  );
}
