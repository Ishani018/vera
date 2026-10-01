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
 *
 * Three things beyond the flood, each earning its place on a real photograph
 * rather than on a clean scan:
 *
 * **It walks down a gradient instead of measuring from one colour.** A page
 * photographed under a lamp is far brighter at the lamp end than at the other,
 * and a single averaged paper colour with a fixed tolerance leaves the bright
 * end behind as a blotch. So a pixel joins the background if it is close to
 * *the pixel it spread from* as well as broadly paper-like overall — the flood
 * walks down the lighting gradient in small steps, and a real edge is a step
 * too big to cross.
 *
 * **It cuts softly.** A hard threshold gives a staircase on every curve, which
 * is the one thing that reads as cheap. Pixels whose distance falls in a band
 * just past the tolerance come out part-transparent, so the edge fades the way
 * a photographed edge actually does.
 *
 * **It ignores grain.** Paper texture leaves thousands of one-pixel islands and
 * holes. Anything smaller than `speck` is taken to be the paper's texture
 * rather than the picture, and goes the same way as its surroundings.
 */
export type RemovalTuning = {
  /**
   * How far one step of the flood may move in Lab. Small enough that a drawn
   * edge stops it, large enough that lighting does not.
   */
  step?: number;
  /** The Lab band past `tolerance` over which the edge fades out. */
  softness?: number;
  /** Islands and holes of at most this many pixels are treated as texture. */
  speck?: number;
};

export const REMOVAL_DEFAULTS: Required<RemovalTuning> = {
  step: 6,
  softness: 5,
  speck: 48,
};

export function backgroundMask(
  source: Bitmap,
  tolerance: number,
  tuning: RemovalTuning = {},
): Mask {
  const { step, softness, speck } = { ...REMOVAL_DEFAULTS, ...tuning };
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

  /** How far a pixel is from the paper the border says this is. */
  const fromPaper = (i: number) => {
    const dl = lab.l[i] - pl;
    const da = lab.a[i] - pa;
    const db = lab.b[i] - pb;
    return Math.sqrt(dl * dl + da * da + db * db);
  };

  /** How far one pixel is from its neighbour. */
  const between = (i: number, j: number) => {
    const dl = lab.l[i] - lab.l[j];
    const da = lab.a[i] - lab.a[j];
    const db = lab.b[i] - lab.b[j];
    return Math.sqrt(dl * dl + da * da + db * db);
  };

  // Generous overall, strict about each step: the total allowance is what lets
  // the flood follow a lamp's falloff right across the page, and the step is
  // what stops it walking straight into the subject when it gets there.
  //
  // A tapering step — strict the further from paper it gets — was tried, to
  // stop the flood following a soft shadow into the object it belongs to. It
  // made the shadow a little better and the uneven lighting much worse, because
  // brightly lit paper is itself a long way from the average paper colour and
  // the taper would not let the flood reach it. A soft shadow against its own
  // subject is what the touch-up brushes are for; the screen says so.
  const roam = tolerance + softness + step * 4;
  const passable = (i: number, from: number) =>
    i === from
      ? fromPaper(i) <= tolerance + softness
      : between(i, from) <= step && fromPaper(i) <= roam;

  const background = flood({ width, height, seeds, passable });
  const data = new Uint8Array(width * height).fill(SOLID);
  for (const i of background) data[i] = CLEAR;

  if (speck > 0) unspeckle(data, width, height, speck);
  if (softness > 0) softenEdge(data, width, height, between, step, softness);
  return { width, height, data };
}

/**
 * Islands and holes too small to be part of the picture, filled in.
 *
 * Grain on a photographed page leaves thousands of these, and every one of them
 * is a speck of paper stuck to the sticker or a pinhole through it. A region
 * this small is never a feature somebody drew, so it becomes whatever surrounds
 * it — which for an island is the background, and for a hole is the subject.
 */
function unspeckle(data: Uint8Array, width: number, height: number, speck: number) {
  const seen = new Uint8Array(data.length);
  for (let start = 0; start < data.length; start++) {
    if (seen[start]) continue;
    const solid = data[start] > 127;
    const stack = [start];
    const region: number[] = [];
    seen[start] = 1;
    // Every region is walked all the way, even the huge one that is obviously
    // not a speck. Stopping early and moving on leaves the rest of it unvisited
    // but its frontier marked, so later rounds find its middle as a fresh
    // region — a small one — and punch a hole in the picture.
    while (stack.length) {
      const i = stack.pop()!;
      region.push(i);
      const x = i % width;
      const y = (i / width) | 0;
      const push = (j: number) => {
        if (!seen[j] && data[j] > 127 === solid) {
          seen[j] = 1;
          stack.push(j);
        }
      };
      if (x > 0) push(i - 1);
      if (x < width - 1) push(i + 1);
      if (y > 0) push(i - width);
      if (y < height - 1) push(i + width);
    }
    if (region.length > speck) continue;
    for (const i of region) data[i] = solid ? CLEAR : SOLID;
  }
}

/**
 * The cut, made gradual where the picture fades rather than stops.
 *
 * Measured by the step the flood refused to take, not by the distance from the
 * paper. The flood stopped at this pixel *because* that step was bigger than it
 * would cross — so how much bigger is exactly the question worth asking. A step
 * barely over the line is a gentle fade and comes out part-transparent; a step
 * far over it is a drawn edge and stays solid.
 *
 * Only along the boundary, so a pale pixel deep inside the subject stays fully
 * opaque. Fading by colour alone would make a pale subject half-transparent all
 * over, which is the wrong answer to a different question.
 */
function softenEdge(
  data: Uint8Array,
  width: number,
  height: number,
  between: (i: number, j: number) => number,
  step: number,
  softness: number,
) {
  const faded = new Map<number, number>();
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== SOLID) continue;
    const x = i % width;
    const y = (i / width) | 0;
    let nearest = Infinity;
    const look = (j: number) => {
      if (data[j] !== CLEAR) return;
      const d = between(i, j);
      if (d < nearest) nearest = d;
    };
    if (x > 0) look(i - 1);
    if (x < width - 1) look(i + 1);
    if (y > 0) look(i - width);
    if (y < height - 1) look(i + width);
    if (nearest === Infinity) continue;

    // A pixel whose step is *within* the allowance did not stop the flood by
    // being too different — it stopped for the overall distance from paper, at
    // the far end of a long gradient. Fading that one would cut a transparent
    // ring out of the subject rather than soften its edge.
    if (nearest <= step) continue;

    const over = nearest - step;
    if (over >= softness) continue;
    const t = Math.max(0, over) / softness;
    // Smoothstep again, for the same reason as the brush: a linear ramp leaves
    // a visible line where it stops changing.
    faded.set(i, Math.round(255 * (t * t * (3 - 2 * t))));
  }
  // Written after the pass, so one softened pixel is never read as background
  // by the pixel beside it.
  for (const [i, alpha] of faded) data[i] = alpha;
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
