'use client';

import type { ReactNode } from 'react';
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
    <header className="flex min-w-0 items-center gap-4 overflow-x-auto border-b border-ink-200 bg-paper px-5">
      <Wordmark />
      {children}
    </header>
  );
}
