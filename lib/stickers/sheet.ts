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
