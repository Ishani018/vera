'use client';

import type { ReactNode } from 'react';
import { UserMenu } from './UserMenu';
import { Wordmark } from './Wordmark';

/**
 * The bar across the top of every screen.
 *
 * One wordmark in one place is most of what makes two quite different editors
 * feel like one product; the rest is that it always takes you home.
 *
 * It scrolls sideways rather than pushing the window wider: a bar that makes
 * the whole page scroll sideways takes the thing being worked on with it.
 */
export function StudioHeader({ children }: { children?: ReactNode }) {
  return (
    /*
      The bar stays white in every palette, including Night. That is a decided
      thing, not an oversight: the wordmark is drawn in `outline`, a near-black
      in all six, and `tests/brand.test.mjs` holds it there. So everything else
      in this bar is coloured for a white fill too — see `StudioTitle` below and
      the tab colours in `StickerTabs`.
    */
    <header className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-ink-200 bg-paper px-3 sm:gap-4 sm:px-5">
      <Wordmark />
      {children}
      {/* Takes the rest of the bar and puts the menu at its far end. Empty, so
          removed from the layout altogether, where sign-in is not set up: the bar
          is then exactly what it always was. */}
      <span className="flex flex-1 justify-end py-1 empty:hidden">
        <UserMenu />
      </span>
    </header>
  );
}

/**
 * The page's name, beside the wordmark.
 *
 * The mockups set it at 42px on a 1738px window — 30px here — against the 16px
 * it was, which left the title reading as a caption on the wordmark rather than
 * as the name of the screen. In the display face, like every other heading on
 * these screens. It is what a narrow window gives up first: the wordmark
 * already says where you are.
 */
export function StudioTitle({ children }: { children: ReactNode }) {
  return (
    <span
      className="hidden shrink-0 truncate tracking-tight sm:inline"
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 'var(--studio-text-page)',
        // `text-on-sheet`, like the wordmark beside it: the bar is white in
        // every palette and `ink-900` is near-white in Night.
        color: 'var(--text-on-sheet)',
      }}
    >
      {children}
    </span>
  );
}
