'use client';

import { drawTexts, fontOf, measure, type StickerText } from './text';

/**
 * The sticker, with its words drawn on.
 *
 * On the main thread rather than in the worker, and for one reason: fonts. The
 * families come from Google at runtime, a worker has no document to load them
 * into, and text drawn in a face that failed to arrive is text in the wrong
 * face — silently, and only visible in the file somebody has already sold.
 * Here the font can be asked for and waited on first.
 *
 * Nothing goes near `lib/render/coverHtml.ts`: this is a canvas, the sticker is
 * a PNG, and the two have nothing to say to each other.
 */

/**
 * Makes sure a family is actually available before anything is drawn in it.
 *
 * `document.fonts.load` resolves whether or not the face arrived, so this can
 * only ask — but asking is what turns "the font had not loaded yet" into "the
 * font is not available", which is a much rarer thing.
 */
export async function waitForFonts(items: StickerText[], width: number, height: number) {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(
    items
      .filter((item) => item.text.trim())
      .map((item) => {
        const { fontSize } = measure(item, width, height);
        return document.fonts.load(fontOf(item, fontSize), item.text).catch(() => null);
      }),
  );
}

export async function withText(
  blob: Blob,
  width: number,
  height: number,
  items: StickerText[],
): Promise<Blob> {
  const wanted = items.filter((item) => item.text.trim());
  if (!wanted.length) return blob;

  await waitForFonts(wanted, width, height);
  const decoded = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    decoded.close();
    return blob;
  }
  context.drawImage(decoded, 0, 0, width, height);
  decoded.close();
  drawTexts(context, wanted, width, height);

  // PNG, for the same reason everything else here is: it is the one format that
  // carries an alpha channel, and a sticker without one is a rectangle.
  return new Promise<Blob>((resolve) =>
    canvas.toBlob((made) => resolve(made ?? blob), 'image/png'),
  );
}
