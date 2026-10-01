'use client';

import { getDb } from '../db';
import { id } from '../defaults';
import type { AssetRecord } from '../assets';
import { makePaint, painted, type Paint } from './colour';

/**
 * Getting a colour layer in and out of the store without losing a shade of it.
 *
 * PNG, and only PNG. The layer is flat areas of one colour each and an alpha
 * channel that says where they stop; JPEG has no alpha at all and would put a
 * grey fringe along every boundary, and the boundary is the information. PNG
 * is lossless, so a layer saved and reopened a week later is the same bytes it
 * was when it was painted, which is what "editing later loses no quality"
 * has to mean.
 */

export async function paintToBlob(paint: Paint): Promise<Blob | null> {
  if (!painted(paint)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = paint.width;
  canvas.height = paint.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(paint.width, paint.height);
  image.data.set(paint.data);
  context.putImageData(image, 0, 0);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

export async function blobToPaint(blob: Blob): Promise<Paint | null> {
  const decoded = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    decoded.close();
    return null;
  }
  context.drawImage(decoded, 0, 0);
  decoded.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const paint = makePaint(canvas.width, canvas.height);
  paint.data.set(image.data);
  return paint;
}

/**
 * Stores a draft's colour layer, over the top of the last one it stored.
 *
 * The same asset id every time, deliberately. A colour layer is written again
 * on every settle of a brush, and a new id each time would leave a trail of
 * megabyte-sized orphans behind one afternoon's colouring. What is overwritten
 * is this draft's own working layer, which is the thing that just changed;
 * nothing anyone saved is touched.
 */
export async function putLayer(
  existing: string | null,
  blob: Blob,
  width: number,
  height: number,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const record: AssetRecord = {
    id: existing ?? id('lay'),
    name: 'colouring.png',
    mime: 'image/png',
    blob,
    width,
    height,
    bytes: blob.size,
    createdAt: Date.now(),
  };
  await db.assets.put(record);
  return record.id;
}
