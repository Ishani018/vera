/**
 * A contact sheet per picture: the original beside every look.
 *
 *   npm run lab:bench docs/lab-inputs
 *   npm run lab:bench ~/Pictures/some-folder
 *
 * Writes `out/lab-bench/<name>.png` and prints a table of what it measured —
 * ink coverage, midtone share, stroke and curve counts, and how long each look
 * took. Tuning by eye alone is how you end up with four looks that are secretly
 * the same; this is how you notice.
 *
 * Runs the real engine, the same code the browser runs. No network, no model.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const require = createRequire(import.meta.url);
const png = require('./png.cjs');

const { runClassic, settingsFor, CLASSIC_WORKING_EDGE } = await import('../lib/lineart/xdog.ts');
const { runColouring, COLOURING_DEFAULTS } = await import('../lib/lineart/colouring.ts');
const { runInked, INKED_DEFAULTS } = await import('../lib/lineart/inked.ts');
const { runLogo, LOGO_DEFAULTS } = await import('../lib/lab/logo.ts');

const folder = process.argv[2];
if (!folder) {
  console.error('usage: npm run lab:bench <folder>');
  process.exit(2);
}

const OUT = process.env.LAB_BENCH_OUT ?? 'out/lab-bench';
mkdirSync(OUT, { recursive: true });

/* A five-by-seven bitmap alphabet, so a sheet needs no font to be readable. */
const GLYPHS = {
  a: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  b: ['11110', '10001', '11110', '10001', '10001', '10001', '11110'],
  c: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  d: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  e: ['11111', '10000', '11110', '10000', '10000', '10000', '11111'],
  f: ['11111', '10000', '11110', '10000', '10000', '10000', '10000'],
  g: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  h: ['10001', '10001', '11111', '10001', '10001', '10001', '10001'],
  i: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  k: ['10001', '10010', '11100', '10010', '10001', '10001', '10001'],
  l: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  m: ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
  n: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  o: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  p: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  r: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  s: ['01111', '10000', '01110', '00001', '00001', '10001', '01110'],
  t: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  u: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  v: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  w: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function drawLabel(data, width, text, x0, y0) {
  let x = x0;
  for (const letter of text.toLowerCase()) {
    const glyph = GLYPHS[letter] ?? GLYPHS[' '];
    for (let row = 0; row < glyph.length; row++) {
      for (let column = 0; column < glyph[row].length; column++) {
        if (glyph[row][column] !== '1') continue;
        const at = ((y0 + row) * width + x + column) * 4;
        if (at < 0 || at + 3 >= data.length) continue;
        data[at] = data[at + 1] = data[at + 2] = 40;
      }
    }
    x += 6;
  }
}

/** The long edge each tile is drawn at, so a sheet is readable on GitHub. */
const TILE = Number(process.env.LAB_BENCH_TILE ?? 320);

const pictures = readdirSync(folder)
  .filter((name) => /\.png$/i.test(name))
  .sort();

if (!pictures.length) {
  console.log(`No PNG pictures in ${folder}.`);
  console.log('Drop some in and run this again; the engine was tuned on synthetic cards.');
  process.exit(0);
}

const rows = [];
for (const name of pictures) {
  const source = png.readPng(join(folder, name));
  const tiles = [{ label: 'Original', gray: null, bitmap: source }];

  for (const look of ['ink-pen', 'fine', 'bold', 'sketch']) {
    const started = Date.now();
    const gray = runClassic(source, settingsFor(look));
    tiles.push({ label: look, gray });
    rows.push({ picture: name, look, ...measure(gray), millis: Date.now() - started });
  }
  {
    const started = Date.now();
    const mask = runClassic(source, settingsFor('ink-pen'));
    const gray = runInked(mask, INKED_DEFAULTS);
    tiles.push({ label: 'hand-inked', gray });
    rows.push({ picture: name, look: 'hand-inked', ...measure(gray), millis: Date.now() - started });
  }
  {
    const started = Date.now();
    const gray = runColouring(source, COLOURING_DEFAULTS);
    tiles.push({ label: 'colouring', gray });
    rows.push({ picture: name, look: 'colouring', ...measure(gray), millis: Date.now() - started });
  }
  {
    const started = Date.now();
    const logo = runLogo(source, LOGO_DEFAULTS);
    tiles.push({ label: 'logo', gray: null, bitmap: rasterise(logo) });
    rows.push({
      picture: name,
      look: 'logo',
      ink: 0,
      midtone: 0,
      curves: logo.verdict.curves,
      millis: Date.now() - started,
    });
  }

  const sheet = contactSheet(tiles);
  const file = join(OUT, `${basename(name, extname(name))}.png`);
  png.writeOpaquePng(file, sheet);
  console.log(`${name} -> ${file}`);
}

console.log('');
console.log('picture'.padEnd(22), 'look'.padEnd(12), 'ink%'.padStart(7), 'mid%'.padStart(7), 'count'.padStart(7), 'ms'.padStart(7));
for (const row of rows) {
  console.log(
    row.picture.slice(0, 21).padEnd(22),
    row.look.padEnd(12),
    (row.ink * 100).toFixed(2).padStart(7),
    (row.midtone * 100).toFixed(2).padStart(7),
    String(row.curves ?? '').padStart(7),
    String(row.millis).padStart(7),
  );
}

function measure(gray) {
  let ink = 0;
  let midtone = 0;
  for (const value of gray.data) {
    if (value < 128) ink += 1;
    else if (value < 250) midtone += 1;
  }
  return { ink: ink / gray.data.length, midtone: midtone / gray.data.length };
}

/** The logo's curves, filled even-odd, so the sheet shows what the SVG would. */
function rasterise(logo) {
  const { width, height } = logo;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  for (const shape of logo.shapes) {
    const rgb = [1, 3, 5].map((at) => parseInt(shape.fill.slice(at, at + 2), 16));
    const polys = shape.curves.map((ring) => {
      const points = [];
      for (const [p0, p1, p2, p3] of ring) {
        for (let i = 0; i < 10; i++) {
          const t = i / 10;
          const m = 1 - t;
          points.push({
            x: m ** 3 * p0.x + 3 * m * m * t * p1.x + 3 * m * t * t * p2.x + t ** 3 * p3.x,
            y: m ** 3 * p0.y + 3 * m * m * t * p1.y + 3 * m * t * t * p2.y + t ** 3 * p3.y,
          });
        }
      }
      return points;
    });
    for (let y = 0; y < height; y++) {
      const crossings = [];
      for (const poly of polys) {
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i];
          const b = poly[(i + 1) % poly.length];
          if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
            crossings.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
          }
        }
      }
      crossings.sort((p, q) => p - q);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        for (let x = Math.ceil(crossings[i]); x < crossings[i + 1]; x++) {
          if (x < 0 || x >= width) continue;
          const at = (y * width + x) * 4;
          data[at] = rgb[0];
          data[at + 1] = rgb[1];
          data[at + 2] = rgb[2];
        }
      }
    }
  }
  return { width, height, data };
}

/** Everything side by side, each tile labelled, scaled to a readable size. */
function contactSheet(tiles) {
  const scaled = tiles.map((tile) => {
    const source = tile.bitmap ?? toBitmap(tile.gray);
    const by = Math.min(1, TILE / Math.max(source.width, source.height));
    return { label: tile.label, ...resize(source, Math.round(source.width * by), Math.round(source.height * by)) };
  });
  const LABEL = 16;
  const PAD = 6;
  const height = Math.max(...scaled.map((t) => t.height)) + LABEL + PAD * 2;
  const width = scaled.reduce((sum, t) => sum + t.width + PAD, PAD);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 244;
    data[i * 4 + 3] = 255;
  }
  let x0 = PAD;
  for (const tile of scaled) {
    for (let y = 0; y < tile.height; y++) {
      for (let x = 0; x < tile.width; x++) {
        const from = (y * tile.width + x) * 4;
        const to = ((y + PAD) * width + x0 + x) * 4;
        data[to] = tile.data[from];
        data[to + 1] = tile.data[from + 1];
        data[to + 2] = tile.data[from + 2];
        data[to + 3] = 255;
      }
    }
    drawLabel(data, width, tile.label, x0, tile.height + PAD + 4);
    x0 += tile.width + PAD;
  }
  return { width, height, data };
}

function toBitmap(gray) {
  const data = new Uint8ClampedArray(gray.width * gray.height * 4);
  for (let i = 0; i < gray.data.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = gray.data[i];
    data[i * 4 + 3] = 255;
  }
  return { width: gray.width, height: gray.height, data };
}

function resize(source, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  const sx = source.width / width;
  const sy = source.height / height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const y0 = Math.floor(y * sy);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1 && yy < source.height; yy++) {
        for (let xx = x0; xx < x1 && xx < source.width; xx++) {
          const at = (yy * source.width + xx) * 4;
          r += source.data[at];
          g += source.data[at + 1];
          b += source.data[at + 2];
          n += 1;
        }
      }
      const to = (y * width + x) * 4;
      data[to] = r / (n || 1);
      data[to + 1] = g / (n || 1);
      data[to + 2] = b / (n || 1);
      data[to + 3] = 255;
    }
  }
  return { width, height, data };
}

