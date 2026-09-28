'use client';

import { bendOf, warp, warpSize, type Bend } from './bend';
import type { CoverSticker } from '../types';

/**
 * Bending an actual picture, as opposed to working out where it goes.
 *
 * The warp itself is arithmetic on a typed array and lives next door with its
 * tests; this is the part that has to touch a canvas, which is also the part
 * that cannot be tested without a browser. Kept apart so the arithmetic can be.
 */

/** Big enough for a whole cover at 300 DPI, small enough to put in a PDF. */
const EXPORT_LIMIT = 4096;

/**
 * Decoded sources, kept because a slider asks for the same one sixty times a
 * second and decoding a three-thousand-pixel painting each time is the only
 * part of this that is slow. Warping from it is not.
 */
const sources = new Map<string, ImageData>();
const results = new Map<string, string>();

function remember<T>(store: Map<string, T>, key: string, value: T, keep: number): T {
  if (store.size >= keep) store.clear();
  store.set(key, value);
  return value;
}

async function pixelsOf(source: string | Blob, longEdge: number): Promise<ImageData> {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
  const decoded = await createImageBitmap(blob);
  // Drawn no larger than the warp will ask for. Sampling a huge painting into a
  // small preview one pixel at a time would sparkle; letting the browser scale
  // it down first is both correct and much quicker.
  const scale = Math.min(1, longEdge / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser cannot read image data.');
  context.drawImage(decoded, 0, 0, width, height);
  decoded.close();
  return context.getImageData(0, 0, width, height);
}

/**
 * The bent picture as a PNG data URL, or null if the sticker is flat.
 *
 * PNG rather than JPEG: a bent picture has transparent corners, which JPEG
 * cannot carry at all, and most of these are line art, where a lossy codec
 * would leave grey fringes along every stroke.
 */
export async function bendToDataUrl(
  sticker: CoverSticker,
  source: string | Blob,
  limit = EXPORT_LIMIT,
): Promise<string | null> {
  const bend = bendOf(sticker);
  if (!bend) return null;

  const key = [sticker.assetId, sticker.arc, sticker.widthIn, sticker.heightIn, limit].join('|');
  const known = results.get(key);
  if (known) return known;

  // Half as much again as the widest the result can be, so the warp always has
  // a little more to sample than it needs.
  const sourceEdge = Math.round(limit * 1.5);
  const sourceKey = `${sticker.assetId}|${sourceEdge}`;
  const input =
    sources.get(sourceKey) ??
    remember(sources, sourceKey, await pixelsOf(source, sourceEdge), 6);

  return remember(results, key, draw(input, bend, sticker, limit), 24);
}

function draw(input: ImageData, bend: Bend, sticker: CoverSticker, limit: number): string {
  const size = warpSize(sticker, bend, input.width, limit);
  const bent = warp(input, bend, size);

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot draw the result.');
  const image = context.createImageData(size.width, size.height);
  image.data.set(bent.data);
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}
