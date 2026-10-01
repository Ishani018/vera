/**
 * Where the sticker pages are.
 *
 * Here rather than in the component because it is a fact about the app, not
 * about a row of buttons: the labels, the tooltips and the rule for which page
 * belongs to which tab can all be checked without a browser, and the component
 * is then only the drawing of it.
 */

export type TabIcon = 'make' | 'sheet' | 'pack' | 'library';

export type StickerTab = {
  href: string;
  label: string;
  icon: TabIcon;
  /** What the page is for, as a tooltip rather than a line of prose. */
  title: string;
};

export const STICKER_TABS: StickerTab[] = [
  {
    href: '/stickers',
    label: 'Make a sticker',
    icon: 'make',
    title: 'Turn a drawing or a photograph into a sticker',
  },
  {
    href: '/stickers/sheet',
    label: 'Sticker sheet',
    icon: 'sheet',
    title: 'Lay stickers out on a page to print and cut',
  },
  {
    href: '/stickers/packs',
    label: 'Packs',
    icon: 'pack',
    title: 'Group stickers, install a pack, save one as a zip',
  },
  {
    href: '/stickers/sources',
    label: 'Library',
    icon: 'library',
    title: 'Everything installed, with where it came from',
  },
];

/**
 * Which tab a path is in.
 *
 * The studio owns whatever the others do not name. Matching on "starts with
 * /stickers" would light the first tab on every page, since they all do, and a
 * bar that is always lit says nothing.
 */
export function tabFor(path: string): string {
  const named = STICKER_TABS.filter((tab) => tab.href !== '/stickers')
    .map((tab) => tab.href)
    .find((href) => path === href || path.startsWith(`${href}/`));
  return named ?? '/stickers';
}
