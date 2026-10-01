import { blur } from '../lineart/pipeline';
import type { Bitmap, Gray } from '../lineart/pipeline';
import { parseColour, type Mask } from '../lineart/mask';

/**
 * The three finishing touches: a shadow under the sticker, a gloss across it,
 * and the grain of the paper it is printed on.
 *
 * All optional, all off by default, and all arithmetic — the grain comes from a
 * hash of the coordinates rather than from a random number generator, so a
 * sticker exported twice is the same file twice. That matters more here than
 * anywhere else in this app: a decoration that came out slightly different
 * every time would make the preview a lie.
 *
 * Each takes the finished sticker and its own shape, and gives back a new
 * picture. None of them touches the alpha channel except the shadow, which has
 * to — a shadow that did not add anything outside the sticker would not be a
 * shadow.
 */

export type Decorations = {
  shadow: { blur: number; offsetX: number; offsetY: number; opacity: number; colour: string } | null;
  gloss: { strength: number; angle: number } | null;
  grain: { strength: number; scale: number } | null;
};

export const NO_DECORATION: Decorations = { shadow: null, gloss: null, grain: null };

export const hasAny = (d: Decorations): boolean => Boolean(d.shadow || d.gloss || d.grain);

/** How much room a shadow needs beyond the sticker, in pixels. */
export const shadowRoom = (d: Decorations): number =>
  d.shadow ? Math.ceil(d.shadow.blur * 3 + Math.max(Math.abs(d.shadow.offsetX), Math.abs(d.shadow.offsetY))) + 2 : 0;

/**
 * A shadow: the sticker's own shape, moved, softened and darkened.
 *
 * Drawn *under* the sticker, so it never darkens the artwork itself — the
 * shadow is composited first and the sticker put back on top of it, which is
 * the only order that leaves a white sticker white.
 *
 * `blur` here is the same three-box-pass blur the tracer uses, whose reach is
 * about three times its radius. The radius is divided accordingly, so the
 * number on the slider means roughly the distance the shadow actually spreads.
 */
export function addShadow(
  sticker: Bitmap,
  shape: Mask,
  shadow: NonNullable<Decorations['shadow']>,
): Bitmap {
  const { width, height } = sticker;
  const colour = parseColour(shadow.colour);

  // Moved first, then softened: softening first and moving after would shift
  // the soft edge off the shape it was made from by a fraction of a pixel.
  const moved = new Uint8ClampedArray(width * height);
  const dx = Math.round(shadow.offsetX);
  const dy = Math.round(shadow.offsetY);
  for (let y = 0; y < height; y++) {
    const from = y - dy;
    if (from < 0 || from >= height) continue;
    for (let x = 0; x < width; x++) {
      const take = x - dx;
      if (take < 0 || take >= width) continue;
      moved[y * width + x] = shape.data[from * width + take];
    }
  }

  const radius = Math.max(0, Math.round(shadow.blur / 3));
  const soft: Gray = radius > 0 ? blur({ width, height, data: moved }, radius) : { width, height, data: moved };
  const strength = Math.max(0, Math.min(1, shadow.opacity));

  const out = new Uint8ClampedArray(sticker.data);
  for (let p = 0, i = 0; p < soft.data.length; p++, i += 4) {
    const under = (soft.data[p] / 255) * strength * 255;
    if (under <= 0) continue;
    const over = out[i + 3];
    // The sticker over the shadow, in the ordinary way — so where the sticker
    // is solid nothing of the shadow shows, and where it is not, the shadow is.
    const alpha = over + under * (1 - over / 255);
    if (alpha <= 0) continue;
    const keep = over / alpha;
    out[i] = Math.round(out[i] * keep + colour.r * (1 - keep));
    out[i + 1] = Math.round(out[i + 1] * keep + colour.g * (1 - keep));
    out[i + 2] = Math.round(out[i + 2] * keep + colour.b * (1 - keep));
    out[i + 3] = Math.round(alpha);
  }
  return { width, height, data: out };
}

/**
 * A gloss: a band of light across the sticker, as if a vinyl one were catching
 * the window.
 *
 * Lightens where the light falls and darkens where it does not, which is what
 * makes it read as a curved surface rather than as a white smear. Only where
 * the sticker already is — it never adds a pixel, so the shape is unchanged.
 */
export function addGloss(
  sticker: Bitmap,
  gloss: NonNullable<Decorations['gloss']>,
): Bitmap {
  const { width, height } = sticker;
  const strength = Math.max(0, Math.min(1, gloss.strength));
  if (strength <= 0) return sticker;

  const angle = (gloss.angle * Math.PI) / 180;
  const ax = Math.cos(angle);
  const ay = Math.sin(angle);
  const half = Math.hypot(width, height) / 2;

  const out = new Uint8ClampedArray(sticker.data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] === 0) continue;
      // Distance along the light's direction, from the middle, as -1 to 1.
      const t = ((x - width / 2) * ax + (y - height / 2) * ay) / half;
      // A soft band at the top of that run, falling away both sides of it.
      const band = Math.exp(-Math.pow((t + 0.45) * 2.4, 2));
      const lift = (band - 0.22) * strength;
      for (let c = 0; c < 3; c++) {
        out[i + c] = Math.round(out[i + c] + (lift > 0 ? (255 - out[i + c]) * lift : out[i + c] * lift));
      }
    }
  }
  return { width, height, data: out };
}

/**
 * The grain of paper, over the sticker.
 *
 * From a hash of the coordinates rather than a random number generator, so it
 * is the same grain every time the same sticker is exported — which is the
 * whole reason it can be shown in a preview at all.
 *
 * Two octaves: one at the asked-for scale and one at twice it, half as strong.
 * One alone reads as television static; two read as paper.
 */
export function addGrain(
  sticker: Bitmap,
  grain: NonNullable<Decorations['grain']>,
): Bitmap {
  const { width, height } = sticker;
  const strength = Math.max(0, Math.min(1, grain.strength));
  if (strength <= 0) return sticker;
  const scale = Math.max(1, grain.scale);

  const out = new Uint8ClampedArray(sticker.data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] === 0) continue;
      const n = value(x / scale, y / scale) + value((x / scale) * 2.7, (y / scale) * 2.7) * 0.5;
      // Centred on nothing, so grain darkens and lightens rather than only
      // darkening — paper does both.
      const shade = (n / 1.5 - 0.5) * 2 * strength * 42;
      for (let c = 0; c < 3; c++) out[i + c] = out[i + c] + shade;
    }
  }
  return { width, height, data: out };
}

/**
 * Smooth value noise from a hash of two integers.
 *
 * Deterministic in the strongest sense available: it is a pure function of its
 * arguments, with no seed to carry and no state to get out of step. The same
 * point gives the same value in the preview, in the export, and on any machine.
 */
function value(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const top = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * fx;
  const bottom = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * fx;
  return top + (bottom - top) * fy;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function hash(x: number, y: number): number {
  let n = (x | 0) * 374761393 + (y | 0) * 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/** All three, in the only order that makes sense. */
export function decorate(sticker: Bitmap, shape: Mask, d: Decorations): Bitmap {
  let out = sticker;
  // Grain and gloss belong to the sticker's own surface, so they go on before
  // the shadow — a shadow is cast by the finished thing, not textured with it.
  if (d.grain) out = addGrain(out, d.grain);
  if (d.gloss) out = addGloss(out, d.gloss);
  if (d.shadow) out = addShadow(out, shape, d.shadow);
  return out;
}
