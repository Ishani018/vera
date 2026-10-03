/**
 * The classic engine: XDoG, and flow-based XDoG.
 *
 * Deterministic, pure TypeScript, and it uses no model and touches no network.
 * Nothing in the Lab does: every look is our own code implementing published
 * mathematics, so there are no weights to fetch, nothing to disclose, and the
 * same input gives the same bytes out on any machine, offline, forever.
 * `docs/ALGORITHMS.md` says whose mathematics, and for which stage.
 *
 * ## What XDoG is
 *
 * A difference of two Gaussians finds edges: blur a picture a little, blur it a
 * lot, subtract, and what is left is whatever changed between the two scales.
 * Winnemöller's extended version (XDoG, 2012) adds two things that turn an edge
 * detector into something that looks drawn. First the wide blur is scaled by
 * `tau` before subtracting, so the response can be pushed from "edges" towards
 * "ink where the picture is darker than its surroundings". Second the result
 * goes through a soft threshold rather than a hard one:
 *
 *     T(u) = 1                        when u >= epsilon
 *            1 + tanh(phi * (u - epsilon))   otherwise
 *
 * `phi` is what makes a line's edge crisp or feathered, which is the difference
 * between a technical pen and a pencil.
 *
 * ## What the flow version adds
 *
 * Isotropic XDoG treats every direction alike, so a line that wobbles comes out
 * dotty and a smooth contour comes out ragged. Kang's flow-based version
 * (FDoG, 2007) measures which way the picture is "going" at each pixel and then
 * does the two halves of the job in two different directions: the difference of
 * Gaussians is taken ACROSS the flow, where the edge actually is, and the
 * result is smoothed ALONG it, which joins a broken line up instead of blurring
 * it away. It is the difference between a scribble and a stroke.
 *
 * The flow field here comes from the smoothed structure tensor rather than
 * Kang's iterative refinement: the minor eigenvector of the blurred tensor is
 * the local tangent, it is a closed form rather than a loop with a stopping
 * rule, and it is therefore both faster and exactly reproducible.
 *
 * ## Floats, not bytes
 *
 * Everything here works on `Float32Array`. The existing `blur` in
 * `pipeline.ts` is three box passes over a `Uint8ClampedArray`, which is right
 * for what it does and wrong for this: the whole signal in a difference of
 * Gaussians is a few grey levels wide, and rounding each pass to a byte throws
 * most of it away before the subtraction happens.
 */

import {
  INK,
  PAPER,
  flattenOntoWhite,
  flood,
  reduce,
  toGray,
  type Bitmap,
  type Gray,
} from './pipeline';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** One plane of floats, the size of the picture. */
export type Field = { width: number; height: number; data: Float32Array };

/** A unit vector per pixel: which way the picture runs here. */
export type Flow = { width: number; height: number; tx: Float32Array; ty: Float32Array };

/**
 * The four looks, as the brief names them.
 *
 * A preset is a starting point and not a cage: it sets the four sliders and
 * whether the flow field is used, and then every slider is still yours.
 */
export type ClassicLook = 'ink-pen' | 'fine' | 'bold' | 'sketch';

export type ClassicSettings = {
  look: ClassicLook;
  /** 0–100. How heavy the finished line is. */
  thickness: number;
  /** 0–100. How much fine texture survives. */
  detail: number;
  /** 0–100. How feathered the edge of a line is: 0 is a hard cut. */
  softness: number;
  /** 0–100. Blur before, and the size of the specks lifted off after. */
  cleanup: number;
  /** For art that is light on dark. */
  invert: boolean;
};

/**
 * What each look is, before anybody touches a slider.
 *
 * `flow` is not a slider because it is not a matter of degree: either the lines
 * follow the picture's own direction or they do not, and halfway between the
 * two looks like a mistake rather than a setting.
 */
export const CLASSIC_LOOKS: Record<
  ClassicLook,
  { label: string; blurb: string; flow: boolean; settings: Omit<ClassicSettings, 'look' | 'invert'> }
> = {
  'ink-pen': {
    label: 'Ink pen',
    blurb: 'Even, confident lines. The default, and the one that prints best.',
    flow: true,
    settings: { thickness: 50, detail: 52, softness: 18, cleanup: 40 },
  },
  fine: {
    label: 'Fine',
    blurb: 'A hard nib. Keeps small detail, so it wants a sharp picture.',
    flow: true,
    settings: { thickness: 22, detail: 74, softness: 10, cleanup: 48 },
  },
  bold: {
    label: 'Bold',
    blurb: 'Thick outlines and little else. Good for stickers and cutting.',
    flow: true,
    settings: { thickness: 86, detail: 24, softness: 24, cleanup: 62 },
  },
  sketch: {
    label: 'Sketch',
    blurb: 'Softer, looser, pencil rather than pen. Leaves some tone in.',
    flow: false,
    settings: { thickness: 40, detail: 58, softness: 76, cleanup: 44 },
  },
};

/** A look, as settings, ready to be handed to `runClassic`. */
export function settingsFor(look: ClassicLook, invert = false): ClassicSettings {
  return { look, invert, ...CLASSIC_LOOKS[look].settings };
}

/**
 * The size the engine always works at.
 *
 * Not a reference for scaling — the actual size. This is a decision worth
 * stating plainly, because the obvious alternative is what `pipeline.ts` does,
 * and here it is wrong.
 *
 * `sigma` is the narrow Gaussian, and it is what decides the finest thing that
 * can survive. It is measured in pixels, and it cannot usefully go below about
 * half a pixel, because below that a Gaussian is not a blur, it is a rounding
 * error. If it were scaled with the picture the way stroke weights are, then on
 * anything much under the reference size the whole detail slider would sit on
 * that floor: measured, every one of the four looks came out identical on a
 * 700-pixel picture, because every one of them had been clamped to the same
 * 0.35.
 *
 * So instead of scaling the parameters to the picture, the picture is scaled to
 * the parameters. Anything larger than this comes down to it; anything smaller
 * is left alone, because enlarging would invent detail the engine would then
 * faithfully draw.
 *
 * What that buys: the same scene uploaded at 1500 and at 2200 pixels gives the
 * same drawing, because both come down to the same working size first. Measured
 * on the test card, 10.46% and 10.33% of the page in ink.
 *
 * What it does NOT buy, and this matters for the Lab's look cards: running the
 * engine on a small picture is not the same as running it big and shrinking the
 * answer. The parameters are in pixels, so a smaller frame gets proportionally
 * heavier lines — measured on the same scene, 20.1% at 240 pixels against 13.0%
 * at 960 and 10.5% at the working size. A thumbnail that is meant to predict
 * the full-size drawing must therefore be made by reducing the RESULT, never by
 * reducing the input first.
 */
export const CLASSIC_WORKING_EDGE = 1400;

/**
 * The sliders, turned into the numbers the maths actually wants.
 *
 * Pure and exported so the mapping can be tested directly rather than inferred
 * from pictures. Every range here was set by measuring the engine's own
 * response on a test card, not by taste: the comments give the numbers, because
 * the next person to move one of these should know what they are moving.
 */
export function resolveClassic(settings: ClassicSettings) {
  const detail = clamp(settings.detail, 0, 100) / 100;
  const thickness = clamp(settings.thickness, 0, 100) / 100;
  const softness = clamp(settings.softness, 0, 100) / 100;
  const cleanup = clamp(settings.cleanup, 0, 100) / 100;

  return {
    /**
     * The narrow Gaussian: the finest thing that survives.
     *
     * 2.4 down to 0.5, geometrically — the useful range is bunched at the
     * bottom, and interpolating it linearly would spend the slider's whole top
     * half between 2.0 and 2.4. Measured on the test card, this moves the ink
     * on the page from about 4.5% at the broad end to about 1.3% at the fine
     * end, which is the difference between a marker and a technical pen.
     */
    sigma: 2.4 * Math.pow(0.5 / 2.4, detail),
    /** The wide Gaussian, as a multiple of the narrow one. Winnemöller's 1.6. */
    k: 1.6,
    /**
     * How much of the wide blur comes off the narrow one.
     *
     * Below 1 this is an edge detector; at 1 it is a pure difference of
     * Gaussians. The useful drawing range sits just under 1, and the closer it
     * gets the more the result turns from outlines into tone — which is what
     * Sketch wants and Bold does not.
     */
    tau: lerp(0.965, 0.995, softness),
    /**
     * Where the soft threshold sits, on the normalised response — which is
     * zero on flat ground in every picture, so this number means one thing.
     *
     * Geometric from -0.02 to -0.0008, a range of twenty-five, because the
     * interesting part is all bunched near zero. Measured across a test card
     * and a photograph, that takes the page from about 1-3% ink to about
     * 6-16%, and the two pictures track each other instead of one coming out
     * blank.
     *
     * It stops short of zero deliberately. At exactly zero the cut sits on the
     * flat ground itself and the page floods — 17% and 37% on those same two
     * pictures — so the last notch of the slider would be a cliff.
     */
    epsilon: -0.02 * Math.pow(0.0008 / 0.02, detail),
    /**
     * How quickly the threshold falls off: the edge of a line.
     *
     * 12000 down to 90, geometrically. The scale looks absurd until you
     * remember what it multiplies: the response is a few thousandths, so phi
     * has to be in the thousands for a hyperbolic tangent to reach its limit
     * at all. Measured, 100 leaves about 7% of a photograph in half-tones and
     * 12000 leaves 0.2%, which is pencil at one end and a technical pen at the
     * other.
     */
    phi: 12000 * Math.pow(90 / 12000, softness),
    /** How far the response is smoothed along the flow, in pixels. */
    sigmaAlong: lerp(1.2, 4.6, 1 - detail),
    /** How broadly the flow field itself is averaged before it is trusted. */
    flowSigma: lerp(1.4, 4.0, cleanup),
    /**
     * Softening before anything is measured, which is noise control.
     *
     * It has a floor the cleanup slider does not reach past, for the reason
     * `edgeBlurRadius` in `pipeline.ts` has one: a photograph has grain and
     * paper has a weave, and at their own scale both of those are edges. With
     * no floor, the finer looks drew the sensor noise across the whole sky.
     */
    preBlur: Math.max(0.8, lerp(0, 2.2, cleanup)),
    /**
     * How far the finished lines are grown.
     *
     * Never less than one pixel once the slider has left its bottom notch: a
     * control that does nothing over the first third of its travel is a broken
     * control.
     */
    dilateRadius: thickness > 0.02 ? Math.max(1, Math.round(lerp(0, 3, thickness))) : 0,
    /** Specks smaller than this are lifted off. */
    minArea: Math.round(lerp(0, 90, cleanup)),
  };
}

/* ------------------------------------------------------------------ fields */

/** 0–255 bytes to 0–1 floats, so the arithmetic below has room to work. */
export function toField(image: Gray): Field {
  const data = new Float32Array(image.data.length);
  for (let i = 0; i < data.length; i++) data[i] = image.data[i] / 255;
  return { width: image.width, height: image.height, data };
}

/**
 * A true separable Gaussian.
 *
 * Three box passes are a fine approximation when the answer is going to be
 * rounded to a byte anyway. Here the answer is the difference between two of
 * these, which is a hair wide, so the kernel is the real thing: normalised
 * weights out to three sigma, clamped at the edges so a border does not darken.
 */
export function gaussian(field: Field, sigma: number): Field {
  if (sigma <= 0.01) return { ...field, data: new Float32Array(field.data) };
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let total = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = w;
    total += w;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= total;
  return pass(pass(field, kernel, radius, true), kernel, radius, false);
}

function pass(field: Field, kernel: Float32Array, radius: number, horizontal: boolean): Field {
  const { width, height, data } = field;
  const out = new Float32Array(data.length);
  const span = horizontal ? width : height;
  const lines = horizontal ? height : width;
  const step = horizontal ? 1 : width;

  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * width : line;
    for (let i = 0; i < span; i++) {
      let sum = 0;
      for (let j = -radius; j <= radius; j++) {
        sum += data[base + clamp(i + j, 0, span - 1) * step] * kernel[j + radius];
      }
      out[base + i * step] = sum;
    }
  }
  return { width, height, data: out };
}

/**
 * Which way the picture runs at each pixel.
 *
 * The structure tensor is the outer product of the gradient with itself,
 * averaged over a neighbourhood: [[gx², gxgy], [gxgy, gy²]]. Averaging the
 * TENSOR rather than the gradient is the whole trick — gradients on opposite
 * sides of a thin dark line point in opposite directions and would cancel to
 * nothing, while their tensors agree, because the tensor cannot tell a
 * direction from its opposite and in this job neither can we.
 *
 * The minor eigenvector (the one for the smaller eigenvalue) points along the
 * edge rather than across it, which is the tangent we want.
 */
export function tangentFlow(field: Field, sigma: number): Flow {
  const { width, height, data } = field;
  const n = width * height;
  const e = new Float32Array(n);
  const f = new Float32Array(n);
  const g = new Float32Array(n);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const left = y * width + clamp(x - 1, 0, width - 1);
      const right = y * width + clamp(x + 1, 0, width - 1);
      const up = clamp(y - 1, 0, height - 1) * width + x;
      const down = clamp(y + 1, 0, height - 1) * width + x;
      const gx = (data[right] - data[left]) * 0.5;
      const gy = (data[down] - data[up]) * 0.5;
      e[i] = gx * gx;
      f[i] = gx * gy;
      g[i] = gy * gy;
    }
  }

  const be = gaussian({ width, height, data: e }, sigma).data;
  const bf = gaussian({ width, height, data: f }, sigma).data;
  const bg = gaussian({ width, height, data: g }, sigma).data;

  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // Eigenvalues of [[E, F], [F, G]]; the minor one is the smaller.
    const diff = be[i] - bg[i];
    const root = Math.sqrt(diff * diff + 4 * bf[i] * bf[i]);
    const minor = (be[i] + bg[i] - root) / 2;
    // The eigenvector for `minor`. Either row of (tensor - minor*I) gives it;
    // the better-conditioned row is the one with the larger magnitude.
    let vx = bf[i];
    let vy = minor - be[i];
    if (Math.abs(vx) + Math.abs(vy) < 1e-12) {
      vx = minor - bg[i];
      vy = bf[i];
    }
    const length = Math.hypot(vx, vy);
    if (length < 1e-12) {
      // Flat: no direction means anything here, so pick one and be consistent
      // about it rather than leaving a zero vector for the walk to trip on.
      tx[i] = 1;
      ty[i] = 0;
    } else {
      tx[i] = vx / length;
      ty[i] = vy / length;
    }
  }
  return { width, height, tx, ty };
}

/** Bilinear sample, clamped at the edges. */
function sample(field: Field, x: number, y: number): number {
  const { width, height, data } = field;
  const cx = clamp(x, 0, width - 1);
  const cy = clamp(y, 0, height - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const top = data[y0 * width + x0] * (1 - fx) + data[y0 * width + x1] * fx;
  const bottom = data[y1 * width + x0] * (1 - fx) + data[y1 * width + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * The difference of Gaussians, taken across the flow.
 *
 * One dimension rather than two: at each pixel we walk out along the normal to
 * the local tangent, which is the direction the edge actually crosses, and
 * accumulate both Gaussians as we go. Sampling only where the information is
 * means a line is measured against what is beside it rather than against what
 * is further along it.
 */
/**
 * ...and why the answer is normalised before it is returned.
 *
 * A difference of Gaussians with `tau` below 1 does not answer zero on flat
 * ground: a region of constant brightness `v` comes back as `v * (1 - tau)`.
 * So the level that means "paper" moves with how bright the picture is, and an
 * absolute threshold calibrated on one picture is wrong on the next.
 *
 * Measured, on the same settings: a test card put 2.91% of its pixels below the
 * threshold and a photograph put 0.63%, which is the difference between a
 * drawing and a nearly blank page — and it was nothing to do with how much was
 * in either picture.
 *
 * Dividing by the wide blur, which is the local brightness, and taking off the
 * `1 - tau` that a flat region would have produced, leaves a response that is
 * zero on flat ground whatever its brightness and negative wherever the picture
 * is darker than its surroundings. `epsilon` then means the same thing in every
 * picture, which is the only way a preset can be a preset.
 */
export function dogAcross(field: Field, flow: Flow, sigma: number, k: number, tau: number): Field {
  const { width, height } = field;
  const out = new Float32Array(width * height);
  const wide = sigma * k;
  const radius = Math.max(1, Math.ceil(wide * 3));

  const narrowK = new Float32Array(radius * 2 + 1);
  const wideK = new Float32Array(radius * 2 + 1);
  let narrowSum = 0;
  let wideSum = 0;
  for (let i = -radius; i <= radius; i++) {
    const a = Math.exp(-(i * i) / (2 * sigma * sigma));
    const b = Math.exp(-(i * i) / (2 * wide * wide));
    narrowK[i + radius] = a;
    wideK[i + radius] = b;
    narrowSum += a;
    wideSum += b;
  }
  for (let i = 0; i < narrowK.length; i++) {
    narrowK[i] /= narrowSum;
    wideK[i] /= wideSum;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      // The normal to the tangent: rotate it by a quarter turn.
      const nx = -flow.ty[i];
      const ny = flow.tx[i];
      let narrow = 0;
      let broad = 0;
      for (let j = -radius; j <= radius; j++) {
        const v = sample(field, x + nx * j, y + ny * j);
        narrow += v * narrowK[j + radius];
        broad += v * wideK[j + radius];
      }
      out[i] = normalise(narrow, broad, tau);
    }
  }
  return { width, height, data: out };
}

/**
 * Zero on flat ground, negative where the picture is darker than around it.
 *
 * The floor on the divisor is what stops a nearly black region — where the
 * local brightness is a rounding error — from turning a tiny difference into an
 * enormous one and drawing noise as if it were a line.
 */
function normalise(narrow: number, broad: number, tau: number): number {
  return (narrow - tau * broad) / Math.max(broad, 0.04) - (1 - tau);
}

/**
 * Smooth along the flow, by walking the streamline through each pixel.
 *
 * This is the step that turns a dotted response into a line. Each pixel takes a
 * Gaussian-weighted average of the response at points found by stepping forward
 * and backward along the tangent field, re-reading the direction at every step
 * so the walk bends with the picture instead of running off straight.
 *
 * The sign check is not optional. A tangent field has no consistent direction —
 * neighbouring pixels can carry v and -v for the same line, because the tensor
 * that produced them cannot tell the two apart — so without flipping each step
 * to agree with the last, the walk turns round on itself and averages a pixel
 * with the one it just came from.
 */
export function smoothAlong(values: Field, flow: Flow, sigma: number): Field {
  const { width, height } = values;
  const out = new Float32Array(width * height);
  if (sigma <= 0.01) return { width, height, data: new Float32Array(values.data) };
  const steps = Math.max(1, Math.ceil(sigma * 2));

  const weights = new Float32Array(steps + 1);
  for (let s = 0; s <= steps; s++) weights[s] = Math.exp(-(s * s) / (2 * sigma * sigma));

  const flowAt = (x: number, y: number) => {
    const ix = clamp(Math.round(x), 0, width - 1);
    const iy = clamp(Math.round(y), 0, height - 1);
    const i = iy * width + ix;
    return { x: flow.tx[i], y: flow.ty[i] };
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let sum = values.data[i] * weights[0];
      let total = weights[0];

      for (const direction of [1, -1]) {
        let px = x;
        let py = y;
        let dx = flow.tx[i] * direction;
        let dy = flow.ty[i] * direction;
        for (let s = 1; s <= steps; s++) {
          px += dx;
          py += dy;
          sum += sample(values, px, py) * weights[s];
          total += weights[s];
          const next = flowAt(px, py);
          // Keep going the way we were going, not the way the field happens to
          // have written it down.
          const agree = next.x * dx + next.y * dy >= 0 ? 1 : -1;
          dx = next.x * agree;
          dy = next.y * agree;
        }
      }
      out[i] = sum / total;
    }
  }
  return { width, height, data: out };
}

/**
 * Winnemöller's soft threshold, as ink on paper.
 *
 * Returns a `Gray` in the app's own convention — `INK` is 0 and `PAPER` is 255
 * — so everything downstream (despeckle, dilate, the exporters) works on it
 * unchanged.
 */
export function softThreshold(values: Field, epsilon: number, phi: number): Gray {
  const { width, height, data } = values;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i++) {
    const u = data[i];
    const t = u >= epsilon ? 1 : 1 + Math.tanh(phi * (u - epsilon));
    // t runs 0 (ink) to 1 (paper); 1 is "no less than the surroundings".
    out[i] = clamp(t, 0, 1) * (PAPER - INK) + INK;
  }
  return { width, height, data: out };
}

/* ------------------------------------------------------------- morphology */

/*
  Greyscale, not binary — and this is the whole reason these two exist here
  instead of being borrowed from `pipeline.ts`.

  `dilate` and `despeckle` over there are built for the colouring-book pipeline,
  whose output is strictly two values, and they are written that way: `dilate`
  asks whether a neighbour is `=== INK` and writes `INK` or `PAPER`, nothing
  between. Hand it a soft-threshold result and every midtone fails that test
  and comes out as paper — which is exactly what happened: all four looks
  measured zero midtones, and the softness slider, whose entire job is to put
  tone between the two extremes, was being erased by the next step.
*/

/**
 * Thicken the ink: a minimum filter.
 *
 * Greyscale dilation of dark-on-light is the minimum over the neighbourhood,
 * which grows a line by the radius and leaves a half-tone half-tone. Separable,
 * so the cost does not grow with the square of the radius.
 */
export function thicken(image: Gray, radius: number): Gray {
  if (radius < 1) return { ...image, data: new Uint8ClampedArray(image.data) };
  const pass = (src: Gray, horizontal: boolean): Gray => {
    const { width, height, data } = src;
    const out = new Uint8ClampedArray(data.length);
    const span = horizontal ? width : height;
    const lines = horizontal ? height : width;
    const step = horizontal ? 1 : width;
    for (let line = 0; line < lines; line++) {
      const base = horizontal ? line * width : line;
      for (let i = 0; i < span; i++) {
        let lowest = 255;
        for (let k = -radius; k <= radius; k++) {
          const v = data[base + clamp(i + k, 0, span - 1) * step];
          if (v < lowest) lowest = v;
        }
        out[base + i * step] = lowest;
      }
    }
    return { width, height, data: out };
  };
  return pass(pass(image, true), false);
}

/**
 * Lift off specks, without flattening what is left.
 *
 * Which pixels count as a speck is decided on a binarised copy, because "is
 * this one blob or two" is a yes-or-no question and a half-tone pixel has to
 * fall on one side of it. What happens to the ones that lose is applied to the
 * grey picture: they go to paper, and every pixel that survives keeps the value
 * it had, tone and all.
 */
export function deSpeckle(image: Gray, minArea: number, cut = 128): Gray {
  if (minArea < 2) return { ...image, data: new Uint8ClampedArray(image.data) };
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data);
  const seen = new Uint8Array(width * height);

  for (let start = 0; start < data.length; start++) {
    if (data[start] >= cut || seen[start]) continue;
    const region = flood({
      width,
      height,
      seeds: [start],
      seen,
      passable: (i) => data[i] < cut,
    });
    if (region.length < minArea) for (const i of region) out[i] = PAPER;
  }
  return { width, height, data: out };
}

/* ------------------------------------------------------------------- whole */

/**
 * A picture in, line art out.
 *
 * The same bytes in give the same bytes out, every time, on every machine:
 * nothing here reads a clock, a random number or anything outside its
 * arguments. `tests/xdog.test.mjs` pins that down with pixel hashes.
 */
export function runClassic(source: Bitmap, settings: ClassicSettings): Gray {
  const p = resolveClassic(settings);
  const flowy = CLASSIC_LOOKS[settings.look].flow;

  /*
    Down to the working size first, and never up.

    This is the other half of the decision at `CLASSIC_WORKING_EDGE`: the
    parameters are fixed in pixels, so the picture is the thing that moves. A
    bigger picture is reduced to the working edge and comes back at that size,
    which is more than enough for a sticker or a colouring page; a smaller one
    is left exactly as it is, because enlarging it would invent detail the
    engine would then faithfully draw.
  */
  /*
    Onto white first, because "transparent" and "black" are the same three
    bytes and only the fourth tells them apart. A PNG with a cut-out background
    carries 0,0,0,0 everywhere outside the subject; read as grey without
    looking at the alpha, that is a solid black page, and the engine duly finds
    no edges in it at all. Measured before this line went in: a transparent
    sticker came back as one black rectangle.
  */
  const grey = reduce(toGray(flattenOntoWhite(source), settings.invert), CLASSIC_WORKING_EDGE);
  let field = toField(grey);
  if (p.preBlur > 0.01) field = gaussian(field, p.preBlur);

  let response: Field;
  if (flowy) {
    const flow = tangentFlow(field, p.flowSigma);
    response = dogAcross(field, flow, p.sigma, p.k, p.tau);
    response = smoothAlong(response, flow, p.sigmaAlong);
  } else {
    // Isotropic: the plain two-dimensional difference of Gaussians. Looser and
    // grainier, which is exactly what Sketch is after.
    const narrow = gaussian(field, p.sigma);
    const broad = gaussian(field, p.sigma * p.k);
    const data = new Float32Array(field.data.length);
    // Normalised the same way, for the same reason: see `dogAcross`.
    for (let i = 0; i < data.length; i++) data[i] = normalise(narrow.data[i], broad.data[i], p.tau);
    response = { width: field.width, height: field.height, data };
  }

  let out = softThreshold(response, p.epsilon, p.phi);
  if (p.dilateRadius > 0) out = thicken(out, p.dilateRadius);
  if (p.minArea > 0) out = deSpeckle(out, p.minArea);
  return out;
}
