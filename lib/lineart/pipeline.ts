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

export const INK = 0;
export const PAPER = 255;

/**
 * The largest edge the converter works at.
 *
 * Enough for 300 DPI on the biggest coloring page KDP prints (8.5 × 11 plus
 * bleed is 11.25 inches, so 3375 pixels). A bigger scan is worked from a
 * reduction of itself: the extra pixels are detail no printer will resolve, at
 * a cost the poet waits for on every slider move. Lives here rather than in the
 * worker so the interface can do the same arithmetic without importing one.
 */
export const MAX_EDGE = 3400;

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

/**
 * Canny: gradient, then thin the ridges to one pixel, then keep only the strong
 * edges and whatever is joined to them.
 *
 * Where thresholding keeps tonal areas, this keeps outlines and nothing else,
 * which is what a soft watercolour wants — it has no edges to speak of inside
 * the wash, and thresholding one turns it to blotches.
 */
export function canny(image: Gray, keepFraction: number, lowSpread = 3): Gray {
  const { width, height, data } = image;
  const magnitude = new Float32Array(width * height);
  const angle = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -data[i - width - 1] - 2 * data[i - 1] - data[i + width - 1] +
        data[i - width + 1] + 2 * data[i + 1] + data[i + width + 1];
      const gy =
        -data[i - width - 1] - 2 * data[i - width] - data[i - width + 1] +
        data[i + width - 1] + 2 * data[i + width] + data[i + width + 1];
      magnitude[i] = Math.hypot(gx, gy);
      // Quantised to the four directions a pixel grid actually has.
      const theta = ((Math.atan2(gy, gx) * 180) / Math.PI + 180) % 180;
      angle[i] = theta < 22.5 || theta >= 157.5 ? 0 : theta < 67.5 ? 1 : theta < 112.5 ? 2 : 3;
    }
  }

  // Non-maximum suppression: keep a pixel only where it is the ridge line.
  const thin = new Float32Array(width * height);
  const neighbours = [1, width + 1, width, width - 1];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const step = neighbours[angle[i]];
      if (magnitude[i] >= magnitude[i - step] && magnitude[i] > magnitude[i + step]) {
        thin[i] = magnitude[i];
      }
    }
  }

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
  const stack: number[] = [];
  const region: number[] = [];

  for (let start = 0; start < data.length; start++) {
    if (data[start] !== INK || seen[start]) continue;
    stack.length = 0;
    region.length = 0;
    stack.push(start);
    seen[start] = 1;

    while (stack.length) {
      const i = stack.pop()!;
      region.push(i);
      const x = i % width;
      const y = (i / width) | 0;
      // Four-connected: diagonal-only touches are not one line, and joining
      // them would keep chains of noise that read as a line and are not one.
      if (x > 0) push(i - 1);
      if (x < width - 1) push(i + 1);
      if (y > 0) push(i - width);
      if (y < height - 1) push(i + width);
    }
    if (region.length < minArea) for (const i of region) out[i] = PAPER;
  }

  function push(n: number) {
    if (!seen[n] && data[n] === INK) {
      seen[n] = 1;
      stack.push(n);
    }
  }

  return { width, height, data: out };
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
  out = despeckle(out, options.minArea);
  if (options.dilateRadius > 0) out = dilate(out, options.dilateRadius);
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

/** The whole chain, from a canvas bitmap to pure black on pure white. */
export function runLineArt(source: Bitmap, settings: LineArtSettings): Gray {
  const options = resolve(settings, Math.max(source.width, source.height));
  // Stretch before blurring: the blur is there to soften texture, and doing it
  // first would flatten the very differences the stretch needs to measure.
  const grey = blur(stretchContrast(toGray(source, settings.invert)), options.blurRadius);

  let binary =
    settings.mode === 'edges'
      ? canny(highPass(grey, options.flattenRadius), options.cannyKeep)
      : adaptiveThreshold(grey, options.window, options.bias);

  // Closing joins strokes the threshold broke — but only where a threshold
  // broke them. Canny's hysteresis has already joined what belongs together,
  // and closing its output does the opposite of what is wanted: on a soft
  // painting the edges come back speckled, and growing then shrinking merges
  // the speckle into solid areas. A page that was meant to be outlines comes
  // back seventy per cent black.
  // Closing joins strokes the threshold broke — but only where a threshold
  // broke them. Canny's hysteresis has already joined what belongs together,
  // and closing its output does the opposite of what is wanted: its lines are
  // one pixel wide, so growing then shrinking merges neighbouring lines into
  // solid areas and a page meant to be outlines comes back a third black.
  const edges = settings.mode === 'edges';
  if (!edges) binary = erode(dilate(binary, 1), 1);

  // A speck is measured in pixels, and a line one pixel wide has very few of
  // them: the same floor that lifts a dust mote off a thresholded painting
  // erases a sixty-pixel stroke of outline. Edges are held to a third of it.
  binary = despeckle(binary, edges ? Math.round(options.minArea / 3) : options.minArea);
  if (options.dilateRadius > 0) binary = dilate(binary, options.dilateRadius);

  return binary;
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
