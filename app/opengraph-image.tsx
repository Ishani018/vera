import { ImageResponse } from 'next/og';
import { BRAND } from '@/lib/brand';
import { PRESS_PROOF } from '@/lib/theme';

/**
 * The picture a link to the site shows in a chat or a feed. Made at build time from the brand config, in the
 * default palette's paper and ink, taken from the palette itself rather than written out here. It uses the system sans rather than the script wordmark, because the script is
 * a web font fetched at runtime and a build must not need the network.
 */
export const alt = `${BRAND.product}, ${BRAND.byline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: 96, background: PRESS_PROOF.paper50, color: PRESS_PROOF.ink900,
        }}
      >
        <div style={{ fontSize: 220, fontWeight: 700, letterSpacing: -6, lineHeight: 1 }}>{BRAND.product}</div>
        <div style={{ fontSize: 36, marginTop: 12, color: PRESS_PROOF.ink500 }}>{BRAND.byline}</div>
        <div style={{ fontSize: 40, marginTop: 56, maxWidth: 900, lineHeight: 1.3 }}>
          The design tool for people who self-publish books.
        </div>
      </div>
    ),
    size,
  );
}
