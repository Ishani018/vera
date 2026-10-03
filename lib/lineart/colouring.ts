/**
 * Colouring page mode: a picture turned into shapes you can fill in.
 *
 * Different in kind from the pen looks in `xdog.ts`. Those answer "where is
 * this picture darker than its surroundings" and give you lines. This one
 * answers "what are the areas" and gives you a map: the colours are reduced to
 * a handful, the picture is cut into connected regions of one colour each, the
 * slivers are merged into whatever they are most like, and the outline is
 * whatever separates one region from the next.
 *
 * ## The one thing that must be true
 *
 * **Every outline is closed.** A colouring page with a gap in it is not a
 * colouring page: one tap of a fill tool and the whole sheet goes pink. This is
 * not approached by drawing carefully and hoping — it falls out of how the
 * outline is defined, and the proof is short enough to state here.
 *
 * Mark a pixel as outline when the pixel to its right or the pixel below it has
 * a different region label. Now take any two neighbouring pixels `p` and `q`
 * that are both NOT outline, and consider the four ways `q` can sit next to `p`:
 *
 * - `q` is right of `p`: `p` is not outline, so `p` and its right neighbour
 *   share a label.
 * - `q` is below `p`: likewise.
 * - `q` is left of `p`: then `p` is `q`'s right neighbour, and `q` is not
 *   outline, so they share a label.
 * - `q` is above `p`: then `p` is `q`'s lower neighbour, same again.
 *
 * In every case `p` and `q` carry the same label. So the label is constant
 * along any four-connected path of non-outline pixels, which is exactly to say
 * a four-connected fill started inside one region can never arrive inside
 * another. `tests/colouring.test.mjs` fills from every region of a real picture
 * and checks it, but the guarantee is in the definition, not in the test.
 *
 * All original code, written from the published mathematics. See
 * `docs/ALGORITHMS.md`.
 */

import {
  INK,
  PAPER,
  flattenOntoWhite,
  reduce,
  toGray,
  toLab,
  type Bitmap,
  type Gray,
  type Lab,
} from './pipeline';
import { CLASSIC_WORKING_EDGE, thicken } from './xdog';
import { prepare } from './smooth';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type ColouringSettings = {
  /** 0–100. How many areas to aim for: a few big shapes, or many small ones. */
  complexity: number;
  /** 0–100. Anything smaller than this is absorbed into its neighbour. */
  minRegion: number;
  /** 0–100. How heavy the outline is. */
  thickness: number;
  /** 0–100. Edge-preserving smoothing first, as everywhere else. */
  smoothing: number;
  /** For art that is light on dark. */
  invert: boolean;
};

export const COLOURING_DEFAULTS: ColouringSettings = {
  complexity: 45,
  minRegion: 40,
  thickness: 45,
  smoothing: 60,
  invert: false,
};

/**
 * The sliders, turned into numbers. Pure, so the mapping can be tested.
 *
 * Colours and areas, unlike `xdog.ts`'s kernels, are not measured in pixels —
 * a region is a share of the picture — so these do scale with it.
 */
export function resolveColouring(settings: ColouringSettings, pixels: number) {
  const complexity = clamp(settings.complexity, 0, 100) / 100;
  const minRegion = clamp(settings.minRegion, 0, 100) / 100;
  const thickness = clamp(settings.thickness, 0, 100) / 100;

  return {
    /**
     * How many colours the picture is reduced to.
     *
     * Four to twenty-four. Below four a photograph loses the shapes along with
     * the colours; above about twenty-four the extra ones land inside areas
     * that were already one thing and the page turns to confetti.
     */
    colours: Math.round(lerp(4, 24, complexity)),
    /**
     * The smallest area that survives, in pixels.
     *
     * A share of the picture rather than a count, so the same slider means the
     * same thing on a phone photograph and on a scan. Geometric, because the
     * interesting part is at the small end: the difference between 1/20000 and
     * 1/5000 of the page is the difference between keeping an eye and losing
     * it, and the difference between 1/500 and 1/200 is barely visible.
     */
    minArea: Math.max(4, Math.round(pixels * 0.00004 * Math.pow(250, minRegion))),
    /** How far the one-pixel outline is grown. */
    thicken: thickness > 0.02 ? Math.max(1, Math.round(lerp(0, 3, thickness))) : 0,
    /** How hard k-means works before it is made to stop. */
    rounds: 12,
  };
}

/* ------------------------------------------------------------- quantising */

/**
 * A pseudo-random sequence that is the same every time.
 *
 * k-means++ picks its starting centres with a weighted draw, which is the part
 * of the algorithm that makes it good and the part that makes it unrepeatable.
 * The weighting is kept and the draw is made from a fixed sequence, so the
 * seeding is still spread out across the picture and the answer is still the
 * same on every machine on every run.
 */
function sequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // xorshift32: cheap, and its period is far longer than anything here needs.
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/** Squared distance in Lab, which is the whole reason for working in Lab. */
function distance(
  l1: number, a1: number, b1: number,
  l2: number, a2: number, b2: number,
): number {
  const dl = l1 - l2;
  const da = a1 - a2;
  const db = b1 - b2;
  return dl * dl + da * da + db * db;
}

export type Quantised = {
  /** One centre index per pixel. */
  labels: Int32Array;
  /** The centres themselves, in Lab. */
  l: Float32Array;
  a: Float32Array;
  b: Float32Array;
};

/**
 * Reduce the picture to `k` colours, in Lab, repeatably.
 *
 * Lab rather than RGB because the whole question is "are these two the same
 * colour to a person", and that is what Lab is for: equal distances in it are
 * roughly equal differences to the eye, which is not remotely true in RGB.
 *
 * The fitting runs on a sample rather than on every pixel. At the working size
 * that is one and a half million points through a dozen rounds, and the centres
 * a good sample finds are indistinguishable from the centres all of them find.
 * The sample is taken by a fixed stride, so it too is the same every run.
 */
export function quantise(lab: Lab, k: number, rounds: number): Quantised {
  const n = lab.width * lab.height;
  const wanted = Math.min(n, 20000);
  const stride = Math.max(1, Math.floor(n / wanted));
  const sample: number[] = [];
  for (let i = 0; i < n; i += stride) sample.push(i);

  const cl = new Float32Array(k);
  const ca = new Float32Array(k);
  const cb = new Float32Array(k);

  // k-means++ seeding: the first centre by the fixed draw, and each one after
  // it weighted towards the points that are furthest from what we have.
  const random = sequence(0x5eed1e);
  let first = sample[Math.floor(random() * sample.length)] ?? 0;
  cl[0] = lab.l[first];
  ca[0] = lab.a[first];
  cb[0] = lab.b[first];

  const nearest = new Float32Array(sample.length).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let s = 0; s < sample.length; s++) {
      const i = sample[s];
      const d = distance(lab.l[i], lab.a[i], lab.b[i], cl[c - 1], ca[c - 1], cb[c - 1]);
      if (d < nearest[s]) nearest[s] = d;
      total += nearest[s];
    }
    let target = random() * total;
    let chosen = sample[sample.length - 1];
    for (let s = 0; s < sample.length; s++) {
      target -= nearest[s];
      if (target <= 0) {
        chosen = sample[s];
        break;
      }
    }
    cl[c] = lab.l[chosen];
    ca[c] = lab.a[chosen];
    cb[c] = lab.b[chosen];
  }

  // Lloyd's iterations, on the sample.
  const sumL = new Float64Array(k);
  const sumA = new Float64Array(k);
  const sumB = new Float64Array(k);
  const counts = new Int32Array(k);
  for (let round = 0; round < rounds; round++) {
    sumL.fill(0); sumA.fill(0); sumB.fill(0); counts.fill(0);
    for (const i of sample) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = distance(lab.l[i], lab.a[i], lab.b[i], cl[c], ca[c], cb[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      sumL[best] += lab.l[i]; sumA[best] += lab.a[i]; sumB[best] += lab.b[i];
      counts[best] += 1;
    }
    let moved = 0;
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      const nl = sumL[c] / counts[c];
      const na = sumA[c] / counts[c];
      const nb = sumB[c] / counts[c];
      moved += Math.abs(nl - cl[c]) + Math.abs(na - ca[c]) + Math.abs(nb - cb[c]);
      cl[c] = nl; ca[c] = na; cb[c] = nb;
    }
    // Settled. Stopping early is not an optimisation here, it is what makes
    // the answer independent of how many rounds anybody asked for.
    if (moved < 0.01) break;
  }

  // And now every pixel, against the centres the sample found.
  const labels = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < k; c++) {
      const d = distance(lab.l[i], lab.a[i], lab.b[i], cl[c], ca[c], cb[c]);
      if (d < bestD) { bestD = d; best = c; }
    }
    labels[i] = best;
  }
  return { labels, l: cl, a: ca, b: cb };
}

/* --------------------------------------------------------------- regions */

export type Regions = {
  width: number;
  height: number;
  /** One region id per pixel. Ids are contiguous from zero. */
  ids: Int32Array;
  /** How many pixels each region has. */
  sizes: Int32Array;
  /** Which quantised colour each region is. */
  colour: Int32Array;
};

/**
 * Connected components: areas of one colour that actually touch.
 *
 * Two patches of the same blue on opposite sides of a face are two things to
 * colour in, not one, so the colour label is not enough and this walks the
 * picture. Four-connected, because a diagonal touch is not a join — and because
 * the closedness proof above is a four-connected argument, so everything here
 * has to agree with it.
 *
 * An explicit stack rather than recursion: a region can be most of the page.
 */
export function labelRegions(labels: Int32Array, width: number, height: number): Regions {
  const n = width * height;
  const ids = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const colour: number[] = [];
  const stack: number[] = [];

  for (let start = 0; start < n; start++) {
    if (ids[start] !== -1) continue;
    const id = sizes.length;
    const want = labels[start];
    sizes.push(0);
    colour.push(want);
    ids[start] = id;
    stack.push(start);
    let count = 0;
    while (stack.length) {
      const i = stack.pop()!;
      count += 1;
      const x = i % width;
      const y = (i / width) | 0;
      if (x > 0) push(i - 1);
      if (x < width - 1) push(i + 1);
      if (y > 0) push(i - width);
      if (y < height - 1) push(i + width);
    }
    sizes[id] = count;

    function push(j: number) {
      if (ids[j] === -1 && labels[j] === want) {
        ids[j] = id;
        stack.push(j);
      }
    }
  }

  return {
    width,
    height,
    ids,
    sizes: Int32Array.from(sizes),
    colour: Int32Array.from(colour),
  };
}

/**
 * Absorb the slivers.
 *
 * A photograph quantised into a dozen colours leaves thousands of regions three
 * pixels across — the speckle along every soft edge. Nobody is colouring those
 * in, and each one is two more lines on the page. Each is merged into whichever
 * neighbour it touches whose colour is nearest in Lab, which is the neighbour a
 * person would say it was part of.
 *
 * Smallest first, and repeatedly: merging two slivers can make one region big
 * enough to keep, and a sliver whose only neighbours are slivers has to wait
 * for them to become something before it can join. One pass leaves a tide line
 * of leftovers along every edge; this keeps going until nothing moves.
 */
export function mergeSmall(regions: Regions, quantised: Quantised, minArea: number): Regions {
  const { width, height, ids } = regions;
  const n = width * height;
  // Which region each region has been absorbed into, resolved lazily.
  const into = new Int32Array(regions.sizes.length);
  for (let i = 0; i < into.length; i++) into[i] = i;
  const resolve = (id: number): number => {
    let r = id;
    while (into[r] !== r) r = into[r];
    // Flatten, so a long chain of merges is walked once rather than every time.
    let walk = id;
    while (into[walk] !== walk) {
      const next = into[walk];
      into[walk] = r;
      walk = next;
    }
    return r;
  };

  const sizes = Int32Array.from(regions.sizes);
  const colour = Int32Array.from(regions.colour);

  for (let pass = 0; pass < 12; pass++) {
    // Who touches whom, for the regions that are still too small.
    const neighbours = new Map<number, Set<number>>();
    for (let i = 0; i < n; i++) {
      const a = resolve(ids[i]);
      const x = i % width;
      const y = (i / width) | 0;
      if (x < width - 1) note(a, resolve(ids[i + 1]));
      if (y < height - 1) note(a, resolve(ids[i + width]));
    }

    const small = [...neighbours.keys()].filter((id) => sizes[id] < minArea);
    if (!small.length) break;
    small.sort((p, q) => sizes[p] - sizes[q]);

    let merged = 0;
    for (const id of small) {
      if (resolve(id) !== id || sizes[id] >= minArea) continue;
      let best = -1;
      let bestD = Infinity;
      for (const other of neighbours.get(id) ?? []) {
        const o = resolve(other);
        if (o === id) continue;
        const d = distance(
          quantised.l[colour[id]], quantised.a[colour[id]], quantised.b[colour[id]],
          quantised.l[colour[o]], quantised.a[colour[o]], quantised.b[colour[o]],
        );
        // Ties go to the bigger neighbour, so a sliver between two equals joins
        // the one it is more likely to be part of — and so the answer does not
        // depend on which order a Set happened to iterate in.
        if (d < bestD || (d === bestD && best >= 0 && sizes[o] > sizes[best])) {
          bestD = d;
          best = o;
        }
      }
      if (best < 0) continue;
      into[id] = best;
      sizes[best] += sizes[id];
      sizes[id] = 0;
      merged += 1;
    }
    if (merged === 0) break;

    function note(a: number, b: number) {
      if (a === b) return;
      if (!neighbours.has(a)) neighbours.set(a, new Set());
      if (!neighbours.has(b)) neighbours.set(b, new Set());
      neighbours.get(a)!.add(b);
      neighbours.get(b)!.add(a);
    }
  }

  // Renumber so the ids are contiguous again.
  const renumber = new Map<number, number>();
  const outIds = new Int32Array(n);
  const outSizes: number[] = [];
  const outColour: number[] = [];
  for (let i = 0; i < n; i++) {
    const root = resolve(ids[i]);
    let id = renumber.get(root);
    if (id === undefined) {
      id = outSizes.length;
      renumber.set(root, id);
      outSizes.push(0);
      outColour.push(colour[root]);
    }
    outIds[i] = id;
    outSizes[id] += 1;
  }
  return {
    width,
    height,
    ids: outIds,
    sizes: Int32Array.from(outSizes),
    colour: Int32Array.from(outColour),
  };
}

/**
 * The outline: one pixel wide, and closed by construction.
 *
 * See the proof at the top of this file. A pixel is outline when the pixel to
 * its right or the pixel below it belongs to a different region — which marks
 * exactly one side of every boundary, so the line is one pixel wide and still
 * separates everything from everything.
 *
 * The right and bottom edges of the picture are marked too. Without that, a
 * fill started in a region that reaches the edge escapes round the outside of
 * the page and into every other region that touches it.
 */
export function outline(regions: Regions): Gray {
  const { width, height, ids } = regions;
  const data = new Uint8ClampedArray(width * height).fill(PAPER);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const edge =
        x === width - 1 ||
        y === height - 1 ||
        ids[i] !== ids[i + 1] ||
        ids[i] !== ids[i + width];
      if (edge) data[i] = INK;
    }
  }
  return { width, height, data };
}

/* ------------------------------------------------------------------ whole */

/** A picture in, a colouring page out. */
export function runColouring(source: Bitmap, settings: ColouringSettings): Gray {
  return colouringPage(source, settings).page;
}

/**
 * The same, with the regions it was drawn from.
 *
 * Exported so the closedness guarantee can be checked end to end rather than
 * only on synthetic regions: the test fills every white area of the finished
 * page and asserts each one lies inside a single region. Nothing in the app
 * needs the regions, but a promise nobody can check is not a promise.
 */
export function colouringPage(
  source: Bitmap,
  settings: ColouringSettings,
): { page: Gray; regions: Regions } {
  const flat = flattenOntoWhite(source);
  // Reduced the same way and to the same size as every other look, so the Lab
  // and the grey agree pixel for pixel.
  const grey = reduce(toGray(flat, settings.invert), CLASSIC_WORKING_EDGE);
  const width = grey.width;
  const height = grey.height;
  const p = resolveColouring(settings, width * height);

  const lab = labOf(flat, width, height, settings);
  const quantised = quantise(lab, p.colours, p.rounds);
  let regions = labelRegions(quantised.labels, width, height);
  regions = mergeSmall(regions, quantised, p.minArea);

  let page = outline(regions);
  if (p.thicken > 0) page = thicken(page, p.thicken);
  return { page, regions };
}

/**
 * The picture in Lab, at the working size, smoothed first.
 *
 * Smoothed for the same reason the pen looks are: quantising a grainy
 * photograph puts every grain on a colour boundary of its own and the page
 * comes out as static. The smoothing runs on each plane separately — they are
 * three independent pictures as far as an edge-preserving filter is concerned,
 * and a filter that mixed them would move colours rather than clean them.
 */
function labOf(flat: Bitmap, width: number, height: number, settings: ColouringSettings): Lab {
  const full = toLab(flat, settings.invert);
  const planes: Float32Array[] = [];
  // Lab's lightness runs 0–100 and the two colour axes run either side of zero;
  // the filters expect something near 0–1, so each plane goes in and out on its
  // own scale rather than being smoothed in units it was not written for.
  const scales: Array<[Float32Array, number, number]> = [
    [full.l, 0, 100],
    [full.a, -128, 255],
    [full.b, -128, 255],
  ];
  const amount = clamp(settings.smoothing, 0, 100) / 100;
  for (const [plane, offset, span] of scales) {
    const small = resampleTo(plane, full.width, full.height, width, height);
    const field = { width, height, data: Float32Array.from(small, (v) => (v - offset) / span) };
    const cleaned = prepare(field, { style: 'bilateral', amount, contrast: 0 });
    planes.push(Float32Array.from(cleaned.data, (v) => v * span + offset));
  }
  return { width, height, l: planes[0], a: planes[1], b: planes[2] };
}

/** Area-averaging reduction of one float plane, to match `reduce`'s geometry. */
function resampleTo(
  plane: Float32Array,
  fromWidth: number,
  fromHeight: number,
  toWidth: number,
  toHeight: number,
): Float32Array {
  if (fromWidth === toWidth && fromHeight === toHeight) return plane;
  const out = new Float32Array(toWidth * toHeight);
  const sx = fromWidth / toWidth;
  const sy = fromHeight / toHeight;
  for (let y = 0; y < toHeight; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < toWidth; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let sum = 0;
      let count = 0;
      for (let yy = y0; yy < y1 && yy < fromHeight; yy++) {
        for (let xx = x0; xx < x1 && xx < fromWidth; xx++) {
          sum += plane[yy * fromWidth + xx];
          count += 1;
        }
      }
      out[y * toWidth + x] = count ? sum / count : 0;
    }
  }
  return out;
}
