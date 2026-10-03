/**
 * Cleaning the picture up before any line is drawn.
 *
 * The engine in `xdog.ts` answers one question very literally: where is this
 * picture darker than its surroundings? Film grain, sensor noise, canvas weave
 * and JPEG mosquito noise are all, at their own scale, honest answers to that
 * question — which is why an unfiltered photograph comes back stippled all over
 * the sky. A plain blur fixes it by destroying the edges too, which is the one
 * thing we are here to find.
 *
 * So: smoothing that knows what an edge is. Two kinds, because they fail
 * differently and the looks want different things.
 *
 * **Bilateral** averages a neighbourhood but weights each neighbour by how
 * similar it is as well as how close, so a pixel on one side of an edge is
 * barely influenced by pixels on the other. Flat areas go smooth, edges stay
 * put. It is the honest default.
 *
 * **Anisotropic Kuwahara** does something stranger and much more useful for a
 * drawing: it divides the neighbourhood into sectors, measures how uniform each
 * one is, and takes its answer mostly from the most uniform. The effect is that
 * detail does not merely survive, it is pushed towards flat shapes with crisp
 * boundaries — the picture starts to look painted rather than photographed,
 * which is exactly the input a pen wants.
 *
 * All original code, written from the published mathematics. See
 * `docs/ALGORITHMS.md`.
 */

import { fastBlur, tangentFlow, type Field, type Flow } from './xdog';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Which kind of smoothing a look asks for. */
export type SmoothStyle = 'none' | 'bilateral' | 'kuwahara';

/**
 * Edge-preserving smoothing, the separable way.
 *
 * A true bilateral filter is not separable: its weights depend on the centre
 * pixel, so a horizontal pass followed by a vertical one is an approximation
 * rather than the same thing. It is a well-known and well-behaved
 * approximation, and it turns a cost that grows with the square of the radius
 * into one that grows linearly — which at the working size is the difference
 * between a filter you can put behind a live slider and one you cannot.
 *
 * It is written down here as an approximation rather than quietly passed off as
 * the real thing. The visible difference is a slight directional bias at
 * corners, which at the radii used here is nothing against the grain it removes.
 *
 * `rangeSigma` is in the same units as the data: these fields run 0 to 1, so
 * 0.1 means "a tenth of the full tonal range counts as a different thing".
 */
export function bilateral(field: Field, spatialSigma: number, rangeSigma: number): Field {
  if (spatialSigma <= 0.01 || rangeSigma <= 0) {
    return { ...field, data: new Float32Array(field.data) };
  }
  const radius = Math.max(1, Math.ceil(spatialSigma * 2));
  const spatial = new Float32Array(radius * 2 + 1);
  for (let i = -radius; i <= radius; i++) {
    spatial[i + radius] = Math.exp(-(i * i) / (2 * spatialSigma * spatialSigma));
  }
  // A lookup rather than an exp() per neighbour: the range term is a function
  // of one difference, and there are only so many differences worth telling
  // apart. 512 steps across the full range is well under a grey level.
  const STEPS = 512;
  const range = new Float32Array(STEPS + 1);
  for (let i = 0; i <= STEPS; i++) {
    const d = i / STEPS;
    range[i] = Math.exp(-(d * d) / (2 * rangeSigma * rangeSigma));
  }

  const pass = (src: Field, horizontal: boolean): Field => {
    const { width, height, data } = src;
    const out = new Float32Array(data.length);
    const span = horizontal ? width : height;
    const lines = horizontal ? height : width;
    const step = horizontal ? 1 : width;
    for (let line = 0; line < lines; line++) {
      const base = horizontal ? line * width : line;
      for (let i = 0; i < span; i++) {
        const here = data[base + i * step];
        let sum = 0;
        let total = 0;
        for (let j = -radius; j <= radius; j++) {
          const v = data[base + clamp(i + j, 0, span - 1) * step];
          const d = Math.abs(v - here);
          const w = spatial[j + radius] * range[d >= 1 ? STEPS : (d * STEPS) | 0];
          sum += v * w;
          total += w;
        }
        out[base + i * step] = total > 0 ? sum / total : here;
      }
    }
    return { width, height, data: out };
  };
  return pass(pass(field, true), false);
}

/**
 * Which of eight equal sectors a direction falls in, by comparison alone.
 *
 * Eight equal sectors of a turn ARE the octants, so the boundaries fall exactly
 * where a sign test and a magnitude test put them. This replaced an `atan2`
 * per sample, which at the working size is 119 million of them and was most of
 * the filter's running time: the whole thing went from 7.9 seconds to well
 * under two, for identical output. There is a test that checks it agrees with
 * the trigonometry it replaced, because "identical" is a claim.
 */
export function octant(u: number, v: number): number {
  const au = u < 0 ? -u : u;
  const av = v < 0 ? -v : v;
  if (v >= 0) {
    if (u >= 0) return av < au ? 0 : 1;
    return au < av ? 2 : 3;
  }
  if (u < 0) return av < au ? 4 : 5;
  return au < av ? 6 : 7;
}

/**
 * `variance` to the power of half the sharpness, for the integer sharpnesses
 * this filter actually uses. `Math.pow` with a fractional exponent is a call;
 * this is three multiplications.
 */
function power(variance: number, sharpness: number): number {
  const half = sharpness / 2;
  if (half === 4) {
    const v2 = variance * variance;
    return v2 * v2;
  }
  return Math.pow(variance, half);
}

/** How many sectors the neighbourhood is cut into. Eight is the usual choice. */
const SECTORS = 8;

/**
 * Smoothing that follows the picture, and flattens towards shapes.
 *
 * The neighbourhood is an ellipse rather than a disc: stretched along the local
 * tangent and squeezed across it, so it reaches a long way down a line and
 * hardly at all across one. That ellipse is cut into eight sectors, and each
 * sector's mean and variance are measured. The answer is a weighted blend of
 * the sector means in which a uniform sector counts for far more than a mixed
 * one — so a pixel sitting on an edge takes its value from the flat side rather
 * than from the average of both, and the edge comes out sharper than it went in.
 *
 * `sharpness` is how strongly uniformity is rewarded. At 0 this is an ordinary
 * elliptical blur; raised, it turns a photograph into something closer to flat
 * paint, which is what the pen wants to trace.
 */
export function anisotropicKuwahara(
  field: Field,
  flow: Flow,
  radius: number,
  sharpness: number,
  eccentricity: number,
): Field {
  const { width, height, data } = field;
  if (radius < 1) return { width, height, data: new Float32Array(data) };
  const out = new Float32Array(data.length);
  // How far the ellipse reaches along the tangent against across it.
  const along = 1 + clamp(eccentricity, 0, 4);
  const across = 1 / along;

  const sums = new Float64Array(SECTORS);
  const squares = new Float64Array(SECTORS);
  const counts = new Int32Array(SECTORS);
  const means = new Float64Array(SECTORS);
  const spreads = new Float64Array(SECTORS);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const tx = flow.tx[i];
      const ty = flow.ty[i];
      sums.fill(0);
      squares.fill(0);
      counts.fill(0);

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          // Into the ellipse's own frame: along the tangent, and across it.
          const u = (dx * tx + dy * ty) / along;
          const v = (-dx * ty + dy * tx) / across;
          if (u * u + v * v > radius * radius) continue;
          const sx = clamp(x + dx, 0, width - 1);
          const sy = clamp(y + dy, 0, height - 1);
          const value = data[sy * width + sx];
          // Which sector, measured in the ellipse's frame so the sectors turn
          // with the picture rather than staying pinned to the screen.
          const sector = octant(u, v);
          sums[sector] += value;
          squares[sector] += value * value;
          counts[sector] += 1;
        }
      }

      let weighted = 0;
      let total = 0;
      for (let s = 0; s < SECTORS; s++) {
        if (counts[s] === 0) continue;
        const mean = sums[s] / counts[s];
        // Variance, floored so a perfectly flat sector does not divide by zero
        // and win everything outright.
        const variance = Math.max(1e-6, squares[s] / counts[s] - mean * mean);
        means[s] = mean;
        spreads[s] = variance;
        const weight = 1 / (1 + power(variance, sharpness));
        weighted += mean * weight;
        total += weight;
      }
      out[i] = total > 0 ? weighted / total : data[i];
    }
  }
  return { width, height, data: out };
}

/**
 * Local contrast normalisation.
 *
 * The problem it solves: a picture is rarely lit evenly, and a line in the
 * shadow of a photograph is a far smaller change in brightness than the same
 * line in the sun. One threshold cannot serve both — the bright half comes out
 * scribbled and the dark half comes out blank.
 *
 * Each pixel is re-expressed as how far it sits from its own neighbourhood's
 * mean, in units of that neighbourhood's own spread. A faint line on a flat
 * dark wall and a strong line on a bright one then look the same to everything
 * downstream.
 *
 * `strength` blends the result back towards the original, because taken to the
 * full the effect also amplifies noise in genuinely flat areas — hence the
 * floor on the spread, which stops a region with nothing in it from having its
 * nothing multiplied up into something.
 */
export function localContrast(field: Field, radius: number, strength: number): Field {
  if (strength <= 0 || radius < 1) return { ...field, data: new Float32Array(field.data) };
  const { width, height, data } = field;
  const squares = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) squares[i] = data[i] * data[i];

  const sigma = radius / 2;
  // A local mean and a local variance: statistics again, so the fast blur.
  const mean = fastBlur(field, sigma).data;
  const meanOfSquares = fastBlur({ width, height, data: squares }, sigma).data;

  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const variance = Math.max(0, meanOfSquares[i] - mean[i] * mean[i]);
    // The floor is what stops flat ground being amplified into noise: below
    // about a fiftieth of the range, a neighbourhood has no contrast to
    // normalise and is left where it is.
    const spread = Math.sqrt(variance) + 0.02;
    const normalised = clamp(0.5 + (data[i] - mean[i]) / (spread * 4), 0, 1);
    out[i] = data[i] + (normalised - data[i]) * strength;
  }
  return { width, height, data: out };
}

/**
 * The whole front end: clean the picture, then hand it on.
 *
 * Kept as one function so the order is decided in one place. It matters:
 * smoothing first and normalising second means the normalisation measures a
 * spread that noise has already been taken out of, which is the point. The
 * other way round amplifies the grain and then carefully preserves it.
 */
export function prepare(
  field: Field,
  options: {
    style: SmoothStyle;
    /** 0–1. How hard to smooth. */
    amount: number;
    /** 0–1. How far to even out local contrast. */
    contrast: number;
    /** Reused when the caller already has one; worked out here otherwise. */
    flow?: Flow;
  },
): Field {
  let out = field;
  if (options.amount > 0.001 && options.style !== 'none') {
    if (options.style === 'bilateral') {
      // Measured ranges: below about 0.06 the range term stops distinguishing
      // grain from detail, and above 0.2 it stops being edge-preserving at all.
      out = bilateral(out, 1 + options.amount * 5, 0.06 + options.amount * 0.1);
    } else {
      const flow = options.flow ?? tangentFlow(out, 2);
      /*
        The radius is held down deliberately. The cost of this filter grows with
        its square — at radius 4 that is 81 samples for each of 1.47 million
        pixels — and measured at the working size, 4 took five seconds against
        three seconds for 3, for a difference nobody can see in the drawing.
      */
      out = anisotropicKuwahara(out, flow, Math.max(1, Math.round(1 + options.amount * 3.6)), 8, 1.4);
    }
  }
  if (options.contrast > 0.001) {
    out = localContrast(out, Math.max(4, Math.round(24 * (1 - options.contrast) + 8)), options.contrast);
  }
  return out;
}
