/**
 * Several stickers, arranged on a sheet of paper.
 *
 * Pure arithmetic: given a page, some margins, a gap and a list of shapes, it
 * says where each one goes. Nothing here draws anything or knows what a canvas
 * is, so the packing can be checked without one — and the same arithmetic
 * serves the preview and the export, which is what stops the file differing
 * from the picture of it.
 *
 * Everything is in inches until the last moment, because that is what paper is
 * sold in and what a printer's margins are quoted in. Pixels arrive only when a
 * resolution is chosen.
 */

export type Page = { id: string; name: string; width: number; height: number };

export const PAGES: Page[] = [
  { id: 'letter', name: 'US Letter', width: 8.5, height: 11 },
  { id: 'a4', name: 'A4', width: 8.27, height: 11.69 },
];

export const pageById = (id: string): Page | null => PAGES.find((p) => p.id === id) ?? null;

/** What a sticker is, as far as a sheet is concerned. */
export type Piece = { id: string; aspect: number };

export type SheetSettings = {
  pageId: string;
  /** Inches of paper left blank at every edge. */
  margin: number;
  /** Inches between one sticker and the next. */
  gap: number;
  /** How wide each sticker is on the paper, in inches. */
  stickerWidth: number;
  dpi: number;
  cutLines: boolean;
};

export const DEFAULT_SHEET: SheetSettings = {
  pageId: 'letter',
  // A quarter inch: inside what every consumer printer can reach, and enough
  // that a sheet fed slightly crooked does not lose a sticker off the edge.
  margin: 0.25,
  gap: 0.125,
  stickerWidth: 2,
  dpi: 300,
  cutLines: true,
};

export type Placed = {
  id: string;
  /** Inches from the top-left of the paper. */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Sheet = {
  page: Page;
  /** Every sticker that fitted, in reading order. */
  placed: Placed[];
  /** How many did not fit on this sheet. */
  overflow: number;
  /** How many fit on one sheet in all, whatever was asked for. */
  capacity: number;
  widthPx: number;
  heightPx: number;
};

/**
 * Shelf packing, which is the right amount of cleverness for this.
 *
 * Left to right until the row is full, then down by the tallest thing in it.
 * Stickers on a sheet are all the same width by design, so anything fancier
 * would win nothing — and rows a person can see are rows a person can cut.
 */
export function layOutSheet(pieces: Piece[], settings: SheetSettings): Sheet {
  const page = pageById(settings.pageId) ?? PAGES[0];
  const margin = Math.max(0, settings.margin);
  const gap = Math.max(0, settings.gap);
  const width = Math.max(0.1, settings.stickerWidth);

  const room = {
    x: margin,
    y: margin,
    width: page.width - 2 * margin,
    height: page.height - 2 * margin,
  };

  const placed: Placed[] = [];
  let x = room.x;
  let y = room.y;
  let rowHeight = 0;
  let overflow = 0;
  let full = false;

  for (const piece of pieces) {
    const height = width / Math.max(0.01, piece.aspect);
    if (full || width > room.width || height > room.height) {
      overflow++;
      continue;
    }
    // Wrap when this one would cross the right-hand margin.
    if (x > room.x && x + width > room.x + room.width + 1e-9) {
      x = room.x;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    if (y + height > room.y + room.height + 1e-9) {
      // No room below either: everything after this is overflow too, so that a
      // tall one late in the list cannot let a short one jump ahead of it.
      full = true;
      overflow++;
      continue;
    }
    placed.push({ id: piece.id, x, y, width, height });
    x += width + gap;
    rowHeight = Math.max(rowHeight, height);
  }

  return {
    page,
    placed,
    overflow,
    capacity: placed.length,
    widthPx: Math.round(page.width * settings.dpi),
    heightPx: Math.round(page.height * settings.dpi),
  };
}

/**
 * How many squares of a given width fit on a sheet, for the reading before
 * anyone has chosen anything.
 */
export function capacityFor(settings: SheetSettings, aspect = 1): number {
  const many = Array.from({ length: 400 }, (_, i) => ({ id: String(i), aspect }));
  return layOutSheet(many, settings).placed.length;
}

/** Inches to pixels at the sheet's resolution, rounded once and consistently. */
export const atDpi = (inches: number, dpi: number): number => Math.round(inches * dpi);

/* ------------------------------------------------------------------- units */

/**
 * Which units a page is thought about in.
 *
 * A4 is a metric page — it is 210 by 297 mm, and 8.27 inches is a rounding of
 * that, not how anybody describes it. Quoting a margin on A4 in hundredths of
 * an inch is asking somebody to convert in their head to check it against a
 * printer manual written in millimetres. Letter is the other way round.
 *
 * The stored numbers stay in inches throughout. This is about what is shown.
 */
export const METRIC_PAGES = new Set(['a4']);

export type Units = 'in' | 'mm';

export const unitsFor = (pageId: string): Units => (METRIC_PAGES.has(pageId) ? 'mm' : 'in');

export const MM_PER_INCH = 25.4;

export const toUnits = (inches: number, units: Units): number =>
  units === 'mm' ? inches * MM_PER_INCH : inches;

export const fromUnits = (value: number, units: Units): number =>
  units === 'mm' ? value / MM_PER_INCH : value;

/**
 * A measurement as it should be read out.
 *
 * Millimetres to one decimal and inches to two: a tenth of a millimetre is
 * already finer than any home printer places paper, and a hundredth of an inch
 * is the same thing in the other system. More digits would be false precision
 * in both.
 */
export function readable(inches: number, units: Units): string {
  const value = toUnits(inches, units);
  return units === 'mm' ? `${roundTo(value, 1)} mm` : `${roundTo(value, 2)} in`;
}

/**
 * Rounding that does not depend on how a number happens to be stored.
 *
 * A quarter inch is 6.35 mm, and `(6.35).toFixed(1)` is "6.3": the nearest
 * double to 6.35 is a hair below it, so the half rounds down. The nudge is
 * relative and twelve orders of magnitude smaller than any measurement here,
 * so it moves nothing except a value sitting exactly on a half.
 */
export function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor * (1 + Number.EPSILON * 4)) / factor;
}

/**
 * The steps a slider in these units should take, as whole numbers.
 *
 * Sliders here count in whole steps and convert, so that dragging one lands on
 * round numbers in the units on screen rather than on 0.37 mm.
 */
export const STEP = { in: 0.01, mm: 0.5 } as const;

export const toSteps = (inches: number, units: Units): number =>
  Math.round(toUnits(inches, units) / STEP[units]);

export const fromSteps = (steps: number, units: Units): number =>
  fromUnits(steps * STEP[units], units);
