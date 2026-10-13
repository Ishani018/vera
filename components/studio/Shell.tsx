'use client';

import type { ReactNode } from 'react';
import { cx } from '../ui';

/**
 * What the three studio screens stand on.
 *
 * The hub, the Lab and Packs were three screens that happened to agree. The
 * approved mockups draw them as one place, so the page, the content width, the
 * card and the headings live here once and each screen says which it is using.
 * Anything true of only one screen stays in that screen.
 *
 * Every size is read off the mockups: they are drawn at 1920 in a 1738px app
 * window, so a number here is the mockup's own number times 1280/1738.
 */

/**
 * The content column.
 *
 * The mockups leave an 8% gutter each side — ~106px at 1280 — and a content
 * column of ~1070. The app had `max-w-5xl`, which is 1024 with padding inside
 * it, so ~976 of content. That 9% is most of the "too small": every card in
 * every grid was narrower than drawn, and the grids then fitted fewer of them.
 */
export const COLUMN = 'mx-auto w-full max-w-[1120px] px-6 sm:px-8';

/** The page itself. Near-white, not cream. See `studioPage` in lib/theme.ts. */
export function StudioPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx('min-h-0 flex-1 overflow-y-auto', className)}
      style={{ background: 'var(--studio-page)' }}
    >
      {children}
    </div>
  );
}

/**
 * A card: one quiet step off the page, with an edge and a shadow.
 *
 * The shadow is the deliberate departure from Press Proof, which sets `rest`
 * and `raised` to none because a printed proof has no drop shadows. It is its
 * own token used only here, so that rule still holds everywhere it held before.
 * Without it these screens read as rectangles ruled on a page rather than as
 * things you could pick up.
 */
export const CARD =
  'rounded-[10px] border transition-[border-color,box-shadow,transform] duration-[var(--motion-base)]';

export const cardStyle = {
  background: 'var(--studio-card)',
  borderColor: 'var(--studio-line)',
  boxShadow: 'var(--studio-shadow-card)',
} as const;

/** A card that answers the pointer. The same card, lifted a little. */
export const cardHover =
  'hover:-translate-y-px hover:border-accentb-500 hover:shadow-[var(--studio-shadow-cardRaised)]';

/**
 * A page heading and the one line under it.
 *
 * `hero` is the 44px the Packs mockup uses for a screen that is all gallery;
 * `page` is the 30px the hub uses for a screen with work to do underneath.
 */
export function PageHead({
  title,
  line,
  size = 'page',
  children,
}: {
  title: string;
  line?: string;
  size?: 'page' | 'hero';
  /** Whatever sits on the right of the heading row: a field, a button. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1
          className="tracking-tight"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: `var(--studio-text-${size})`,
            lineHeight: 1.08,
            color: 'var(--color-ink-900)',
          }}
        >
          {title}
        </h1>
        {line && (
          <p
            className="mt-2"
            style={{ fontSize: 'var(--studio-text-body)', color: 'var(--color-ink-500)' }}
          >
            {line}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * A section heading.
 *
 * It was a 10px uppercase mono label, which is a proof sheet's annotation —
 * right for a margin note, wrong for the word that tells you what the next
 * eight cards are. The mockups set it at 29px on a 1738px window, so 19.5px
 * here, in the display face like the page title above it.
 */
export function SectionHead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cx('tracking-tight', className)}
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 'var(--studio-text-section)',
        color: 'var(--color-ink-900)',
      }}
    >
      {children}
    </h2>
  );
}

/**
 * A numbered section label with a rule running to the end of the row.
 *
 * The home screen's way of marking up a page in order: "01 Start from", "02 Your
 * stickers". Lives here so the pages that use it cannot drift into two versions.
 */
export function NumberedLabel({ number, title }: { number: string; title: string }) {
  return (
    <h2 className="flex items-center gap-3">
      <span className="mono-label shrink-0 text-ink-900" style={{ fontSize: 12, fontWeight: 500 }}>
        {number} {title}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-ink-300" />
    </h2>
  );
}
