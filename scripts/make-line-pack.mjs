import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Draws the line-art pack in starter/lines.
 *
 * The pictures are made here rather than downloaded, which settles the licence
 * question by construction: nothing came from anywhere, so nothing can be
 * encumbered. It also means the pack can be rebuilt byte for byte, so a change
 * to one picture shows up as a change to one picture.
 *
 * Deliberately small: polylines, a distance field for the stroke, and a PNG
 * writer. Adding a drawing library to make eight shapes would be a dependency
 * the app itself never loads.
 */

const SIZE = 512;
const STROKE = 7; // px, full width

/* ---------- geometry, all in a 0..1 box ---------- */

/** A circle, or an arc of one, as a polyline. */
const arc = (cx, cy, r, from = 0, to = Math.PI * 2, steps = 160) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });

/** An ellipse, for the things a circle gets wrong — a cup seen from above. */
const ellipse = (cx, cy, rx, ry, steps = 160) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });

/** A cubic bezier as a polyline. */
const curve = (p0, p1, p2, p3, steps = 80) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return [0, 1].map(
      (k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k],
    );
  });

const line = (a, b) => [a, b];

/** An axis-aligned rectangle, as four lines. */
const box = (left, top, right, bottom) => [
  [[left, top], [right, top]],
  [[right, top], [right, bottom]],
  [[right, bottom], [left, bottom]],
  [[left, bottom], [left, top]],
];

/* ---------- the eight drawings ---------- */

const DRAWINGS = {
  'leaf.png': [
    curve([0.5, 0.1], [0.86, 0.3], [0.86, 0.66], [0.5, 0.92]),
    curve([0.5, 0.1], [0.14, 0.3], [0.14, 0.66], [0.5, 0.92]),
    line([0.5, 0.18], [0.5, 0.92]),
    curve([0.5, 0.34], [0.6, 0.38], [0.68, 0.44], [0.72, 0.52]),
    curve([0.5, 0.34], [0.4, 0.38], [0.32, 0.44], [0.28, 0.52]),
    curve([0.5, 0.52], [0.58, 0.56], [0.64, 0.62], [0.67, 0.7]),
    curve([0.5, 0.52], [0.42, 0.56], [0.36, 0.62], [0.33, 0.7]),
  ],
  'flower.png': [
    ...[0, 1, 2, 3, 4].map((i) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const px = 0.5 + Math.cos(a) * 0.21;
      const py = 0.42 + Math.sin(a) * 0.21;
      return arc(px, py, 0.13);
    }),
    arc(0.5, 0.42, 0.085),
    curve([0.5, 0.63], [0.52, 0.74], [0.48, 0.82], [0.5, 0.93]),
    curve([0.5, 0.78], [0.6, 0.72], [0.72, 0.74], [0.75, 0.82]),
    curve([0.5, 0.78], [0.62, 0.8], [0.72, 0.82], [0.75, 0.82]),
  ],
  'cup.png': [
    ellipse(0.47, 0.38, 0.25, 0.075),
    line([0.22, 0.38], [0.28, 0.78]),
    line([0.72, 0.38], [0.66, 0.78]),
    curve([0.28, 0.78], [0.34, 0.87], [0.6, 0.87], [0.66, 0.78]),
    curve([0.72, 0.46], [0.86, 0.44], [0.9, 0.58], [0.78, 0.66]),
    curve([0.72, 0.53], [0.81, 0.52], [0.83, 0.59], [0.76, 0.62]),
    curve([0.4, 0.24], [0.44, 0.17], [0.36, 0.15], [0.4, 0.07]),
    curve([0.56, 0.24], [0.6, 0.17], [0.52, 0.15], [0.56, 0.07]),
  ],
  'house.png': [
    line([0.5, 0.12], [0.88, 0.44]),
    line([0.5, 0.12], [0.12, 0.44]),
    line([0.14, 0.44], [0.14, 0.86]),
    line([0.86, 0.44], [0.86, 0.86]),
    line([0.1, 0.86], [0.9, 0.86]),
    line([0.41, 0.86], [0.41, 0.58]),
    line([0.59, 0.86], [0.59, 0.58]),
    line([0.41, 0.58], [0.59, 0.58]),
    arc(0.55, 0.72, 0.022),
    ...box(0.22, 0.56, 0.34, 0.68),
    line([0.68, 0.22], [0.68, 0.36]),
    line([0.78, 0.3], [0.78, 0.36]),
    line([0.68, 0.22], [0.78, 0.3]),
  ],
  'cat.png': [
    arc(0.5, 0.56, 0.28),
    line([0.28, 0.38], [0.26, 0.16]),
    line([0.26, 0.16], [0.45, 0.31]),
    line([0.72, 0.38], [0.74, 0.16]),
    line([0.74, 0.16], [0.55, 0.31]),
    arc(0.4, 0.52, 0.035),
    arc(0.6, 0.52, 0.035),
    curve([0.46, 0.62], [0.48, 0.65], [0.52, 0.65], [0.54, 0.62]),
    line([0.5, 0.63], [0.5, 0.68]),
    line([0.2, 0.58], [0.36, 0.62]),
    line([0.2, 0.66], [0.36, 0.66]),
    line([0.8, 0.58], [0.64, 0.62]),
    line([0.8, 0.66], [0.64, 0.66]),
  ],
  'heart.png': [
    curve([0.5, 0.86], [0.1, 0.56], [0.14, 0.18], [0.38, 0.18]),
    curve([0.38, 0.18], [0.46, 0.18], [0.5, 0.26], [0.5, 0.32]),
    curve([0.5, 0.86], [0.9, 0.56], [0.86, 0.18], [0.62, 0.18]),
    curve([0.62, 0.18], [0.54, 0.18], [0.5, 0.26], [0.5, 0.32]),
  ],
  'moon.png': [
    // The two edges share their endpoints exactly, so the crescent closes to a
    // point instead of showing a gap where the lines nearly meet.
    arc(0.44, 0.5, 0.34, Math.PI / 3, (Math.PI * 5) / 3),
    curve(
      [0.44 + 0.34 * Math.cos(Math.PI / 3), 0.5 + 0.34 * Math.sin(Math.PI / 3)],
      [0.2, 0.74],
      [0.2, 0.26],
      [0.44 + 0.34 * Math.cos((Math.PI * 5) / 3), 0.5 + 0.34 * Math.sin((Math.PI * 5) / 3)],
    ),
    arc(0.84, 0.24, 0.045),
    arc(0.9, 0.56, 0.03),
    arc(0.78, 0.78, 0.024),
  ],
  'boat.png': [
    line([0.16, 0.66], [0.84, 0.66]),
    curve([0.16, 0.66], [0.24, 0.82], [0.76, 0.82], [0.84, 0.66]),
    line([0.5, 0.12], [0.5, 0.66]),
    line([0.5, 0.18], [0.78, 0.6]),
    line([0.78, 0.6], [0.5, 0.6]),
    line([0.46, 0.22], [0.24, 0.6]),
    line([0.24, 0.6], [0.46, 0.6]),
    curve([0.08, 0.88], [0.18, 0.82], [0.28, 0.94], [0.38, 0.88]),
    curve([0.58, 0.9], [0.68, 0.84], [0.78, 0.96], [0.9, 0.9]),
  ],
};

/* ---------- rasterising ---------- */

const distanceToSegment = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
};

/**
 * One drawing as RGBA bytes.
 *
 * Coverage comes from the distance to the nearest stroke, which anti-aliases
 * every edge the same way and never leaves a seam where two lines meet — the
 * thing that goes wrong if you draw each line into the buffer in turn.
 */
function raster(polylines, size = SIZE, stroke = STROKE) {
  const half = stroke / 2;
  const pixels = new Uint8Array(size * size * 4);
  const segments = [];
  for (const polyline of polylines) {
    for (let i = 0; i + 1 < polyline.length; i += 1) {
      segments.push([
        polyline[i][0] * size,
        polyline[i][1] * size,
        polyline[i + 1][0] * size,
        polyline[i + 1][1] * size,
      ]);
    }
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      let nearest = Infinity;
      for (const [ax, ay, bx, by] of segments) {
        // Cheap reject: a segment whose box is already further than the best.
        if (px < Math.min(ax, bx) - nearest || px > Math.max(ax, bx) + nearest) continue;
        if (py < Math.min(ay, by) - nearest || py > Math.max(ay, by) + nearest) continue;
        const d = distanceToSegment(px, py, ax, ay, bx, by);
        if (d < nearest) nearest = d;
      }
      const coverage = Math.max(0, Math.min(1, half + 0.5 - nearest));
      if (coverage <= 0) continue;
      const at = (y * size + x) * 4;
      pixels[at + 3] = Math.round(coverage * 255); // black, so only alpha varies
    }
  }
  return pixels;
}

/* ---------- PNG ---------- */

const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, body) => {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  const named = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(named));
  return Buffer.concat([head, named, tail]);
};

function png(pixels, size = SIZE) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none, so the bytes are predictable
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head[8] = 8; // bit depth
  head[9] = 6; // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- write ---------- */

const out = join(new URL('..', import.meta.url).pathname.replace(/\/$/, ''), 'starter', 'lines');
mkdirSync(out, { recursive: true });
for (const [file, polylines] of Object.entries(DRAWINGS)) {
  const bytes = png(raster(polylines));
  writeFileSync(join(out, file), bytes);
  console.log(`${file} — ${SIZE}x${SIZE}, ${(bytes.length / 1024).toFixed(1)} KB`);
}
console.log(`\n${Object.keys(DRAWINGS).length} drawings in starter/lines.`);
