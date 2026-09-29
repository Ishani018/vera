/**
 * Golden-file checks for the designer *screen*.
 *
 *   npm run golden:screen           compare against the recorded goldens
 *   npm run golden:screen:update    re-record them (only when a change is intended)
 *
 * The PDF goldens next door prove that the file sent to KDP is right. They
 * cannot prove that what someone sees while making it is right, and two of the
 * worst bugs in this repo so far lived exactly in that gap:
 *
 * - every line of type on the cover was drawn at a seventy-second of its size
 *   — present in the DOM, selectable, and invisible — while the PDF stayed
 *   perfect, because the PDF never asked the screen anything;
 * - an Instagram post offered a 3375-pixel export, then wrote a 10547-pixel
 *   file, and the only place either number was ever shown was the screen.
 *
 * So this walks the designer as a person would, and records two tiers:
 *
 * - The **layout tier**, which is measurements rather than pixels: where each
 *   text box and picture sits on the board and how big it is, in points, with
 *   type sizes converted back out of pixels. It is compared everywhere. It
 *   holds only quantities the stored design decides — a text box's left, top
 *   and width, never its height, because height is decided by whichever
 *   typeface the machine managed to load.
 *
 * - The **image tier**, which is the board rasterised and compared pixel by
 *   pixel. It is compared only against the engine that recorded it, for the
 *   same reason the PDF strict tier is: two Chrome builds do not put the same
 *   ink in the same place, and pretending otherwise is how the last portable
 *   tier failed on the first machine that was genuinely different.
 *
 * Google Fonts is blocked for the whole run, on purpose. Whether the network
 * was up is not a fact about this code, and a golden that changes when it goes
 * down is a golden nobody trusts. Which faces a book embeds is already checked,
 * in the PDF goldens, where it belongs.
 */

import { spawn } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tests', 'golden');
const BASE = process.env.GOLDEN_BASE_URL || 'http://127.0.0.1:3000';
const UPDATE = process.argv.includes('--update');

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const { migrateProject } = await import(join(ROOT, 'lib', 'projects.ts'));
const { coverLayout } = await import(join(ROOT, 'lib', 'render', 'coverLayout.ts'));
const { boardFor, presetById } = await import(join(ROOT, 'lib', 'presets.ts'));
const { sheetCount } = await import(join(ROOT, 'lib', 'render', 'coloringLayout.ts'));

const round = (n) => Number(n.toFixed(4));

/**
 * The window the screen is measured in. Everything recorded is in points.
 *
 * Tall enough for the biggest board to be on screen all at once. An element
 * screenshot photographs what is painted, and a board taller than the window
 * is clipped by the pane it scrolls in — so at 900 the bottom quarter of an
 * Instagram post was not in the picture, and a change down there would have
 * gone unnoticed. The designer scales a board to the width it has, never the
 * height, so a taller window changes what can be seen and nothing else.
 */
const VIEWPORT = { width: 1440, height: 1280 };
/**
 * Below this, a difference is anti-aliasing: the same shape with its edge
 * pixels blended slightly differently. Above it, something moved or changed
 * colour. Both counts are always printed, so the assumption stays visible.
 */
const SOFT_DELTA = 8;
/** How much of the image may differ softly before that stops being edges. */
const SOFT_SHARE = 0.005;

/* ----------------------------------------------------------------- a browser */

/**
 * Chromium, wherever this is running.
 *
 * The sandbox has one at a fixed path; a Mac has Chrome in /Applications. Set
 * GOLDEN_BROWSER to override. This never downloads one: an unexpected browser
 * is exactly what the image tier is keyed on, so acquiring one silently would
 * defeat the check.
 */
function findBrowser() {
  const candidates = [
    process.env.GOLDEN_BROWSER,
    '/opt/pw-browsers/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      'No browser found. Set GOLDEN_BROWSER to a Chrome or Chromium binary.\n' +
        `  looked in: ${candidates.join(', ')}`,
    );
  }
  return found;
}

/* ------------------------------------------------------------- the server */

async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await reachable(BASE)) {
    console.log(`using the server already listening at ${BASE} (warm)`);
    return null;
  }
  if (process.env.GOLDEN_BASE_URL) throw new Error(`Nothing is listening at ${BASE}.`);
  process.stdout.write('starting a dev server… ');
  // Its own process group: `npm run dev` spawns `next dev` as a grandchild, and
  // killing the child alone leaves the server running.
  const child = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await reachable(BASE)) {
      process.stdout.write('up\n');
      return child;
    }
  }
  stop(child);
  throw new Error('the dev server did not come up within a minute');
}

function stop(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

/* -------------------------------------------------------------- a picture */

/**
 * A small PNG, made here.
 *
 * The cover fixture's own images are placeholders that no browser will decode
 * — which the PDF goldens never noticed, because a PDF embeds an image without
 * looking inside it. A screen check has to draw them, so it brings its own:
 * four quadrants and a diagonal, which makes a rotation, a flip or a stretch
 * visible at a glance in the recorded image.
 */
function png(size, [r0, g0, b0]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(body));
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // no filter, so the bytes stay readable
    for (let x = 0; x < size; x += 1) {
      const at = row + 1 + x * 4;
      const half = size / 2;
      const quadrant = (x < half ? 0 : 1) + (y < half ? 0 : 2);
      const onDiagonal = Math.abs(x - y) < size / 12;
      raw[at] = onDiagonal ? 20 : (r0 + quadrant * 40) % 256;
      raw[at + 1] = onDiagonal ? 20 : (g0 + quadrant * 30) % 256;
      raw[at + 2] = onDiagonal ? 20 : (b0 + quadrant * 55) % 256;
      raw[at + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------ the fixtures */

const fixture = JSON.parse(readFileSync(join(DIR, 'cover.fixture.json'), 'utf8'));
const project = migrateProject(structuredClone(fixture.project));

/**
 * A launch-kit board built out of the cover's own parts.
 *
 * Made here rather than stored as a second fixture so that it cannot drift
 * from the cover it borrows from, and so the picture bytes are not written
 * into the repository twice. Everything about it is fixed — its id, its
 * dates, its coordinates — because a golden may not depend on the clock.
 */
function boardDesign() {
  const title = structuredClone(project.cover.textBoxes[0]);
  const curved = structuredClone(project.cover.textBoxes[1] ?? project.cover.textBoxes[0]);
  const sticker = structuredClone(project.cover.stickers[0]);
  const board = boardFor(presetById('instagram-post'));
  Object.assign(title, { id: 'gb-title', panel: 'board', x: 90, y: 110, width: 630, curve: 0 });
  Object.assign(curved, { id: 'gb-arch', panel: 'board', x: 105, y: 520, width: 600, curve: 24 });
  Object.assign(sticker, {
    id: 'gb-picture',
    x: board.width / 2 - 120,
    y: 240,
    width: 240,
    height: 180,
    rotate: 0,
    arc: 0,
  });
  return {
    id: 'dsn-golden',
    name: 'Golden post',
    presetId: 'instagram-post',
    createdAt: 0,
    cover: {
      backgroundColor: '#f2ece0',
      backColor: '#f2ece0',
      spineColor: '#f2ece0',
      frontImage: null,
      imageSpansWrap: false,
      showBarcodeZone: false,
      textBoxes: [title, curved],
      stickers: [sticker],
    },
  };
}

const seeded = { ...project, designs: [boardDesign()] };
/**
 * How thick the designer thinks this book is.
 *
 * Not the fixture's `pageCount`, which is what the PDF goldens hand the export
 * route. The screen has no such number: it works the page count out of the
 * book in front of it, and that decides the spine, and the spine decides how
 * wide the whole board is. Asking the wrong one made every measurement here
 * six tenths of a percent out, which is exactly the size of mistake a golden
 * exists to catch — so the aspect is checked against the board below.
 */
const pages = sheetCount(seeded);

/** One picture per asset the fixture refers to, in place of its placeholders. */
const PICTURES = Object.fromEntries(
  Object.keys(fixture.assets)
    .filter((id) => !id.includes(':'))
    .map((id, index) => [
      id,
      `data:image/png;base64,${png(64, [90 + index * 50, 130 - index * 30, 170 + index * 20]).toString('base64')}`,
    ]),
);
const coverBoard = coverLayout(seeded, pages);
const kitBoard = boardFor(presetById('instagram-post'));

const CASES = [
  {
    name: 'cover',
    what: 'the KDP wrap cover, in the designer',
    url: `${BASE}/coloring?open=cover`,
    board: { width: round(coverBoard.width), height: round(coverBoard.height) },
    pages,
  },
  {
    name: 'board',
    what: 'an Instagram post, in the launch kit',
    url: `${BASE}/coloring?open=kit&design=dsn-golden`,
    board: { width: round(kitBoard.width), height: round(kitBoard.height) },
  },
];

/* --------------------------------------------------------- driving the page */

/** Put the fixture where the app looks for it, as the app stores it. */
async function seedBrowser(page) {
  // Seeding before the app has opened its own database would make an empty
  // one of our own and leave Dexie upgrading around it.
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('Your designs'), {
    timeout: 30000,
  });
  // Listing what is saved is what makes Dexie open the database. Waiting for
  // the stores themselves rather than for a moment to pass: opening one that
  // does not exist yet would create an empty database of the wrong version and
  // leave the app upgrading around it.
  await page.waitForFunction(
    () =>
      indexedDB
        .databases()
        .then((found) => {
          if (!found.some((d) => d.name === 'versecraft')) return false;
          return new Promise((res) => {
            const r = indexedDB.open('versecraft');
            r.onsuccess = () => {
              const names = [...r.result.objectStoreNames];
              r.result.close();
              res(names.includes('projects') && names.includes('assets'));
            };
            r.onerror = () => res(false);
          });
        }),
    { timeout: 30000, polling: 500 },
  );
  const report = await page.evaluate(
    async (record, assets, key) => {
      const open = () =>
        new Promise((res, rej) => {
          const r = indexedDB.open('versecraft');
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
      const put = (db, store, value) =>
        new Promise((res, rej) => {
          const tx = db.transaction(store, 'readwrite');
          tx.objectStore(store).put(value);
          tx.oncomplete = res;
          tx.onerror = () => rej(tx.error);
        });
      const db = await open();
      await put(db, 'projects', record);
      let count = 0;
      for (const [id, dataUrl] of Object.entries(assets)) {
        const blob = await (await fetch(dataUrl)).blob();
        const bitmap = await createImageBitmap(blob);
        await put(db, 'assets', {
          id,
          name: id,
          mime: blob.type,
          blob,
          width: bitmap.width,
          height: bitmap.height,
          bytes: blob.size,
          createdAt: 0,
        });
        count += 1;
      }
      window.localStorage.setItem(key, record.id);
      return count;
    },
    seeded,
    PICTURES,
    'versecraft:activeProjectId',
  );
  return report;
}

/**
 * Everything drawn on the board, in points.
 *
 * Read out of the live DOM rather than out of the model, because the model is
 * what was already believed. The number that mattered in the 1/72 bug was the
 * one the browser ended up using.
 */
const MEASURE = (boardWidthPt) => {
  const stage = document.querySelector('[data-cover-stage]');
  if (!stage) return { error: 'no stage' };
  // The scale the designer itself used, read off the width it set, rather
  // than the width the browser rounded that to. A scale taken from the
  // rendered box is a fraction of a percent out, and every size recorded here
  // would inherit it.
  const scale = parseFloat(stage.style.width) / boardWidthPt;
  const stageRect = stage.getBoundingClientRect();
  const pt = (px, places = 1) => Number((px / scale).toFixed(places));

  /**
   * A colour as four bytes, whatever the engine chose to call it.
   *
   * Chrome hands back `oklab(0.696 -0.162 0.051 / 0.7)` for a guide drawn with
   * an opacity modifier, and how a build spells that — the colour space it
   * settles on, how many digits it keeps — is the build's business, not this
   * design's. Painting it and reading the pixel back gives the same four
   * numbers on any engine that agrees about the colour, which is the thing
   * actually worth comparing. That mistake has been made here before: a
   * portable tier holding something only one engine says.
   */
  const paint = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const colour = (value) => {
    if (!value || value === 'none') return value;
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = value;
    paint.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data;
    return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Number((a / 255).toFixed(3))})`;
  };

  /**
   * A transform as the angle it turns things through.
   *
   * The matrix is printed to six digits, and the last of them is an engine's
   * rounding rather than a fact about the cover. Everything the designer
   * applies is a rotation about a corner, so the angle is the whole of it; a
   * matrix that is not one is kept as it came, to be noticed.
   */
  const turn = (value) => {
    if (!value || value === 'none') return 'none';
    const parts = value.match(/^matrix\(([^)]+)\)$/);
    if (!parts) return value;
    const [a, b, c, d] = parts[1].split(',').map(Number);
    const angle = (Math.atan2(b, a) * 180) / Math.PI;
    const scaleX = Math.hypot(a, b);
    const scaleY = Math.hypot(c, d);
    if (Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001) return value;
    return `${Number(angle.toFixed(2))}deg`;
  };
  /**
   * Where the box is, from the used values of left/top/width/height.
   *
   * Not `getBoundingClientRect`, which is the outline of the thing after it
   * has been rotated: the spine's text would then be recorded as a tall thin
   * shape whose measurements depend on how long the words are in whichever
   * face loaded. These are the numbers the designer handed the browser.
   */
  const box = (el) => {
    const s = getComputedStyle(el);
    return {
      x: pt(parseFloat(s.left)),
      y: pt(parseFloat(s.top)),
      width: pt(parseFloat(s.width)),
      // Recorded only where the designer set it. A text box is as tall as its
      // words, which is as tall as whichever typeface the machine loaded, and
      // a number like that belongs in nobody's golden.
      height: el.style.height ? pt(parseFloat(s.height)) : 'the type decides',
    };
  };
  const typeOf = (el) => {
    const s = getComputedStyle(el);
    return {
      sizePt: Number((parseFloat(s.fontSize) / scale).toFixed(2)),
      weight: s.fontWeight,
      italic: s.fontStyle !== 'normal',
      color: colour(s.color),
      align: s.textAlign,
      letterSpacingPt:
        s.letterSpacing === 'normal' ? 0 : Number((parseFloat(s.letterSpacing) / scale).toFixed(3)),
      lineHeight:
        s.lineHeight === 'normal'
          ? 'normal'
          : Number((parseFloat(s.lineHeight) / parseFloat(s.fontSize)).toFixed(3)),
      transform: turn(s.transform),
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
    };
  };

  const items = [];
  for (const el of stage.querySelectorAll('*')) {
    const style = getComputedStyle(el);
    if (style.position !== 'absolute') continue;
    // The insides of a picture or a text box — its image, its handles — are
    // the box's own business, and are reported through it.
    if (el.parentElement?.closest('[role="button"]')) continue;

    if (el.getAttribute('role') === 'button') {
      const image = el.querySelector('img, canvas');
      if (image) {
        const bent = image.tagName === 'CANVAS';
        items.push({
          kind: bent ? 'bent picture' : 'picture',
          ...box(el),
          transform: turn(style.transform),
          radius: style.borderRadius === '0px' ? 0 : pt(parseFloat(style.borderRadius), 2),
          drawn: bent ? image.width > 0 : image.complete && image.naturalWidth > 0,
          source: bent ? `${image.width}x${image.height} canvas` : `${image.naturalWidth}x${image.naturalHeight}`,
        });
      } else {
        items.push({ kind: el.tagName === 'svg' ? 'curved text' : 'text', ...box(el), ...typeOf(el) });
      }
      continue;
    }
    if (el.tagName === 'IMG') {
      items.push({
        kind: 'board picture',
        ...box(el),
        fit: style.objectFit,
        drawn: el.complete && el.naturalWidth > 0,
        source: `${el.naturalWidth}x${el.naturalHeight}`,
      });
      continue;
    }
    // Everything else painted on the board: the two panel colours a wrap
    // cover has, and the barcode area KDP reserves.
    items.push({
      kind: 'painted area',
      ...box(el),
      background: colour(style.backgroundColor),
      // Reported only when there is one: Tailwind's reset leaves every element
      // with a border style and no width, which would put a border on
      // everything here. In pixels rather than points, because a guide is a
      // hairline on a screen however far the board is zoomed — measured in
      // points it changes every time the view does and says nothing.
      border:
        parseFloat(style.borderTopWidth) > 0
          ? `${Number(parseFloat(style.borderTopWidth).toFixed(2))}px ${style.borderStyle} ${colour(style.borderColor)}`
          : 'none',
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
    });
  }

  // Whatever the interface claims the output will be. The 3375-pixel export
  // was only ever visible as a number on a screen like this one — so every
  // number the panel states about the size of things is recorded: each value
  // in its measurements list, and any text anywhere that reads as A × B.
  const readouts = [];
  const say = (text) => {
    const t = (text || '').trim().replace(/\s+/g, ' ');
    if (t && t.length < 48 && !readouts.includes(t)) readouts.push(t);
  };
  for (const el of document.querySelectorAll('dd')) say(el.textContent);
  for (const el of document.body.querySelectorAll('*')) {
    if (el.children.length || /^(SCRIPT|STYLE|NOSCRIPT|TITLE)$/.test(el.tagName)) continue;
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
    if (/\d[^A-Za-z]{0,4}[×x][^A-Za-z]{0,4}\d/.test(t)) say(t);
  }

  return {
    stage: {
      widthPx: Number(stageRect.width.toFixed(1)),
      heightPx: Number(stageRect.height.toFixed(1)),
      // The board's own shape, which the stage has to keep whatever the window.
      aspect: Number((stageRect.width / stageRect.height).toFixed(4)),
    },
    items,
    readouts: readouts.sort(),
  };
};

/**
 * What the download menu says it will make.
 *
 * Opened, read and closed. The sizes moved into a menu, and this is the check
 * that caught an Instagram post offering 3375 pixels and writing 10547: a
 * number nobody can see is a number nobody can check.
 */
async function exportChoices(page) {
  const button = await page.$('[aria-haspopup="menu"]');
  if (!button) return [];
  await button.click();
  await new Promise((r) => setTimeout(r, 300));
  const labels = await page
    .$$eval('[role="menu"] [role="menuitem"]', (nodes) =>
      nodes.map((node) => node.textContent.trim()),
    )
    .catch(() => []);
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 300));
  return labels.map((label) => `download: ${label}`);
}

async function settle(page) {
  // Pictures first: a sticker measured before its bytes arrive has no size.
  await page.waitForFunction(
    () => {
      const stage = document.querySelector('[data-cover-stage]');
      if (!stage) return false;
      return [...stage.querySelectorAll('img')].every((i) => i.complete && i.naturalWidth > 0);
    },
    { timeout: 30000 },
  );
  // Then the warp, which draws into a canvas a frame or two later, and any
  // transition the stage itself is running.
  await new Promise((r) => setTimeout(r, 1500));
}

/* ------------------------------------------------------- comparing pictures */

/**
 * Two PNGs, compared in the browser that made them.
 *
 * Decoding a PNG in Node would mean a dependency; there is a decoder already
 * running one process away. It reports both kinds of difference separately:
 * edge pixels blended a shade differently, and pixels that actually changed.
 */
const DIFF = async (aUrl, bUrl, softDelta) => {
  const load = (url) =>
    new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('could not decode'));
      img.src = url;
    });
  const [a, b] = await Promise.all([load(aUrl), load(bUrl)]);
  if (a.width !== b.width || a.height !== b.height) {
    return { size: `${a.width}x${a.height} vs ${b.width}x${b.height}` };
  }
  const draw = (img) => {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
    return c.getContext('2d').getImageData(0, 0, img.width, img.height).data;
  };
  const one = draw(a);
  const two = draw(b);
  let soft = 0;
  let hard = 0;
  let worst = 0;
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let i = 0; i < one.length; i += 4) {
    const d = Math.max(
      Math.abs(one[i] - two[i]),
      Math.abs(one[i + 1] - two[i + 1]),
      Math.abs(one[i + 2] - two[i + 2]),
      Math.abs(one[i + 3] - two[i + 3]),
    );
    if (!d) continue;
    worst = Math.max(worst, d);
    if (d <= softDelta) {
      soft += 1;
      continue;
    }
    hard += 1;
    const p = i / 4;
    const x = p % a.width;
    const y = (p - x) / a.width;
    box.x0 = Math.min(box.x0, x);
    box.y0 = Math.min(box.y0, y);
    box.x1 = Math.max(box.x1, x);
    box.y1 = Math.max(box.y1, y);
  }
  return {
    width: a.width,
    height: a.height,
    pixels: a.width * a.height,
    soft,
    hard,
    worst,
    where: hard ? `${box.x0},${box.y0} to ${box.x1},${box.y1}` : null,
  };
};

/* ------------------------------------------------------------------- output */

function compare(name, tier, got, want) {
  const problems = [];
  for (const key of Object.keys(want)) {
    if (JSON.stringify(got[key]) === JSON.stringify(want[key])) continue;
    // A list of things on a board is compared one thing at a time, and one
    // field at a time within it. Printing both lists whole says nothing
    // except that they differ.
    if (Array.isArray(want[key]) && Array.isArray(got[key])) {
      const length = Math.max(want[key].length, got[key].length);
      for (let i = 0; i < length; i += 1) {
        const a = want[key][i];
        const b = got[key][i];
        if (JSON.stringify(a) === JSON.stringify(b)) continue;
        if (!a) problems.push(`    ${key}[${i}] appeared: ${JSON.stringify(b)}`);
        else if (!b) problems.push(`    ${key}[${i}] went: ${JSON.stringify(a)}`);
        else if (typeof a !== 'object' || typeof b !== 'object') {
          problems.push(`    ${key}[${i}]: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
        } else {
          const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])]
            .filter((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]))
            .map((f) => `${f}: ${JSON.stringify(a[f])} → ${JSON.stringify(b[f])}`);
          problems.push(`    ${key}[${i}] (${a.kind ?? 'item'}): ${fields.join(', ')}`);
        }
      }
      continue;
    }
    problems.push(`    ${key}\n      was: ${JSON.stringify(want[key])}\n      now: ${JSON.stringify(got[key])}`);
  }
  if (!problems.length) return true;
  console.log(`\n✗ ${name} — ${tier} tier changed:\n${problems.join('\n')}`);
  return false;
}

const sameEngine = (a, b) =>
  Boolean(a && b) && a.engine === b.engine && a.platform === b.platform;

/* --------------------------------------------------------------------- run */

let server = null;
let browser = null;
let failures = 0;
let recorded = 0;
try {
  server = await ensureServer();
  const executablePath = findBrowser();
  browser = await puppeteer.launch({ executablePath, args: ['--no-sandbox', '--font-render-hinting=none'] });
  const version = await browser.version();
  const engine = { engine: version, platform: process.platform };
  console.log(`driving ${version} (${process.platform}) from ${executablePath}`);

  for (const kase of CASES) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      // Blocked on purpose: which faces the machine could reach is not a fact
      // about this code. See the note at the top.
      if (/fonts\.(googleapis|gstatic)\.com/.test(req.url())) return void req.abort();
      req.continue();
    });

    const assets = await seedBrowser(page);
    await page.goto(kase.url, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-cover-stage]', { timeout: 30000 });
    await settle(page);

    const choices = await exportChoices(page);
    const layout = await page.evaluate(MEASURE, kase.board.width);
    layout.readouts = [...layout.readouts, ...choices].sort();
    // The board this was measured against has to be the board on screen. If
    // the two disagree, every point in the record is scaled by the difference
    // and the whole thing is quietly wrong rather than loudly.
    const shape = round(kase.board.width / kase.board.height);
    if (Math.abs(layout.stage.aspect - shape) > 0.002) {
      throw new Error(
        `${kase.name}: the stage is ${layout.stage.aspect} wide to tall, but the board ` +
          `this run measured against is ${shape}. They have to be the same board.`,
      );
    }
    const stage = await page.$('[data-cover-stage]');
    const shot = Buffer.from(await stage.screenshot({ type: 'png' }));
    await context.close();

    const jsonPath = join(DIR, `screen-${kase.name}.json`);
    const pngPath = join(DIR, `screen-${kase.name}.png`);
    const got = {
      what: kase.what,
      board: { width: kase.board.width, height: kase.board.height },
      viewport: VIEWPORT,
      // What the screen worked the book's thickness out to be, which is what
      // decides the spine and so the width of the whole board.
      pages: kase.pages ?? null,
      assets,
      layout,
      recordedWith: engine,
    };

    if (UPDATE || !existsSync(jsonPath)) {
      writeFileSync(jsonPath, JSON.stringify(got, null, 2) + '\n');
      writeFileSync(pngPath, shot);
      recorded += 1;
      console.log(
        `recorded ${kase.name}: ${layout.items.length} things on a ` +
          `${kase.board.width}x${kase.board.height}pt board, image ${shot.length} bytes ` +
          `(tied to ${version} on ${process.platform})`,
      );
      continue;
    }

    const actualPath = join(DIR, `screen-${kase.name}.actual.png`);
    if (existsSync(actualPath)) rmSync(actualPath);
    const want = JSON.parse(readFileSync(jsonPath, 'utf8'));
    let ok = compare(kase.name, 'layout', got.layout, want.layout);
    ok = compare(kase.name, 'board', got.board, want.board) && ok;

    let imageNote;
    if (!sameEngine(engine, want.recordedWith)) {
      imageNote =
        `skipped — recorded on ${want.recordedWith?.engine ?? '?'} ` +
        `(${want.recordedWith?.platform ?? '?'}), running ${version} (${process.platform}). ` +
        `Anti-aliasing and glyph rasterisation are the engine's, not the design's.`;
    } else {
      const compareContext = await browser.createBrowserContext();
      const comparePage = await compareContext.newPage();
      const diff = await comparePage.evaluate(
        DIFF,
        `data:image/png;base64,${readFileSync(pngPath).toString('base64')}`,
        `data:image/png;base64,${shot.toString('base64')}`,
        SOFT_DELTA,
      );
      await compareContext.close();
      if (diff.size) {
        ok = false;
        imageNote = `the board is a different size: ${diff.size}`;
      } else {
        const budget = Math.round(diff.pixels * SOFT_SHARE);
        const bad = diff.hard > 0 || diff.soft > budget;
        if (bad) ok = false;
        imageNote =
          `${diff.width}x${diff.height}, ${diff.hard} pixel(s) changed, ` +
          `${diff.soft} edge pixel(s) shaded differently (worst ${diff.worst}/255, ` +
          `allowance ${budget})${diff.where ? `, first change around ${diff.where}` : ''}`;
        if (bad) {
          // What this run actually drew, kept beside the golden. A count of
          // changed pixels says something moved; only the picture says what.
          writeFileSync(actualPath, shot);
          imageNote += `\n    what this run drew: ${actualPath}`;
        }
      }
    }

    if (!ok) failures += 1;
    console.log(
      `${ok ? '✓' : '✗'} ${kase.name}: ${layout.items.length} things on the board, ` +
        `stage ${layout.stage.widthPx}x${layout.stage.heightPx}px, ` +
        `readouts ${JSON.stringify(layout.readouts)}\n    image tier: ${imageNote}`,
    );
  }

  if (failures) console.log(`\n${failures} screen golden(s) changed`);
  else if (recorded === CASES.length) console.log(`\nrecorded ${recorded} screen golden(s)`);
  else console.log(`\nall screen goldens match${recorded ? ` (${recorded} newly recorded)` : ''}`);
} finally {
  await browser?.close();
  stop(server);
}

process.exit(failures ? 1 : 0);
