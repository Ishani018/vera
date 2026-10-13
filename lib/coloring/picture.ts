import type { ColoringBook, ColoringPage } from '../types';

/**
 * Which file a coloring page prints from.
 *
 * With `coloring.lineArtOn` on, each picture is traced and the line art prints.
 * Off, the upload prints as it came — mazes, word searches, dot-to-dot, pages
 * drawn elsewhere. Everything that has to choose between "the line art" and "the
 * original" asks here instead of guessing, so the preview, the export, the grid
 * and the warnings cannot disagree about it. It is one switch, not a type of book.
 *
 * Kept free of the DOM and the store so the tests can check it directly.
 */

/** True unless the book has been told to print pictures as they are. */
export function usesLineArt(book: Pick<ColoringBook, 'coloring'>): boolean {
  return book.coloring?.lineArtOn !== false;
}

/**
 * The asset a page prints from, or null when there is nothing yet.
 *
 * With line art on that is the converted file, falling back to the original
 * while it is still being made so that a half-converted book previews as a book
 * rather than as holes. With it off it is always the original — a stored line
 * art file from an earlier go is ignored, not deleted, so turning the switch
 * back on costs nothing.
 */
export function pictureAssetId(
  book: Pick<ColoringBook, 'coloring'>,
  page: Pick<ColoringPage, 'lineArtAssetId' | 'sourceAssetId'>,
): string | null {
  if (!usesLineArt(book)) return page.sourceAssetId || null;
  return page.lineArtAssetId ?? (page.sourceAssetId || null);
}

/**
 * Whether the page is ready to print as it stands.
 *
 * Line art on: the converter has finished with it. Off: always — there is
 * nothing to wait for.
 */
export function isReady(
  book: Pick<ColoringBook, 'coloring'>,
  page: Pick<ColoringPage, 'lineArtAssetId'>,
): boolean {
  return !usesLineArt(book) || Boolean(page.lineArtAssetId);
}

