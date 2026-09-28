import { BLEED, MIN_COVER_DPI, getTrim } from '../kdp';
import { MAX_EDGE } from '../lineart/pipeline';
import type { ColoringBook, ColoringPage } from '../types';

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
 * Two corrections to the upload's own size: anything past MAX_EDGE was worked
 * from a reduction of itself, and line art may have been enlarged afterwards.
 */
export function storedLongEdge(page: ColoringPage): number {
  const natural = Math.max(page.naturalWidth, page.naturalHeight);
  if (!natural) return 0;
  return Math.round(Math.min(natural, MAX_EDGE) * (page.upscaled || 1));
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
  const scale = Math.min(MAX_EDGE / Math.max(page.naturalWidth, page.naturalHeight), 1);
  const width = page.naturalWidth * scale * (page.upscaled || 1);
  const height = page.naturalHeight * scale * (page.upscaled || 1);
  return Math.max(width / printed.width, height / printed.height);
}

/** Everything the interface needs to say, worked out once. */
export function pageQuality(page: ColoringPage, book: ColoringBook) {
  const dpi = printedDpi(page, book);
  const factor = page.upscaled || 1;
  return {
    dpi,
    factor,
    stored: storedLongEdge(page),
    natural: Math.max(page.naturalWidth, page.naturalHeight),
    stretched: factor > EXTREME_UPSCALE,
    soft: dpi > 0 && dpi < MIN_COVER_DPI,
  };
}
