'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { STICKER_TABS, tabFor, type TabIcon } from '@/lib/stickers/tabs';
import { cx } from '../ui';
import { LibraryIcon, MakeIcon, PackIcon, SheetIcon, type IconProps } from './icons';

/**
 * Where the sticker pages are, as a row of tabs you can see.
 *
 * It replaces three underlined links in the top-right corner. Those were the
 * same size as the small print beside them and sat where a browser keeps its
 * own furniture, so the second and third pages of this part of the app were
 * effectively undiscovered. A tab bar says, without being read: there are four
 * places, and you are in this one.
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
      background: `var(--color-${TAB_COLOUR[here] ?? 'accent'}-500)`,
    });
  }, [here]);

  return (
    <nav aria-label="Stickers" className="shrink-0 border-b border-ink-200 bg-paper-0 px-2 sm:px-4">
      <ul className="relative mx-auto flex max-w-5xl items-stretch gap-1 overflow-x-auto">
        <span className="tab-underline" style={mark} aria-hidden="true" />
        {STICKER_TABS.map(({ href, label, icon, title }, n) => {
          const current = here === href;
          const Icon = ICONS[icon];
          return (
            <li key={href}>
              <Link
                ref={(node) => void (tabs.current[n] = node)}
                href={href}
                title={title}
                aria-current={current ? 'page' : undefined}
                className={cx(
                  'nudge-hover flex items-center gap-2 whitespace-nowrap px-3 py-2.5 text-[13.5px]',
                  'transition-colors duration-[--motion-base]',
                  current ? 'font-[600]' : 'text-ink-700 hover:text-ink-900',
                )}
                style={current ? { color: `var(--color-${TAB_COLOUR[here] ?? 'accent'}-600)` } : undefined}
              >
                <span className="nudge">
                  <Icon size={17} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * A colour per tab, from the palette's roles.
 *
 * Making a sticker is the lilac one because stickers are lilac throughout;
 * a sheet is printed, so it is clay; a pack is the sunny one; and the library
 * keeps the brand teal. The underline and the label take the same colour, so
 * the mark and the word agree.
 */
const TAB_COLOUR: Record<string, string> = {
  '/stickers': 'lilac',
  '/stickers/sheet': 'clay',
  '/stickers/packs': 'sun',
  '/stickers/library': 'accent',
};
