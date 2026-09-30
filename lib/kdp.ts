/**
 * KDP print specification.
 *
 * Every number in this file comes from Amazon KDP's published print
 * requirements and is mirrored in SPECS.md. Nothing here is inferred or
 * interpolated — if a value is not in KDP's tables, it is not in this file.
 *
 * All dimensions are in INCHES unless a name says otherwise.
 */

export const PT_PER_INCH = 72;
export const MM_PER_INCH = 25.4;

export type TrimSize = {
  id: string;
  width: number;
  height: number;
  /** Trims KDP prints in every marketplace, and the two poetry standards. */
  label: string;
  recommendedForPoetry?: boolean;
};

/** KDP black-and-white / colour trim sizes, in inches. */
export const TRIM_SIZES: TrimSize[] = [
  { id: '5x8', width: 5, height: 8, label: '5" × 8"' },
  { id: '5.06x7.81', width: 5.06, height: 7.81, label: '5.06" × 7.81"' },
  { id: '5.25x8', width: 5.25, height: 8, label: '5.25" × 8"' },
  { id: '5.5x8.5', width: 5.5, height: 8.5, label: '5.5" × 8.5"', recommendedForPoetry: true },
  { id: '6x9', width: 6, height: 9, label: '6" × 9"', recommendedForPoetry: true },
  { id: '5.83x8.27', width: 5.83, height: 8.27, label: '5.83" × 8.27" (A5)' },
  { id: '6.14x9.21', width: 6.14, height: 9.21, label: '6.14" × 9.21"' },
  { id: '6.69x9.61', width: 6.69, height: 9.61, label: '6.69" × 9.61"' },
  { id: '7x10', width: 7, height: 10, label: '7" × 10"' },
  { id: '7.44x9.69', width: 7.44, height: 9.69, label: '7.44" × 9.69"' },
  { id: '7.5x9.25', width: 7.5, height: 9.25, label: '7.5" × 9.25"' },
  { id: '8x10', width: 8, height: 10, label: '8" × 10"' },
  { id: '8.25x6', width: 8.25, height: 6, label: '8.25" × 6" (landscape)' },
  { id: '8.25x8.25', width: 8.25, height: 8.25, label: '8.25" × 8.25" (square)' },
  { id: '8.5x8.5', width: 8.5, height: 8.5, label: '8.5" × 8.5" (square)' },
  { id: '8.5x11', width: 8.5, height: 11, label: '8.5" × 11"' },
  { id: '8.27x11.69', width: 8.27, height: 11.69, label: '8.27" × 11.69" (A4)' },
];

export const DEFAULT_TRIM_ID = '5.5x8.5';

/** Coloring books are square by default; 8.5 × 11 is the other one KDP prints. */
export const DEFAULT_COLORING_TRIM = '8.5x8.5';
export const COLORING_TRIM_IDS = ['8.5x8.5', '8.5x11'] as const;

export function getTrim(id: string): TrimSize {
  return TRIM_SIZES.find((t) => t.id === id) ?? TRIM_SIZES.find((t) => t.id === DEFAULT_TRIM_ID)!;
}

/**
 * Minimum inside (gutter) margin by page count. KDP widens the gutter as the
 * book thickens because a thicker spine swallows more of the inner margin.
 */
export const GUTTER_TABLE: ReadonlyArray<{ minPages: number; maxPages: number; inside: number }> = [
  { minPages: 24, maxPages: 150, inside: 0.375 },
  { minPages: 151, maxPages: 300, inside: 0.5 },
  { minPages: 301, maxPages: 500, inside: 0.625 },
  { minPages: 501, maxPages: 700, inside: 0.75 },
  { minPages: 701, maxPages: 828, inside: 0.875 },
];

export const MIN_PAGES = 24;
export const MAX_PAGES = 828;

/** Minimum inside margin for a given page count. */
export function minInsideMargin(pageCount: number): number {
  for (const row of GUTTER_TABLE) {
    if (pageCount >= row.minPages && pageCount <= row.maxPages) return row.inside;
  }
  // Below the 24-page minimum KDP still requires the 24–150 gutter; above 828
  // the book is not printable at all, so quote the widest published gutter.
  return pageCount < GUTTER_TABLE[0].minPages
    ? GUTTER_TABLE[0].inside
    : GUTTER_TABLE[GUTTER_TABLE.length - 1].inside;
}

/** Minimum outside / top / bottom margin. Bleed books need the wider value. */
export const OUTSIDE_MARGIN_NO_BLEED = 0.25;
export const OUTSIDE_MARGIN_WITH_BLEED = 0.375;

export function minOutsideMargin(bleed: boolean): number {
  return bleed ? OUTSIDE_MARGIN_WITH_BLEED : OUTSIDE_MARGIN_NO_BLEED;
}

/** Bleed is added to top, bottom and the outside edge only — never the gutter. */
export const BLEED = 0.125;

export type PaperType = 'white' | 'cream' | 'color';

/** Per-page caliper, in inches. Spine width = page count × this. */
export const PAPER_THICKNESS: Record<PaperType, number> = {
  white: 0.002252,
  cream: 0.0025,
  color: 0.002347,
};

export const PAPER_LABELS: Record<PaperType, string> = {
  white: 'Black & white on white paper',
  cream: 'Black & white on cream paper',
  color: 'Colour paper',
};

/** Spine width in inches for a finished page count. */
export function spineWidth(pageCount: number, paper: PaperType): number {
  return pageCount * PAPER_THICKNESS[paper];
}

/** Total bleed added across a full wraparound cover: 0.125" on each of 4 edges. */
export const COVER_BLEED_TOTAL = 0.25;

export type CoverDimensions = {
  width: number;
  height: number;
  spine: number;
  /** Distance from the left edge of the PDF to the back-cover/spine fold. */
  spineStart: number;
  /** Distance from the left edge of the PDF to the spine/front-cover fold. */
  spineEnd: number;
  bleed: number;
};

/**
 * Full wraparound cover, as a single PDF page:
 *   width  = (2 × trim width) + spine + 0.25"
 *   height = trim height + 0.25"
 */
export function coverDimensions(
  trim: TrimSize,
  pageCount: number,
  paper: PaperType,
): CoverDimensions {
  const spine = spineWidth(pageCount, paper);
  const width = 2 * trim.width + spine + COVER_BLEED_TOTAL;
  const height = trim.height + COVER_BLEED_TOTAL;
  return {
    width,
    height,
    spine,
    spineStart: BLEED + trim.width,
    spineEnd: BLEED + trim.width + spine,
    bleed: BLEED,
  };
}

/** KDP reserves this box, bottom-right of the back cover, for the barcode. */
export const BARCODE_ZONE = { width: 2, height: 1.2, marginFromTrim: 0.25 };

/** Interior page box, including bleed if the book bleeds. */
export function pageBox(trim: TrimSize, bleed: boolean) {
  return {
    width: trim.width + (bleed ? BLEED : 0),
    height: trim.height + (bleed ? 2 * BLEED : 0),
  };
}

/** KDP requires an even final page count; a book is padded with blanks. */
export function padToEven(pageCount: number): number {
  return pageCount % 2 === 0 ? pageCount : pageCount + 1;
}

export const MIN_COVER_DPI = 300;

/** Effective DPI of an image placed at a given physical size. */
export function effectiveDpi(pixels: number, inches: number): number {
  if (inches <= 0) return 0;
  return pixels / inches;
}

export type Margins = { inside: number; outside: number; top: number; bottom: number };

export type ValidationIssue = {
  id: string;
  level: 'error' | 'warning' | 'info';
  message: string;
  fix?: string;
};

export type MarginCheckInput = {
  margins: Margins;
  pageCount: number;
  bleed: boolean;
};

/** Margin compliance for the current page count. Re-run whenever pages change. */
export function checkMargins({ margins, pageCount, bleed }: MarginCheckInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const minInside = minInsideMargin(pageCount);
  const minOutside = minOutsideMargin(bleed);

  if (margins.inside < minInside - 1e-9) {
    issues.push({
      id: 'margin-inside',
      level: 'error',
      message: `Inside (gutter) margin is ${fmtIn(margins.inside)} but KDP requires at least ${fmtIn(minInside)} at ${pageCount} pages.`,
      fix: `Raise the inside margin to ${fmtIn(minInside)}.`,
    });
  }
  for (const edge of ['outside', 'top', 'bottom'] as const) {
    if (margins[edge] < minOutside - 1e-9) {
      issues.push({
        id: `margin-${edge}`,
        level: 'error',
        message: `${cap(edge)} margin is ${fmtIn(margins[edge])} but the minimum ${bleed ? 'with bleed' : 'without bleed'} is ${fmtIn(minOutside)}.`,
        fix: `Raise the ${edge} margin to ${fmtIn(minOutside)}.`,
      });
    }
  }
  // A gutter that is legal now but will not be legal one tier up is worth saying.
  const nextTier = GUTTER_TABLE.find((r) => r.minPages > pageCount);
  if (nextTier && margins.inside < nextTier.inside && pageCount > nextTier.minPages - 20) {
    issues.push({
      id: 'margin-inside-near-tier',
      level: 'warning',
      message: `At ${nextTier.minPages} pages the required gutter rises to ${fmtIn(nextTier.inside)}; you are ${nextTier.minPages - pageCount} pages away.`,
      fix: `Consider setting the inside margin to ${fmtIn(nextTier.inside)} now.`,
    });
  }
  return issues;
}

export function checkPageCount(pageCount: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (pageCount % 2 !== 0) {
    issues.push({
      id: 'page-parity',
      level: 'warning',
      message: `The book is ${pageCount} pages. KDP requires an even page count.`,
      fix: 'A blank page is appended automatically on export.',
    });
  }
  if (pageCount < MIN_PAGES) {
    issues.push({
      id: 'page-min',
      level: 'error',
      message: `The book is ${pageCount} pages. KDP's minimum is ${MIN_PAGES}.`,
      fix: 'Add more poems or more front/back matter.',
    });
  }
  if (pageCount > MAX_PAGES) {
    issues.push({
      id: 'page-max',
      level: 'error',
      message: `The book is ${pageCount} pages. KDP's maximum is ${MAX_PAGES}.`,
      fix: 'Split the collection into two volumes.',
    });
  }
  return issues;
}

function fmtIn(v: number): string {
  return `${Number(v.toFixed(4))}"`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const inchesToPt = (inches: number) => inches * PT_PER_INCH;
export const ptToInches = (pt: number) => pt / PT_PER_INCH;

/**
 * The same lengths in CSS pixels, for boards that are stated in them.
 *
 * A pixel is three quarters of a point exactly, so neither direction loses
 * anything: Instagram's 1080 is 810 points and 810 points is 1080 again.
 * Points remain what is stored — see `docs/DECISIONS.md` — and these are only
 * for saying a size out loud on a board whose own size was given in pixels.
 */
export const PT_PER_PX = 0.75;
export const pxToPt = (px: number) => px * PT_PER_PX;
export const ptToPx = (pt: number) => pt / PT_PER_PX;
