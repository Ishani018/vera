import { toLab } from '../lineart/pipeline';
import type { Bitmap } from '../lineart/pipeline';
import { parseColour } from '../lineart/mask';
import type { Rgb } from '../lineart/mask';
import type { Paint } from './colour';

/**
 * Changing a colour that is already there.
 *
 * Two places need it and they are not the same place. The **colour layer** is
 * flat areas somebody filled, so replacing one is exact: find the pixels that
 * are that colour and make them the other one. A **kept picture** is a
 * photograph or a painting, where "the red" is a thousand reds — so matching
 * has a tolerance, and it is measured in Lab, because a tolerance in RGB
 * decides that navy and black are closer than two pinks.
 *
 * Both are pure and deterministic. The same swap on the same picture gives the
 * same bytes every time, which is what lets it be stored as a setting and
 * re-applied at export size rather than baked into the preview.
 */

export type Swap = {
  /** What to look for, as a hex colour. */
  from: string;
  /** What to put there. */
  to: string;
  /** Lab distance. 0 is exact; about 20 catches one shade and its shading. */
  tolerance: number;
};

/** How far apart two colours look, rather than how far apart their numbers are. */
export function labDistance(a: Rgb, b: Rgb): number {
  const pair = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([a.r, a.g, a.b, 255, b.r, b.g, b.b, 255]),
  };
  const lab = toLab(pair);
  const dl = lab.l[0] - lab.l[1];
  const da = lab.a[0] - lab.a[1];
  const db = lab.b[0] - lab.b[1];
  return Math.sqrt(dl * dl + da * da + db * db);
}

/**
 * Which pixels of the colour layer count as "that colour".
 *
 * Transparent pixels never match, whatever their channels happen to hold: a
 * pixel that has not been painted has no colour to replace, and an erased one
 * keeps whatever was underneath in its RGB out of sheer arithmetic.
 */
export function matchingInPaint(paint: Paint, target: Rgb, tolerance: number): number[] {
  const out: number[] = [];
  const { data } = paint;
  for (let p = 0, i = 0; i < data.length; p++, i += 4) {
    if (data[i + 3] === 0) continue;
    const here = { r: data[i], g: data[i + 1], b: data[i + 2] };
    if (tolerance <= 0) {
      if (here.r === target.r && here.g === target.g && here.b === target.b) out.push(p);
    } else if (labDistance(here, target) <= tolerance) {
      out.push(p);
    }
  }
  return out;
}

/** The colour of one pixel of a picture, or null where there is nothing. */
export function sampleAt(bitmap: Bitmap | Paint, x: number, y: number): Rgb | null {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= bitmap.width || py >= bitmap.height) return null;
  const i = (py * bitmap.width + px) * 4;
  if (bitmap.data[i + 3] === 0) return null;
  return { r: bitmap.data[i], g: bitmap.data[i + 1], b: bitmap.data[i + 2] };
}

export const toHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/**
 * A list of swaps applied to a picture, in order.
 *
 * In order, and that matters: swapping red for blue and then blue for green
 * makes the original red green, which is what anyone reading the list top to
 * bottom would expect. Each pixel is decided once against the *original*
 * colour of the step before, so the list is a recipe rather than a pile.
 *
 * Returns the picture unchanged when there is nothing to do, so a preview that
 * has no swaps costs nothing.
 */
export function applySwaps(source: Bitmap, swaps: Swap[]): Bitmap {
  if (!swaps.length) return source;
  const data = new Uint8ClampedArray(source.data);
  const steps = swaps.map((swap) => ({
    from: parseColour(swap.from),
    to: parseColour(swap.to),
    tolerance: Math.max(0, swap.tolerance),
  }));

  // One cache per run. A photograph has far fewer distinct colours than pixels,
  // and a Lab conversion per pixel per swap is the difference between an
  // instant preview and a two-second one.
  const decided = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let answer = decided.get(key);
    if (answer === undefined) {
      let here = { r: data[i], g: data[i + 1], b: data[i + 2] };
      for (const step of steps) {
        const hit =
          step.tolerance <= 0
            ? here.r === step.from.r && here.g === step.from.g && here.b === step.from.b
            : labDistance(here, step.from) <= step.tolerance;
        if (hit) here = step.to;
      }
      answer = (here.r << 16) | (here.g << 8) | here.b;
      decided.set(key, answer);
    }
    data[i] = (answer >> 16) & 255;
    data[i + 1] = (answer >> 8) & 255;
    data[i + 2] = answer & 255;
  }
  return { width: source.width, height: source.height, data };
}
