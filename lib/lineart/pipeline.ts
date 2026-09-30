import type { LineArtSettings, SourceKind } from '../types';

/**
 * Turning a painting into line art.
 *
 * Every step here is a fixed arithmetic operation on pixels: a weighted sum, a
 * comparison against a local mean, a morphological open. Nothing is generated,
 * invented or inferred. The same picture and the same settings give the same
 * bytes every time, which is the property that matters — it is what makes the
 * output a filtered version of the poet's own painting rather than a new work
 * derived from a model.
 *
 * Written against plain typed arrays rather than a computer-vision library so
 * it can be exercised by the unit tests, and so the whole of it is readable.
 */

/** RGBA, as it comes out of a canvas. */
export type Bitmap = { width: number; height: number; data: Uint8ClampedArray };

/** One byte per pixel. In binary images, ink is 0 and paper is 255. */
export type Gray = { width: number; height: number; data: Uint8ClampedArray };

/**
 * CIE L*a*b*, one plane each. Lightness, green-to-red, blue-to-yellow.
 *
 * Kept as floats rather than bytes because a and b run either side of zero and
 * the whole reason for the space is that distances in it mean something: two
 * colours a person calls plainly different are far apart here even when they
 * are the same brightness.
 */
export type Lab = {
  width: number;
  height: number;
  l: Float32Array;
  a: Float32Array;
  b: Float32Array;
};

/** A gradient field: the rate of change in x and y at every pixel. */
export type Gradient = { width: number; height: number; gx: Float32Array; gy: Float32Array };

/**
 * A gradient field thinned to its ridge lines: how strong an edge is at each
 * pixel, zero everywhere that is not the crest of one.
 *
 * Separate from the thresholds that follow it because the thinning does not
 * depend on them. Only the cut between "edge" and "not an edge" moves when the
 * detail slider moves, so the ridges are worth keeping across a drag.
 */
export type Ridges = { width: number; height: number; values: Float32Array };

export const INK = 0;
export const PAPER = 255;

/**
 * The largest edge the converter traces at.
 *
 * Short of the 3375 pixels a full-bleed 8.5 × 11 page needs at 300 DPI, and
 * deliberately so. Every pass here costs with the area, so tracing a 4000-pixel
 * scan at full size is four times the work of tracing it at 2000 — and the
 * finished lines are enlarged to the printing size afterwards anyway, which is
 * a cheap operation on a two-colour picture and loses almost nothing, because
 * what is being enlarged is a few hard edges rather than a photograph. Tracing
 * above about this size buys detail a coloring page has no use for.
 *
 * Lives here rather than in the worker so the interface can do the same
 * arithmetic without importing one.
 */
export const TRACE_EDGE = 2400;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const odd = (n: number) => (Math.round(n) % 2 === 0 ? Math.round(n) + 1 : Math.round(n));

/* ------------------------------------------------------------------- steps */

/**
 * Rec. 709 luma. Not a plain average: the eye is far more sensitive to green
 * than to blue, and averaging turns a saturated blue and a saturated green of
 * the same apparent lightness into very different greys.
 */
export function toGray(source: Bitmap, invert = false): Gray {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; p < out.length; i += 4, p += 1) {
    const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    out[p] = invert ? 255 - luma : luma;
  }
  return { width, height, data: out };
}

/** sRGB's transfer curve, undone once for each of the 256 possible values. */
const LINEAR = (() => {
  const table = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    const c = v / 255;
    table[v] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return table;
})();

const labF = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);

/**
 * Into CIE L*a*b*, which is where "these two look different" is a distance.
 *
 * The reason this exists is the case grey cannot handle: a red square beside a
 * teal one, both about as bright as each other. To a luma channel there is
 * almost nothing between them, so the boundary vanishes and the page comes back
 * with a hole in it. In Lab the same pair are nearly a hundred units apart,
 * because they differ in hue rather than in lightness, and an edge finder
 * looking at all three planes finds the line exactly where the eye does.
 */
export function toLab(source: Bitmap, invert = false): Lab {
  const { width, height, data } = source;
  const count = width * height;
  const l = new Float32Array(count);
  const a = new Float32Array(count);
  const b = new Float32Array(count);

  for (let i = 0, p = 0; p < count; i += 4, p += 1) {
    const r = LINEAR[invert ? 255 - data[i] : data[i]];
    const g = LINEAR[invert ? 255 - data[i + 1] : data[i + 1]];
    const bl = LINEAR[invert ? 255 - data[i + 2] : data[i + 2]];

    // sRGB to XYZ under D65, then normalised by the white point.
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    const z = (0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883;

    const fx = labF(x);
    const fy = labF(y);
    const fz = labF(z);
    l[p] = 116 * fy - 16;
    a[p] = 500 * (fx - fy);
    b[p] = 200 * (fy - fz);
  }
  return { width, height, l, a, b };
}

/** Lightness on its own, as a grey picture the rest of the pipeline can use. */
export function lightness(lab: Lab): Gray {
  const out = new Uint8ClampedArray(lab.l.length);
  for (let i = 0; i < out.length; i++) out[i] = (lab.l[i] * 255) / 100;
  return { width: lab.width, height: lab.height, data: out };
}

/**
 * Three box blurs in a row, which is close enough to a Gaussian for this and a
 * great deal faster: each pass is two separable sweeps of running sums, so the
 * cost does not grow with the radius.
 */
export function blur(image: Gray, radius: number): Gray {
  if (radius < 1) return { ...image, data: new Uint8ClampedArray(image.data) };
  let current = image;
  for (let pass = 0; pass < 3; pass++) {
    current = boxPass(boxPass(current, radius, true), radius, false);
  }
  return current;
}

function boxPass(image: Gray, radius: number, horizontal: boolean): Gray {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data.length);
  const span = horizontal ? width : height;
  const lines = horizontal ? height : width;
  const step = horizontal ? 1 : width;
  const window = radius * 2 + 1;

  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * width : line;
    // Edges are handled by clamping, so a blurred border does not darken.
    let sum = data[base] * (radius + 1);
    for (let i = 1; i <= radius; i++) sum += data[base + Math.min(i, span - 1) * step];

    for (let i = 0; i < span; i++) {
      out[base + i * step] = sum / window;
      const add = data[base + Math.min(i + radius + 1, span - 1) * step];
      const drop = data[base + Math.max(i - radius, 0) * step];
      sum += add - drop;
    }
  }
  return { width, height, data: out };
}

/**
 * Pulls the picture out to the full range of greys before anything is decided.
 *
 * This is the step that makes a pale watercolour work. The threshold below asks
 * whether a pixel is darker than its surroundings by an absolute number of grey
 * levels; a soft wash whose whole tonal range is 180 to 225 has almost nothing
 * that far below its own local mean, so without this the page comes out blank —
 * not blotchy, blank. Stretching those 45 levels across all 255 makes the same
 * differences five times larger and perfectly findable.
 *
 * Percentiles rather than the outright darkest and lightest pixels, so one dust
 * speck or one blown highlight cannot set the whole scale.
 */
export function stretchContrast(image: Gray, lowPercent = 0.5, highPercent = 99.5): Gray {
  const { width, height, data } = image;
  const histogram = new Uint32Array(256);
  for (const value of data) histogram[value]++;

  const total = data.length;
  const lowTarget = (total * lowPercent) / 100;
  const highTarget = (total * highPercent) / 100;
  let low = 0;
  let high = 255;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v];
    if (seen >= lowTarget) {
      low = v;
      break;
    }
  }
  seen = 0;
  for (let v = 255; v >= 0; v--) {
    seen += histogram[v];
    if (seen >= total - highTarget) {
      high = v;
      break;
    }
  }

  // A picture that is genuinely one flat tone has nothing to stretch, and
  // amplifying it would only turn sensor noise into a drawing.
  const span = high - low;
  if (span < 4) return { width, height, data: new Uint8ClampedArray(data) };

  const scale = 255 / span;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i++) out[i] = (data[i] - low) * scale;
  return { width, height, data: out };
}

/**
 * Takes the lighting out: every pixel against the broad average around it.
 *
 * A photograph of a canvas carries a smooth ramp across the whole frame — one
 * corner lit, the opposite one in shadow. To an edge finder that ramp is a real
 * slope, and because it is perfectly even, every pixel on it ties with its
 * neighbours and survives the thinning pass; the page comes back solid. This is
 * the same trick the local threshold plays, done as a subtraction so the result
 * is still a grey picture: what is left is the brushwork and none of the lamp.
 *
 * Mid grey is the zero point, so both darker-than and lighter-than survive.
 */
export function highPass(image: Gray, radius: number): Gray {
  const broad = blur(image, radius);
  const out = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < out.length; i++) out[i] = 128 + image.data[i] - broad.data[i];
  return { width: image.width, height: image.height, data: out };
}

/**
 * Local thresholding: a pixel is ink when it is darker than the average of the
 * square around it, by a margin.
 *
 * This is the step that makes a photographed painting work at all. A single
 * threshold across the whole image turns the shadowed corner of an unevenly-lit
 * photograph solid black; comparing each pixel against its own neighbourhood
 * ignores the lighting entirely and sees only the brushwork.
 *
 * The window mean comes from an integral image, so a 75-pixel window costs the
 * same as a 9-pixel one.
 */
export function adaptiveThreshold(image: Gray, window: number, bias: number): Gray {
  const { width, height, data } = image;
  const radius = Math.max(1, Math.floor(window / 2));
  const out = new Uint8ClampedArray(data.length);

  // (width+1) × (height+1) so the inclusive-exclusive arithmetic below needs no
  // special case at the top or left edge. Float64 because a 3000×3000 image of
  // white sums past the exact-integer range of a 32-bit float.
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += data[y * width + x];
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + rowSum;
    }
  }

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (width + 1) + x1 + 1] -
        integral[y0 * (width + 1) + x1 + 1] -
        integral[(y1 + 1) * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];
      out[y * width + x] = data[y * width + x] < sum / area - bias ? INK : PAPER;
    }
  }
  return { width, height, data: out };
}

/** Sobel on one plane. Separated out so colour can supply its own. */
export function sobel(image: Gray): Gradient {
  const { width, height, data } = image;
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      gx[i] =
        -data[i - width - 1] - 2 * data[i - 1] - data[i + width - 1] +
        data[i - width + 1] + 2 * data[i + 1] + data[i + width + 1];
      gy[i] =
        -data[i - width - 1] - 2 * data[i - width] - data[i - width + 1] +
        data[i + width - 1] + 2 * data[i + width] + data[i + width + 1];
    }
  }
  return { width, height, gx, gy };
}

/**
 * The gradient of a colour picture, taken across all three planes at once.
 *
 * Three separate gradients cannot simply be added: they are vectors, and two
 * planes changing in opposite directions would cancel to nothing at a boundary
 * that is plainly there. Di Zenzo's construction instead finds, at each pixel,
 * the direction in which the colour changes fastest and how fast that is —
 * which is the right generalisation, and reduces to the ordinary gradient when
 * only one plane is doing anything.
 *
 * With Lab as the input this is the step that finds a red square against a teal
 * one. There is no lightness edge there to find; there is an enormous hue one.
 */
export function colorSobel(lab: Lab): Gradient {
  const { width, height } = lab;
  const planes: Gradient[] = [
    sobel(planeAsGray(lab.l, width, height, 2.55)),
    sobel(planeAsGray(lab.a, width, height, 1, 128)),
    sobel(planeAsGray(lab.b, width, height, 1, 128)),
  ];

  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  for (let i = 0; i < gx.length; i++) {
    let xx = 0;
    let yy = 0;
    let xy = 0;
    for (const plane of planes) {
      xx += plane.gx[i] * plane.gx[i];
      yy += plane.gy[i] * plane.gy[i];
      xy += plane.gx[i] * plane.gy[i];
    }
    // The larger eigenvalue of [[xx, xy], [xy, yy]] and its eigenvector: the
    // fastest rate of change and the direction it happens in.
    const half = (xx + yy) / 2;
    const spread = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy);
    const magnitude = Math.sqrt(Math.max(0, half + spread));
    const theta = 0.5 * Math.atan2(2 * xy, xx - yy);
    gx[i] = magnitude * Math.cos(theta);
    gy[i] = magnitude * Math.sin(theta);
  }
  return { width, height, gx, gy };
}

/** A float plane as a byte picture, so one Sobel serves every plane. */
function planeAsGray(plane: Float32Array, width: number, height: number, scale: number, offset = 0): Gray {
  const data = new Uint8ClampedArray(plane.length);
  for (let i = 0; i < data.length; i++) data[i] = plane[i] * scale + offset;
  return { width, height, data };
}

/**
 * Canny: thin the gradient ridges to one pixel, then keep only the strong edges
 * and whatever is joined to them.
 *
 * Where thresholding keeps tonal areas, this keeps outlines and nothing else,
 * which is what a soft watercolour wants — it has no edges to speak of inside
 * the wash, and thresholding one turns it to blotches.
 *
 * It takes a gradient rather than a picture so the same thinning and the same
 * thresholds serve a grey edge and a colour one.
 */
export function thinEdges(gradient: Gradient): Ridges {
  const { width, height, gx: fieldX, gy: fieldY } = gradient;
  const magnitude = new Float32Array(width * height);
  const angle = new Uint8Array(width * height);

  for (let i = 0; i < magnitude.length; i++) {
    magnitude[i] = Math.hypot(fieldX[i], fieldY[i]);
    // Quantised to the four directions a pixel grid actually has.
    const theta = ((Math.atan2(fieldY[i], fieldX[i]) * 180) / Math.PI + 180) % 180;
    angle[i] = theta < 22.5 || theta >= 157.5 ? 0 : theta < 67.5 ? 1 : theta < 112.5 ? 2 : 3;
  }

  // Non-maximum suppression: keep a pixel only where it is the ridge line.
  const values = new Float32Array(width * height);
  const neighbours = [1, width + 1, width, width - 1];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const step = neighbours[angle[i]];
      if (magnitude[i] >= magnitude[i - step] && magnitude[i] > magnitude[i + step]) {
        values[i] = magnitude[i];
      }
    }
  }
  return { width, height, values };
}

export function canny(input: Gradient | Ridges, keepFraction: number, lowSpread = 3): Gray {
  const ridges = 'values' in input ? input : thinEdges(input);
  const { width, height, values: thin } = ridges;

  // The thresholds come from the picture's own gradients rather than from fixed
  // numbers. A soft watercolour's strongest edge is weaker than a hard
  // painting's faintest one, so any absolute pair either finds nothing in the
  // first or everything in the second. Keeping the strongest share of the
  // edges there are means one slider position means the same thing on both.
  const histogram = new Uint32Array(1024);
  let gradients = 0;
  for (const value of thin) {
    if (value <= 0) continue;
    histogram[Math.min(1023, Math.round(value))]++;
    gradients++;
  }

  // Hysteresis: strong edges seed, and weak pixels survive only if joined.
  const out = new Uint8ClampedArray(width * height).fill(PAPER);
  // A flat field has no gradients at all, so there is no share of them to
  // take: without this the percentile below lands on zero, every pixel clears
  // it, and an empty picture comes back solid black.
  if (gradients === 0) return { width, height, data: out };

  // Both thresholds are shares of the whole page rather than of the pixels that
  // happen to carry a gradient. In a soft wash almost every pixel carries one —
  // the wash is a gentle slope everywhere — so a share of those is nearly a
  // share of the picture, and "the strongest tenth of the gradients" fills the
  // page with ink.
  //
  // Taking the weak threshold as its own, wider share rather than as a fraction
  // of the strong one is what bounds the result. Hysteresis can only spread
  // into pixels above the weak threshold, so the finished page is at most
  // `lowSpread` times the share asked for, whatever the picture is. A ratio of
  // the strong threshold gives no such bound, and on a smooth painting the
  // spread runs away across the whole slope.
  const keep = clamp(keepFraction, 0, 1);
  const wantHigh = thin.length * keep;
  const wantLow = thin.length * Math.min(1, keep * lowSpread);
  let high = -1;
  let low = -1;
  let above = 0;
  for (let bin = 1023; bin >= 1; bin--) {
    above += histogram[bin];
    if (high < 0 && above >= wantHigh) high = bin;
    if (above >= wantLow) {
      low = bin;
      break;
    }
  }
  // Fewer gradients than were asked for: keep every edge there is.
  if (high < 0) high = 1;
  if (low < 0) low = 1;

  const stack: number[] = [];
  for (let i = 0; i < thin.length; i++) {
    if (thin[i] >= high) {
      out[i] = INK;
      stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (out[n] === PAPER && thin[n] >= low) {
          out[n] = INK;
          stack.push(n);
        }
      }
    }
  }
  return { width, height, data: out };
}

/** Grows the ink. A square structuring element, so it separates into two sweeps. */
export function dilate(image: Gray, radius: number): Gray {
  return radius < 1 ? { ...image, data: new Uint8ClampedArray(image.data) } : morph(image, radius, true);
}

/** Shrinks the ink. */
export function erode(image: Gray, radius: number): Gray {
  return radius < 1 ? { ...image, data: new Uint8ClampedArray(image.data) } : morph(image, radius, false);
}

function morph(image: Gray, radius: number, grow: boolean): Gray {
  const pass = (src: Gray, horizontal: boolean): Gray => {
    const { width, height, data } = src;
    const out = new Uint8ClampedArray(data.length);
    const span = horizontal ? width : height;
    const lines = horizontal ? height : width;
    const step = horizontal ? 1 : width;
    for (let line = 0; line < lines; line++) {
      const base = horizontal ? line * width : line;
      for (let i = 0; i < span; i++) {
        let hit = false;
        for (let k = -radius; k <= radius && !hit; k++) {
          const at = clamp(i + k, 0, span - 1);
          hit = grow ? data[base + at * step] === INK : data[base + at * step] === PAPER;
        }
        out[base + i * step] = hit ? (grow ? INK : PAPER) : grow ? PAPER : INK;
      }
    }
    return { width, height, data: out };
  };
  return pass(pass(image, true), false);
}

/**
 * Removes islands of ink smaller than `minArea`.
 *
 * A photograph of a painting carries the canvas texture, dust and sensor noise,
 * and thresholding turns every speck of it into a dot nobody wants to colour
 * around. Flood filled from an explicit stack: a recursive fill overflows on a
 * large connected region, which on a dark painting is most of the page.
 */
export function despeckle(image: Gray, minArea: number): Gray {
  if (minArea < 2) return { ...image, data: new Uint8ClampedArray(image.data) };
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data);
  const seen = new Uint8Array(width * height);

  for (let start = 0; start < data.length; start++) {
    if (data[start] !== INK || seen[start]) continue;
    const region = flood({
      width,
      height,
      seeds: [start],
      seen,
      passable: (i) => data[i] === INK,
    });
    if (region.length < minArea) for (const i of region) out[i] = PAPER;
  }

  return { width, height, data: out };
}

/**
 * Every pixel reachable from the seeds, four-connected.
 *
 * Four-connected because a diagonal-only touch is not one line, and joining
 * those would keep chains of noise that read as a line and are not one.
 *
 * An explicit stack, not recursion: a recursive fill overflows on a large
 * connected region, which on a dark painting is most of the page.
 *
 * `seen` is taken rather than made so a caller walking every region in an
 * image can share one across the whole walk — which is what `despeckle` does,
 * and what makes it one pass instead of one per region. A caller with a single
 * seed can leave it out.
 */
export function flood({
  width,
  height,
  seeds,
  passable,
  seen = new Uint8Array(width * height),
}: {
  width: number;
  height: number;
  seeds: number[];
  /**
   * True where the fill may spread. Called once per pixel considered.
   *
   * `from` is the pixel it would spread from, which is a seed's own index for
   * a seed. It lets a caller ask about the *step* as well as the pixel — how
   * far this one is from its neighbour — which is what tells a slow gradient
   * apart from an edge, when comparing against one fixed colour cannot.
   */
  passable: (index: number, from: number) => boolean;
  seen?: Uint8Array;
}): number[] {
  const stack: number[] = [];
  const region: number[] = [];

  for (const seed of seeds) {
    if (seen[seed] || !passable(seed, seed)) continue;
    seen[seed] = 1;
    stack.push(seed);
  }

  while (stack.length) {
    const i = stack.pop()!;
    region.push(i);
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) step(i - 1, i);
    if (x < width - 1) step(i + 1, i);
    if (y > 0) step(i - width, i);
    if (y < height - 1) step(i + width, i);
  }

  function step(n: number, from: number) {
    if (!seen[n] && passable(n, from)) {
      seen[n] = 1;
      stack.push(n);
    }
  }

  return region;
}

/* ---------------------------------------------------------------- settings */

/**
 * What each slider means in the numbers the steps take.
 *
 * Kept in one place and exported so the tests can assert on the mapping rather
 * than on magic numbers buried in the pipeline, and so the ends of every slider
 * are a deliberate choice instead of wherever the maths happened to land.
 */
/** The size the slider mapping is written against: a typical phone photograph. */
export const REFERENCE_EDGE = 1400;

/** The widest and narrowest neighbourhood the threshold looks at, as a share. */
const WINDOW_BROAD = 0.37;
const WINDOW_FINE = 0.0125;

export function resolve(settings: LineArtSettings, longEdge: number = REFERENCE_EDGE) {
  const detail = clamp(settings.detail, 0, 100) / 100;
  const thickness = clamp(settings.thickness, 0, 100) / 100;
  const cleanup = clamp(settings.cleanup, 0, 100) / 100;
  const smoothing = clamp(settings.smoothing ?? 0, 0, 100) / 100;
  // Everything measured in pixels is a share of the picture, not a fixed
  // count. A four-pixel blur is a real softening on a phone photograph and
  // nothing at all on a scan four times the size; without this, the same
  // painting photographed twice gives two different pages.
  const scale = clamp(longEdge, 200, 4000) / REFERENCE_EDGE;

  return {
    /** More cleanup means more blur before anything is decided. */
    blurRadius: Math.round(lerp(0, 4, cleanup) * scale),
    /**
     * A small window sees fine texture; a large one sees only broad shapes.
     * More detail therefore means a smaller window.
     *
     * The broad end is a third of the picture, and it has to be. The window
     * must be wider than whatever is being looked for, and the boundary of a
     * soft wash is a gradual ramp a tenth of the frame across: a window
     * narrower than the ramp sits entirely inside it, finds its own centre
     * pixel equal to the local mean, and returns a blank page. Interpolated
     * geometrically, so the broad half of the slider is not crammed into its
     * last few notches.
     */
    window: odd(
      clamp(longEdge * WINDOW_BROAD * Math.pow(WINDOW_FINE / WINDOW_BROAD, detail), 9, 1001),
    ),
    /** How much darker than its surroundings a pixel must be to become ink. */
    bias: lerp(12, 3, detail),
    /** Roughly how much of the page comes back as line. */
    cannyKeep: lerp(0.005, 0.06, detail),
    /**
     * How broad "the lighting" is taken to be. Wide enough that nothing anyone
     * painted is mistaken for a lamp.
     */
    flattenRadius: Math.max(8, Math.round(longEdge / 24)),
    /**
     * How far Otsu's cut is moved on already-drawn art. Above it, faint grey
     * shading falls on the ink side and is kept; below it, only what is clearly
     * a stroke survives — which is the setting that takes a generator's soft
     * shading off a page and leaves the outline.
     */
    cleanupCut: Math.round(lerp(-6, 34, detail)),
    /**
     * How much the finished lines are grown. Nothing at all at the thinnest
     * setting, and never less than one pixel above it: on a small picture the
     * scaling alone would round every weight down to nothing, and a slider
     * that does nothing over half its travel is a broken slider.
     */
    dilateRadius: thickness > 0 ? Math.max(1, Math.round(lerp(0, 3, thickness) * scale)) : 0,
    /** Specks smaller than this are lifted off. An area, so it scales as one. */
    minArea: Math.round(lerp(0, 90, cleanup) * scale * scale),
    /** How far a ragged edge is straightened, before the stroke width caps it. */
    smoothRadius: Math.round(lerp(0, 5, smoothing) * scale),
    /**
     * How far the colour planes are blurred before outlines are found. Noise
     * lives in them at every scale; a real change of colour does not.
     */
    chromaRadius: Math.max(2, Math.round(longEdge / 180)),
    /**
     * The softening applied before outlines are found. It has a floor the
     * cleanup slider does not: paint has a texture and paper has a grain, and
     * at their own scale both are edges. Below about two pixels the finder
     * traces the weave of the canvas instead of the picture on it.
     */
    edgeBlurRadius: Math.max(Math.round(2 * scale), Math.round(lerp(0, 4, cleanup) * scale)),
  };
}

/**
 * Area-averaging reduction, for measurements that must not depend on size.
 *
 * Averaging rather than sampling: dropping pixels would thin a stroke until it
 * disappeared, and the whole point of the reduction below is to measure how
 * thick the strokes are.
 */
export function reduce(image: Gray, maxEdge: number): Gray {
  const long = Math.max(image.width, image.height);
  if (long <= maxEdge) return { ...image, data: new Uint8ClampedArray(image.data) };

  const scale = maxEdge / long;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const out = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * image.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * image.height) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * image.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * image.width) / width));
      let sum = 0;
      let count = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          sum += image.data[yy * image.width + xx];
          count++;
        }
      }
      out[y * width + x] = sum / count;
    }
  }
  return { width, height, data: out };
}

/** The size the guess below measures at, so 1024 and 3400 are judged alike. */
const GUESS_EDGE = 512;
/** Strokes up to about this many pixels at that size are strokes, not areas. */
const GUESS_RADIUS = 3;

/**
 * Is this already a drawing?
 *
 * The question is not how light the picture is — a bold painting of black
 * shapes on white is just as light as a drawing, and a generated page with a
 * soft grey wash behind it is not light at all. The question is whether the
 * dark part is *strokes* or *areas*, and erosion answers it directly: eat three
 * pixels in from every edge and a line disappears while a filled shape barely
 * notices. What survives, as a share of what there was, is the whole test.
 *
 * Measured on a reduction to a fixed size so that one thumbnail-sized page and
 * one full scan of the same drawing are judged the same way.
 *
 * It is a guess, and it is offered as one: the page carries a flag saying so,
 * and the poet can say otherwise.
 */
export function guessSource(source: Bitmap): { kind: SourceKind; ink: number; solid: number } {
  const small = reduce(stretchContrast(toGray(source)), GUESS_EDGE);
  const cut = otsuThreshold(small);

  const binary = new Uint8ClampedArray(small.data.length);
  let ink = 0;
  for (let i = 0; i < binary.length; i++) {
    const isInk = small.data[i] <= cut;
    binary[i] = isInk ? INK : PAPER;
    if (isInk) ink++;
  }

  const core = erode({ width: small.width, height: small.height, data: binary }, GUESS_RADIUS);
  let survived = 0;
  for (const value of core.data) if (value === INK) survived++;

  const inkShare = ink / binary.length;
  const solidShare = ink ? survived / ink : 0;
  // A drawing's strokes all but vanish; a painting keeps most of its dark.
  // The second half is a floor rather than a second opinion: a picture that is
  // more than half ink is not a drawing whatever shape the ink is in.
  const kind: SourceKind = solidShare < 0.25 && inkShare < 0.6 ? 'lineart' : 'painting';
  return { kind, ink: inkShare, solid: solidShare };
}

/**
 * Otsu's threshold: the single cut that best separates the picture into two
 * groups. Used on art that is already a drawing, where one global cut is right
 * and a local one would only find texture inside the strokes.
 *
 * The value returned is the last one belonging to the darker group, so the test
 * that goes with it is `value <= threshold`. Using `<` instead drops the whole
 * darkest tone, which on a two-tone drawing is every stroke in it.
 */
export function otsuThreshold(image: Gray): number {
  const histogram = new Uint32Array(256);
  for (const value of image.data) histogram[value]++;
  const total = image.data.length;

  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * histogram[v];

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let best = 0;
  let bestVariance = -1;
  for (let v = 0; v < 256; v++) {
    backgroundWeight += histogram[v];
    if (backgroundWeight === 0) continue;
    const foregroundWeight = total - backgroundWeight;
    if (foregroundWeight === 0) break;
    backgroundSum += v * histogram[v];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const between =
      backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (between > bestVariance) {
      bestVariance = between;
      best = v;
    }
  }
  return best;
}

/**
 * The path for art that is already a drawing.
 *
 * No tracing: one global cut forces the greys to black or white, which is what
 * takes the soft anti-aliased edge off every stroke and drops any shading the
 * generator put in. Tracing this instead would find both sides of every line
 * and hand back a hollow, doubled drawing.
 */
export function runCleanup(source: Bitmap, settings: LineArtSettings): Gray {
  const options = resolve(settings, Math.max(source.width, source.height));
  const grey = stretchContrast(toGray(source, settings.invert));

  // A little above Otsu's cut so pale background texture and the faint grey of
  // a soft shadow fall on the paper side rather than becoming ink.
  const cut = clamp(otsuThreshold(grey) + options.cleanupCut, 0, 254);
  const binary = new Uint8ClampedArray(grey.data.length);
  for (let i = 0; i < grey.data.length; i++) binary[i] = grey.data[i] <= cut ? INK : PAPER;

  let out: Gray = { width: grey.width, height: grey.height, data: binary };
  // A third of the floor a painting gets. That floor is sized for what a
  // camera adds — canvas weave, sensor grain, dust — and a page that arrived
  // drawn has none of it, only the odd compression artefact a pixel or two
  // across. At the full floor the smallest real marks on such a page go with
  // them: the dot of an i, and every full stop in a caption.
  out = despeckle(out, Math.round(options.minArea / 3));
  if (options.dilateRadius > 0) out = dilate(out, options.dilateRadius);
  // No smoothing on this path, deliberately. Smoothing exists to straighten
  // what tracing made ragged, and a page that arrived already drawn has clean
  // edges before it gets here — thresholding a crisp drawing gives back a
  // crisp drawing. What such a page does have, far more often than a painting
  // does, is small lettering: a caption a few pixels across whose strokes sit
  // close enough together that a vote of the neighbourhood closes the gaps
  // between them and turns a sentence into a row of blots. Nothing to gain
  // here, and a caption to lose.
  return out;
}

/**
 * Enlarges a finished drawing, smoothly.
 *
 * A page from an image generator arrives at about a thousand pixels and a
 * coloring page at 300 DPI needs two and a half thousand. Nearest-neighbour
 * would turn every curve into a staircase; this interpolates, softens the
 * result and cuts it back to two colours, which keeps the curves curved.
 *
 * It adds no detail — there is none to add — and the interface says by how
 * much it stretched so nobody mistakes a big file for a sharp one.
 */
export function upscale(image: Gray, width: number, height: number): Gray {
  if (width === image.width && height === image.height) {
    return { ...image, data: new Uint8ClampedArray(image.data) };
  }
  const out = new Uint8ClampedArray(width * height);
  const xRatio = image.width / width;
  const yRatio = image.height / height;

  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, (y + 0.5) * yRatio - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(image.height - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, (x + 0.5) * xRatio - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(image.width - 1, x0 + 1);
      const fx = sx - x0;
      const top =
        image.data[y0 * image.width + x0] * (1 - fx) + image.data[y0 * image.width + x1] * fx;
      const bottom =
        image.data[y1 * image.width + x0] * (1 - fx) + image.data[y1 * image.width + x1] * fx;
      out[y * width + x] = top * (1 - fy) + bottom * fy;
    }
  }

  // Interpolating a two-colour image makes grey along every edge. Soften it,
  // then cut it back, which lands the boundary on a smooth curve rather than
  // on the pixel grid it came from.
  const softened = blur({ width, height, data: out }, 1);
  const binary = new Uint8ClampedArray(width * height);
  for (let i = 0; i < binary.length; i++) binary[i] = softened.data[i] < 128 ? INK : PAPER;
  return { width, height, data: binary };
}

/**
 * Straightens a ragged edge without moving it.
 *
 * Thresholding decides every pixel on its own, so a line that ought to be
 * straight comes out with a bite taken out of it here and a bump there: the
 * edge of a hand-drawn square wobbles, and the printed page looks torn rather
 * than drawn. Blurring the two-colour picture and cutting it again is a vote of
 * the neighbourhood — a pixel stays ink if most of what is around it is ink —
 * which files off the bumps and fills in the bites while leaving the line
 * exactly where it was.
 *
 * It will rub out anything narrower than the vote, which is why the caller ties
 * the radius to how wide the strokes actually are.
 */
export function smoothEdges(image: Gray, radius: number): Gray {
  if (radius < 1) return { ...image, data: new Uint8ClampedArray(image.data) };
  const soft = blur(image, radius);
  const out = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < out.length; i++) out[i] = soft.data[i] < 128 ? INK : PAPER;
  return { width: image.width, height: image.height, data: out };
}

/** Wherever either picture has ink. */
export function union(a: Gray, b: Gray): Gray {
  const out = new Uint8ClampedArray(a.data.length);
  for (let i = 0; i < out.length; i++) out[i] = a.data[i] === INK || b.data[i] === INK ? INK : PAPER;
  return { width: a.width, height: a.height, data: out };
}

/**
 * How wide the strokes in a binary picture are, near enough.
 *
 * Erode by one and see how much ink is left: a line two pixels wide loses all
 * of it, a line ten wide loses a fifth. Inverting that gives a width, which is
 * the only honest cap on how far a corner can be rounded — smoothing by more
 * than the stroke is wide does not round the stroke, it deletes it.
 */
export function strokeWidth(image: Gray): number {
  let ink = 0;
  for (const value of image.data) if (value === INK) ink++;
  if (!ink) return 0;
  let core = 0;
  for (const value of erode(image, 1).data) if (value === INK) core++;
  const lost = (ink - core) / ink;
  // A stroke of width w loses roughly 2/w of itself to a one-pixel erosion.
  return lost <= 0 ? Infinity : 2 / lost;
}

/**
 * The expensive half of tracing, which depends on the picture and on almost
 * none of the sliders.
 *
 * Getting into Lab, flattening the lighting, blurring the colour planes and
 * taking a gradient across all three of them is most of the work and about a
 * second of it. Nothing in it moves when the detail, thickness or smoothing
 * slider moves — only the picture, the invert flag and the softening the
 * cleanup slider asks for — so it is worth keeping so the next drag of a
 * slider does not pay for it again.
 */
export type Analysis = { grey?: Gray; ridges?: Ridges };

/**
 * What an analysis depends on. Two settings with the same key may share one,
 * and two with different keys must not: handing over a stale analysis would
 * quietly trace a picture nobody asked for.
 */
export function analysisKey(settings: LineArtSettings): string {
  return `${settings.invert ? 'i' : '-'}|${clamp(settings.cleanup, 0, 100)}`;
}

/** The greys the tonal threshold works on. */
export function analyseGrey(source: Bitmap, settings: LineArtSettings): Gray {
  const options = resolve(settings, Math.max(source.width, source.height));
  // Stretch before blurring: the blur is there to soften texture, and doing it
  // first would flatten the very differences the stretch needs to measure.
  return blur(stretchContrast(toGray(source, settings.invert)), options.blurRadius);
}

/**
 * The outline finder's view of the picture, thinned to ridge lines. The
 * expensive one: Lab, the lighting correction, the colour gradient and the
 * thinning pass, none of which move when detail, thickness or smoothing do.
 */
export function analyseRidges(source: Bitmap, settings: LineArtSettings): Ridges {
  const options = resolve(settings, Math.max(source.width, source.height));
  return thinEdges(colorSobel(prepareForEdges(toLab(source, settings.invert), options)));
}

/**
 * The whole chain, from a canvas bitmap to pure black on pure white.
 *
 * An `analysis` may be handed in when one was already made for this picture at
 * this cleanup setting; it is exactly what `analyse` returns, and passing a
 * stale one would silently trace the wrong picture, so the caller keys its
 * cache on `analysisKey`.
 */
export function runLineArt(
  source: Bitmap,
  settings: LineArtSettings,
  analysis?: Analysis,
): Gray {
  const options = resolve(settings, Math.max(source.width, source.height));
  const edges = settings.mode === 'edges';
  // Only the half this mode needs is ever built, so shading never pays for a
  // colour gradient it will not look at.
  const grey = edges ? null : (analysis?.grey ?? analyseGrey(source, settings));
  const ridges = edges ? (analysis?.ridges ?? analyseRidges(source, settings)) : null;

  // Outlines are found across all three planes at once, which is what puts a
  // line between a red square and a teal one: there is no lightness edge there
  // to find, and to a grey picture the two are one undivided shape.
  //
  // Shading is left on lightness alone. A tonal threshold is about how dark
  // something is, and adding colour boundaries to it fills a page that was
  // meant to be mostly paper.
  let binary = edges
    ? canny(ridges!, options.cannyKeep)
    : adaptiveThreshold(grey!, options.window, options.bias);

  // Closing joins strokes the threshold broke — but only where a threshold
  // broke them. Canny's hysteresis has already joined what belongs together,
  // and closing its output does the opposite of what is wanted: its lines are
  // one pixel wide, so growing then shrinking merges neighbouring lines into
  // solid areas and a page meant to be outlines comes back a third black.
  if (!edges) binary = erode(dilate(binary, 1), 1);

  // A speck is measured in pixels, and a line one pixel wide has very few of
  // them: the same floor that lifts a dust mote off a thresholded painting
  // erases a sixty-pixel stroke of outline. Edges are held to a third of it.
  binary = despeckle(binary, edges ? Math.round(options.minArea / 3) : options.minArea);
  if (options.dilateRadius > 0) binary = dilate(binary, options.dilateRadius);

  return smoothSafely(binary, options.smoothRadius);
}

/**
 * Gets a colour picture ready to have its outlines found.
 *
 * Two different corrections, because the planes have different problems.
 * Lightness carries the lamp, so the broad lighting is subtracted out of it.
 * Hue and saturation barely move under a lamp but they are where every kind of
 * noise ends up — paper grain, sensor speckle, and the chroma subsampling that
 * every photograph and every JPEG has been through. Left alone, that noise is a
 * gradient in every direction inside a flat square of paint, and the square
 * comes back scribbled over. Colour boundaries are broad things, so a generous
 * blur takes the noise out and leaves every real edge where it was.
 */
function prepareForEdges(
  lab: Lab,
  options: { flattenRadius: number; chromaRadius: number; edgeBlurRadius: number },
): Lab {
  const flat = highPass(blur(lightness(lab), options.edgeBlurRadius), options.flattenRadius);
  const l = new Float32Array(flat.data.length);
  for (let i = 0; i < l.length; i++) l[i] = (flat.data[i] * 100) / 255;
  return {
    width: lab.width,
    height: lab.height,
    l,
    a: blurPlane(lab.a, lab.width, lab.height, options.chromaRadius),
    b: blurPlane(lab.b, lab.width, lab.height, options.chromaRadius),
  };
}

/** Blurs one signed plane by going through the byte blur and back. */
function blurPlane(plane: Float32Array, width: number, height: number, radius: number): Float32Array {
  const soft = blur(planeAsGray(plane, width, height, 1, 128), radius);
  const out = new Float32Array(plane.length);
  for (let i = 0; i < out.length; i++) out[i] = soft.data[i] - 128;
  return out;
}

/** How much of a page is ink. */
function inkCount(image: Gray): number {
  let ink = 0;
  for (const value of image.data) if (value === INK) ink++;
  return ink;
}

/** How much of the drawing a round of smoothing is allowed to cost. */
const KEEP_INK = 0.67;

/**
 * Smooths as much as the strokes can take, and not a pixel more.
 *
 * The stroke width is a first estimate — it is an average, and an average is
 * wrong about the thinnest line on the page, which is exactly the line that
 * gets rubbed out. So the result is checked rather than trusted: if a round of
 * smoothing has eaten a third of the drawing it was too strong for these
 * lines, and it steps down and tries again. A page comes back straighter or it
 * comes back as it was; it never comes back emptier.
 */
function smoothSafely(binary: Gray, asked: number): Gray {
  const ink = inkCount(binary);
  if (asked < 1 || ink === 0) return { ...binary, data: new Uint8ClampedArray(binary.data) };

  let radius = Math.min(asked, Math.floor(strokeWidth(binary) / 3));
  while (radius >= 1) {
    const out = smoothEdges(binary, radius);
    if (inkCount(out) >= ink * KEEP_INK) return out;
    radius--;
  }
  return { ...binary, data: new Uint8ClampedArray(binary.data) };
}

/** Back to RGBA, pure black on pure white, for a canvas to draw. */
export function toBitmap(image: Gray): Bitmap {
  const out = new Uint8ClampedArray(image.width * image.height * 4);
  for (let p = 0, i = 0; p < image.data.length; p++, i += 4) {
    const value = image.data[p] === INK ? 0 : 255;
    out[i] = value;
    out[i + 1] = value;
    out[i + 2] = value;
    out[i + 3] = 255;
  }
  return { width: image.width, height: image.height, data: out };
}
