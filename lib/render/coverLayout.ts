import {
  BARCODE_ZONE,
  coverDimensions,
  getTrim,
  inchesToPt,
  type CoverDimensions,
} from '../kdp';
import type { Board, Guide, Rect } from '../board';
import { trimOf } from '../board';
import type { CoverPanel, CoverTextBox, CoverableBook } from '../types';

/**
 * Geometry for the wraparound cover, in points, measured from the top-left of
 * the cover PDF (bleed included). The designer scales these by a
 * pixels-per-point factor and the export writes them out as points, so what is
 * dragged on screen is what lands in the PDF.
 *
 * Points, because this coordinate space will have to hold a 1200x628 pixel
 * board as readily as an 8.5 inch one, and points are exact for both. KDP's own
 * numbers stay in inches — they are inches — and are converted here, at the one
 * boundary between the two.
 */

export type { Rect } from '../board';

/**
 * A cover is a board with three panels and its own marks on it.
 *
 * `barcode` and `folds` are also in `guides`, built from the same numbers in
 * the one place below. They are kept as named fields because a cover really
 * does have exactly one barcode reserve and exactly two folds, and code about
 * covers should be able to say so.
 */
export type CoverLayout = Board<CoverPanel> & {
  /** KDP's own figures, in inches, unconverted. */
  dimensions: CoverDimensions;
  /** KDP's reserved barcode area, bottom-right of the back cover. */
  barcode: Rect;
  /** Fold positions, measured from the left edge. */
  folds: [number, number];
};

export function coverLayout(project: CoverableBook, pageCount: number): CoverLayout {
  const trim = getTrim(project.trim.trimId);
  const d = coverDimensions(trim, pageCount, project.trim.paper);

  const pt = inchesToPt;
  const panels: Record<CoverPanel, Rect> = {
    back: { x: pt(d.bleed), y: pt(d.bleed), width: pt(trim.width), height: pt(trim.height) },
    spine: { x: pt(d.spineStart), y: pt(d.bleed), width: pt(d.spine), height: pt(trim.height) },
    front: { x: pt(d.spineEnd), y: pt(d.bleed), width: pt(trim.width), height: pt(trim.height) },
  };

  const back = panels.back;
  const safeTop = trimOf({ width: pt(d.width), height: pt(d.height), bleed: pt(d.bleed) }).y;
  const barcode: Rect = {
    x: back.x + back.width - pt(BARCODE_ZONE.marginFromTrim + BARCODE_ZONE.width),
    y: back.y + back.height - pt(BARCODE_ZONE.marginFromTrim + BARCODE_ZONE.height),
    width: pt(BARCODE_ZONE.width),
    height: pt(BARCODE_ZONE.height),
  };

  const width = pt(d.width);
  const height = pt(d.height);
  const bleed = pt(d.bleed);
  const folds: [number, number] = [pt(d.spineStart), pt(d.spineEnd)];

  // KDP asks for a quarter inch inside the trim on a cover.
  const safeInset = pt(0.25);
  const safe = (panel: Rect, label: string): Guide => ({
    kind: 'safe',
    label,
    rect: {
      x: panel.x + safeInset,
      y: Math.max(safeTop, panel.y) + safeInset,
      width: panel.width - 2 * safeInset,
      height: panel.height - 2 * safeInset,
    },
  });

  return {
    dimensions: d,
    width,
    height,
    bleed,
    panels,
    barcode,
    folds,
    guides: [
      safe(panels.back, 'the back cover'),
      safe(panels.front, 'the front cover'),
      { kind: 'fold', label: 'the spine', axis: 'x', at: folds[0] },
      { kind: 'fold', label: 'the spine', axis: 'x', at: folds[1] },
      { kind: 'reserved', label: "KDP's barcode", rect: barcode },
    ],
  };
}

/** Absolute position of a text box, from the top-left of the whole cover. */
export function textBoxRect(box: CoverTextBox, layout: CoverLayout): Rect {
  const panel = layout.panels[box.panel];
  return {
    x: panel.x + box.x,
    y: panel.y + box.y,
    width: box.width,
    height: 0,
  };
}

/** True when a box overlaps the area KDP reserves for the barcode. */
export function collidesWithBarcode(
  box: CoverTextBox,
  layout: CoverLayout,
  estimatedHeightIn: number,
): boolean {
  if (box.panel !== 'back') return false;
  const r = textBoxRect(box, layout);
  const b = layout.barcode;
  return (
    r.x < b.x + b.width &&
    r.x + r.width > b.x &&
    r.y < b.y + b.height &&
    r.y + estimatedHeightIn > b.y
  );
}

/**
 * Spine text is only worth setting once the spine is wide enough to hold it.
 * KDP will not print spine text below 0.0625" (about 25 pages of cream stock).
 */
export const MIN_SPINE_TEXT_WIDTH = 0.0625;

export function spineTooThinForText(layout: CoverLayout): boolean {
  return layout.dimensions.spine < MIN_SPINE_TEXT_WIDTH;
}
