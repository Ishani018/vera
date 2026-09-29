import Link from 'next/link';

/**
 * The name, in one place.
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
    <Link
      href="/"
      title="Everything you have made"
      className="shrink-0 rounded-lg py-3 pr-1 text-[34px] leading-[38px] tracking-tight text-ink-900 transition-colors hover:text-accent-500"
      style={{ fontFamily: "'Great Vibes', 'Snell Roundhand', 'Segoe Script', cursive" }}
    >
      Isnaevy
    </Link>
  );
}
