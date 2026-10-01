'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  return (
    <nav aria-label="Stickers" className="shrink-0 border-b border-ink-200 bg-paper-0 px-2 sm:px-4">
      <ul className="mx-auto flex max-w-5xl items-stretch gap-1 overflow-x-auto">
        {STICKER_TABS.map(({ href, label, icon, title }) => {
          const current = here === href;
          const Icon = ICONS[icon];
          return (
            <li key={href}>
              <Link
                href={href}
                title={title}
                aria-current={current ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] transition-colors',
                  current
                    ? 'border-accent-500 font-[600] text-accent-500'
                    : 'border-transparent text-ink-700 hover:border-ink-300 hover:text-ink-900',
                )}
              >
                <Icon size={17} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
