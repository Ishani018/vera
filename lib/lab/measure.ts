/**
 * How big a picture is, read from its header rather than by decoding it.
 *
 * The Lab works at a fixed long edge — 300px for a look card, 1400 for the
 * canvas — so a 48-megapixel phone photograph is thrown away almost entirely.
 * The worker used to find that out the expensive way: `createImageBitmap(blob)`
 * with no options decodes at FULL resolution first, which for 8000 x 6000 is
 * 192 MB of RGBA in the worker, and only then draws it small.
 *
 * `createImageBitmap` can downscale while it decodes, but only if it is told
 * the target size, and the target depends on the aspect ratio, which is the one
 * thing you do not know until you have decoded. Hence this: the first few bytes
 * of every format the app accepts carry the dimensions in plain sight, so a few
 * hundred bytes of header answer the question for nothing.
 *
 * Pure byte-reading, no DOM and no canvas, so it runs in Node and is tested
 * there against real files.
 */

export type Size = { width: number; height: number };

/** PNG: an 8-byte signature, then IHDR with width and height as big-endian u32. */
function png(view: DataView): Size | null {
  if (view.byteLength < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i++) if (view.getUint8(i) !== signature[i]) return null;
  // Bytes 12..15 are the chunk type; it must be IHDR for the size to be here.
  if (view.getUint32(12) !== 0x49484452) return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * JPEG: walk the markers to the start-of-frame, which carries the size.
 *
 * Every SOFn except SOF4 (DHT), SOF8 (JPG), SOF12 and SOF0xC (DAC/RST) is a
 * frame header laid out the same way: length, precision, height, width. The
 * excluded ones share the 0xC0 block but are not frames, which is the one trap
 * in an otherwise mechanical walk.
 */
function jpeg(view: DataView): Size | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let at = 2;
  while (at + 9 < view.byteLength) {
    if (view.getUint8(at) !== 0xff) {
      at += 1;
      continue;
    }
    const marker = view.getUint8(at + 1);
    // Padding fill bytes, and the standalone markers that carry no length.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      at += 2;
      continue;
    }
    const length = view.getUint16(at + 2);
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
    if (length < 2) return null;
    at += 2 + length;
  }
  return null;
}

/** GIF: the logical screen descriptor, two little-endian u16 right after the magic. */
function gif(view: DataView): Size | null {
  if (view.byteLength < 10) return null;
  if (view.getUint8(0) !== 0x47 || view.getUint8(1) !== 0x49 || view.getUint8(2) !== 0x46) return null;
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

/**
 * WebP: a RIFF container with three different chunk layouts.
 *
 * VP8 (lossy) hides the size after a 3-byte start code; VP8L (lossless) packs
 * both dimensions, minus one, into 28 bits; VP8X (extended) stores them as
 * 24-bit little-endian, also minus one.
 */
function webp(view: DataView): Size | null {
  if (view.byteLength < 30) return null;
  if (view.getUint32(0) !== 0x52494646) return null; // "RIFF"
  if (view.getUint32(8) !== 0x57454250) return null; // "WEBP"
  const chunk = view.getUint32(12);
  if (chunk === 0x56503858) {
    // "VP8X"
    const w = view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16);
    const h = view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16);
    return { width: w + 1, height: h + 1 };
  }
  if (chunk === 0x56503820) {
    // "VP8 " — 0x9d 0x01 0x2a is the start code, then 14 bits each.
    for (let at = 20; at < Math.min(view.byteLength - 7, 40); at++) {
      if (view.getUint8(at) === 0x9d && view.getUint8(at + 1) === 0x01 && view.getUint8(at + 2) === 0x2a) {
        return {
          width: view.getUint16(at + 3, true) & 0x3fff,
          height: view.getUint16(at + 5, true) & 0x3fff,
        };
      }
    }
    return null;
  }
  if (chunk === 0x5650384c) {
    // "VP8L" — one signature byte, then 14 bits of width-1 and 14 of height-1.
    if (view.getUint8(20) !== 0x2f) return null;
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/**
 * The picture's size, or null when the bytes are not a format we read.
 *
 * Null is not a failure: the caller falls back to decoding at full size, which
 * is exactly what it did before this existed. Being unable to read a header
 * must never be the reason a picture will not open.
 */
export function sizeOf(bytes: ArrayBuffer | Uint8Array): Size | null {
  const view =
    bytes instanceof Uint8Array
      ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : new DataView(bytes);
  const found = png(view) ?? jpeg(view) ?? gif(view) ?? webp(view);
  if (!found) return null;
  // A header can say anything; a zero or a negative is not a picture.
  if (!(found.width > 0) || !(found.height > 0)) return null;
  return found;
}

/**
 * The size to decode at, so the decoder does the shrinking instead of us.
 *
 * Never upscales: a 200px drawing asked for at 1400 stays 200px, because
 * enlarging it in the decoder would hand the engine a blurred picture and
 * charge forty-nine times the memory for it.
 */
export function targetSize(source: Size, longEdge: number): Size {
  const scale = Math.min(1, longEdge / Math.max(source.width, source.height));
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

/**
 * How big a picture may be before we stop decoding it at full size.
 *
 * This number is a quality decision, not just a memory one, and it is worth
 * being exact about why.
 *
 * Decoding at full size and shrinking with `drawImage` is what the Lab has
 * always done, and it is the output everything downstream was tuned against.
 * Asking the decoder to shrink instead is far cheaper — a 48-megapixel photo
 * costs 5.9 MB rather than 192 MB — but it is a DIFFERENT resampling filter,
 * and measured on a detailed 4000 x 3000 photograph it moves about 7% of pixels
 * by more than 8/255, with a worst pixel around 100/255. That is enough to
 * change which side of a threshold the line finder lands on. Two-stepping
 * through an intermediate size does not recover it: decoding at 2x the target
 * and then shrinking was measured as slightly worse, not better.
 *
 * So the rule is: under this budget, decode at full size and keep exactly the
 * output the Lab has always produced. Over it, shrink in the decoder — because
 * the alternative is not "better pixels", it is a tab that runs out of memory —
 * and SAY SO, so a changed picture is never passed off as the usual one.
 *
 * 32 megapixels is about 128 MB of RGBA. Every mainstream phone and camera
 * ships well under it by default, so in practice this path is the one almost
 * everybody gets.
 */
export const FULL_DECODE_PIXELS = 32_000_000;

/**
 * The most pixels we will ask a decoder to produce at full size.
 *
 * Only reached when the header could not be read, since otherwise the size is
 * known and the rule above applies. 80 megapixels is about 320 MB of RGBA —
 * past what a phone will give a tab. The limit exists so that the answer is a
 * sentence rather than a dead tab.
 */
export const MOST_PIXELS = 80_000_000;
