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
    label: 'Make',
    icon: 'make',
    title: 'Turn a drawing or a photograph into a sticker',
  },
  {
    href: '/stickers/library',
    label: 'Library',
    icon: 'library',
    title: 'Everything installed, with its licence and where it came from',
  },
  {
    href: '/stickers/packs',
    label: 'Packs',
    icon: 'pack',
    title: 'Group stickers, install a pack, save one as a zip',
  },
];

/**
 * The sheet, which is a page but not a tab.
 *
 * Laying stickers out to print is something you do *to* stickers you have
 * already picked, not a place you set off for: the one way in is "Put these on
 * a sheet" on the hub, with a selection in hand. A tab for it sat in the bar
 * being the only one nobody could use without going somewhere else first.
 *
 * It is named here rather than deleted because `tabFor` still has to answer for
 * it — a page the bar cannot account for would leave the underline stranded
 * under whichever tab was last lit.
 */
export const SHEET = '/stickers/sheet';

/**
 * Which tab a path is in.
 *
 * The studio owns whatever the others do not name, the sheet included.
 * Matching on "starts with /stickers" would light the first tab on every page,
 * since they all do, and a bar that is always lit says nothing.
 */
export function tabFor(path: string): string {
  const named = STICKER_TABS.filter((tab) => tab.href !== '/stickers')
    .map((tab) => tab.href)
    .find((href) => path === href || path.startsWith(`${href}/`));
  return named ?? '/stickers';
}
