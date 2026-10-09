'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { STICKER_TABS, tabFor, type TabIcon } from '@/lib/stickers/tabs';
import { cx } from '../ui';
import { LibraryIcon, MakeIcon, PackIcon, SheetIcon, type IconProps } from './icons';
// The app's one bin, rather than a second drawing of the same thing.
import { TrashIcon } from '../icons';

/**
 * Where the sticker pages are, as tabs on the right of the top bar.
 *
 * They used to sit in a full-width band of their own under the header, which is
 * what none of the three approved mockups do: there the tabs are level with the
 * wordmark, on the right, and there is one bar rather than two. The band cost a
 * row of height on every sticker page and read as a second header.
 *
 * Sized from the mockups: 25.5px on a 1738px window, so 16px here, against the
 * 13.5px it was. It is a destination, not a footnote.
 *
 * The current tab is marked three ways over — colour, weight and a rule under
 * it — because colour alone is the one that fails for a reader who cannot see
 * it, and `aria-current` says it a fourth way for a reader using a screen
 * reader.
 */

const ICONS: Record<TabIcon, (props: IconProps) => React.ReactElement> = {
  make: MakeIcon,
  sheet: SheetIcon,
  pack: PackIcon,
  library: LibraryIcon,
};

export function StickerTabs() {
  const path = usePathname() ?? '/stickers';
  const here = tabFor(path);

  /**
   * One underline for the bar, slid to whichever tab is current.
   *
   * Measured from the tab itself and moved with a transform, so changing page
   * costs a composited move rather than a layout. It starts without a width,
   * so the first paint has no mark in the wrong place to correct.
   */
  const tabs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [mark, setMark] = useState<React.CSSProperties>({ opacity: 0 });

  useEffect(() => {
    const at = STICKER_TABS.findIndex((tab) => tab.href === here);
    const node = tabs.current[at];
    const bar = node?.closest('ul');
    if (!node || !bar) return;
    const a = node.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    setMark({
      opacity: 1,
      width: a.width,
      transform: `translateX(${a.left - b.left}px)`,
    });
  }, [here]);

  return (
    <nav aria-label="Stickers" className="flex min-w-0 self-stretch">
      <ul className="relative flex items-stretch gap-0.5 overflow-x-auto">
        <span className="tab-underline" style={mark} aria-hidden="true" />
        {STICKER_TABS.map(({ href, label, icon, title }, n) => {
          const current = here === href;
          const Icon = ICONS[icon];
          return (
            <li key={href} className="flex">
              <Link
                ref={(node) => void (tabs.current[n] = node)}
                href={href}
                title={title}
                aria-current={current ? 'page' : undefined}
                className={cx(
                  // Smaller and tighter below `sm`: the bar is one row and the
                  // wordmark is not negotiable, so the tabs give way first
                  // rather than letting the last one scroll off the screen.
                  'nudge-hover flex items-center gap-2 whitespace-nowrap px-1.5 text-[13px]',
                  'sm:px-3 sm:text-[length:var(--studio-text-nav)]',
                  'transition-colors duration-[var(--motion-base)]',
                  current && 'font-[600]',
                )}
                /*
                  Coloured for a WHITE fill, not for the page: the bar stays
                  white in every palette, and in Night the deep accent steps
                  invert — `accentb-700` is a pale teal that reads 2.1:1 there.
                  Both tokens pick whichever step actually reads on sheet.
                */
                style={{
                  color: current ? 'var(--teal-on-sheet)' : 'var(--text-muted-on-sheet)',
                }}
              >
                <span className="nudge max-sm:hidden">
                  <Icon size={18} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}

        {/*
          The trash, smaller and last, in the red that means "this is where
          things go when you take them away" everywhere else in the app. It is a
          link, not a tab: there is one trash dialog and it lives on the home
          screen, so this goes there rather than growing a copy.
        */}
        <li className="flex">
          <Link
            href="/?trash=1"
            title="Thirty days, then gone"
            className={cx(
              'nudge-hover flex items-center gap-1.5 whitespace-nowrap pl-1.5 text-[13px]',
              'sm:pl-3 sm:text-[length:var(--studio-text-body)]',
            )}
            style={{ color: 'var(--red-on-sheet)' }}
          >
            <span className="nudge max-sm:hidden">
              <TrashIcon size={16} />
            </span>
            Trash
          </Link>
        </li>
      </ul>
    </nav>
  );
}
