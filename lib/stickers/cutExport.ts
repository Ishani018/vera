'use client';

import { cutLine, cutLineSvg, type CutLine } from './cutline';

/**
 * The cut line for a finished sticker, taken from the sticker itself.
 *
 * From its alpha channel rather than from the mask the pipeline held a moment
 * earlier, and deliberately: what is traced is the PNG that will be sent to the
 * printer, so the line and the picture cannot drift apart. Anything that
 * happened after the mask — the words, the shadow — is in that alpha too, which
 * is the right answer: a shadow is part of the sticker and gets cut round.
 */
export async function cutLineFor(
  blob: Blob,
  tolerance: number,
): Promise<{ cut: CutLine; svg: string } | null> {
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
  const data = new Uint8Array(canvas.width * canvas.height);
  for (let p = 0, i = 3; p < data.length; p++, i += 4) data[p] = image.data[i];

  const cut = cutLine({ width: canvas.width, height: canvas.height, data }, tolerance);
  return { cut, svg: cutLineSvg(cut) };
}
