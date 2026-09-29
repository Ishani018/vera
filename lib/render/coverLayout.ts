import {
  BARCODE_ZONE,
  coverDimensions,
  getTrim,
  inchesToPt,
  type CoverDimensions,
} from '../kdp';
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

export type Rect = { x: number; y: number; width: number; height: number };

export type CoverLayout = {
  /** KDP's own figures, in inches, unconverted. */
  dimensions: CoverDimensions;
  /** The same size in points, which is what everything else here is in. */
  width: number;
  height: number;
  panels: Record<CoverPanel, Rect>;
  /** KDP's reserved barcode area, bottom-right of the back cover. */
  barcode: Rect;
  /** Fold positions, measured from the left edge. */
  folds: [number, number];
  bleed: number;
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
  const barcode: Rect = {
    x: back.x + back.width - pt(BARCODE_ZONE.marginFromTrim + BARCODE_ZONE.width),
    y: back.y + back.height - pt(BARCODE_ZONE.marginFromTrim + BARCODE_ZONE.height),
    width: pt(BARCODE_ZONE.width),
    height: pt(BARCODE_ZONE.height),
  };

  return {
    dimensions: d,
    width: pt(d.width),
    height: pt(d.height),
    panels,
    barcode,
    folds: [pt(d.spineStart), pt(d.spineEnd)],
    bleed: pt(d.bleed),
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
