import { BLEED, getTrim } from '../kdp';
import type { ColoringBook, ColoringPage, ColoringSettings, MatterSlot } from '../types';

/**
 * Where a picture goes on a printed sheet, in inches.
 *
 * The same arithmetic the studio preview does, done once here so the preview,
 * the PDF and the tests cannot disagree about it. Inches rather than
 * percentages because the page is a physical thing and the stylesheet writes
 * them out unchanged.
 */

/** The whole sheet that comes off the press, bleed included. */
export type Sheet = {
  width: number;
  height: number;
  bleed: number;
};

export function sheetOf(book: ColoringBook): Sheet {
  const trim = getTrim(book.trim.trimId);
  const bleed = book.trim.bleed ? BLEED : 0;
  // Bleed is trimmed off the outside edge, the top and the bottom. The spine
  // edge is not trimmed, so the width gains one bleed and the height two.
  return { width: trim.width + bleed, height: trim.height + 2 * bleed, bleed };
}

/** Which side of the fold a page landed on. The gutter is not symmetrical. */
export type Side = 'left' | 'right';

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * The area a picture is allowed to occupy.
 *
 * A picture set to fill the page runs to the sheet edge, bleed and all — that
 * is what bleed is for. One set to fit stays inside the margins, which KDP
 * requires of anything that is not bleeding, and which are not the same on the
 * two sides of the fold: the gutter is on the left of a recto and the right of
 * a verso.
 */
export function targetRect(book: ColoringBook, fit: ColoringPage['fit'], side: Side): Rect {
  const sheet = sheetOf(book);
  if (fit === 'cover') return { x: 0, y: 0, width: sheet.width, height: sheet.height };

  const { inside, outside, top, bottom } = book.margins;
  const gutterLeft = side === 'right';
  return {
    x: gutterLeft ? inside : sheet.bleed + outside,
    y: sheet.bleed + top,
    width: sheet.width - inside - sheet.bleed - outside,
    height: sheet.height - 2 * sheet.bleed - top - bottom,
  };
}

/**
 * The box to give the image element, before any rotation is applied.
 *
 * Rotating an element turns its box with it, so an element that is to end up
 * `w × h` on the page must be written out as `h × w` and spun about its own
 * centre. Keeping that swap here rather than in a stylesheet is the difference
 * between a turned picture landing where it was meant to and landing anywhere
 * at all.
 */
export type ArtBox = Rect & { rotate: 0 | 90 };

export function artBox(page: ColoringPage, book: ColoringBook, side: Side): ArtBox {
  const target = targetRect(book, page.fit, side);
  const turned = page.rotate === 90;

  // The picture's proportions as they land on the page, once turned.
  const across = turned ? page.naturalHeight : page.naturalWidth;
  const down = turned ? page.naturalWidth : page.naturalHeight;

  if (!across || !down) return { ...target, rotate: 0 };

  const scale =
    page.fit === 'cover'
      ? Math.max(target.width / across, target.height / down)
      : Math.min(target.width / across, target.height / down);

  const footWidth = across * scale;
  const footHeight = down * scale;
  const centreX = target.x + target.width / 2;
  const centreY = target.y + target.height / 2;

  const boxWidth = turned ? footHeight : footWidth;
  const boxHeight = turned ? footWidth : footHeight;

  return {
    x: centreX - boxWidth / 2,
    y: centreY - boxHeight / 2,
    width: boxWidth,
    height: boxHeight,
    rotate: turned ? 90 : 0,
  };
}

/** Where custom front-matter artwork is kept, by slot. */
export const MATTER_ART_KEYS = {
  title: 'titleArt',
  belongs: 'belongsArt',
  colorTest: 'colorTestArt',
} as const satisfies Record<MatterSlot, keyof ColoringSettings>;

/** The drawing supplied for a generated page, if there is one. */
export function matterArt(book: ColoringBook, slot: MatterSlot): ColoringPage | null {
  return book.coloring[MATTER_ART_KEYS[slot]];
}

/** Every drawing supplied for a generated page, in printed order. */
export function matterArtwork(book: ColoringBook): ColoringPage[] {
  return (['title', 'belongs', 'colorTest'] as MatterSlot[])
    .map((slot) => matterArt(book, slot))
    .filter((art): art is ColoringPage => Boolean(art));
}

/**
 * How many sheets the finished book runs to, once padded to an even count.
 *
 * Worked out by walking the book the way the binding does rather than by
 * adding up parts, because "this page takes a right-hand one" is not a sum: it
 * may leave a sheet blank ahead of itself, and whether it does depends on
 * everything before it. Known without laying anything out all the same,
 * because a coloring book's pages are one picture each rather than a flow of
 * type — and the preview replaces this with the real count as soon as it has
 * one.
 */
export function sheetCount(book: ColoringBook): number {
  const { coloring } = book;
  let used = 0;
  /** Adds a page, first skipping a sheet if this one must start a leaf. */
  const place = (mustBeRecto: boolean) => {
    // The next page number is `used + 1`, and odd numbers are right-hand pages.
    if (mustBeRecto && used % 2 === 1) used++;
    used++;
  };

  if (coloring.titlePage) place(false);
  if (coloring.copyrightPage) place(false);
  if (coloring.belongsToPage) place(false);
  // The page pens are tested on wants a blank behind it as much as any picture
  // does — more, since the whole point is to find out what soaks through.
  if (coloring.colorTestPage) place(coloring.singleSided);
  for (let i = 0; i < book.pages.length; i++) place(coloring.singleSided);

  return used + (used % 2);
}

/** Which generated front-matter pages this book is set to print. */
export function frontMatterPages(book: ColoringBook): number {
  const { titlePage, copyrightPage, belongsToPage, colorTestPage } = book.coloring;
  return [titlePage, copyrightPage, belongsToPage, colorTestPage].filter(Boolean).length;
}
