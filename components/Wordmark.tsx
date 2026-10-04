import Link from 'next/link';
import { BRAND } from '@/lib/brand';

/**
 * The product's name, from `lib/brand.ts`, with the studio's name small beside it.
 *
 * Set in Abril Fatface, served from this site (`/fonts`, see `app/globals.css`),
 * so it needs no network and never asks Google for anything. The fallback is a
 * bold system serif: if the file fails, it should still look like a wordmark.
 *
 * It stays at 34px in a 38px line box, which is what the bar was built around,
 * so the header is the same height it was and nothing below it moves.
 *
 * The colour is `outline`, not `ink-900`: the bar is white in every palette,
 * and in Night `ink-900` is nearly white, which is white on white. `outline`
 * is a near-black in all six, including Night.
 */
export function Wordmark() {
  return (
    <span className="flex shrink-0 items-baseline gap-2">
      <Link
        href="/"
        title="Everything you have made"
        className="shrink-0 rounded-lg py-3 pr-1 text-[34px] leading-[38px] text-outline transition-colors hover:text-accent-500"
        style={{ fontFamily: 'var(--font-wordmark)' }}
      >
        {BRAND.product}
      </Link>
      {/* The studio, small and second, in the same ink as the name. Not a link, so a stray click never leaves work behind. */}
      <span
        data-byline
        title={`${BRAND.product} is made by ${BRAND.studio}`}
        className="mono-label hidden shrink-0 text-outline opacity-70 sm:inline"
        style={{ fontSize: 10, letterSpacing: '0.06em' }}
      >
        {BRAND.byline}
      </span>
    </span>
  );
}
