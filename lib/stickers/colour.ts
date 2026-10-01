import { INK, dilate, flood } from '../lineart/pipeline';
import type { Bitmap, Gray } from '../lineart/pipeline';
import { parseColour } from '../lineart/mask';
import type { Rgb } from '../lineart/mask';

/**
 * Colouring a traced sticker in.
 *
 * Everything here is pure and works on plain arrays, so the awkward parts —
 * where a fill stops, what counts as a leak, what one undo puts back — can be
 * tested without a canvas, a worker or a browser.
 *
 * The colour lives on its own layer, the same size as the traced line art and
 * entirely separate from it. Painting never alters a single traced pixel, so
 * re-tracing at a different threshold, or exporting at a different size, does
 * not have to unpick the colouring from the drawing afterwards.
 */

/** The colour layer: straight RGBA, transparent where nothing has been painted. */
export type Paint = Bitmap;

/**
 * How much of the canvas one fill may cover before we stop and ask.
 *
 * A drawing whose outline has a gap in it lets a fill escape into the
 * background and flood the lot. There is no way to tell that apart from a
 * deliberate fill of the sky, so this does not refuse — it warns, and offers
 * the gap-closing control, which is the thing that actually fixes it.
 */
export const LEAK_SHARE = 0.5;

/** Anything at or below this is a line. Traced art is binary; this is for safety. */
const DARK = 127;

export function makePaint(width: number, height: number): Paint {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/**
 * A thickened copy of the line art, used only to decide where a fill stops.
 *
 * This is the gap-closing control, and the reason it is a working copy is the
 * whole point: closing a gap by fattening the lines would also fatten them on
 * screen and in the export. Here the fattening is thrown away the moment the
 * fill has been worked out, and the drawing the user sees is untouched.
 */
export function barrierOf(ink: Gray, gap: number): Gray {
  return dilate(ink, gap);
}

export type Fill = {
  /** Every pixel the fill covers, including the part tucked under the lines. */
  pixels: number[];
  /** Fraction of the canvas covered, 0 to 1. */
  share: number;
  /** True when that fraction is past `LEAK_SHARE`. */
  leaked: boolean;
};

/**
 * The region a click falls in, bounded by the thickened lines.
 *
 * Three steps, and the third is the one that is easy to leave out. The fill is
 * worked out against the *thickened* lines, so it stops short of the real ones
 * and leaves a pale halo all the way round. Growing it back by the same amount
 * tucks it under them. The growth is allowed to move only into pixels the
 * barrier calls ink, so it can slide under a line but can never step out into
 * the open paper of the region next door.
 *
 * One round more than the thickening, not exactly as many: `gap` rounds bring
 * the fill up to the edge of the real line and stop there, and the line's own
 * edge is softened on the way out, so a hair of pale would still show along it.
 * The extra round puts the colour a pixel underneath. It is safe at every
 * setting, including none, because the growth is still confined to ink.
 *
 * Returns null for a click on a line itself, which has no region to fill.
 */
export function fillAt({ barrier, at, gap }: { barrier: Gray; at: number; gap: number }): Fill | null {
  const { width, height, data } = barrier;
  if (at < 0 || at >= width * height || data[at] <= DARK) return null;

  const taken = new Uint8Array(width * height);
  const pixels = flood({
    width,
    height,
    seeds: [at],
    passable: (i) => data[i] > DARK,
    seen: taken,
  });

  // Tuck back under the lines: `gap` rounds of growth, into barrier ink only.
  let edge = pixels;
  for (let round = 0; round <= gap && edge.length; round++) {
    const next: number[] = [];
    for (const i of edge) {
      const x = i % width;
      const y = (i / width) | 0;
      if (x > 0) under(i - 1);
      if (x < width - 1) under(i + 1);
      if (y > 0) under(i - width);
      if (y < height - 1) under(i + width);
    }
    pixels.push(...next);
    edge = next;

    function under(n: number) {
      if (!taken[n] && data[n] <= DARK) {
        taken[n] = 1;
        next.push(n);
      }
    }
  }

  const share = pixels.length / (width * height);
  return { pixels, share, leaked: share > LEAK_SHARE };
}

/** The pixels of a filled circle, for the brush and the eraser. */
export function disc(width: number, height: number, cx: number, cy: number, radius: number): number[] {
  const pixels: number[] = [];
  const r = Math.max(0.5, radius);
  const top = Math.max(0, Math.floor(cy - r));
  const bottom = Math.min(height - 1, Math.ceil(cy + r));
  const left = Math.max(0, Math.floor(cx - r));
  const right = Math.min(width - 1, Math.ceil(cx + r));
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) pixels.push(y * width + x);
    }
  }
  return pixels;
}

/**
 * A brush with a soft edge: the pixels of a disc, each with how strongly it
 * lands there.
 *
 * `softness` is the fraction of the radius that fades, so 0 is a hard circle
 * and 1 fades the whole way from the middle. The falloff is smoothstep rather
 * than linear, because a linear edge leaves a visible ring where the gradient
 * stops changing and a person reads that ring as part of the picture.
 */
export function softDisc(
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  softness: number,
): [number, number][] {
  const out: [number, number][] = [];
  const r = Math.max(0.5, radius);
  const soft = Math.min(1, Math.max(0, softness));
  const inner = r * (1 - soft);
  const top = Math.max(0, Math.floor(cy - r));
  const bottom = Math.min(height - 1, Math.ceil(cy + r));
  const left = Math.max(0, Math.floor(cx - r));
  const right = Math.min(width - 1, Math.ceil(cx + r));
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      let w = 1;
      if (soft > 0 && d > inner) {
        const t = (d - inner) / (r - inner);
        w = 1 - t * t * (3 - 2 * t);
      }
      if (w > 0) out.push([y * width + x, Math.round(w * 255)]);
    }
  }
  return out;
}

/** `smear`, but with a soft brush. The strongest touch at each pixel wins. */
export function softSmear(
  width: number,
  height: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  softness: number,
): [number, number][] {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / Math.max(1, radius / 3)),
  );
  const strongest = new Map<number, number>();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    for (const [i, w] of softDisc(
      width,
      height,
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t,
      radius,
      softness,
    )) {
      // The strongest, not the sum: adding them would make the middle of a
      // slow drag harder than the middle of a quick one.
      if ((strongest.get(i) ?? 0) < w) strongest.set(i, w);
    }
  }
  return [...strongest];
}

/**
 * The pixels of a line between two points of a drag.
 *
 * A pointer moving quickly reports a handful of positions a long way apart.
 * Stamping a disc at each one draws a dotted line; stamping along the gap
 * between them draws a stroke.
 */
export function smear(
  width: number,
  height: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
): number[] {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / Math.max(1, radius / 2)));
  const pixels: number[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    pixels.push(...disc(width, height, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, radius));
  }
  return pixels;
}

/**
 * One undoable change to the colour layer.
 *
 * A whole snapshot of a colour layer is several megabytes, and sixty of them
 * is most of a browser tab's memory. A patch carries only the pixels that
 * actually changed, and what they were, which for a brush stroke is a few
 * thousand bytes.
 */
export type Patch = {
  pixels: Uint32Array;
  before: Uint8ClampedArray;
  after: Uint8ClampedArray;
};

/**
 * Collects one gesture — a click of the bucket, or a whole drag of the brush —
 * into a single patch, so one undo puts back the whole stroke rather than the
 * last few pixels of it.
 */
export class Stroke {
  private readonly before = new Map<number, number>();
  private readonly paint: Paint;

  // Written out rather than declared in the parameter list, because the tests
  // run TypeScript by stripping the types out and a parameter property is a
  // type that does something.
  constructor(paint: Paint) {
    this.paint = paint;
  }

  /** Paints pixels a colour, or erases them when the colour is null. */
  apply(pixels: Iterable<number>, colour: Rgb | null, alpha = 255) {
    const { data } = this.paint;
    for (const p of pixels) {
      const i = p * 4;
      if (!this.before.has(p)) {
        this.before.set(
          p,
          (data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3],
        );
      }
      if (colour) {
        data[i] = colour.r;
        data[i + 1] = colour.g;
        data[i + 2] = colour.b;
        data[i + 3] = alpha;
      } else {
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      }
    }
  }

  /**
   * The same, with a weight per pixel: a soft brush, where the edge of the
   * stroke lands more gently than the middle of it.
   *
   * The strongest touch wins rather than accumulating, so passing over the
   * same place twice in one stroke does not darken it.
   */
  applyEach(entries: Iterable<[number, number]>, colour: Rgb | null) {
    const { data } = this.paint;
    for (const [p, weight] of entries) {
      const i = p * 4;
      if (!this.before.has(p)) {
        this.before.set(
          p,
          (data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3],
        );
      }
      if (!colour) {
        // Erasing softly: take the weight off what is there.
        data[i + 3] = Math.max(0, data[i + 3] - weight);
        if (data[i + 3] === 0) data[i] = data[i + 1] = data[i + 2] = 0;
        continue;
      }
      // A different target replaces what was there; the same one is deepened.
      const same = data[i] === colour.r && data[i + 1] === colour.g && data[i + 2] === colour.b;
      data[i] = colour.r;
      data[i + 1] = colour.g;
      data[i + 2] = colour.b;
      data[i + 3] = same ? Math.max(data[i + 3], weight) : weight;
    }
  }

  /** Null when the gesture changed nothing, which is not worth an undo step. */
  commit(): Patch | null {
    const changed: number[] = [];
    const { data } = this.paint;
    for (const [p, packed] of this.before) {
      const i = p * 4;
      const wasR = (packed >>> 24) & 255;
      const wasG = (packed >>> 16) & 255;
      const wasB = (packed >>> 8) & 255;
      const wasA = packed & 255;
      if (data[i] !== wasR || data[i + 1] !== wasG || data[i + 2] !== wasB || data[i + 3] !== wasA) {
        changed.push(p);
      }
    }
    if (!changed.length) return null;

    const before = new Uint8ClampedArray(changed.length * 4);
    const after = new Uint8ClampedArray(changed.length * 4);
    changed.forEach((p, n) => {
      const packed = this.before.get(p)!;
      before[n * 4] = (packed >>> 24) & 255;
      before[n * 4 + 1] = (packed >>> 16) & 255;
      before[n * 4 + 2] = (packed >>> 8) & 255;
      before[n * 4 + 3] = packed & 255;
      after.set(data.subarray(p * 4, p * 4 + 4), n * 4);
    });
    return { pixels: Uint32Array.from(changed), before, after };
  }
}

export function applyPatch(paint: Paint, patch: Patch, side: 'before' | 'after') {
  const source = patch[side];
  patch.pixels.forEach((p, n) => {
    paint.data.set(source.subarray(n * 4, n * 4 + 4), p * 4);
  });
}

/** Roughly what a patch costs to keep, for the history's memory ceiling. */
export function patchBytes(patch: Patch): number {
  return patch.pixels.byteLength + patch.before.byteLength + patch.after.byteLength;
}

/**
 * Undo and redo for the colour layer.
 *
 * The same shape as `useCoverHistory` — a past stack, a future stack, cleared
 * on the next change — but of patches rather than snapshots, and bounded by
 * total size as well as by count, because one fill of a large region is worth
 * a hundred small brush strokes.
 */
export const HISTORY_STEPS = 40;
export const HISTORY_BYTES = 48 * 1024 * 1024;

export class PaintHistory {
  private past: Patch[] = [];
  private future: Patch[] = [];
  private bytes = 0;

  record(patch: Patch) {
    this.past.push(patch);
    this.bytes += patchBytes(patch);
    this.future = [];
    while (this.past.length > HISTORY_STEPS || (this.bytes > HISTORY_BYTES && this.past.length > 1)) {
      this.bytes -= patchBytes(this.past.shift()!);
    }
  }

  undo(paint: Paint): boolean {
    const patch = this.past.pop();
    if (!patch) return false;
    applyPatch(paint, patch, 'before');
    this.future.push(patch);
    this.bytes -= patchBytes(patch);
    return true;
  }

  redo(paint: Paint): boolean {
    const patch = this.future.pop();
    if (!patch) return false;
    applyPatch(paint, patch, 'after');
    this.past.push(patch);
    this.bytes += patchBytes(patch);
    return true;
  }

  get depth() {
    return { past: this.past.length, future: this.future.length };
  }

  clear() {
    this.past = [];
    this.future = [];
    this.bytes = 0;
  }
}

/** True where anything has been painted at all — what the composite needs to know. */
export function painted(paint: Paint): boolean {
  for (let i = 3; i < paint.data.length; i += 4) if (paint.data[i] > 0) return true;
  return false;
}

/** The ink of a traced image as a plain mask, for a fill to work against. */
export function inkOf(lines: Gray): Gray {
  return { ...lines, data: new Uint8ClampedArray(lines.data) };
}

export { parseColour, INK };
