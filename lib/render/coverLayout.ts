import { BARCODE_ZONE, coverDimensions, getTrim, type CoverDimensions } from '../kdp';
import type { CoverPanel, CoverTextBox, Project } from '../types';

/**
 * Geometry for the wraparound cover, in inches, measured from the top-left of
 * the cover PDF (bleed included). The designer scales these by a pixels-per-inch
 * factor and the export writes them out as inches, so what is dragged on screen
 * is what lands in the PDF.
 */

export type Rect = { x: number; y: number; width: number; height: number };

export type CoverLayout = {
  dimensions: CoverDimensions;
  panels: Record<CoverPanel, Rect>;
  /** KDP's reserved barcode area, bottom-right of the back cover. */
  barcode: Rect;
  /** Fold positions, measured from the left edge. */
  folds: [number, number];
  bleed: number;
};

export function coverLayout(project: Project, pageCount: number): CoverLayout {
  const trim = getTrim(project.trim.trimId);
  const d = coverDimensions(trim, pageCount, project.trim.paper);

  const panels: Record<CoverPanel, Rect> = {
    back: { x: d.bleed, y: d.bleed, width: trim.width, height: trim.height },
    spine: { x: d.spineStart, y: d.bleed, width: d.spine, height: trim.height },
    front: { x: d.spineEnd, y: d.bleed, width: trim.width, height: trim.height },
  };

  const back = panels.back;
  const barcode: Rect = {
    x: back.x + back.width - BARCODE_ZONE.marginFromTrim - BARCODE_ZONE.width,
    y: back.y + back.height - BARCODE_ZONE.marginFromTrim - BARCODE_ZONE.height,
    width: BARCODE_ZONE.width,
    height: BARCODE_ZONE.height,
  };

  return {
    dimensions: d,
    panels,
    barcode,
    folds: [d.spineStart, d.spineEnd],
    bleed: d.bleed,
  };
}

/** Absolute position of a text box, from the top-left of the whole cover. */
export function textBoxRect(box: CoverTextBox, layout: CoverLayout): Rect {
  const panel = layout.panels[box.panel];
  return {
    x: panel.x + box.x,
    y: panel.y + box.y,
    width: box.widthIn,
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
