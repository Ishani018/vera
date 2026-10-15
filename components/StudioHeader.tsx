'use client';

import type { ReactNode } from 'react';
import { PalettePicker } from './PalettePicker';
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
export function StudioHeader({
  children,
  actions,
}: {
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex h-14 min-w-0 items-center justify-between border-b border-ink-200 bg-paper px-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4 overflow-x-auto">
        <Wordmark />
        {children}
      </div>
      <div className="ml-4 flex shrink-0 items-center gap-2.5 py-1">
        {actions}
        <PalettePicker compact />
        <UserMenu />
      </div>
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
