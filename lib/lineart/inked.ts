/**
 * Hand-inked mode: the line mask redrawn as strokes.
 *
 * Every other look in this folder decides, for each pixel, whether it is ink.
 * This one stops thinking in pixels. The mask is thinned to a one-pixel
 * skeleton, the skeleton is followed into paths, the paths are tidied — short
 * spurs dropped, near gaps joined, corners rounded off — and only then is
 * anything drawn. What gets drawn is a stroke with a width that varies along
 * it and tapers at both ends, the way a nib unloads.
 *
 * Two things follow from working in paths rather than pixels.
 *
 * **The output is genuinely vector.** The SVG is not a traced picture of a
 * raster; it is the same strokes the canvas drew, written down as outlines. The
 * two agree because they are built from one list of points and one list of
 * widths — there is no second implementation to drift.
 *
 * **The wobble is a wobble, not noise.** A hand-drawn line is not straight, but
 * it is not random either: it drifts. The offset here is smooth along the
 * length of each stroke and comes from a fixed sequence seeded by the stroke's
 * own index, so a picture redrawn tomorrow wobbles identically. There is no
 * `Math.random` in this file and a test makes sure of it.
 *
 * All original code, written from the published mathematics. See
 * `docs/ALGORITHMS.md`.
 */

import { INK, PAPER, type Gray } from './pipeline';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type Point = { x: number; y: number };
/** A stroke: where it goes, and how wide it is at each point along it. */
export type Stroke = { points: Point[]; widths: number[] };

export type InkedSettings = {
  /** 0–100. How heavy the pen is. */
  thickness: number;
  /** 0–100. How far the ends thin away to nothing. */
  taper: number;
  /** 0–100. How much the line drifts off true. */
  wobble: number;
  /** 0–100. How much of the fine detail survives: shorter strokes kept. */
  detail: number;
};

export const INKED_DEFAULTS: InkedSettings = {
  thickness: 45,
  taper: 55,
  wobble: 30,
  detail: 50,
};

/** The sliders, as numbers. Pure, so the mapping is testable. */
export function resolveInked(settings: InkedSettings) {
  const thickness = clamp(settings.thickness, 0, 100) / 100;
  const taper = clamp(settings.taper, 0, 100) / 100;
  const wobble = clamp(settings.wobble, 0, 100) / 100;
  const detail = clamp(settings.detail, 0, 100) / 100;
  return {
    /** Half-width at the fattest part of a stroke, in pixels. */
    radius: lerp(0.6, 3.4, thickness),
    /** How far from each end the taper reaches, as a share of the stroke. */
    taperShare: lerp(0, 0.42, taper),
    /** How thin the very end gets, as a share of the full width. */
    taperTo: lerp(1, 0.08, taper),
    /** How far the line may drift, in pixels. */
    wobbleAmount: lerp(0, 1.8, wobble),
    /** How long a drift is: short is a shake, long is a lean. */
    wobbleScale: 26,
    /** Strokes shorter than this are dropped. More detail keeps more. */
    minLength: Math.round(lerp(26, 3, detail)),
    /** A spur shorter than this hanging off a junction is thinning debris. */
    maxSpur: Math.round(lerp(14, 4, detail)),
    /** Ends closer than this, and roughly in line, are joined up. */
    maxGap: Math.round(lerp(2, 7, detail)),
    /** How hard the corners are rounded off. */
    smoothRounds: 2,
  };
}

/* ------------------------------------------------------------- skeleton */

/**
 * Thin the mask until every line is one pixel wide.
 *
 * Zhang and Suen's two-pass method: on each sweep a pixel is removed only if it
 * has between two and six neighbours, exactly one run of ink around it, and
 * satisfies a pair of conditions that differ between the two passes. Together
 * those keep the shape connected and keep the ends where they are, which is
 * what distinguishes thinning from erosion — an erosion of a line is no line.
 *
 * The two passes alternate on purpose. One pass alone eats a diagonal from one
 * side and shifts it; the pair is symmetric.
 */
export function skeletonise(mask: Gray): Gray {
  const { width, height } = mask;
  // 1 where there is ink. Working in a plain byte array rather than on the
  // grey values, because thinning is a question about shape, not about tone.
  let on = new Uint8Array(width * height);
  for (let i = 0; i < on.length; i++) on[i] = mask.data[i] < 128 ? 1 : 0;

  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : on[y * width + x];

  for (let round = 0; round < 64; round++) {
    let removedAny = false;
    for (const pass of [0, 1]) {
      const doomed: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!on[y * width + x]) continue;
          // The eight neighbours, clockwise from north, as Zhang and Suen
          // number them: p2 p3 p4 p5 p6 p7 p8 p9.
          const p2 = at(x, y - 1);
          const p3 = at(x + 1, y - 1);
          const p4 = at(x + 1, y);
          const p5 = at(x + 1, y + 1);
          const p6 = at(x, y + 1);
          const p7 = at(x - 1, y + 1);
          const p8 = at(x - 1, y);
          const p9 = at(x - 1, y - 1);
          const ring = [p2, p3, p4, p5, p6, p7, p8, p9];
          let neighbours = 0;
          for (const v of ring) neighbours += v;
          if (neighbours < 2 || neighbours > 6) continue;
          // Exactly one 0-to-1 step going round: more than one means removing
          // this pixel would cut the shape in two.
          let transitions = 0;
          for (let i = 0; i < 8; i++) {
            if (ring[i] === 0 && ring[(i + 1) % 8] === 1) transitions += 1;
          }
          if (transitions !== 1) continue;
          if (pass === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          doomed.push(y * width + x);
        }
      }
      if (doomed.length) {
        removedAny = true;
        for (const i of doomed) on[i] = 0;
      }
    }
    if (!removedAny) break;
  }

  const data = new Uint8ClampedArray(width * height);
  for (let i = 0; i < on.length; i++) data[i] = on[i] ? INK : PAPER;
  return { width, height, data };
}

/* --------------------------------------------------------------- tracing */

const STEPS: Array<[number, number]> = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

/**
 * Follow the skeleton into paths.
 *
 * Eight-connected here, unlike everything else in this folder, because a
 * thinned diagonal IS a chain of diagonal touches and a four-connected walk
 * would see it as a row of separate dots.
 *
 * Ends and junctions first, then whatever is left. A pixel with one neighbour
 * is the end of something and is the natural place to start; a pixel with three
 * or more is where strokes meet and is where they have to be cut apart, or one
 * stroke would wander out of a crossing down somebody else's line. Closed loops
 * have neither, so they are picked up afterwards from any pixel on them.
 */
export function trace(skeleton: Gray): Point[][] {
  const { width, height, data } = skeleton;
  const on = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] < 128;

  const degree = (x: number, y: number) => {
    let n = 0;
    for (const [dx, dy] of STEPS) if (on(x + dx, y + dy)) n += 1;
    return n;
  };

  const used = new Uint8Array(width * height);
  const paths: Point[][] = [];

  const walk = (startX: number, startY: number, firstX: number, firstY: number) => {
    const points: Point[] = [{ x: startX, y: startY }];
    let x = firstX;
    let y = firstY;
    let fromX = startX;
    let fromY = startY;
    for (;;) {
      points.push({ x, y });
      used[y * width + x] = 1;
      if (degree(x, y) !== 2) break;
      let nextX = -1;
      let nextY = -1;
      for (const [dx, dy] of STEPS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!on(nx, ny)) continue;
        if (nx === fromX && ny === fromY) continue;
        if (used[ny * width + nx]) continue;
        nextX = nx;
        nextY = ny;
        break;
      }
      if (nextX < 0) break;
      fromX = x;
      fromY = y;
      x = nextX;
      y = nextY;
    }
    if (points.length > 1) paths.push(points);
  };

  // Ends and junctions.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!on(x, y)) continue;
      const d = degree(x, y);
      if (d === 2) continue;
      used[y * width + x] = 1;
      for (const [dx, dy] of STEPS) {
        const nx = x + dx;
        const ny = y + dy;
        if (on(nx, ny) && !used[ny * width + nx]) walk(x, y, nx, ny);
      }
    }
  }
  // Whatever is left is a closed loop.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!on(x, y) || used[y * width + x]) continue;
      used[y * width + x] = 1;
      for (const [dx, dy] of STEPS) {
        const nx = x + dx;
        const ny = y + dy;
        if (on(nx, ny) && !used[ny * width + nx]) {
          walk(x, y, nx, ny);
          break;
        }
      }
    }
  }
  return paths;
}

/** How long a path is, following it rather than measuring end to end. */
export function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

/** How many of a pixel's eight neighbours are lit. */
function degreeOf(skeleton: Gray, x: number, y: number): number {
  const { width, height, data } = skeleton;
  let n = 0;
  for (const [dx, dy] of STEPS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < width && ny < height && data[ny * width + nx] < 128) n += 1;
  }
  return n;
}

/**
 * Rub the barbs off the skeleton, before anything is traced.
 *
 * This has to happen here rather than on the traced paths, and the reason is
 * the whole shape of the bug it fixes. Thinning leaves little barbs wherever
 * the mask had a bump. A barb is only a few pixels long, but the pixel it hangs
 * off becomes a JUNCTION — and tracing cuts at junctions, because a stroke that
 * ran through a crossing would wander off down somebody else's line.
 *
 * So a smooth circle with eight barbs on it does not come out as one stroke
 * with eight hairs. It comes out as sixteen pieces: eight long arcs and eight
 * fragments a few pixels each, between pairs of barbs. Drop the short pieces
 * and the circle is drawn as four arcs with gaps between them, which is exactly
 * what happened — measured: four arcs of 95, 92, 82 and 75 pixels where there
 * should have been one of 420.
 *
 * Erasing the barbs first turns those junctions back into ordinary points, and
 * the next trace walks straight through them.
 *
 * Repeated, because a barb can have a barb — and each round ends with another
 * thinning pass, because rubbing a barb out leaves the pixel it hung from with
 * three neighbours arranged in a way that is no longer a junction at all, and
 * only the thinning rules know that. Without it a three-pixel barb comes back
 * as a one-pixel stub, which is a bump on the line instead of a hair beside it.
 */
export function pruneSkeleton(skeleton: Gray, maxSpur: number, rounds = 4): Gray {
  const { width, height } = skeleton;
  const data = new Uint8ClampedArray(skeleton.data);
  let current: Gray = { width, height, data };

  for (let round = 0; round < rounds; round++) {
    const paths = trace(current);
    const doomed: Point[] = [];
    for (const points of paths) {
      if (pathLength(points) >= maxSpur) continue;
      const head = points[0];
      const tail = points[points.length - 1];
      const headLoose = degreeOf(current, head.x, head.y) <= 1;
      const tailLoose = degreeOf(current, tail.x, tail.y) <= 1;
      // A barb has one loose end. Both ends loose is a short line on its own,
      // which is a speck rather than debris, and the length filter deals with
      // it later; neither end loose is a real link between two crossings.
      if (headLoose === tailLoose) continue;
      // Everything but the junction end, which belongs to the lines it joins.
      const from = headLoose ? 0 : 1;
      const to = headLoose ? points.length - 1 : points.length;
      for (let i = from; i < to; i++) doomed.push(points[i]);
    }
    if (!doomed.length) break;
    for (const point of doomed) data[point.y * width + point.x] = PAPER;
    current = skeletonise({ width, height, data });
    data.set(current.data);
  }
  return current;
}

/**
 * Join up the ends that were meant to be joined.
 *
 * Two different jobs, and they turned out to be the same job.
 *
 * The first is the obvious one: a line crossing a patch of shadow goes faint,
 * the threshold loses a few pixels of it, and the drawing has a hole. Two loose
 * ends close together and heading towards each other are one line.
 *
 * The second is the one that actually mattered. Thinning a line that is a
 * pixel or two too thick leaves little loops and clusters, and every one of
 * them is a junction — and tracing cuts at junctions, so a perfectly smooth
 * circle came out as four arcs of 95, 92, 82 and 75 pixels with the short
 * fragments between them dropped for being short. Those arcs meet AT the
 * junction: the gap between them is zero. The first version of this function
 * skipped zero-length gaps outright, to avoid joining a path to itself, and so
 * could not fix the thing it most needed to fix.
 *
 * So: zero counts, and all four ways two paths can meet are tried rather than
 * only end-to-start — a path traced outwards from a junction may run either
 * way round, and insisting on one orientation misses half the joins.
 *
 * Heading still decides. Two ends a few pixels apart but pointing away from one
 * another are the corners of two different things, and bridging them draws a
 * line nobody's picture contains.
 */
export function joinGaps(paths: Point[][], maxGap: number): Point[][] {
  if (paths.length < 2) return paths;
  const open: Array<Point[] | null> = paths.map((points) => points);

  /** The way a path is heading at one end, pointing OUT of the path. */
  const heading = (points: Point[], atStart: boolean) => {
    const n = Math.min(6, points.length);
    const inner = atStart ? points[n - 1] : points[points.length - n];
    const edge = atStart ? points[0] : points[points.length - 1];
    const dx = edge.x - inner.x;
    const dy = edge.y - inner.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  };

  for (let i = 0; i < open.length; i++) {
    let grew = true;
    while (grew) {
      grew = false;
      const a = open[i];
      if (!a) break;
      for (let j = 0; j < open.length; j++) {
        if (i === j) continue;
        const b = open[j];
        if (!b) continue;
        // The four ways they can meet: a's end or start, to b's start or end.
        for (const aAtStart of [false, true]) {
          for (const bAtStart of [true, false]) {
            const aEdge = aAtStart ? a[0] : a[a.length - 1];
            const bEdge = bAtStart ? b[0] : b[b.length - 1];
            const gap = Math.hypot(bEdge.x - aEdge.x, bEdge.y - aEdge.y);
            if (gap > maxGap) continue;
            const out = heading(a, aAtStart);
            const into = heading(b, bAtStart);
            // `into` points out of b at the meeting end, so a continuation has
            // the two pointing at each other: their dot product near -1.
            if (-(out.x * into.x + out.y * into.y) < 0.55) continue;
            if (gap > 0.0001) {
              const toward = (out.x * (bEdge.x - aEdge.x) + out.y * (bEdge.y - aEdge.y)) / gap;
              if (toward < 0.55) continue;
            }
            const front = aAtStart ? [...a].reverse() : a;
            const back = bAtStart ? b : [...b].reverse();
            open[i] = front.concat(back);
            open[j] = null;
            grew = true;
            break;
          }
          if (grew) break;
        }
        if (grew) break;
      }
    }
  }
  return open.filter((points): points is Point[] => points !== null);
}

/**
 * Round the corners off.
 *
 * Chaikin's corner cutting: replace each segment with its quarter and
 * three-quarter points, and repeat. Two rounds take the staircase off a
 * diagonal — which is an artefact of the pixel grid and not of the picture —
 * without pulling the line away from where it was.
 *
 * The two end points are kept exactly where they are, so a stroke that met
 * another at a junction still meets it.
 */
export function chaikin(points: Point[], rounds: number): Point[] {
  let current = points;
  for (let round = 0; round < rounds && current.length > 2; round++) {
    const next: Point[] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const a = current[i];
      const b = current[i + 1];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

/* ---------------------------------------------------------------- strokes */

/**
 * A smooth, repeatable drift.
 *
 * Value noise: a fixed sequence sampled at whole numbers and interpolated
 * between them, so the result wanders rather than jittering. Seeded by the
 * stroke's index, so stroke seven drifts the same way every time this runs on
 * any machine, which is the difference between a drawing and a lottery.
 */
function drift(seed: number): (t: number) => number {
  const value = (n: number) => {
    let h = (n ^ seed) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5;
  };
  return (t) => {
    const i = Math.floor(t);
    const f = t - i;
    // Smoothstep between the two, so there is no corner at each whole number.
    const s = f * f * (3 - 2 * f);
    return value(i) * (1 - s) + value(i + 1) * s;
  };
}

/**
 * Turn a path into a stroke: a width at every point, and a drift off true.
 *
 * `strength` says how dark the original mask was under each point, which is
 * what makes the pen press harder where the picture was more certain. The taper
 * is a share of the stroke's length rather than a fixed distance, so a short
 * stroke tapers like a short stroke instead of being all point.
 */
export function strokeFrom(
  points: Point[],
  index: number,
  strengthAt: (p: Point) => number,
  p: ReturnType<typeof resolveInked>,
): Stroke {
  const total = pathLength(points);
  const wander = drift(index * 2654435761);
  const out: Point[] = [];
  const widths: number[] = [];

  let travelled = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      travelled += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    const along = total > 0 ? travelled / total : 0;

    // Taper: full width in the middle, thinning towards each end.
    let taper = 1;
    if (p.taperShare > 0) {
      const fromEnd = Math.min(along, 1 - along) / p.taperShare;
      if (fromEnd < 1) taper = lerp(p.taperTo, 1, fromEnd);
    }

    // The nib presses where the mask was dark.
    const strength = clamp(strengthAt(points[i]), 0, 1);
    widths.push(Math.max(0.35, p.radius * taper * lerp(0.55, 1, strength)));

    // The drift goes across the line, never along it: pushing a point along its
    // own direction would bunch the samples up rather than move the line.
    if (p.wobbleAmount > 0) {
      const before = points[Math.max(0, i - 1)];
      const after = points[Math.min(points.length - 1, i + 1)];
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const len = Math.hypot(dx, dy) || 1;
      const amount = wander(travelled / p.wobbleScale) * p.wobbleAmount * 2;
      out.push({ x: points[i].x + (-dy / len) * amount, y: points[i].y + (dx / len) * amount });
    } else {
      out.push({ x: points[i].x, y: points[i].y });
    }
  }
  return { points: out, widths };
}

/** Everything, from a line mask to a list of strokes. */
export function strokesFrom(mask: Gray, settings: InkedSettings): Stroke[] {
  const p = resolveInked(settings);
  const tidy = pruneSkeleton(skeletonise(mask), p.maxSpur);

  let paths = trace(tidy);
  paths = joinGaps(paths, p.maxGap);
  paths = paths.filter((points) => pathLength(points) >= p.minLength);
  paths = paths.map((points) => chaikin(points, p.smoothRounds));

  // How dark the ORIGINAL mask was, not the skeleton: the skeleton is one pixel
  // wide everywhere and so says nothing about how strong a line was.
  const strengthAt = (point: Point) => {
    const x = clamp(Math.round(point.x), 0, mask.width - 1);
    const y = clamp(Math.round(point.y), 0, mask.height - 1);
    return 1 - mask.data[y * mask.width + x] / 255;
  };

  return paths.map((points, i) => strokeFrom(points, i, strengthAt, p));
}

/* --------------------------------------------------------------- drawing */

/**
 * Draw the strokes as pixels.
 *
 * A disc stamped at every sample point, which gives round caps and round joins
 * for free and cannot produce the mitre spikes a polygon approach does at a
 * sharp corner. The samples are a pixel or two apart after Chaikin, so
 * consecutive discs overlap and the stroke comes out continuous.
 */
export function renderStrokes(strokes: Stroke[], width: number, height: number): Gray {
  const data = new Uint8ClampedArray(width * height).fill(PAPER);
  for (const stroke of strokes) {
    for (let i = 0; i < stroke.points.length; i++) {
      const { x, y } = stroke.points[i];
      const r = stroke.widths[i];
      const x0 = Math.max(0, Math.floor(x - r));
      const x1 = Math.min(width - 1, Math.ceil(x + r));
      const y0 = Math.max(0, Math.floor(y - r));
      const y1 = Math.min(height - 1, Math.ceil(y + r));
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const d = Math.hypot(px + 0.5 - x, py + 0.5 - y);
          if (d > r + 0.5) continue;
          // One pixel of softness at the rim, so a thin stroke does not crawl.
          const cover = clamp(r + 0.5 - d, 0, 1);
          const value = Math.round(lerp(PAPER, INK, cover));
          const at = py * width + px;
          if (value < data[at]) data[at] = value;
        }
      }
    }
  }
  return { width, height, data };
}

/**
 * Write the strokes as SVG, as outlines rather than as stroked lines.
 *
 * An SVG `stroke-width` is one number for a whole path, and the entire point of
 * these strokes is that the width changes along them. So each one becomes a
 * filled shape: down one side offset by the half-width, round the end, and back
 * up the other. That is the same geometry the raster stamps, which is what lets
 * the two agree rather than merely resemble each other.
 */
export function strokesToSvg(strokes: Stroke[], width: number, height: number): string {
  const round = (n: number) => Math.round(n * 100) / 100;
  const paths: string[] = [];

  for (const stroke of strokes) {
    const { points, widths } = stroke;
    if (points.length < 2) continue;
    const left: Point[] = [];
    const right: Point[] = [];
    for (let i = 0; i < points.length; i++) {
      const before = points[Math.max(0, i - 1)];
      const after = points[Math.min(points.length - 1, i + 1)];
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const r = widths[i];
      left.push({ x: points[i].x + nx * r, y: points[i].y + ny * r });
      right.push({ x: points[i].x - nx * r, y: points[i].y - ny * r });
    }
    const parts = [`M ${round(left[0].x)} ${round(left[0].y)}`];
    for (let i = 1; i < left.length; i++) parts.push(`L ${round(left[i].x)} ${round(left[i].y)}`);
    // A half-circle cap, drawn as an arc so it stays a circle at any zoom.
    parts.push(
      `A ${round(widths[widths.length - 1])} ${round(widths[widths.length - 1])} 0 0 1 ` +
        `${round(right[right.length - 1].x)} ${round(right[right.length - 1].y)}`,
    );
    for (let i = right.length - 2; i >= 0; i--) parts.push(`L ${round(right[i].x)} ${round(right[i].y)}`);
    parts.push(`A ${round(widths[0])} ${round(widths[0])} 0 0 1 ${round(left[0].x)} ${round(left[0].y)}`);
    parts.push('Z');
    paths.push(`<path d="${parts.join(' ')}"/>`);
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<g fill="#000" fill-rule="nonzero">`,
    ...paths,
    `</g>`,
    `</svg>`,
  ].join('\n');
}

/** A line mask in, hand-inked pixels out. */
export function runInked(mask: Gray, settings: InkedSettings): Gray {
  return renderStrokes(strokesFrom(mask, settings), mask.width, mask.height);
}

/** A line mask in, hand-inked SVG out. The same strokes, written down. */
export function runInkedSvg(mask: Gray, settings: InkedSettings): string {
  return strokesToSvg(strokesFrom(mask, settings), mask.width, mask.height);
}
