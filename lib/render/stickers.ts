import { bendOf } from '../cover/bend';
import { MIN_COVER_DPI, ptToInches } from '../kdp';
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

/**
 * The rectangle a sticker occupies, ignoring any rotation.
 *
 * A bent one covers the box its arc sweeps out instead, which is a different
 * shape from the one it was placed in — taller, and usually wider, because the
 * outer edge of a bend is longer than the middle. Everything downstream, from
 * where the picture is drawn to whether it is about to cross the spine, reads
 * this one function, so all of it follows the bend without being told.
 */
export function stickerRect(sticker: CoverSticker): Rect {
  const bend = bendOf(sticker);
  if (!bend) {
    return { x: sticker.x, y: sticker.y, width: sticker.width, height: sticker.height };
  }
  return {
    x: sticker.x + bend.box.x,
    y: sticker.y + bend.box.y,
    width: bend.box.width,
    height: bend.box.height,
  };
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
  const rect = stickerRect(sticker);
  const radians = (sticker.rotate * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const width = rect.width * cos + rect.height * sin;
  const height = rect.width * sin + rect.height * cos;
  return {
    x: rect.x + rect.width / 2 - width / 2,
    y: rect.y + rect.height / 2 - height / 2,
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
  if (!sticker.width || !sticker.height) return 0;
  // Dots per *inch*, so the size has to come back out of points to ask it.
  const flat = Math.min(
    sticker.naturalWidth / ptToInches(sticker.width),
    sticker.naturalHeight / ptToInches(sticker.height),
  );
  // Bending pulls the outer edge longer than the picture was, and the same
  // pixels have to cover it. That edge is the softest part of the printed
  // result, so it is the one the reading has to be about.
  const bend = bendOf(sticker);
  return bend ? flat / bend.stretch : flat;
}

/**
 * Which picture to draw for a sticker.
 *
 * A bent one is a picture that does not exist until it is warped, and two
 * stickers may bend the same image differently, so it cannot be looked up by
 * the image it came from. Both the exporter that makes these and the renderer
 * that draws them ask here, so neither can use the wrong one.
 */
export function stickerImageKey(sticker: CoverSticker): string {
  return sticker.arc ? `bend:${sticker.id}` : sticker.assetId;
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
  // The layout's points, not `dimensions`, which is KDP's figure in inches.
  const { folds, barcode } = layout;

  if (stickerDpi(sticker) < MIN_COVER_DPI) warnings.push('soft');

  // The trim line, which is the bleed inset from every edge.
  const trim: Rect = {
    x: layout.bleed,
    y: layout.bleed,
    width: layout.width - 2 * layout.bleed,
    height: layout.height - 2 * layout.bleed,
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
