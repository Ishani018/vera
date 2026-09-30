import type { Bitmap } from '../lineart/pipeline';

/**
 * Flipping, turning and cropping — kept as a setting, never as pixels.
 *
 * The original upload is stored once and never written on. What a person does
 * here is recorded as four numbers and applied on the way to the preview and on
 * the way to the export, at the size each of those needs. So turning a picture
 * five degrees and back again costs nothing at all, where baking it in would
 * have cost two resamplings and left the drawing softer than it started.
 *
 * Everything here is arithmetic on the pixels given, so it is the same on any
 * browser rather than depending on how one of them happens to resample.
 */

export type Frame = {
  flipX: boolean;
  flipY: boolean;
  /** Degrees clockwise. Quarter turns are exact; anything else is resampled. */
  rotate: number;
  /**
   * The part to keep, as fractions of the picture *after* flipping and turning.
   * Null keeps all of it, which is not the same as a crop of the whole thing:
   * null costs nothing, and a full-size crop still goes through the arithmetic.
   */
  crop: { x: number; y: number; width: number; height: number } | null;
};

export const NO_FRAME: Frame = { flipX: false, flipY: false, rotate: 0, crop: null };

/** True when a frame would leave the picture exactly as it is. */
export const isPlain = (frame: Frame): boolean =>
  !frame.flipX && !frame.flipY && norm(frame.rotate) === 0 && !frame.crop;

/** Degrees brought into 0–360, so -90 and 270 are the same turn. */
export const norm = (degrees: number): number => ((degrees % 360) + 360) % 360;

/** The next quarter turn from here, in the direction asked. */
export const quarterFrom = (degrees: number, direction: 1 | -1): number =>
  norm(Math.round(degrees / 90) * 90 + direction * 90);

export function applyFrame(source: Bitmap, frame: Frame): Bitmap {
  if (isPlain(frame)) return source;
  let out = source;
  if (frame.flipX || frame.flipY) out = flip(out, frame.flipX, frame.flipY);
  const turn = norm(frame.rotate);
  if (turn !== 0) out = turn % 90 === 0 ? quarterTurn(out, turn) : rotate(out, turn);
  if (frame.crop) out = crop(out, frame.crop);
  return out;
}

/** Mirrored. An exact rearrangement: not one pixel is invented or lost. */
export function flip(source: Bitmap, x: boolean, y: boolean): Bitmap {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data.length);
  for (let row = 0; row < height; row++) {
    const from = y ? height - 1 - row : row;
    for (let col = 0; col < width; col++) {
      const take = x ? width - 1 - col : col;
      const a = (from * width + take) * 4;
      out.set(data.subarray(a, a + 4), (row * width + col) * 4);
    }
  }
  return { width, height, data: out };
}

/**
 * A quarter, a half or three quarters of a turn, done by moving pixels rather
 * than by sampling them.
 *
 * Worth its own path: the general rotation below would give very nearly this
 * answer, and "very nearly" on a right angle means a drawing that came back
 * from two turns very slightly blurrier than it left. This one is reversible to
 * the byte.
 */
export function quarterTurn(source: Bitmap, degrees: number): Bitmap {
  const turn = norm(degrees);
  const { width, height, data } = source;
  const sideways = turn === 90 || turn === 270;
  const w = sideways ? height : width;
  const h = sideways ? width : height;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let nx: number;
      let ny: number;
      if (turn === 90) {
        nx = height - 1 - y;
        ny = x;
      } else if (turn === 180) {
        nx = width - 1 - x;
        ny = height - 1 - y;
      } else {
        nx = y;
        ny = width - 1 - x;
      }
      const from = (y * width + x) * 4;
      out.set(data.subarray(from, from + 4), (ny * w + nx) * 4);
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Any other angle, on a canvas big enough to hold the corners.
 *
 * Bilinear, and sampled backwards — for each pixel of the result, where did it
 * come from — because sampling forwards leaves holes wherever two source pixels
 * land on the same destination. Outside the original it is transparent, which
 * is what makes a turned sticker still a sticker rather than a rectangle with
 * corners of nothing in it.
 */
export function rotate(source: Bitmap, degrees: number): Bitmap {
  const angle = (norm(degrees) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const { width, height, data } = source;

  const w = Math.max(1, Math.ceil(Math.abs(width * cos) + Math.abs(height * sin)));
  const h = Math.max(1, Math.ceil(Math.abs(width * sin) + Math.abs(height * cos)));
  const out = new Uint8ClampedArray(w * h * 4);

  const cx = width / 2;
  const cy = height / 2;
  const ox = w / 2;
  const oy = h / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Backwards: rotate this point by the opposite angle to find its source.
      const dx = x + 0.5 - ox;
      const dy = y + 0.5 - oy;
      const sx = cos * dx + sin * dy + cx - 0.5;
      const sy = -sin * dx + cos * dy + cy - 0.5;
      const i = (y * w + x) * 4;
      if (sx < -1 || sy < -1 || sx > width || sy > height) continue;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      for (let c = 0; c < 4; c++) {
        const p00 = at(data, width, height, x0, y0, c);
        const p10 = at(data, width, height, x0 + 1, y0, c);
        const p01 = at(data, width, height, x0, y0 + 1, c);
        const p11 = at(data, width, height, x0 + 1, y0 + 1, c);
        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        out[i + c] = Math.round(top + (bottom - top) * fy);
      }
    }
  }
  return { width: w, height: h, data: out };
}

/** One channel, or nothing at all beyond the edge. */
function at(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, c: number) {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return data[(y * width + x) * 4 + c];
}

/** The part kept, as fractions. Clamped, so a crop can never fall off the picture. */
export function crop(
  source: Bitmap,
  box: { x: number; y: number; width: number; height: number },
): Bitmap {
  const { width, height, data } = source;
  const left = Math.max(0, Math.min(width - 1, Math.round(box.x * width)));
  const top = Math.max(0, Math.min(height - 1, Math.round(box.y * height)));
  const w = Math.max(1, Math.min(width - left, Math.round(box.width * width)));
  const h = Math.max(1, Math.min(height - top, Math.round(box.height * height)));

  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const from = ((top + y) * width + left) * 4;
    out.set(data.subarray(from, from + w * 4), y * w * 4);
  }
  return { width: w, height: h, data: out };
}

/**
 * The tightest box round everything that is not transparent, as fractions.
 *
 * For the "trim to the sticker" button. Null when there is nothing there at
 * all, which is the one case where trimming would leave no picture.
 */
export function contentBox(bitmap: Bitmap): Frame['crop'] {
  const { width, height, data } = bitmap;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) return null;
  return {
    x: left / width,
    y: top / height,
    width: (right - left + 1) / width,
    height: (bottom - top + 1) / height,
  };
}

/**
 * The average colour of a picture's border: what its paper is, near enough.
 *
 * Only the edge, because the edge is the part a scanner or a camera saw of the
 * page rather than of the drawing. Transparent border pixels are skipped, and
 * white is the answer when every one of them is transparent — a picture with no
 * paper at all is being put on paper, and white is the only honest guess.
 */
export function borderColour(source: Bitmap): { r: number; g: number; b: number } {
  const { width, height, data } = source;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const take = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] === 0) return;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  };
  for (let x = 0; x < width; x++) {
    take(x, 0);
    take(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    take(0, y);
    take(width - 1, y);
  }
  if (!n) return { r: 255, g: 255, b: 255 };
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

/**
 * Everything see-through, put onto a flat colour.
 *
 * Turning a picture leaves empty corners, and nothing downstream is expecting
 * them: the tracer reads a colour, and a transparent pixel's colour is zero,
 * which is black — so a turned drawing would come back with four solid black
 * corners. Putting the corners onto the picture's own paper colour instead
 * means the background removal treats them as exactly what they look like, more
 * paper, and takes them away again.
 */
export function flatten(source: Bitmap, onto: { r: number; g: number; b: number }): Bitmap {
  const data = new Uint8ClampedArray(source.data);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 255) continue;
    const t = a / 255;
    data[i] = Math.round(data[i] * t + onto.r * (1 - t));
    data[i + 1] = Math.round(data[i + 1] * t + onto.g * (1 - t));
    data[i + 2] = Math.round(data[i + 2] * t + onto.b * (1 - t));
    data[i + 3] = 255;
  }
  return { width: source.width, height: source.height, data };
}
