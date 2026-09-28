import type { CoverSticker } from '../types';
import { MAX_SWEEP_DEGREES } from './curve';

/**
 * A picture bent around an arc, the way curved text is.
 *
 * Text can be bent by putting its letters on a path, because letters are
 * outlines and the renderer will happily turn each one. A photograph is a grid
 * of pixels and nothing in CSS, SVG or PDF will bend one, so this warps the
 * pixels: every pixel of the result is asked where it came from in the
 * original, which is exact everywhere and has no seams to hide — the strips a
 * mesh warp is usually built from always show their joins somewhere.
 *
 * The same arithmetic as the text curve. A picture keeps the length of its
 * middle line and the distance between its top and bottom edges, so bending it
 * neither stretches nor shrinks it; it just wraps it round.
 */

/**
 * How close the inner edge may come to the centre of the circle, as a share of
 * the picture's height. Bend a tall picture far enough and its inner edge would
 * reach the middle and fold through itself; this is where it stops instead.
 */
const MIN_INNER = 0.05;

export type Bend = {
  /** Radians actually achieved, which a tall picture may cut short. */
  sweep: number;
  up: boolean;
  /** The circle's centre, in inches from the unbent sticker's top-left corner. */
  cx: number;
  cy: number;
  rIn: number;
  rOut: number;
  /** The upright box the bent picture covers, from that same corner. */
  box: { x: number; y: number; width: number; height: number };
  /**
   * How far the outer edge is pulled out, which is where the pixels are
   * thinnest on the ground and so where the printed result is softest.
   */
  stretch: number;
};

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

const FULL = (MAX_SWEEP_DEGREES * Math.PI) / 180;

/** As far round as a picture of this shape can go before it folds in on itself. */
export function sweepLimit(widthIn: number, heightIn: number): number {
  if (heightIn <= 0) return FULL;
  return Math.min(FULL, widthIn / (heightIn * (0.5 + MIN_INNER)));
}

/** The geometry for a bent sticker, or null when it is flat. */
export function bendOf(sticker: CoverSticker): Bend | null {
  const arc = sticker.arc ?? 0;
  const width = sticker.widthIn;
  const height = sticker.heightIn;
  if (!arc || width <= 0 || height <= 0) return null;

  // The slider runs across what this particular picture can do rather than
  // across a fixed number of degrees.
  //
  // How far a picture can bend depends on its shape: the middle line keeps its
  // length, so it sets the radius, and the radius cannot fall below half the
  // height without the inner edge folding through the centre. A square runs out
  // of room at about a quarter of the way along a fixed scale and a long thin
  // strip never does — so a fixed scale would leave most stickers with a slider
  // that stopped doing anything halfway. Every position here moves the picture,
  // and the panel says what it worked out to in degrees.
  const sweep = (clamp(Math.abs(arc), 0, 100) / 100) * sweepLimit(width, height);
  if (sweep <= 0) return null;

  const up = arc > 0;
  const middle = width / sweep;
  const rIn = middle - height / 2;
  const rOut = middle + height / 2;

  const half = sweep / 2;
  const past = half >= Math.PI / 2;
  const reach = past ? rOut : rOut * Math.sin(half);
  // The far edge is the outer one; the near edge is the inner one until the
  // bend passes a quarter turn and the outer edge comes back round.
  const near = (past ? rOut : rIn) * Math.cos(half);
  const low = up ? -rOut : near;
  const high = up ? -near : rOut;

  const boxWidth = 2 * reach;
  const boxHeight = high - low;

  return {
    sweep,
    up,
    cx: width / 2,
    cy: height / 2 - (low + high) / 2,
    rIn,
    rOut,
    box: {
      x: width / 2 - reach,
      y: height / 2 - boxHeight / 2,
      width: boxWidth,
      height: boxHeight,
    },
    stretch: rOut / middle,
  };
}

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

/**
 * The bent picture, worked out one output pixel at a time.
 *
 * Backwards, from the result to the source, because that is the direction that
 * leaves no gaps: every pixel of the output gets exactly one answer. Going
 * forwards from the source would scatter pixels across the output and leave
 * holes between them wherever the picture had been stretched.
 */
export function warp(source: Pixels, bend: Bend, out: { width: number; height: number }): Pixels {
  const data = new Uint8ClampedArray(out.width * out.height * 4);
  const { box, cx, cy, rIn, rOut, sweep, up } = bend;
  const thickness = rOut - rIn;
  const sw = source.width;
  const sh = source.height;

  for (let py = 0; py < out.height; py += 1) {
    const y = box.y + ((py + 0.5) / out.height) * box.height - cy;
    for (let px = 0; px < out.width; px += 1) {
      const x = box.x + ((px + 0.5) / out.width) * box.width - cx;

      const radius = Math.hypot(x, y);
      // Measured from straight up for an arch and straight down for a hang, so
      // that the middle of the picture stays the middle either way.
      const angle = up ? Math.atan2(x, -y) : Math.atan2(x, y);
      const u = angle / sweep + 0.5;
      const v = up ? (rOut - radius) / thickness : (radius - rIn) / thickness;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;

      sample(source, u * (sw - 1), v * (sh - 1), data, (py * out.width + px) * 4);
    }
  }

  return { data, width: out.width, height: out.height };
}

/** Bilinear, so a bent edge is smooth rather than a staircase. */
function sample(
  source: Pixels,
  sx: number,
  sy: number,
  out: Uint8ClampedArray,
  at: number,
): void {
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(x0 + 1, source.width - 1);
  const y1 = Math.min(y0 + 1, source.height - 1);
  const fx = sx - x0;
  const fy = sy - y0;

  const a = (y0 * source.width + x0) * 4;
  const b = (y0 * source.width + x1) * 4;
  const c = (y1 * source.width + x0) * 4;
  const d = (y1 * source.width + x1) * 4;

  for (let channel = 0; channel < 4; channel += 1) {
    const top = source.data[a + channel] * (1 - fx) + source.data[b + channel] * fx;
    const bottom = source.data[c + channel] * (1 - fx) + source.data[d + channel] * fx;
    out[at + channel] = top * (1 - fy) + bottom * fy;
  }
}

/** Pixels across the widest part of the result, and how many down. */
export function warpSize(
  sticker: CoverSticker,
  bend: Bend,
  sourceWidth: number,
  limit = 4096,
): { width: number; height: number } {
  // Dense enough that the outer edge, where the picture is pulled thinnest, is
  // still carrying every pixel the original had.
  const density = sourceWidth / sticker.widthIn;
  const width = Math.max(1, Math.round(bend.box.width * density));
  const height = Math.max(1, Math.round(bend.box.height * density));
  const over = Math.max(width, height) / limit;
  if (over <= 1) return { width, height };
  return {
    width: Math.max(1, Math.round(width / over)),
    height: Math.max(1, Math.round(height / over)),
  };
}
