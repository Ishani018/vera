/**
 * Logo mode: a picture reduced to a few flat colours and traced into curves.
 *
 * Different again from the other looks. Those answer "where are the lines";
 * this answers "what are the shapes, and what is the smallest honest set of
 * curves that describes them". The output is an SVG of filled paths with no
 * raster anywhere in it, so it is as sharp on a shop sign as on a favicon.
 *
 * The honest part, which the interface also says out loud: **most photographs
 * make poor logos.** A logo is a handful of shapes that survive being printed
 * at a centimetre across in one colour. A photograph of a face is thousands of
 * shapes, and reducing it to three colours does not make it fewer shapes, it
 * makes it three colours of noise. This is built for drawings, lettering,
 * silhouettes and marks — and it will tell you when what it got was not one.
 *
 * All original code, written from the published mathematics. See
 * `docs/ALGORITHMS.md`.
 */

import { quantise } from '../lineart/colouring';
import { contoursOf, fitCurves, signedArea, simplify, type Cubic } from '../lineart/contour';
import { flattenOntoWhite, reduce, toGray, toLab, type Bitmap } from '../lineart/pipeline';
import { CLASSIC_WORKING_EDGE } from '../lineart/xdog';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type LogoSettings = {
  /** How many colours the mark is reduced to. One, two or three. */
  colours: 1 | 2 | 3;
  /** 0–100. How far the curves may stray from the traced edge. */
  smoothness: number;
  /** 0–100. Shapes smaller than this share of the picture are dropped. */
  minShape: number;
  /** Chosen rather than taken from the picture, when somebody wants them. */
  palette?: string[];
};

export const LOGO_DEFAULTS: LogoSettings = { colours: 2, smoothness: 45, minShape: 35 };

export function resolveLogo(settings: LogoSettings, pixels: number) {
  const smoothness = clamp(settings.smoothness, 0, 100) / 100;
  const minShape = clamp(settings.minShape, 0, 100) / 100;
  return {
    /**
     * How far a simplified outline may move, in pixels, before fitting.
     * Half a pixel keeps the staircase; three pixels is a logo.
     */
    epsilon: lerp(0.4, 3, smoothness),
    /** How far the fitted curves may stray. Looser than the simplifier. */
    fitError: lerp(0.6, 4.5, smoothness),
    /**
     * The smallest shape kept, as a share of the whole picture. Geometric,
     * because the interesting part is all at the small end: the difference
     * between a thousandth and a hundredth of the picture is an eye against a
     * head, and between a tenth and a fifth is nothing anybody notices.
     */
    minArea: Math.max(8, pixels * 0.00002 * Math.pow(900, minShape)),
  };
}

export type LogoShape = { fill: string; curves: Cubic[][] };
export type LogoResult = {
  width: number;
  height: number;
  shapes: LogoShape[];
  svg: string;
  /** What the engine thinks of what it was given. */
  verdict: { shapes: number; curves: number; busy: boolean };
};

/** A picture in, a logo out. */
export function runLogo(source: Bitmap, settings: LogoSettings): LogoResult {
  const flat = flattenOntoWhite(source);
  const grey = reduce(toGray(flat, false), CLASSIC_WORKING_EDGE);
  const width = grey.width;
  const height = grey.height;
  const p = resolveLogo(settings, width * height);

  const lab = toLab(flat, false);
  const scaled = resampleLab(lab, width, height);
  const quantised = quantise(scaled, settings.colours, 12);

  const shapes: LogoShape[] = [];
  let curveCount = 0;
  for (let colour = 0; colour < settings.colours; colour++) {
    const chosen = settings.palette?.[colour] ?? labToHex(quantised, colour);
    const rings: Cubic[][] = [];
    for (const contour of contoursOf(
      (x, y) => quantised.labels[y * width + x] === colour,
      width,
      height,
    )) {
      /*
        A hole is held to a much smaller threshold than an outline.

        They are not the same question. A shape smaller than a speck is noise
        and should go; a HOLE smaller than a speck is almost always something
        that matters — an eye, the inside of an ear, the gap between two petals
        — and dropping it does not remove a small thing, it FILLS a small thing,
        which is far more visible. Measured before this: the cat's ears and the
        flower's petal junctions came out as solid black blobs.
      */
      const floor = contour.hole ? p.minArea / 10 : p.minArea;
      if (contour.area < floor) continue;
      const tidy = simplify(contour.points, p.epsilon);
      /*
        Three, not four.

        A closed ring needs three distinct points and no more — a triangle is a
        shape. Asking for four quietly threw every triangle away, and the ones
        that mattered were holes: the cat's ears are thin triangles, they
        simplified to three points, and they were dropped, which did not remove
        them but FILLED them. Both ears came out as solid black wedges.
      */
      if (tidy.length < 3) continue;
      const closed = [...tidy, tidy[0]];
      const curves = fitCurves(closed, p.fitError);
      if (!curves.length) continue;
      rings.push(curves);
      curveCount += curves.length;
    }
    if (rings.length) shapes.push({ fill: chosen, curves: rings });
  }

  /*
    The lightest colour, dropped.

    A mark reduced to two colours is almost always a shape and the paper behind
    it, and painting the paper is how you get a logo with a white rectangle
    stuck to it that nobody notices until it is on a dark background. So the
    palest fill is left out and becomes the transparency it already was.
  */
  const trimmed = shapes.length > 1 ? shapes.filter((shape) => shape !== palest(shapes)) : shapes;

  return {
    width,
    height,
    shapes: trimmed,
    svg: toSvg(trimmed, width, height),
    verdict: {
      shapes: trimmed.reduce((sum, shape) => sum + shape.curves.length, 0),
      curves: curveCount,
      // Measured rather than guessed at: a mark is a handful of shapes. Past
      // about forty, whatever this was, it was not a logo.
      busy: trimmed.reduce((sum, shape) => sum + shape.curves.length, 0) > 40,
    },
  };
}

function palest(shapes: LogoShape[]): LogoShape {
  let best = shapes[0];
  let bestLightness = -1;
  for (const shape of shapes) {
    const light = lightnessOf(shape.fill);
    if (light > bestLightness) {
      bestLightness = light;
      best = shape;
    }
  }
  return best;
}

function lightnessOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** One colour of the quantised set, as a hex string. */
function labToHex(q: ReturnType<typeof quantise>, index: number): string {
  // Lab back to sRGB, the usual way round: Lab to XYZ with the D65 white, then
  // the linear-to-sRGB transfer.
  const l = q.l[index];
  const a = q.a[index];
  const b = q.b[index];
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const back = (t: number) => (t > 6 / 29 ? t * t * t : 3 * (6 / 29) ** 2 * (t - 4 / 29));
  const x = 0.95047 * back(fx);
  const y = 1 * back(fy);
  const z = 1.08883 * back(fz);
  const lin = [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.204 * y + 1.057 * z,
  ];
  const srgb = lin.map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
    return Math.round(clamp(c, 0, 1) * 255);
  });
  return `#${srgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The shapes as SVG.
 *
 * `fill-rule="evenodd"` is what makes holes holes: the counter of a letter O is
 * a second ring inside the first, and under even-odd the area between them
 * fills and the middle does not, with no need to work out which ring is which.
 */
export function toSvg(shapes: LogoShape[], width: number, height: number): string {
  const paths = shapes.map(
    (shape) => `<path fill="${shape.fill}" fill-rule="evenodd" d="${pathDataFor(shape)}"/>`,
  );
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    ...paths,
    `</svg>`,
  ].join('\n');
}

/**
 * One shape's rings, as a single run of SVG path commands.
 *
 * Exported, and used by the canvas as well as by the SVG, because the two must
 * not be two implementations. They were, briefly, and the difference was not
 * subtle: the canvas filled each ring on its own, which fills the holes, so a
 * line drawing of a cat came out as a solid black cat. All the rings belong to
 * one path, filled once, even-odd — then a counter is a counter in both.
 */
export function pathDataFor(shape: LogoShape): string {
  const round = (n: number) => Math.round(n * 100) / 100;
  return shape.curves
    .map((ring) => {
      const parts = [`M ${round(ring[0][0].x)} ${round(ring[0][0].y)}`];
      for (const [, c1, c2, end] of ring) {
        parts.push(
          `C ${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(end.x)} ${round(end.y)}`,
        );
      }
      parts.push('Z');
      return parts.join(' ');
    })
    .join(' ');
}

/** Lab at the working size, matching `reduce`'s geometry. */
function resampleLab(lab: ReturnType<typeof toLab>, width: number, height: number) {
  if (lab.width === width && lab.height === height) return lab;
  const pick = (plane: Float32Array) => {
    const out = new Float32Array(width * height);
    const sx = lab.width / width;
    const sy = lab.height / height;
    for (let y = 0; y < height; y++) {
      const y0 = Math.floor(y * sy);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      for (let x = 0; x < width; x++) {
        const x0 = Math.floor(x * sx);
        const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
        let sum = 0;
        let count = 0;
        for (let yy = y0; yy < y1 && yy < lab.height; yy++) {
          for (let xx = x0; xx < x1 && xx < lab.width; xx++) {
            sum += plane[yy * lab.width + xx];
            count += 1;
          }
        }
        out[y * width + x] = count ? sum / count : 0;
      }
    }
    return out;
  };
  return { width, height, l: pick(lab.l), a: pick(lab.a), b: pick(lab.b) };
}

export { signedArea };
