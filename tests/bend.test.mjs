import assert from 'node:assert/strict';
import test from 'node:test';

import { bendOf, warp, warpSize } from '../lib/cover/bend.ts';
import { MAX_SWEEP_DEGREES } from '../lib/cover/curve.ts';
import { stickerBounds, stickerDpi, stickerImageKey, stickerRect } from '../lib/render/stickers.ts';
import { buildCoverHtml } from '../lib/render/coverHtml.ts';
import { createColoringBook } from '../lib/projects.ts';

/** The cover stores points now; these tests still think in inches. */
const IN = (inches) => inches * 72;

const sticker = (over = {}) => ({
  id: 's1',
  assetId: 'a1',
  naturalWidth: 1200,
  naturalHeight: 1200,
  x: IN(9),
  y: IN(3),
  width: IN(4),
  height: IN(2),
  rotate: 0,
  cornerRadius: 0,
  border: null,
  shadow: false,
  arc: 0,
  name: 'Cat',
  ...over,
});

test('a picture nobody has bent is left entirely alone', () => {
  assert.equal(bendOf(sticker()), null);
  assert.equal(bendOf(sticker({ arc: 0 })), null);
  assert.deepEqual(stickerRect(sticker()), { x: IN(9), y: IN(3), width: IN(4), height: IN(2) });
  assert.equal(stickerDpi(sticker()), 300);
});

test('bending keeps the middle line the length it was', () => {
  for (const arc of [5, 20, -20, 40]) {
    const bend = bendOf(sticker({ arc }));
    const middle = (bend.rIn + bend.rOut) / 2;
    assert.ok(Math.abs(middle * bend.sweep - IN(4)) < 1e-7, `arc ${arc}`);
  }
});

test('and keeps the picture as thick from top to bottom as it was', () => {
  for (const arc of [5, 20, -20, 40]) {
    const bend = bendOf(sticker({ arc }));
    assert.ok(Math.abs(bend.rOut - bend.rIn - IN(2)) < 1e-7, `arc ${arc}`);
  }
});

test('a tall picture stops before its inner edge folds through the middle', () => {
  // A square asked to bend right round would have to turn itself inside out.
  const bend = bendOf(sticker({ arc: 100, width: IN(3), height: IN(3) }));
  assert.ok(bend.rIn > 0, 'the inner edge crossed the centre');
  assert.ok(bend.sweep < (MAX_SWEEP_DEGREES * Math.PI) / 180);
  // A long thin one has room for the whole range.
  const strip = bendOf(sticker({ arc: 100, width: IN(8), height: IN(0.5) }));
  assert.ok(Math.abs(strip.sweep - (MAX_SWEEP_DEGREES * Math.PI) / 180) < 1e-7);
});

test('every step of the slider moves the picture, whatever shape it is', () => {
  // A fixed scale of degrees would leave most stickers with a slider that
  // stopped doing anything partway along.
  for (const shape of [{ width: IN(4), height: IN(2) }, { width: IN(3), height: IN(3) }, { width: IN(8), height: IN(0.5) }]) {
    let last = 0;
    for (const arc of [10, 25, 50, 75, 100]) {
      const { sweep } = bendOf(sticker({ ...shape, arc }));
      assert.ok(sweep > last, `${JSON.stringify(shape)} stopped moving at ${arc}`);
      last = sweep;
    }
    assert.ok(bendOf(sticker({ ...shape, arc: 100 })).rIn > 0);
  }
});

test('the two halves of the slider are mirror images', () => {
  for (const arc of [15, 45, 100]) {
    assert.equal(bendOf(sticker({ arc })).sweep, bendOf(sticker({ arc: -arc })).sweep);
    assert.equal(bendOf(sticker({ arc })).up, true);
    assert.equal(bendOf(sticker({ arc: -arc })).up, false);
  }
});

test('the bent picture stays centred on the box it was placed in', () => {
  for (const arc of [10, -10, 55, -55]) {
    const bend = bendOf(sticker({ arc }));
    assert.ok(Math.abs(bend.box.x + bend.box.width / 2 - IN(4) / 2) < 1e-7, `arc ${arc} drifted across`);
    assert.ok(Math.abs(bend.box.y + bend.box.height / 2 - IN(2) / 2) < 1e-7, `arc ${arc} drifted down`);
  }
});

test('the box a bend covers is as wide as its outer edge reaches', () => {
  for (const arc of [10, 30, 60, 100]) {
    const bend = bendOf(sticker({ arc }));
    const half = bend.sweep / 2;
    // The outer edge is the widest part, until the bend passes a quarter turn
    // and the sides of the circle itself become the widest part.
    const reach = half >= Math.PI / 2 ? bend.rOut : bend.rOut * Math.sin(half);
    assert.ok(Math.abs(bend.box.width - 2 * reach) < 1e-7, `arc ${arc}`);
    assert.ok(bend.box.height > IN(2), `arc ${arc} did not grow taller`);
  }

  // Up and down are mirror images, so they cover the same area.
  const up = bendOf(sticker({ arc: 30 }));
  const down = bendOf(sticker({ arc: -30 }));
  assert.ok(Math.abs(up.box.width - down.box.width) < 1e-7);
  assert.ok(Math.abs(up.box.height - down.box.height) < 1e-7);
});

test('the DPI reading follows the outer edge, where the pixels are thinnest', () => {
  const s = sticker({ arc: 30 });
  const bend = bendOf(s);
  assert.ok(bend.stretch > 1);
  // The outer edge is pulled out by exactly the ratio of its radius to the
  // middle one, and that is how much softer it prints.
  assert.equal(stickerDpi(s), 300 / bend.stretch);
  assert.ok(stickerDpi(s) < 300, 'bending can only ever cost sharpness');
});

test('the warnings are about where the bent picture is, not where it was placed', () => {
  // A bend reaches past the box it was placed in, so a sticker that cleared the
  // trim flat may not clear it bent.
  const s = sticker({ arc: 45 });
  const rect = stickerRect(s);
  assert.ok(rect.width > IN(4) && rect.height > IN(2));
  assert.ok(Math.abs(rect.x + rect.width / 2 - IN(9 + 2)) < 1e-7);
  // Turning a bent picture still works off the bent shape.
  const turned = stickerBounds(sticker({ arc: 45, rotate: 90 }));
  assert.ok(Math.abs(turned.width - rect.height) < 1e-7);
  assert.ok(Math.abs(turned.height - rect.width) < 1e-7);
});

test('the warped raster is dense enough to keep every pixel of the original', () => {
  const s = sticker({ arc: 30 });
  const bend = bendOf(s);
  const size = warpSize(s, bend, 1200);
  // Across the outer edge there is at least one output pixel per source pixel.
  const outerInches = bend.rOut * bend.sweep;
  assert.ok((size.width / bend.box.width) * outerInches >= 1200);
});

test('a warp that would be enormous is held to a size a PDF can carry', () => {
  const s = sticker({ arc: 30, width: IN(12), height: IN(6) });
  const size = warpSize(s, bendOf(s), 40000, 4096);
  assert.ok(Math.max(size.width, size.height) <= 4096);
  assert.ok(size.width > 0 && size.height > 0);
});

/* ------------------------------------------------------- the pixels themselves */

// A source whose every pixel says where it is, so the warp can be checked by
// reading the result rather than by looking at it.
function ramp(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      data[at] = Math.round((x / (width - 1)) * 255);
      data[at + 1] = Math.round((y / (height - 1)) * 255);
      data[at + 2] = 128;
      data[at + 3] = 255;
    }
  }
  return { data, width, height };
}

const pixel = (img, x, y) => {
  const at = (y * img.width + x) * 4;
  return [img.data[at], img.data[at + 1], img.data[at + 2], img.data[at + 3]];
};

test('every pixel of the result gets an answer, so a warp has no holes in it', () => {
  const s = sticker({ arc: 25 });
  const bend = bendOf(s);
  const out = warp(ramp(64, 32), bend, { width: 120, height: 90 });
  // Walk the middle line of the bent picture: it is inside the shape all the
  // way across, so not one pixel of it may be missing.
  let holes = 0;
  const middle = (bend.rIn + bend.rOut) / 2;
  for (let i = 0; i <= 40; i += 1) {
    const angle = (i / 40 - 0.5) * bend.sweep * 0.98;
    const x = bend.cx + middle * Math.sin(angle);
    const y = bend.cy - middle * Math.cos(angle);
    const px = Math.floor(((x - bend.box.x) / bend.box.width) * 120);
    const py = Math.floor(((y - bend.box.y) / bend.box.height) * 90);
    if (pixel(out, px, py)[3] === 0) holes += 1;
  }
  assert.equal(holes, 0);
});

test('the picture keeps its left-to-right and top-to-bottom order once bent', () => {
  const s = sticker({ arc: 25 });
  const bend = bendOf(s);
  const out = warp(ramp(64, 32), bend, { width: 160, height: 120 });
  const along = (u, v) => {
    const radius = bend.rOut - v * (bend.rOut - bend.rIn);
    const angle = (u - 0.5) * bend.sweep * 0.96;
    const x = bend.cx + radius * Math.sin(angle);
    const y = bend.cy - radius * Math.cos(angle);
    return pixel(
      out,
      Math.floor(((x - bend.box.x) / bend.box.width) * 160),
      Math.floor(((y - bend.box.y) / bend.box.height) * 120),
    );
  };
  // Red rises left to right along the arc.
  assert.ok(along(0.1, 0.5)[0] < along(0.5, 0.5)[0]);
  assert.ok(along(0.5, 0.5)[0] < along(0.9, 0.5)[0]);
  // Green rises from the outer edge inward, which is top to bottom.
  assert.ok(along(0.5, 0.1)[1] < along(0.5, 0.9)[1]);
});

test('a hang is the mirror of an arch, not a different picture', () => {
  const up = sticker({ arc: 25 });
  const down = sticker({ arc: -25 });
  const source = ramp(64, 32);
  const size = { width: 100, height: 80 };
  const a = warp(source, bendOf(up), size);
  const b = warp(source, bendOf(down), size);
  // Flipping one top to bottom should give the other, give or take the
  // rounding of a bilinear sample.
  let worst = 0;
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      const here = pixel(a, x, y);
      const there = pixel(b, x, size.height - 1 - y);
      // Green runs the other way once flipped.
      worst = Math.max(worst, Math.abs(here[0] - there[0]), Math.abs(here[3] - there[3]));
    }
  }
  assert.ok(worst <= 8, `they differ by ${worst}`);
});

test('nothing outside the bent shape is painted', () => {
  const s = sticker({ arc: 60 });
  const bend = bendOf(s);
  const out = warp(ramp(32, 16), bend, { width: 80, height: 80 });
  // The very corners of the box are outside an arch by construction.
  for (const [x, y] of [[0, 0], [79, 0], [0, 79], [79, 79]]) {
    assert.equal(pixel(out, x, y)[3], 0, `corner ${x},${y} was painted`);
  }
});

/* ------------------------------------------------- what reaches the PDF */

const book = (stickers) => {
  const b = createColoringBook('Bend check');
  b.cover.stickers = stickers;
  return b;
};
const render = (b, assets) =>
  buildCoverHtml(b, { pageCount: 52, fontStyle: '', guides: false, assets });

test('a flat sticker still renders exactly the way it always did', () => {
  const s = sticker({ cornerRadius: 0.3, border: { widthPt: 3, color: '#111' }, shadow: true });
  const rule = render(book([s]), { a1: 'data:x' }).match(/#cs0 \{[\s\S]*?\n\}/)[0];
  assert.match(rule, /left: 648pt;/);
  assert.match(rule, /width: 288pt;/);
  assert.match(rule, /overflow: hidden;/);
  assert.match(rule, /border-radius:/);
  assert.match(rule, /border: 3pt solid/);
  assert.match(rule, /box-shadow:/);
});

test('a bent sticker is drawn over the box its arc sweeps out', () => {
  const s = sticker({ arc: 40 });
  const rect = stickerRect(s);
  const rule = render(book([s]), { 'bend:s1': 'data:x' }).match(/#cs0 \{[\s\S]*?\n\}/)[0];
  assert.match(rule, new RegExp(`left: ${rect.x}pt;`));
  assert.match(rule, new RegExp(`top: ${rect.y}pt;`));
  assert.match(rule, new RegExp(`width: ${rect.width}pt;`));
  assert.match(rule, new RegExp(`height: ${rect.height}pt;`));
});

test('a frame around a shape that is no longer a rectangle is not drawn', () => {
  const s = sticker({ arc: 40, cornerRadius: 0.3, border: { widthPt: 3, color: '#111' } });
  const rule = render(book([s]), { 'bend:s1': 'data:x' }).match(/#cs0 \{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(rule, /border-radius:/);
  assert.doesNotMatch(rule, /border: /);
  assert.doesNotMatch(rule, /overflow: hidden;/);
});

test('a bent shadow follows the curved edge rather than boxing it', () => {
  const rule = (arc) =>
    render(book([sticker({ arc, shadow: true })]), { a1: 'd', 'bend:s1': 'd' })
      .match(/#cs0 \{[\s\S]*?\n\}/)[0];
  assert.match(rule(0), /box-shadow:/);
  assert.match(rule(40), /filter: drop-shadow/);
  assert.doesNotMatch(rule(40), /box-shadow:/);
});

test('the warped picture is looked up by the sticker, not by the image it came from', () => {
  // Two stickers can bend one picture differently; one entry cannot serve both.
  const a = sticker({ id: 's1', arc: 40 });
  const b = sticker({ id: 's2', arc: -70, x: 2 });
  assert.equal(stickerImageKey(a), 'bend:s1');
  assert.equal(stickerImageKey(b), 'bend:s2');
  assert.equal(stickerImageKey(sticker()), 'a1');
  const html = render(book([a, b]), { 'bend:s1': 'data:one', 'bend:s2': 'data:two' });
  assert.match(html, /src="data:one"/);
  assert.match(html, /src="data:two"/);
});

test('a bend with no warped picture yet draws nothing rather than the unbent one', () => {
  // Showing the flat picture in the bent picture's place would be a lie about
  // what is going to print.
  const html = render(book([sticker({ arc: 40 })]), { a1: 'data:flat' });
  assert.doesNotMatch(html, /<div class="cover-sticker"/);
  assert.doesNotMatch(html, /src="data:flat"/);
  // A flat one with its picture still draws, as it always has.
  assert.match(render(book([sticker()]), { a1: 'data:flat' }), /<div class="cover-sticker"/);
});
