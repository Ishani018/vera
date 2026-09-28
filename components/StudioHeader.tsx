'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The bar across the top of every screen.
 *
 * One wordmark in one place is most of what makes two quite different editors
 * feel like one product; the rest is that it always takes you home.
 */
export function StudioHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex items-center gap-4 border-b border-ink-200 bg-paper px-5">
      <Link
        href="/"
        className="rounded-lg py-4 pr-1 text-[20px] font-semibold tracking-tight transition-colors hover:text-accent-500"
        title="All your books"
      >
        Verse<span className="text-accent-500">craft</span>
      </Link>
      {children}
    </header>
  );
}
