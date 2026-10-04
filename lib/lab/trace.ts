import { contoursOf, fitCurves, simplify, type Cubic, type Point } from '../lineart/contour';
import type { Gray } from '../lineart/pipeline';
import { pathDataFor, toSvg } from './logo';

/**
 * A drawing's ink, traced into real curves.
 *
 * Most of the Lab's looks are drawn in pixels, and until this existed their
 * Download SVG button sat greyed out, with a tooltip explaining that "a traced
 * copy would be a worse picture of the same thing". That was a reason to be
 * careful about what the button promises, and not a reason for it to be dead:
 * somebody who wants a vector wants it more, not less, when the look is one
 * they like. So it traces, and the tooltip says so.
 *
 * The same contour tracer and curve fitter the Logo look uses, on purpose: it
 * has already been through the holes problem (an eye, the inside of an ear
 * dropped as "too small" and so FILLED), and a second tracer would have to
 * learn that again. Ink is where the page is darker than half way, which is
 * where a soft stroke crosses from paper to line.
 */
/**
 * Take the staircase out of a boundary traced off a pixel grid, before simplifying it.
 *
 * A staircase strays almost a whole pixel from the line it follows (0.89 px at a
 * slope of one half, and nearer 1.0 the shallower it gets), so a simplifier
 * given less than about a pixel keeps every step and the fitter then draws a
 * curve for each: a straight stroke came out as 133 curves. Simplifying with a
 * pixel of slack fixes that, but moves the edge of a three pixel stroke by a
 * third of its width. Averaging each point with its neighbours first (1-2-1,
 * twice) flattens the stairs while moving the line by about a third of a pixel,
 * and then a tight tolerance is enough.
 */
function smoothRing(points: Point[], passes = 2): Point[] {
  let ring = points;
  const n = points.length;
  if (n < 6) return ring;
  for (let pass = 0; pass < passes; pass++) {
    const next: Point[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = ring[(i + n - 1) % n];
      const b = ring[i];
      const c = ring[(i + 1) % n];
      next[i] = { x: (a.x + 2 * b.x + c.x) / 4, y: (a.y + 2 * b.y + c.y) / 4 };
    }
    ring = next;
  }
  return ring;
}

export function traceInk(lines: Gray, fill = '#000000'): string {
  const { width, height, data } = lines;
  const rings: Cubic[][] = [];
  for (const contour of contoursOf((x, y) => data[y * width + x] < 128, width, height)) {
    // A hole is held to a smaller floor than an outline: a speck of ink is noise,
    // but a speck of paper inside a stroke is a counter, and dropping it fills it.
    const floor = contour.hole ? 1 : 6;
    if (contour.area < floor) continue;
    const tidy = simplify(smoothRing(contour.points), 0.5);
    if (tidy.length < 3) continue;
    const curves = fitCurves([...tidy, tidy[0]], 0.9);
    if (curves.length) rings.push(curves);
  }
  return toSvg(rings.length ? [{ fill, curves: rings }] : [], width, height);
}

export { pathDataFor };
