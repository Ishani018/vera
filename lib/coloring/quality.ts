import { BLEED, MIN_COVER_DPI, getTrim } from '../kdp';
import { TRACE_EDGE } from '../lineart/pipeline';
import type { ColoringBook, ColoringPage } from '../types';
import { usesLineArt } from './picture';

/**
 * What a picture will actually look like once it is printed.
 *
 * Kept away from the components because the grid and the studio both report it
 * and they must not disagree: a thumbnail saying 412 dpi beside a panel saying
 * "under 300" would leave nobody knowing which to believe. Pure functions, so
 * the tests can check the arithmetic without a browser.
 */

/** Past this, enlargement is visible: the lines thicken and the corners round. */
export const EXTREME_UPSCALE = 2.5;

/** The paper that gets printed, in inches — the trim plus whatever bleed is on. */
export function printedSize(book: ColoringBook): { width: number; height: number } {
  const trim = getTrim(book.trim.trimId);
  const bleed = book.trim.bleed ? BLEED : 0;
  // Bleed is added on three sides of a page: the outside edge, the top and the
  // bottom. The spine edge is not trimmed, so the width gains one bleed and the
  // height gains two.
  return { width: trim.width + bleed, height: trim.height + 2 * bleed };
}

/** The long edge a finished page needs, in pixels, for 300 DPI at this trim. */
export function targetLongEdge(book: ColoringBook): number {
  const printed = printedSize(book);
  return Math.round(Math.max(printed.width, printed.height) * MIN_COVER_DPI);
}

/**
 * The long edge of the file that actually gets saved.
 *
 * Two corrections to the upload's own size: anything past TRACE_EDGE was worked
 * from a reduction of itself, and the finished lines may have been enlarged
 * afterwards.
 */
export function storedLongEdge(page: ColoringPage): number {
  const natural = Math.max(page.naturalWidth, page.naturalHeight);
  if (!natural) return 0;
  return Math.round(Math.min(natural, TRACE_EDGE) * (page.upscaled || 1));
}

/**
 * Resolution as printed, for a picture set to fit the page.
 *
 * Whichever side runs out of room first decides the scale, so the answer is the
 * larger of the two ratios — not the width alone, which reads far too kindly
 * for a tall picture on a square page.
 */
export function printedDpi(page: ColoringPage, book: ColoringBook): number {
  if (!page.naturalWidth || !page.naturalHeight) return 0;
  const printed = printedSize(book);
  if (!usesLineArt(book)) {
    // Printed as uploaded: no tracing reduction and no enlargement, so the
    // upload's own pixels are the whole story.
    return Math.max(page.naturalWidth / printed.width, page.naturalHeight / printed.height);
  }
  const scale = Math.min(TRACE_EDGE / Math.max(page.naturalWidth, page.naturalHeight), 1);
  const width = page.naturalWidth * scale * (page.upscaled || 1);
  const height = page.naturalHeight * scale * (page.upscaled || 1);
  return Math.max(width / printed.width, height / printed.height);
}

/** Everything the interface needs to say, worked out once. */
export function pageQuality(page: ColoringPage, book: ColoringBook) {
  const dpi = printedDpi(page, book);
  const asIs = !usesLineArt(book);
  // An upload that prints as it is was never enlarged, whatever an earlier run
  // with line art on left behind in `upscaled`.
  const factor = asIs ? 1 : page.upscaled || 1;
  const natural = Math.max(page.naturalWidth, page.naturalHeight);
  return {
    dpi,
    factor,
    stored: asIs ? natural : storedLongEdge(page),
    natural,
    stretched: factor > EXTREME_UPSCALE,
    soft: dpi > 0 && dpi < MIN_COVER_DPI,
  };
}

/**
 * Where a picture lands on the page, as percentages of the page box.
 *
 * Out here rather than in the component because it is arithmetic with a right
 * answer, and because the answer is easy to get subtly wrong: rotating an
 * element turns its box with it, so the width handed to CSS is the one it has
 * *before* the quarter turn, and page width and page height are different
 * units that have to be converted between.
 */
export function placeOnPage(page: ColoringPage, book: ColoringBook) {
  const printed = printedSize(book);
  const turned = page.rotate === 90;

  // The picture's size as it lands on the page, once any quarter turn is done.
  const width = turned ? page.naturalHeight : page.naturalWidth;
  const height = turned ? page.naturalWidth : page.naturalHeight;
  const fits = width > 0 && height > 0;
  const scale = !fits
    ? 1
    : page.fit === 'cover'
      ? Math.max(printed.width / width, printed.height / height)
      : Math.min(printed.width / width, printed.height / height);

  const acrossPage = fits ? ((width * scale) / printed.width) * 100 : 100;
  const downPage = fits ? ((height * scale) / printed.height) * 100 : 100;

  return {
    turned,
    acrossPage,
    downPage,
    /** What CSS is given: the width before any rotation. */
    boxWidth: turned ? (downPage * printed.height) / printed.width : acrossPage,
    /** True when something is going over the edge and will be trimmed away. */
    cropped: acrossPage > 100.01 || downPage > 100.01,
  };
}

/** True when the picture and the page are both wide, or both tall, or both square. */
export function shapesAgree(page: ColoringPage, book: ColoringBook): boolean {
  if (!page.naturalWidth || !page.naturalHeight) return true;
  const printed = printedSize(book);
  const sense = (w: number, h: number) => (w > h * 1.15 ? 'wide' : h > w * 1.15 ? 'tall' : 'square');
  const picture = sense(
    page.rotate === 90 ? page.naturalHeight : page.naturalWidth,
    page.rotate === 90 ? page.naturalWidth : page.naturalHeight,
  );
  return picture === sense(printed.width, printed.height);
}
