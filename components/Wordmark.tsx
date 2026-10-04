import Link from 'next/link';
import { BRAND } from '@/lib/brand';

/**
 * The product's name, from `lib/brand.ts`, with the studio's name small beside it.
 *
 * Set in Great Vibes, which is loaded from Google Fonts in `app/layout.tsx`
 * alongside the faces the books themselves use. The fallbacks are scripts
 * rather than a generic serif: if the network is down the wordmark should
 * still look like a wordmark, and macOS and Windows each ship one.
 *
 * It is 34px against a 20px bar elsewhere because a script face carries far
 * less ink per point than a sans — at 20px it reads as small print rather
 * than as a name. The line box is set tight enough that the header is the
 * same height it was, so nothing below it moves.
 */
export function Wordmark() {
  return (
    <span className="flex shrink-0 items-baseline gap-2">
      <Link
        href="/"
        title="Everything you have made"
        className="shrink-0 rounded-lg py-3 pr-1 text-[34px] leading-[38px] tracking-tight text-ink-900 transition-colors hover:text-accent-500"
        style={{ fontFamily: "'Great Vibes', 'Snell Roundhand', 'Segoe Script', cursive" }}
      >
        {BRAND.product}
      </Link>
      {/* The studio, small and second. Not a link, so a stray click never leaves work behind. */}
      <span
        data-byline
        title={`${BRAND.product} is made by ${BRAND.studio}`}
        className="mono-label hidden shrink-0 text-ink-500 sm:inline"
        style={{ fontSize: 10, letterSpacing: '0.06em' }}
      >
        {BRAND.byline}
      </span>
    </span>
  );
}
