import type { CoverSticker } from '../types';
import type { CoverLayout } from '../render/coverLayout';
import { stickerBounds } from '../render/stickers';

/**
 * The arithmetic behind dragging a sticker around.
 *
 * All of it is pure and in inches, so the designer is left with pointer events
 * and the tests can check the hard parts — which are the snapping and the
 * aspect-locked resize — without a browser.
 */

/** How close, in inches on the page, a line has to be to catch. */
/** Points. Was six hundredths of an inch, which is what this still is. */
export const SNAP_DISTANCE = 4.32;

export type Guide = { axis: 'x' | 'y'; at: number };

/**
 * Every line worth snapping to: the cover's own centres and trim edges, the
 * spine folds, and the edges and centres of the other stickers.
 *
 * The other stickers are what makes a row of badges line up, and they are the
 * reason this takes a list rather than just the layout.
 */
export function snapLines(
  layout: CoverLayout,
  others: CoverSticker[],
): { x: number[]; y: number[] } {
  // The layout's own points, not `dimensions`, which is KDP's figure in inches.
  const { bleed, width, height, folds, panels } = layout;
  const x = [
    bleed,
    width - bleed,
    width / 2,
    ...folds,
    panels.back.x + panels.back.width / 2,
    panels.front.x + panels.front.width / 2,
  ];
  const y = [bleed, height - bleed, height / 2];

  for (const other of others) {
    const box = stickerBounds(other);
    x.push(box.x, box.x + box.width / 2, box.x + box.width);
    y.push(box.y, box.y + box.height / 2, box.y + box.height);
  }
  return { x, y };
}

/**
 * Moves a sticker, letting its edges and centre catch on nearby lines.
 *
 * Each axis is decided on its own: a sticker can be centred horizontally while
 * its top edge lines up with something else, which is what anyone arranging
 * things expects and what treating the two together would prevent.
 */
export function snapMove(
  sticker: CoverSticker,
  lines: { x: number[]; y: number[] },
  distance = SNAP_DISTANCE,
): { x: number; y: number; guides: Guide[] } {
  const box = stickerBounds(sticker);
  const guides: Guide[] = [];

  const best = (axis: 'x' | 'y', start: number, size: number, candidates: number[]) => {
    // The three points on this edge that are worth lining up.
    const points = [start, start + size / 2, start + size];
    let shift = 0;
    let closest = distance;
    let at: number | null = null;
    for (const point of points) {
      for (const candidate of candidates) {
        const gap = candidate - point;
        if (Math.abs(gap) < closest) {
          closest = Math.abs(gap);
          shift = gap;
          at = candidate;
        }
      }
    }
    if (at !== null) guides.push({ axis, at });
    return shift;
  };

  return {
    x: sticker.x + best('x', box.x, box.width, lines.x),
    y: sticker.y + best('y', box.y, box.height, lines.y),
    guides,
  };
}

export type Corner = 'nw' | 'ne' | 'se' | 'sw';

/**
 * Resizes from a corner, keeping the opposite corner exactly where it is.
 *
 * Aspect is locked unless asked otherwise, because a stretched photograph is
 * almost never what anyone meant — and when it is, holding Shift says so.
 * The lock follows whichever way the pointer moved further, so dragging mostly
 * sideways scales by the width and mostly downwards by the height.
 */
export function resizeFromCorner(
  sticker: CoverSticker,
  corner: Corner,
  deltaX: number,
  deltaY: number,
  // Points. Was a fifth of an inch, which is what this still is.
  { free = false, minimum = 14.4 }: { free?: boolean; minimum?: number } = {},
): Pick<CoverSticker, 'x' | 'y' | 'width' | 'height'> {
  const west = corner === 'nw' || corner === 'sw';
  const north = corner === 'nw' || corner === 'ne';

  let width = sticker.width + (west ? -deltaX : deltaX);
  let height = sticker.height + (north ? -deltaY : deltaY);

  if (!free) {
    const ratio = sticker.width / sticker.height;
    // Follow the axis the pointer committed to, so the sticker does not fight
    // the hand that is dragging it.
    if (Math.abs(deltaX) > Math.abs(deltaY)) height = width / ratio;
    else width = height * ratio;
  }

  width = Math.max(minimum, width);
  height = Math.max(minimum, height);

  return {
    // The anchored corner does not move, so a west or north drag moves the
    // origin by exactly what the size gained.
    x: west ? sticker.x + sticker.width - width : sticker.x,
    y: north ? sticker.y + sticker.height - height : sticker.y,
    width: width,
    height: height,
  };
}

/** The angle from a sticker's centre to a point, in degrees clockwise from up. */
export function angleTo(sticker: CoverSticker, pointX: number, pointY: number): number {
  const centreX = sticker.x + sticker.width / 2;
  const centreY = sticker.y + sticker.height / 2;
  const degrees = (Math.atan2(pointY - centreY, pointX - centreX) * 180) / Math.PI + 90;
  return ((degrees % 360) + 360) % 360;
}

/** Rotation catches on the twelfths of a turn, which is where most stickers want to be. */
export function snapAngle(degrees: number, within = 4): number {
  const nearest = Math.round(degrees / 15) * 15;
  return Math.abs(nearest - degrees) <= within ? ((nearest % 360) + 360) % 360 : degrees;
}

/** Moves a sticker one place up or down the stack, without renumbering anything. */
export function restack(stickers: CoverSticker[], id: string, direction: 1 | -1): CoverSticker[] {
  const from = stickers.findIndex((s) => s.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= stickers.length) return stickers;
  const next = [...stickers];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
