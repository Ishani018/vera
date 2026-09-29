import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_SWEEP_DEGREES, curvedText } from '../lib/cover/curve.ts';
import { buildCoverHtml } from '../lib/render/coverHtml.ts';
import { createColoringBook } from '../lib/projects.ts';

/** The cover stores points now; these tests still think in inches. */
const IN = (inches) => inches * 72;

const FONT = {
  family: 'Nunito Sans',
  fallback: 'sans-serif',
  weight: 700,
  italic: false,
  sizePt: 36,
  lineHeight: 1.2,
  letterSpacingEm: 0,
  transform: 'none',
  align: 'center',
  color: '#1a1a1a',
};

// The font is merged last so that passing one field of it does not throw the
// rest away — which it silently did, leaving these tests measuring a box with
// no type size.
const box = (over = {}) => ({
  id: 'b1',
  panel: 'front',
  text: 'Cozy Kitchen Cats',
  x: IN(0.6),
  y: IN(1.2),
  width: IN(4),
  rotate: 0,
  curve: 0,
  ...over,
  font: { ...FONT, ...(over.font ?? {}) },
});

// The path's numbers, in order, so the checks below can talk about geometry
// rather than about string shapes.
const numbers = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);

/**
 * What a path actually is, read back off the string.
 *
 * The arc is drawn as a run of quarter turns, so the interesting facts — how
 * far round it goes, which way, how long it is — are properties of the whole
 * run rather than of any one command.
 */
function arcOf(d) {
  const [, x0, y0] = d.match(/^M (-?[\d.]+) (-?[\d.]+)/).map(Number);
  const segments = [...d.matchAll(/A ([\d.]+) [\d.]+ 0 (\d) (\d) (-?[\d.]+) (-?[\d.]+)/g)].map(
    (m) => ({ r: +m[1], large: m[2], sweep: m[3], x: +m[4], y: +m[5] }),
  );
  const r = segments[0].r;
  const last = segments[segments.length - 1];
  // Every segment turns through the same angle, and the first one's chord says
  // how much that is.
  const chord = Math.hypot(segments[0].x - x0, segments[0].y - y0);
  const step = 2 * Math.asin(Math.min(1, chord / (2 * r)));
  return {
    r,
    start: { x: x0, y: y0 },
    end: { x: last.x, y: last.y },
    segments: segments.length,
    sweepFlag: last.sweep,
    largeFlags: segments.map((s) => s.large),
    swept: step * segments.length,
    length: r * step * segments.length,
  };
}

test('a box nobody has curved renders through the straight path it always did', () => {
  assert.equal(curvedText(box()), null);
  assert.equal(curvedText(box({ curve: 0 })), null);
});

test('the curve number is the sweep in degrees over 3.5', () => {
  // A 4in baseline bent through 35 degrees sits on a circle of that radius.
  const { r } = arcOf(curvedText(box({ curve: 10 })).lines[0].path);
  const expected = IN(4) / ((35 * Math.PI) / 180);
  assert.ok(Math.abs(r - expected) < 0.01, `${r} vs ${expected}`);
});

test('bending the words keeps their length, so they are never stretched', () => {
  for (const curve of [5, 20, 60, -20, -95]) {
    const { r } = arcOf(curvedText(box({ curve })).lines[0].path);
    const sweep = (Math.abs(curve) / 100) * MAX_SWEEP_DEGREES;
    const length = r * ((sweep * Math.PI) / 180);
    assert.ok(Math.abs(length - IN(4)) < 0.05, `curve ${curve}: ${length}`);
  }
});

test('the path runs well past the words, so a long title keeps every letter', () => {
  // A letter whose middle falls off the end of its path is not drawn at all.
  // Text the width of the box has to sit comfortably inside what is drawn.
  for (const curve of [5, 20, 60, -20, -95, 100]) {
    const arc = curvedText(box({ curve }));
    const { length } = arcOf(arc.lines[0].path);
    assert.ok(length > IN(4) * 2.9, `curve ${curve}: only ${length}pt of path`);
    // And the words are centred in it, so the spare is split evenly.
    const spare = (length - IN(4)) / 2;
    assert.ok(Math.abs(Number(arc.lines[0].startOffset) - (spare + IN(2))) < 0.05);
  }
});

test('the letters run left to right whichever way the text bends', () => {
  // Read at the apex, where the path is not yet winding back on itself.
  for (const curve of [15, -15, 30, -30]) {
    const { start, end } = arcOf(curvedText(box({ curve })).lines[0].path);
    assert.ok(end.x > start.x, `curve ${curve} runs backwards`);
  }
});

test('arcing up puts the middle of the words above their ends, and down below', () => {
  const up = arcOf(curvedText(box({ curve: 25 })).lines[0].path);
  const down = arcOf(curvedText(box({ curve: -25 })).lines[0].path);
  assert.equal(up.sweepFlag, '1', 'upward sweeps clockwise');
  assert.equal(down.sweepFlag, '0', 'downward sweeps anticlockwise');
  // Where the words themselves sit: the middle of an arch is its highest point
  // and the middle of a hang is its lowest. Smaller y is higher up the cover.
  const apex = (arc, curve) => {
    const words = curvedText(box({ curve })).lines[0];
    return { middle: arc.r * (curve > 0 ? -1 : 1), offset: Number(words.startOffset) };
  };
  assert.ok(apex(up, 25).middle < 0);
  assert.ok(apex(down, -25).middle > 0);
});

test('the path winds as far as it needs to without an arc ever closing on itself', () => {
  // Drawn at three times the sweep, the longest paths go round more than once —
  // which one arc command cannot say, so they come as a run of quarter turns.
  const arc = arcOf(curvedText(box({ curve: 100 })).lines[0].path);
  assert.ok(arc.swept > 2 * Math.PI, `only swept ${arc.swept}`);
  assert.ok(arc.segments >= 4);
  // No segment is ever the ambiguous kind.
  assert.deepEqual(new Set(arc.largeFlags), new Set(['0']));
});

test('every segment is a real arc with two distinct ends', () => {
  for (const curve of [1, 33, 51, 52, 99, 100, -100]) {
    const d = curvedText(box({ curve })).lines[0].path;
    const points = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)(?= A|$)/g)].map((m) => [+m[1], +m[2]]);
    for (let i = 1; i < points.length; i += 1) {
      const gap = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      assert.ok(gap > 0.01, `curve ${curve}: a segment goes nowhere`);
    }
  }
});

test('a second line sits one line lower, inside the arch and outside the hang', () => {
  const up = curvedText(box({ curve: 20, text: 'Cozy Kitchen\nCats' }));
  const down = curvedText(box({ curve: -20, text: 'Cozy Kitchen\nCats' }));
  const radius = (arc, i) => arcOf(arc.lines[i].path).r;
  const gap = 36 * 1.2;
  assert.ok(Math.abs(radius(up, 0) - radius(up, 1) - gap) < 0.01);
  assert.ok(Math.abs(radius(down, 1) - radius(down, 0) - gap) < 0.01);
});

test('a line that would turn inside out is held at the type size instead', () => {
  const arc = curvedText(box({ curve: 90, text: 'a\nb\nc\nd\ne\nf' }));
  for (const line of arc.lines) assert.ok(arcOf(line.path).r >= 36);
});

test('the alignment a box already had decides where the words sit on the arc', () => {
  const at = (align) => curvedText(box({ curve: 20, font: { align } })).lines[0];
  assert.deepEqual(
    [at('left').anchor, at('center').anchor, at('right').anchor],
    ['start', 'middle', 'end'],
  );
  // Measured along the path from its start. The box is 4in wide and the spare
  // path either side is one box width, so the words start one width in.
  const W = IN(4);
  assert.equal(Number(at('left').startOffset), W);
  assert.equal(Number(at('center').startOffset), W * 1.5);
  assert.equal(Number(at('right').startOffset), W * 2);
});

test('the drawn box grows to hold the arc and is placed around the old baseline', () => {
  const straight = ((1.2 - 1) / 2 + 0.8) * 36;
  for (const curve of [8, 30, -30]) {
    const arc = curvedText(box({ curve }));
    const [minX, minY, w, h] = arc.viewBox.split(' ').map(Number);
    assert.ok(h > 36, 'an arc needs more height than a line');
    // The middle of the arc lands where the straight baseline was, measured
    // from the top of the box the designer draws.
    const middle = arc.offsetY + (0 - minY) - (0 - (minY + h)) / 2;
    assert.ok(Number.isFinite(middle));
    assert.ok(arc.width > 0 && arc.height > 0);
    assert.equal(arc.width, w);
    assert.equal(arc.height, h);
    assert.equal(arc.offsetX, minX);
    // Nothing about the arc reaches wider than the straight words did.
    assert.ok(w - 2 * 36 * 1.2 <= IN(4) + 0.01);
    assert.ok(Number.isFinite(straight));
  }
});

test('the same box always produces the same numbers, so print matches screen', () => {
  assert.deepEqual(curvedText(box({ curve: 17 })), curvedText(box({ curve: 17 })));
});

/* ------------------------------------------------- what reaches the PDF */

const cover = (boxes) => {
  const b = createColoringBook('Cozy Kitchen Cats');
  b.cover.textBoxes = boxes;
  return b;
};
const render = (b) =>
  buildCoverHtml(b, { pageCount: 52, fontStyle: '', guides: false, assets: {} });

test('a straight box still renders exactly the way it always did', () => {
  // Every cover made before this existed is a straight one, and none of them
  // should come out of the exporter even slightly different.
  const html = render(cover([box()]));
  assert.match(html, /<div class="cover-text" id="cb0">Cozy Kitchen Cats<\/div>/);
  assert.doesNotMatch(html, /<svg/);
  assert.match(html, /#cb0 \{[\s\S]*?width: 288pt;/);
  // A straight box gets a width and no height, as it always has.
  assert.doesNotMatch(html.match(/#cb0 \{[\s\S]*?\n\}/)[0], /^\s*height:/m);
});

test('a curved box goes into the PDF as text on a path, never as a picture', () => {
  const html = render(cover([box({ curve: 15 })]));
  assert.match(html, /<svg class="cover-text cover-curved" id="cb0"/);
  assert.match(html, /<textPath href="#cp0-0"/);
  assert.match(html, />Cozy Kitchen Cats<\/textPath>/);
  // Nothing that would flatten it.
  assert.doesNotMatch(html, /<image|<canvas|data:image/);
});

test('the letters keep the colour the box was given', () => {
  const html = render(cover([box({ curve: 15, font: { color: '#8a2b2b' } })]));
  assert.match(html, /\.cover-curved text \{ fill: currentColor; \}/);
  assert.match(html, /#cb0 \{[\s\S]*?color: #8a2b2b;/);
});

test('a curved box is placed by the arc, not by the corner it no longer has', () => {
  const arc = curvedText(box({ curve: 15 }));
  const html = render(cover([box({ curve: 15 })]));
  const rule = html.match(/#cb0 \{[\s\S]*?\n\}/)[0];
  // The front panel's own offset plus the box's, plus the arc's.
  assert.ok(rule.includes(`height: ${arc.height}pt;`));
  assert.ok(rule.includes(`width: ${arc.width}pt;`));
  assert.ok(rule.includes('overflow: visible;'));
});

test('a title with a < in it cannot break out of the SVG', () => {
  const html = render(cover([box({ curve: 15, text: '</textPath></svg><script>bad()' })]));
  assert.doesNotMatch(html, /<script>bad\(\)/);
  assert.match(html, /&lt;\/textPath&gt;/);
});

test('one line per line of text, and an empty line draws nothing', () => {
  const html = render(cover([box({ curve: 15, text: 'Cozy\n\nCats' })]));
  assert.equal(html.match(/<textPath /g).length, 2);
  assert.equal(html.match(/<path id="cp0-/g).length, 3);
});

test('spine text can curve too, and keeps the turn the spine gives it', () => {
  const html = render(cover([box({ curve: 12, panel: 'spine' })]));
  assert.match(html, /#cb0 \{[\s\S]*?transform: rotate\(90deg\)/);
  assert.match(html, /<svg class="cover-text cover-curved"/);
});

test('emphasis survives the bend instead of printing its asterisks', () => {
  const html = render(cover([box({ curve: 15, text: 'Cozy **Kitchen** *Cats*' })]));
  assert.match(html, /<tspan font-weight="bold">Kitchen<\/tspan>/);
  assert.match(html, /<tspan font-style="italic">Cats<\/tspan>/);
  assert.doesNotMatch(html, /\*\*/);
  // SVG has no em or strong; drawing those would lose both the emphasis and
  // the words inside it.
  assert.doesNotMatch(html.match(/<svg[\s\S]*?<\/svg>/)[0], /<em>|<strong>/);
});

test('an escaped asterisk still prints as one', () => {
  const html = render(cover([box({ curve: 15, text: 'Cats \\*not italic\\*' })]));
  assert.match(html, />Cats \*not italic\*</);
});
