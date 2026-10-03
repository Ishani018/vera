/**
 * Region boundaries, as closed polygons, and curves fitted to them.
 *
 * Stage 4's `trace` follows a SKELETON — a one-pixel line, walked from end to
 * end. This follows a BORDER: the outline of a filled area, which is a
 * different shape of problem and has to come back closed or the fill in an SVG
 * leaks exactly the way a fill on a colouring page would.
 *
 * All original code, written from the published mathematics. See
 * `docs/ALGORITHMS.md`.
 */

export type Point = { x: number; y: number };
export type Contour = {
  points: Point[];
  area: number;
  /**
   * True when this ring is a hole rather than an outline.
   *
   * Falls out of the winding, which this tracer sets consistently: an outline
   * comes back with a positive signed area and a hole with a negative one.
   * Worth having, because the two want different treatment — a shape smaller
   * than a speck is noise, and a HOLE smaller than a speck is usually an eye.
   */
  hole: boolean;
};

/**
 * The outline of everything `inside` says is inside, as closed polygons.
 *
 * Crack following rather than walking pixel centres. Every boundary is a run of
 * unit segments along the lattice BETWEEN pixels — the top of this pixel, the
 * left of that one — and each is given a direction with the inside on a
 * consistent side. Chain them end to end and the loops close by construction:
 * every lattice point that an edge arrives at has exactly one edge leaving it,
 * because the inside/outside pattern around a point cannot be odd.
 *
 * That is worth the slight extra work over tracing pixel centres, which has to
 * decide what to do at a diagonal touch and gets a different answer depending
 * on which it picks. There is no such choice here.
 */
export function contoursOf(
  inside: (x: number, y: number) => boolean,
  width: number,
  height: number,
): Contour[] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && inside(x, y);
  const key = (x: number, y: number) => y * (width + 1) + x;

  /** From each lattice point, where the one edge leaving it goes. */
  const next = new Map<number, Point>();
  const add = (fromX: number, fromY: number, toX: number, toY: number) => {
    next.set(key(fromX, fromY), { x: toX, y: toY });
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!at(x, y)) continue;
      // Clockwise around the pixel, in screen coordinates where y runs down.
      if (!at(x, y - 1)) add(x, y, x + 1, y);
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) add(x, y + 1, x, y);
    }
  }

  const contours: Contour[] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const points: Point[] = [];
    let here = { x: start % (width + 1), y: Math.floor(start / (width + 1)) };
    for (;;) {
      const id = key(here.x, here.y);
      if (seen.has(id)) break;
      seen.add(id);
      points.push(here);
      const step = next.get(id);
      if (!step) break;
      here = step;
    }
    if (points.length >= 4) {
      const signed = signedArea(points);
      contours.push({ points, area: Math.abs(signed), hole: signed < 0 });
    }
  }
  return contours.sort((a, b) => b.area - a.area);
}

/** Twice the signed area, by the shoelace sum. Sign says which way it winds. */
export function signedArea(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += a.x * b.y - b.x * a.y;
  }
  return total / 2;
}

/**
 * Drop the points a shape does not need.
 *
 * Douglas and Peucker: keep the two ends, find the point furthest from the line
 * between them, and if it is further than `epsilon` keep it and recurse on both
 * halves. A boundary traced off a pixel grid is a staircase of unit steps and
 * most of them say nothing — this is what turns four thousand points into forty
 * without moving the shape more than a fraction of a pixel.
 */
export function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3 || epsilon <= 0) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  // An explicit stack: a long boundary recurses deeply enough to matter.
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    if (last <= first + 1) continue;
    let worst = 0;
    let worstAt = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i], points[first], points[last]);
      if (d > worst) {
        worst = d;
        worstAt = i;
      }
    }
    if (worst > epsilon && worstAt > 0) {
      keep[worstAt] = 1;
      stack.push([first, worstAt], [worstAt, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (length === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / length;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/* ------------------------------------------------------------- Béziers */

/** A cubic: start, two handles, end. */
export type Cubic = [Point, Point, Point, Point];

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const scale = (a: Point, by: number): Point => ({ x: a.x * by, y: a.y * by });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
function unit(a: Point): Point {
  const length = Math.hypot(a.x, a.y);
  return length === 0 ? { x: 0, y: 0 } : { x: a.x / length, y: a.y / length };
}

/**
 * Fit cubic Béziers to a run of points.
 *
 * Schneider's method: guess a parameterisation by chord length, solve for the
 * two handle lengths by least squares, measure the worst error, and if it is
 * too big either nudge the parameterisation and try again or split at the worst
 * point and fit the two halves. Recursion is what lets one routine answer both
 * "this is a gentle arc" and "this is a letter S".
 *
 * `error` is in pixels, and it is the whole quality control: a logo traced at
 * half a pixel looks like the picture, and at four pixels looks like a logo.
 */
export function fitCurves(points: Point[], error: number): Cubic[] {
  if (points.length < 2) return [];
  const tidied = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  if (tidied.length < 2) return [];
  if (tidied.length === 2) {
    const [a, b] = tidied;
    const third = scale(sub(b, a), 1 / 3);
    return [[a, add(a, third), sub(b, third), b]];
  }
  return fitRun(
    tidied,
    0,
    tidied.length - 1,
    unit(sub(tidied[1], tidied[0])),
    unit(sub(tidied[tidied.length - 2], tidied[tidied.length - 1])),
    error,
    0,
  );
}

function fitRun(
  d: Point[],
  first: number,
  last: number,
  tangent1: Point,
  tangent2: Point,
  error: number,
  depth: number,
): Cubic[] {
  const count = last - first + 1;
  if (count === 2) {
    const distance = Math.hypot(d[last].x - d[first].x, d[last].y - d[first].y) / 3;
    return [
      [
        d[first],
        add(d[first], scale(tangent1, distance)),
        add(d[last], scale(tangent2, distance)),
        d[last],
      ],
    ];
  }

  let u = chordLengths(d, first, last);
  let curve = generate(d, first, last, u, tangent1, tangent2);
  let { worst, at } = maxError(d, first, last, curve, u);
  if (worst < error) return [curve];

  // Close: the shape is right and only the parameterisation is off, so nudge
  // each point towards where the curve actually is nearest it and solve again.
  if (worst < error * error) {
    for (let attempt = 0; attempt < 4; attempt++) {
      u = reparameterise(d, first, last, u, curve);
      curve = generate(d, first, last, u, tangent1, tangent2);
      const again = maxError(d, first, last, curve, u);
      if (again.worst < error) return [curve];
      worst = again.worst;
      at = again.at;
    }
  }

  // Too far out, or too deep to keep trying: split at the worst point.
  if (depth > 24 || at <= first || at >= last) return [curve];
  const centre = centreTangent(d, at);
  return [
    ...fitRun(d, first, at, tangent1, centre, error, depth + 1),
    ...fitRun(d, at, last, scale(centre, -1), tangent2, error, depth + 1),
  ];
}

/** A first guess at where each point sits along the curve, by distance. */
function chordLengths(d: Point[], first: number, last: number): number[] {
  const u = [0];
  for (let i = first + 1; i <= last; i++) {
    u.push(u[i - first - 1] + Math.hypot(d[i].x - d[i - 1].x, d[i].y - d[i - 1].y));
  }
  const total = u[u.length - 1] || 1;
  return u.map((value) => value / total);
}

const B0 = (t: number) => (1 - t) ** 3;
const B1 = (t: number) => 3 * t * (1 - t) ** 2;
const B2 = (t: number) => 3 * t * t * (1 - t);
const B3 = (t: number) => t ** 3;

/**
 * The best handle lengths for this parameterisation, by least squares.
 *
 * The two ends and the two tangent DIRECTIONS are fixed; the only unknowns are
 * how far along each tangent the handles sit. Two unknowns, so a two by two
 * system, which is why this is a closed form rather than an optimisation.
 */
function generate(
  d: Point[],
  first: number,
  last: number,
  u: number[],
  tangent1: Point,
  tangent2: Point,
): Cubic {
  const count = last - first + 1;
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;

  for (let i = 0; i < count; i++) {
    const t = u[i];
    const a1 = scale(tangent1, B1(t));
    const a2 = scale(tangent2, B2(t));
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const target = sub(
      d[first + i],
      add(
        add(scale(d[first], B0(t)), scale(d[first], B1(t))),
        add(scale(d[last], B2(t)), scale(d[last], B3(t))),
      ),
    );
    x0 += dot(a1, target);
    x1 += dot(a2, target);
  }

  const determinant = c00 * c11 - c01 * c01;
  let alpha1 = determinant === 0 ? 0 : (x0 * c11 - x1 * c01) / determinant;
  let alpha2 = determinant === 0 ? 0 : (c00 * x1 - c01 * x0) / determinant;

  // A negative or vanishing handle is the least-squares solution saying it
  // cannot help; the usual fallback is a third of the chord, which is what a
  // circular arc of this span would use.
  const chord = Math.hypot(d[last].x - d[first].x, d[last].y - d[first].y);
  if (alpha1 < 1e-6 || alpha2 < 1e-6) {
    alpha1 = chord / 3;
    alpha2 = chord / 3;
  }
  return [
    d[first],
    add(d[first], scale(tangent1, alpha1)),
    add(d[last], scale(tangent2, alpha2)),
    d[last],
  ];
}

function evaluate(curve: Cubic, t: number): Point {
  return {
    x: curve[0].x * B0(t) + curve[1].x * B1(t) + curve[2].x * B2(t) + curve[3].x * B3(t),
    y: curve[0].y * B0(t) + curve[1].y * B1(t) + curve[2].y * B2(t) + curve[3].y * B3(t),
  };
}

function maxError(
  d: Point[],
  first: number,
  last: number,
  curve: Cubic,
  u: number[],
): { worst: number; at: number } {
  let worst = 0;
  let at = Math.floor((last - first + 1) / 2) + first;
  for (let i = first + 1; i < last; i++) {
    const on = evaluate(curve, u[i - first]);
    const distance = (on.x - d[i].x) ** 2 + (on.y - d[i].y) ** 2;
    if (distance >= worst) {
      worst = distance;
      at = i;
    }
  }
  return { worst: Math.sqrt(worst), at };
}

/** One Newton step towards the nearest point on the curve, per sample. */
function reparameterise(d: Point[], first: number, last: number, u: number[], curve: Cubic): number[] {
  return u.map((t, i) => {
    const point = d[first + i];
    const on = evaluate(curve, t);
    const d1 = derivative(curve, t);
    const d2 = secondDerivative(curve, t);
    const numerator = (on.x - point.x) * d1.x + (on.y - point.y) * d1.y;
    const denominator = d1.x * d1.x + d1.y * d1.y + (on.x - point.x) * d2.x + (on.y - point.y) * d2.y;
    if (denominator === 0) return t;
    void last;
    return t - numerator / denominator;
  });
}

function derivative(c: Cubic, t: number): Point {
  const a = scale(sub(c[1], c[0]), 3);
  const b = scale(sub(c[2], c[1]), 3);
  const d = scale(sub(c[3], c[2]), 3);
  return {
    x: a.x * (1 - t) ** 2 + b.x * 2 * t * (1 - t) + d.x * t * t,
    y: a.y * (1 - t) ** 2 + b.y * 2 * t * (1 - t) + d.y * t * t,
  };
}

function secondDerivative(c: Cubic, t: number): Point {
  const a = scale(sub(c[1], c[0]), 3);
  const b = scale(sub(c[2], c[1]), 3);
  const d = scale(sub(c[3], c[2]), 3);
  const e = scale(sub(b, a), 2);
  const f = scale(sub(d, b), 2);
  return { x: e.x * (1 - t) + f.x * t, y: e.y * (1 - t) + f.y * t };
}

/** The direction a path is going as it passes through one of its points. */
function centreTangent(d: Point[], at: number): Point {
  return unit(sub(d[at - 1], d[at + 1]));
}
