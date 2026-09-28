import {
  MIN_COVER_DPI,
  checkMargins,
  checkPageCount,
  padToEven,
  type ValidationIssue,
} from '../kdp';
import { EXTREME_UPSCALE, pageQuality } from './quality';
import type { ColoringBook } from '../types';

/**
 * Everything wrong with a coloring book, said plainly.
 *
 * Separate from the poetry validator because almost nothing overlaps: a
 * coloring book has no measure, no widows and no running heads, and it has one
 * problem poetry never has — a picture that is too few pixels to print.
 */
export function validateColoringBook(book: ColoringBook, pageCount: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!book.pages.length) {
    issues.push({
      id: 'coloring-empty',
      level: 'error',
      message: 'There are no pictures in this book yet.',
      fix: 'Add some in Pictures.',
    });
  }

  if (pageCount > 0) {
    issues.push(...checkPageCount(pageCount));
    issues.push(
      ...checkMargins({
        margins: book.margins,
        pageCount: padToEven(pageCount),
        bleed: book.trim.bleed,
      }),
    );
  }

  const unconverted = book.pages.filter((page) => !page.lineArtAssetId);
  if (unconverted.length) {
    issues.push({
      id: 'coloring-unconverted',
      level: 'error',
      message: `${unconverted.length} picture${unconverted.length === 1 ? ' has' : 's have'} not been converted to line art yet.`,
      fix: 'Open Pictures and wait for the converter to finish.',
    });
  }

  const soft = book.pages.filter((page) => pageQuality(page, book).soft);
  if (soft.length) {
    issues.push({
      id: 'coloring-dpi',
      level: 'warning',
      message: `${soft.length} picture${soft.length === 1 ? '' : 's'} print below ${MIN_COVER_DPI} DPI: ${names(soft.map((p) => p.title))}.`,
      fix: 'They will still print; the lines will look a little rough. A larger original is the only real fix.',
    });
  }

  const stretched = book.pages.filter((page) => pageQuality(page, book).stretched);
  if (stretched.length) {
    issues.push({
      id: 'coloring-upscale',
      level: 'warning',
      message: `${stretched.length} picture${stretched.length === 1 ? ' was' : 's were'} enlarged more than ${EXTREME_UPSCALE}×: ${names(stretched.map((p) => p.title))}.`,
      fix: 'Enlarging cannot add detail. If the lines come out soft, start from a bigger file.',
    });
  }

  if (book.coloring.containsAiImages) {
    issues.push({
      id: 'coloring-ai',
      level: 'info',
      message: 'This book is marked as containing AI-generated images.',
      fix: "KDP asks to be told at publication. Check their current content guidelines for the wording they want.",
    });
  }

  return issues;
}

/** Up to three names, then a count, so a warning stays one line. */
function names(titles: string[]): string {
  const shown = titles.slice(0, 3).map((t) => t || 'Untitled');
  const rest = titles.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(', ');
}
