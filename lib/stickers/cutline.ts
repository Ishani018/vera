import type { Mask } from '../lineart/mask';

/**
 * The die-cut outline, as a path a cutting machine can follow.
 *
 * Traced from the sticker's own alpha channel rather than worked out again from
 * the artwork, so the line the machine cuts is the edge of the picture that was
 * exported beside it. If the two ever disagreed, the sticker would be cut a
 * little wrong and nobody would find out until a sheet of them arrived.
 *
 * The trace follows the *cracks* between pixels rather than the pixel centres:
 * every boundary between a solid pixel and an empty one is one unit-long
 * segment, and the segments chain into closed loops. Holes come out wound the
 * opposite way to outlines, which is what lets one path with the ordinary
 * fill rule describe a shape with a hole in it.
 */

export type Point = { x: number; y: number };
export type Loop = Point[];

/** Anything at or above this counts as solid. Half, so a soft edge cuts at its middle. */
export const SOLID_AT = 128;

/**
 * Every closed loop round the solid parts of a mask.
 *
 * Wound consistently: solid is always on the same side, so an outline and the
 * hole inside it run opposite ways.
 */
export function traceLoops(mask: Mask, threshold = SOLID_AT): Loop[] {
  const { width, height, data } = mask;
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] >= threshold;

  // Directed unit segments along the cracks, keyed by where they start. A
  // vertex can have two of them leaving it where four pixels meet corner to
  // corner, which is why this is a list per key rather than one entry.
  const out = new Map<string, Point[]>();
  const key = (p: Point) => `${p.x},${p.y}`;
  const add = (from: Point, to: Point) => {
    const at = out.get(key(from));
    if (at) at.push(to);
    else out.set(key(from), [to]);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!solid(x, y)) continue;
      // Wound so that the solid pixel is always on the same side of its edge.
      if (!solid(x, y - 1)) add({ x, y }, { x: x + 1, y });
      if (!solid(x + 1, y)) add({ x: x + 1, y }, { x: x + 1, y: y + 1 });
      if (!solid(x, y + 1)) add({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
      if (!solid(x - 1, y)) add({ x, y: y + 1 }, { x, y });
    }
  }

  const loops: Loop[] = [];
  for (const [start] of out) {
    for (;;) {
      const first = out.get(start);
      if (!first?.length) break;
      const loop: Loop = [];
      let here = fromKey(start);
      for (;;) {
        const next = out.get(key(here));
        if (!next?.length) break;
        // Shift rather than pop, so a saddle is always resolved the same way.
        const step = next.shift()!;
        if (!next.length) out.delete(key(here));
        loop.push(here);
        here = step;
        if (key(here) === start) break;
      }
      if (loop.length > 2) loops.push(loop);
    }
  }
  return loops;
}

const fromKey = (k: string): Point => {
  const [x, y] = k.split(',').map(Number);
  return { x, y };
};

/**
 * Ramer–Douglas–Peucker: the same line with the corners that matter kept.
 *
 * A crack-traced outline is all right angles, one point per pixel — a circle of
 * a thousand pixels across comes out as four thousand segments, which is a file
 * no cutting machine wants and a path no editor will open happily. This keeps
 * every point that is more than `tolerance` away from the straight line through
 * its neighbours and drops the rest, so the error is bounded by the number
 * given rather than by luck.
 */
export function simplify(loop: Loop, tolerance: number): Loop {
  if (loop.length < 4 || tolerance <= 0) return loop;
  // Closed: simplify it as an open line from the first point round to itself,
  // which keeps that point and lets everything between it move.
  const closed = [...loop, loop[0]];
  const kept = rdp(closed, 0, closed.length - 1, tolerance);
  kept.pop();
  return kept.length > 2 ? kept : loop;
}

function rdp(points: Loop, first: number, last: number, tolerance: number): Loop {
  let worst = 0;
  let at = first;
  for (let i = first + 1; i < last; i++) {
    const d = distanceToSegment(points[i], points[first], points[last]);
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= tolerance) return [points[first], points[last]];
  const left = rdp(points, first, at, tolerance);
  const right = rdp(points, at, last, tolerance);
  left.pop();
  return [...left, ...right];
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * The worst a simplified loop strays from the one it came from, in pixels.
 *
 * Measured from every original point to the simplified line, which is the
 * honest direction: it answers "how far could the blade be from the edge of my
 * picture", not "how far are two lists of numbers apart".
 */
export function strayed(original: Loop, kept: Loop): number {
  if (kept.length < 2) return Infinity;
  let worst = 0;
  for (const p of original) {
    let nearest = Infinity;
    for (let i = 0; i < kept.length; i++) {
      const a = kept[i];
      const b = kept[(i + 1) % kept.length];
      const d = distanceToSegment(p, a, b);
      if (d < nearest) nearest = d;
    }
    if (nearest > worst) worst = nearest;
  }
  return worst;
}

export type CutLine = {
  /** One `M … Z` per loop, in the picture's own pixel coordinates. */
  path: string;
  loops: number;
  points: number;
  /** The worst any loop strays from the traced edge, in pixels. */
  strayPx: number;
  width: number;
  height: number;
};

/** Twice the area a loop encloses, signed — which also says which way it winds. */
export function twiceArea(loop: Loop): number {
  let sum = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

/**
 * The smallest thing worth cutting, in square pixels.
 *
 * A softened edge has alpha values either side of the threshold, and thresholding
 * one leaves a scatter of two- and three-pixel islands along it. They are not
 * shapes — no blade can cut a three-pixel island, and a file full of them is a
 * file a cutting machine chokes on. Sixteen square pixels is four pixels
 * square: below anything anyone drew, above everything the threshold invents.
 */
export const LEAST_AREA = 16;

export function cutLine(mask: Mask, tolerance = 1.5, leastArea = LEAST_AREA): CutLine {
  const traced = traceLoops(mask).filter((loop) => Math.abs(twiceArea(loop)) >= leastArea * 2);
  const kept = traced.map((loop) => simplify(loop, tolerance));
  const strayPx = traced.reduce((worst, loop, i) => Math.max(worst, strayed(loop, kept[i])), 0);
  return {
    path: kept.map(pathOf).join(' '),
    loops: kept.length,
    points: kept.reduce((n, loop) => n + loop.length, 0),
    strayPx: Number(strayPx.toFixed(3)),
    width: mask.width,
    height: mask.height,
  };
}

const round = (n: number) => Number(n.toFixed(2));

function pathOf(loop: Loop): string {
  if (!loop.length) return '';
  const parts = [`M ${round(loop[0].x)} ${round(loop[0].y)}`];
  for (let i = 1; i < loop.length; i++) parts.push(`L ${round(loop[i].x)} ${round(loop[i].y)}`);
  parts.push('Z');
  return parts.join(' ');
}

/**
 * A whole SVG file: the cut line as a stroked path over nothing.
 *
 * Stroked and unfilled, because that is what a cutting machine reads — the line
 * is the instruction, not the outline of a filled shape. The size is given in
 * millimetres as well as pixels so the machine cuts it at the size it was
 * designed at rather than at whatever it assumes.
 */
export function cutLineSvg(cut: CutLine, dpi = 300): string {
  const mmWide = ((cut.width / dpi) * 25.4).toFixed(2);
  const mmHigh = ((cut.height / dpi) * 25.4).toFixed(2);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${mmWide}mm" height="${mmHigh}mm"`,
    ` viewBox="0 0 ${cut.width} ${cut.height}">`,
    `<title>Cut line</title>`,
    `<path d="${cut.path}" fill="none" stroke="#FF0000" stroke-width="1" fill-rule="nonzero"/>`,
    '</svg>',
  ].join('');
}
