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
      <DemoChip />
      {children}
    </header>
  );
}

/**
 * That this is a demonstration, said on every screen.
 *
 * Small, and next to the name rather than in a banner, because it has to be
 * true everywhere without being the loudest thing anywhere. The front page
 * carries the long version in its footer; this is the reminder for someone
 * two hours into a book who has forgotten where they are.
 *
 * Deliberately shorter than the wordmark beside it, so the header keeps the
 * height it has. That height decides how much room the editors have, and the
 * editors' board scale is what the screen goldens measure.
 */
function DemoChip() {
  return (
    <span
      title="A public demonstration. Your work is saved in this browser only."
      className="shrink-0 rounded-full border border-accent-500/40 bg-accent-50 px-2 py-0.5 text-[10.5px] font-[580] uppercase tracking-wider text-accent-600"
    >
      Demo
    </span>
  );
}
