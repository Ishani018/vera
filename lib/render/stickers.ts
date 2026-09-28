import { MIN_COVER_DPI } from '../kdp';
import type { CoverSticker } from '../types';
import type { CoverLayout, Rect } from './coverLayout';

/**
 * What a sticker is doing on the cover, in the terms someone placing one cares
 * about: how sharp it will print, and whether it is about to be cut off,
 * folded down the middle, or covered by a barcode sticker.
 *
 * Out here rather than in the designer because the answers are arithmetic with
 * a right answer, and because the PDF and the screen must agree about them.
 */

/** The rectangle a sticker occupies, ignoring any rotation. */
export function stickerRect(sticker: CoverSticker): Rect {
  return { x: sticker.x, y: sticker.y, width: sticker.widthIn, height: sticker.heightIn };
}

/**
 * The area a sticker covers once it has been turned.
 *
 * A turned rectangle is not a rectangle, and the overlap checks below want one,
 * so this is the smallest upright box that contains it. Erring outwards is the
 * right way to err: a warning about a corner that only just clears the trim
 * costs a glance, and a missing one costs a print run.
 */
export function stickerBounds(sticker: CoverSticker): Rect {
  const radians = (sticker.rotate * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const width = sticker.widthIn * cos + sticker.heightIn * sin;
  const height = sticker.widthIn * sin + sticker.heightIn * cos;
  return {
    x: sticker.x + sticker.widthIn / 2 - width / 2,
    y: sticker.y + sticker.heightIn / 2 - height / 2,
    width,
    height,
  };
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/**
 * How sharp a sticker will print.
 *
 * The limit is whichever way round the picture is being stretched further, so
 * the reading is the smaller of the two — a wide photograph squeezed into a
 * tall box is as soft as its worst axis, not as sharp as its best.
 */
export function stickerDpi(sticker: CoverSticker): number {
  if (!sticker.widthIn || !sticker.heightIn) return 0;
  return Math.min(
    sticker.naturalWidth / sticker.widthIn,
    sticker.naturalHeight / sticker.heightIn,
  );
}

export type StickerWarning =
  | 'soft'
  | 'off-the-trim'
  | 'across-the-spine'
  | 'under-the-barcode';

/**
 * Everything worth saying about where a sticker has been put.
 *
 * None of it stops anyone: a picture running off the trimmed edge is a
 * perfectly ordinary design, and a sticker may cross the spine on purpose.
 * They are things to have been told, not rules.
 */
export function stickerWarnings(sticker: CoverSticker, layout: CoverLayout): StickerWarning[] {
  const warnings: StickerWarning[] = [];
  const box = stickerBounds(sticker);
  const { dimensions: d, folds, barcode } = layout;

  if (stickerDpi(sticker) < MIN_COVER_DPI) warnings.push('soft');

  // The trim line, which is the bleed inset from every edge.
  const trim: Rect = {
    x: d.bleed,
    y: d.bleed,
    width: d.width - 2 * d.bleed,
    height: d.height - 2 * d.bleed,
  };
  if (
    box.x < trim.x ||
    box.y < trim.y ||
    box.x + box.width > trim.x + trim.width ||
    box.y + box.height > trim.y + trim.height
  ) {
    warnings.push('off-the-trim');
  }

  // A sticker straddling a fold is bent in half by the binding.
  if (folds.some((fold) => box.x < fold && box.x + box.width > fold)) {
    warnings.push('across-the-spine');
  }

  if (overlaps(box, barcode)) warnings.push('under-the-barcode');

  return warnings;
}

export const WARNING_TEXT: Record<StickerWarning, string> = {
  soft: `Under ${MIN_COVER_DPI} DPI at this size — it will print soft.`,
  'off-the-trim': 'Part of this runs past the trim line and will be cut off.',
  'across-the-spine': 'This crosses the spine, so it will be folded down the middle.',
  'under-the-barcode': 'This is under the area KDP prints a barcode over.',
};
