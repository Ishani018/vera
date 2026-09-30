import { INK, blur, dilate, erode, flood, toLab, type Bitmap, type Gray } from './pipeline';

/**
 * Transparency, which the line-art pipeline does not have.
 *
 * Everything next door is single-channel opaque greyscale — `Gray`, with
 * `INK = 0` and `PAPER = 255` — and `toBitmap` writes alpha 255 without
 * asking. A sticker is the one thing that cannot be made out of that.
 *
 * So a `Mask` travels *alongside* a `Gray` rather than widening it. One byte
 * per pixel, 0 transparent and 255 opaque, which is the same shape `dilate`,
 * `erode` and `blur` already take — so the morphology the die-cut and the edge
 * smoothing need is already written and already tested. A four-channel bitmap
 * would have meant touching every function in an eleven-hundred-line file that
 * currently works.
 *
 * Compositing is one explicit step at the end, where it can be read.
 */

export type Mask = { width: number; height: number; data: Uint8Array };

export const CLEAR = 0;
export const SOLID = 255;

export const makeMask = (width: number, height: number, fill = CLEAR): Mask => ({
  width,
  height,
  data: new Uint8Array(width * height).fill(fill),
});

/* ----------------------------------------------- borrowing the morphology */

/**
 * A mask seen as a `Gray`, so `dilate`, `erode` and `blur` can work on it.
 *
 * Their convention is the opposite of this one — they grow `INK`, which is 0,
 * and a mask's opaque is 255 — so the values are turned over on the way in and
 * back on the way out. Cheaper than a second morphology, and it means there is
 * one implementation of a dilation in this codebase rather than two that can
 * disagree.
 */
const asGray = (mask: Mask): Gray => {
  const data = new Uint8ClampedArray(mask.data.length);
  for (let i = 0; i < data.length; i++) data[i] = mask.data[i] >= 128 ? INK : 255;
  return { width: mask.width, height: mask.height, data };
};

const fromGray = (gray: Gray): Mask => {
  const data = new Uint8Array(gray.data.length);
  for (let i = 0; i < data.length; i++) data[i] = gray.data[i] === INK ? SOLID : CLEAR;
  return { width: gray.width, height: gray.height, data };
};

/** Grows the opaque area by `radius` pixels. */
export const grow = (mask: Mask, radius: number): Mask =>
  radius < 1 ? copy(mask) : fromGray(dilate(asGray(mask), radius));

/** Shrinks it. */
export const shrink = (mask: Mask, radius: number): Mask =>
  radius < 1 ? copy(mask) : fromGray(erode(asGray(mask), radius));

/**
 * Rounds the corners, by growing and then shrinking by the same amount.
 *
 * A morphological closing. Convex corners come back rounded to the radius as a
 * side effect, which is exactly the shape a die-cut sticker has, and it costs
 * nothing beyond the two passes already written.
 */
export const roundCorners = (mask: Mask, radius: number): Mask =>
  radius < 1 ? copy(mask) : shrink(grow(mask, radius), radius);

export const copy = (mask: Mask): Mask => ({
  width: mask.width,
  height: mask.height,
  data: new Uint8Array(mask.data),
});

/**
 * Softens the cut edge, so it is not a staircase.
 *
 * Runs on the alpha itself rather than on a two-value version of it, so the
 * result has real intermediate values — which is the whole point, and the one
 * place a mask is genuinely more than a black-and-white image.
 */
export function feather(mask: Mask, radius: number): Mask {
  if (radius < 1) return copy(mask);
  const soft = blur(
    { width: mask.width, height: mask.height, data: new Uint8ClampedArray(mask.data) },
    radius,
  );
  return { width: mask.width, height: mask.height, data: Uint8Array.from(soft.data) };
}

/* ----------------------------------------------------------- making masks */

/**
 * A mask from traced line art: the ink is the sticker, the paper is nothing.
 *
 * Which is the whole of "make the white background transparent" for a drawing,
 * because by this point the drawing is already exactly two values.
 */
export function maskFromInk(lines: Gray): Mask {
  const data = new Uint8Array(lines.data.length);
  for (let i = 0; i < data.length; i++) data[i] = lines.data[i] === INK ? SOLID : CLEAR;
  return { width: lines.width, height: lines.height, data };
}

/**
 * A mask for a picture on plain paper: everything except the background.
 *
 * Flooded **inward from the border**, and that is the whole trick. Removing
 * every pixel that merely *matches* the background colour would punch a hole
 * through the white of an eye, the inside of an O, the gap in a teapot handle.
 * Only background connected to the edge of the picture is background.
 *
 * Distance is measured in Lab, so "within a tolerance of the paper" means what
 * the eye means by it rather than what the three channels happen to add up to.
 *
 * `tolerance` is a Lab distance. Around 12 lifts a clean white scan; past 40 it
 * starts eating pale parts of the subject.
 */
export function backgroundMask(source: Bitmap, tolerance: number): Mask {
  const { width, height } = source;
  const lab = toLab(source);
  const seeds: number[] = [];
  for (let x = 0; x < width; x++) {
    seeds.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seeds.push(y * width, y * width + width - 1);
  }

  // The paper's colour, averaged over the border, so one dark pixel in a corner
  // does not decide what the background is.
  let sl = 0;
  let sa = 0;
  let sb = 0;
  for (const i of seeds) {
    sl += lab.l[i];
    sa += lab.a[i];
    sb += lab.b[i];
  }
  const n = seeds.length || 1;
  const [pl, pa, pb] = [sl / n, sa / n, sb / n];

  const near = (i: number) => {
    const dl = lab.l[i] - pl;
    const da = lab.a[i] - pa;
    const db = lab.b[i] - pb;
    return Math.sqrt(dl * dl + da * da + db * db) <= tolerance;
  };

  const background = flood({ width, height, seeds, passable: near });
  const data = new Uint8Array(width * height).fill(SOLID);
  for (const i of background) data[i] = CLEAR;
  return { width, height, data };
}

/* ------------------------------------------------------------- the die cut */

/**
 * The ring a die-cut edge draws, outside the artwork and never over it.
 *
 * Grown from the sticker's own shape and then had that shape taken back out,
 * so what is left is only the part beyond the artwork. Nothing the artwork
 * occupies is in the ring, which is what makes the outline unable to clip it.
 */
export function dieCutRing(subject: Mask, width: number, cornerRadius: number): Mask {
  if (width < 1) return makeMask(subject.width, subject.height);
  const rounded = roundCorners(subject, cornerRadius);
  const grown = grow(rounded, width);
  const ring = new Uint8Array(grown.data.length);
  for (let i = 0; i < ring.length; i++) {
    // Anything the artwork covers, even partly, is not ring. A partly covered
    // pixel is an edge pixel, and painting the outline into it is the exact
    // thing that eats a thin line.
    ring[i] = grown.data[i] > 0 && subject.data[i] === CLEAR ? SOLID : CLEAR;
  }
  return { width: grown.width, height: grown.height, data: ring };
}

/**
 * Room around the artwork for an outline to live in.
 *
 * Without it a die-cut on something that touches the edge of the picture would
 * be cut off by the edge of the picture — the outline would look chewed on
 * exactly the stickers people crop tightly. Growing the canvas first means the
 * ring always has somewhere to go.
 */
export function padMask(mask: Mask, by: number): Mask {
  if (by < 1) return copy(mask);
  const width = mask.width + by * 2;
  const height = mask.height + by * 2;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < mask.height; y++) {
    data.set(mask.data.subarray(y * mask.width, (y + 1) * mask.width), (y + by) * width + by);
  }
  return { width, height, data };
}

/** The same, for the picture the mask belongs to. */
export function padBitmap(source: Bitmap, by: number): Bitmap {
  if (by < 1) return { ...source, data: new Uint8ClampedArray(source.data) };
  const width = source.width + by * 2;
  const height = source.height + by * 2;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < source.height; y++) {
    const from = y * source.width * 4;
    data.set(
      source.data.subarray(from, from + source.width * 4),
      ((y + by) * width + by) * 4,
    );
  }
  return { width, height, data };
}

/* ------------------------------------------------------------ compositing */

export type Rgb = { r: number; g: number; b: number };

/** `#abc` and `#aabbcc`, which is what every colour in this app is stored as. */
export function parseColour(value: string): Rgb {
  const hex = value.trim().replace(/^#/, '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/**
 * The finished sticker: colour where it is opaque, nothing where it is not.
 *
 * The ring is painted first and the artwork over it, so an outline can never
 * cover the thing it is outlining even if the two disagree by a pixel.
 *
 * `paint` is the artwork's own colour, pixel for pixel, for a picture kept as
 * it is; for traced line art it is one flat colour and the mask carries all
 * the shape.
 *
 * `colour` is the colouring layer, which goes on last of the three underneath
 * layers and first of all: it is beneath the drawing, so a fill tucked under a
 * line never paints over the line, and it carries its own alpha, so a sticker
 * is opaque wherever it has been coloured in even if that is outside the ink.
 */
export function compositeSticker({
  subject,
  ring,
  paint,
  colour = null,
  inkColour,
  ringColour,
}: {
  subject: Mask;
  ring: Mask | null;
  /** The picture, where the sticker is a picture. Null for flat line art. */
  paint: Bitmap | null;
  /** What has been coloured in, straight RGBA. Null when nothing has been. */
  colour?: Bitmap | null;
  inkColour: string;
  ringColour: string;
}): Bitmap {
  const { width, height } = subject;
  const out = new Uint8ClampedArray(width * height * 4);
  const ink = parseColour(inkColour);
  const edge = parseColour(ringColour);

  for (let p = 0, i = 0; p < subject.data.length; p++, i += 4) {
    const ringAlpha = ring ? ring.data[p] : CLEAR;
    if (ringAlpha > 0) {
      out[i] = edge.r;
      out[i + 1] = edge.g;
      out[i + 2] = edge.b;
      out[i + 3] = ringAlpha;
    }
    const painted = colour ? colour.data[i + 3] : 0;
    if (painted > 0) {
      out[i] = colour!.data[i];
      out[i + 1] = colour!.data[i + 1];
      out[i + 2] = colour!.data[i + 2];
      out[i + 3] = Math.max(out[i + 3], painted);
    }
    const alpha = subject.data[p];
    if (alpha > 0) {
      if (paint) {
        out[i] = paint.data[i];
        out[i + 1] = paint.data[i + 1];
        out[i + 2] = paint.data[i + 2];
      } else {
        out[i] = ink.r;
        out[i + 1] = ink.g;
        out[i + 2] = ink.b;
      }
      // The artwork wins where the two overlap, so an outline cannot eat it.
      out[i + 3] = Math.max(out[i + 3], alpha);
    }
  }
  return { width, height, data: out };
}

/** True where anything at all is see-through. What an alpha channel is for. */
export function hasTransparency(bitmap: Bitmap): boolean {
  for (let i = 3; i < bitmap.data.length; i += 4) {
    if (bitmap.data[i] < 255) return true;
  }
  return false;
}

/**
 * The colour layer at a different size, for exporting bigger or smaller than
 * the size it was painted at.
 *
 * Nearest neighbour rather than anything smoother, and deliberately: a colour
 * layer is flat areas meeting along edges that sit underneath the drawing's
 * lines, so there is nothing for blending to improve and a blended edge would
 * invent colours that are in neither region. Where the seams show, the lines
 * are on top of them.
 */
export function scalePaint(paint: Bitmap, width: number, height: number): Bitmap {
  if (paint.width === width && paint.height === height) return paint;
  const out = new Uint8ClampedArray(width * height * 4);
  const xScale = paint.width / width;
  const yScale = paint.height / height;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(paint.height - 1, (y * yScale) | 0);
    for (let x = 0; x < width; x++) {
      const sx = Math.min(paint.width - 1, (x * xScale) | 0);
      const from = (sy * paint.width + sx) * 4;
      out.set(paint.data.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data: out };
}

/**
 * The background removal, corrected by hand.
 *
 * Automatic removal is a guess, and on a real photograph it is wrong in a few
 * places every time — a shadow under an edge it keeps, a pale patch inside the
 * subject it takes. This is the correction: a layer painted over the picture
 * saying "keep this whatever you decided" and "drop this whatever you decided",
 * applied to the mask before anything else looks at it, so the export, the
 * die-cut and the preview all see the same corrected shape.
 *
 * The layer is a straight RGBA picture, which is how it can be stored as a
 * lossless PNG and reopened a week later exactly as it was painted. Its red
 * channel is what the pixel should become and its alpha is how strongly, so a
 * soft brush blends towards its target instead of stamping a hard-edged hole.
 */
export function applyTouch(base: Mask, touch: Bitmap): Mask {
  if (touch.width !== base.width || touch.height !== base.height) return base;
  const data = new Uint8Array(base.data);
  for (let p = 0, i = 0; p < data.length; p++, i += 4) {
    const weight = touch.data[i + 3];
    if (!weight) continue;
    const target = touch.data[i];
    data[p] = Math.round(data[p] + ((target - data[p]) * weight) / 255);
  }
  return { width: base.width, height: base.height, data };
}

/** What the restore and remove brushes paint, as colours in the touch layer. */
export const KEEP = { r: 255, g: 255, b: 255 };
export const DROP = { r: 0, g: 0, b: 0 };
