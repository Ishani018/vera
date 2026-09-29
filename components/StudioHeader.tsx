'use client';

import type { ReactNode } from 'react';
import { Wordmark } from './Wordmark';

/**
 * The bar across the top of every screen.
 *
 * One wordmark in one place is most of what makes two quite different editors
 * feel like one product; the rest is that it always takes you home.
 */
export function StudioHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex items-center gap-4 border-b border-ink-200 bg-paper px-5">
      <Wordmark />
      {children}
    </header>
  );
}
