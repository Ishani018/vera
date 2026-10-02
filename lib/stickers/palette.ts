import type { Bitmap } from '../lineart/pipeline';
import type { Rgb } from '../lineart/mask';
import { labDistance, toHex } from './recolour';

/**
 * The colours a picture is actually made of.
 *
 * The colour well opens on a fixed row of pleasant colours, which is the wrong
 * row: somebody colouring in their own drawing of their own cat wants the
 * cat's colours, and matching a ginger by eye in a colour wheel takes four
 * goes. Reading them off the picture turns that into one click.
 *
 * Deliberately crude. A proper median cut would be better at picking out the
 * one red flower in a green field, and it would also run for a second on the
 * main thread every time a picture changed. Buckets of 32 levels per channel,
 * counted and then thinned out by distance, give eight colours that a person
 * recognises as theirs, in a few milliseconds.
 */

/** How far apart two swatches must be before both are worth offering. */
const APART = 14;

/** Pixels this transparent are the background, not a colour. */
const SOLID = 160;

export function paletteOf(picture: Bitmap, count = 8): string[] {
  const bucket = new Map<number, { r: number; g: number; b: number; n: number }>();
  const { data } = picture;

  /*
    Every fourth pixel on each axis. A thousand-pixel sticker is a million
    reads otherwise, and the sixteenth of it that this looks at lands on the
    same handful of colours — the answer does not change, it just arrives.
  */
  const step = Math.max(1, Math.round(Math.min(picture.width, picture.height) / 250));
  for (let y = 0; y < picture.height; y += step) {
    for (let x = 0; x < picture.width; x += step) {
      const i = (y * picture.width + x) * 4;
      if (data[i + 3] < SOLID) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
      const seen = bucket.get(key);
      if (seen) {
        seen.r += r;
        seen.g += g;
        seen.b += b;
        seen.n += 1;
      } else {
        bucket.set(key, { r, g, b, n: 1 });
      }
    }
  }

  const ordered = [...bucket.values()]
    .sort((a, b) => b.n - a.n)
    .map((cell): Rgb => ({
      r: Math.round(cell.r / cell.n),
      g: Math.round(cell.g / cell.n),
      b: Math.round(cell.b / cell.n),
    }));

  const chosen: Rgb[] = [];
  for (const colour of ordered) {
    if (chosen.length >= count) break;
    if (chosen.every((already) => labDistance(already, colour) > APART)) chosen.push(colour);
  }
  return chosen.map(toHex);
}

/**
 * The same, from a file the person chose.
 *
 * Shrunk to 200px on the long edge first. The colours of a picture do not
 * change when it is made smaller, and a four-megapixel photograph read at full
 * size stalls the screen for long enough to notice.
 */
export async function paletteOfBlob(blob: Blob, count = 8): Promise<string[]> {
  const decoded = await createImageBitmap(blob);
  const scale = Math.min(1, 200 / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    decoded.close();
    return [];
  }
  context.drawImage(decoded, 0, 0, width, height);
  decoded.close();
  const image = context.getImageData(0, 0, width, height);
  return paletteOf({ width, height, data: image.data }, count);
}
