import { textArc } from '../cover/curve';

/**
 * Words on a sticker.
 *
 * Drawn onto a canvas, not through `lib/render/coverHtml.ts`: a sticker is a
 * PNG with an alpha channel, made in the browser, and the cover renderer makes
 * pages of a book. They share the geometry of a curve and nothing else — the
 * circle a line of text is bent around comes from `lib/cover/curve.ts`, so a
 * title arched over a sticker and the same title arched over a cover bend the
 * same way.
 *
 * Placing letters on that circle is this file's own work, because a canvas has
 * no equivalent of an SVG text path: each glyph is measured, turned to face
 * along the arc, and drawn one at a time.
 *
 * Sizes and positions are fractions of the sticker rather than pixels, so the
 * same text lands in the same place whether the sticker is exported at 500
 * pixels or 2000.
 */

export type StickerText = {
  id: string;
  text: string;
  /** The family name, as the picker gives it. */
  family: string;
  /** What to use if that family will not load. */
  fallback: string;
  weight: number;
  colour: string;
  /** Height of one line, as a fraction of the sticker's long edge. */
  size: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  /** Where the text sits, as fractions of the sticker. */
  x: number;
  y: number;
  /** How wide the words are given, as a fraction of the sticker's width. */
  width: number;
  /** -100 to 100. Zero is straight; positive arches up. */
  curve: number;
  /** Drawn behind the letters, so it never eats into them. Null for none. */
  outline: { width: number; colour: string } | null;
};

export const MAX_TEXTS = 8;

export function newText(id: string): StickerText {
  return {
    id,
    text: 'Your words',
    family: 'EB Garamond',
    fallback: "Georgia, 'Times New Roman', serif",
    weight: 600,
    colour: '#1B1815',
    size: 0.12,
    lineHeight: 1.2,
    align: 'center',
    x: 0.5,
    y: 0.5,
    width: 0.8,
    curve: 0,
    outline: null,
  };
}

/** Everything the drawing needs, in pixels of a sticker this size. */
export type TextMetrics = {
  fontSize: number;
  lineGap: number;
  boxWidth: number;
  centreX: number;
  baselineY: number;
  lines: string[];
};

export function measure(item: StickerText, width: number, height: number): TextMetrics {
  const longEdge = Math.max(width, height);
  const fontSize = Math.max(1, item.size * longEdge);
  const lines = item.text.split('\n');
  return {
    fontSize,
    lineGap: fontSize * item.lineHeight,
    boxWidth: Math.max(1, item.width * width),
    centreX: item.x * width,
    baselineY: item.y * height,
    lines,
  };
}

/** The CSS font shorthand for an item, at a size in pixels. */
export const fontOf = (item: StickerText, size: number): string =>
  `${item.weight} ${size}px "${item.family}", ${item.fallback}`;

/**
 * Where each letter of a curved line goes.
 *
 * Returned rather than drawn, so the arithmetic can be checked without a
 * canvas. Each entry is a glyph, the point to put its middle at, and the angle
 * to turn it to; the caller draws it with its own alignment baseline.
 *
 * `widths` are the measured advance of each character, which only a canvas can
 * supply — so the caller measures and this decides where the results go.
 */
export function placeOnArc({
  letters,
  widths,
  radius,
  theta,
  up,
  align,
}: {
  letters: string[];
  widths: number[];
  radius: number;
  theta: number;
  up: boolean;
  align: StickerText['align'];
}): { letter: string; angle: number; radius: number }[] {
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return [];

  // The words keep the length they had: an angle per pixel of advance.
  const perPixel = theta / Math.max(1, radius * theta);
  const span = total * perPixel;
  const start = align === 'left' ? -theta / 2 : align === 'right' ? theta / 2 - span : -span / 2;

  const out: { letter: string; angle: number; radius: number }[] = [];
  let along = 0;
  for (let i = 0; i < letters.length; i++) {
    const middle = along + widths[i] / 2;
    out.push({
      letter: letters[i],
      // Downward text reads the other way round the circle, so its angles run
      // backwards — otherwise a hanging title comes out mirrored.
      angle: (up ? 1 : -1) * (start + middle * perPixel),
      radius,
    });
    along += widths[i];
  }
  return out;
}

/**
 * Where one letter of a curved line ends up, and how far it is turned.
 *
 * The same arithmetic the canvas does with `translate`/`rotate`/`translate`,
 * written out so it can be checked without one. It was wrong once — a hanging
 * line came out upside down and reading backwards — and the thing that was
 * wrong was exactly this and nothing else.
 *
 * The rule it encodes: the letters stand on the side of the circle *facing its
 * centre*, whichever way the line bends. A letter on the far side of the same
 * circle is the bottom half of a rubber stamp.
 */
export function glyphSpot({
  angle,
  radius,
  up,
  centreX,
  baselineY,
}: {
  angle: number;
  radius: number;
  up: boolean;
  centreX: number;
  baselineY: number;
}): { x: number; y: number; rotation: number } {
  const cy = baselineY + (up ? radius : -radius);
  const along = up ? -radius : radius;
  return {
    x: centreX - along * Math.sin(angle),
    y: cy + along * Math.cos(angle),
    rotation: angle,
  };
}

/** The circle a line of this text is bent around, in pixels. */
export function arcFor(item: StickerText, metrics: TextMetrics) {
  return textArc({
    width: metrics.boxWidth,
    curve: item.curve,
    size: metrics.fontSize,
    lineHeight: item.lineHeight,
    lines: metrics.lines.length,
  });
}

/**
 * Draws the text onto a context, at the size that context happens to be.
 *
 * The outline is stroked first and the fill painted over it, so a thick outline
 * grows outward from the letters instead of eating into them — the same reason
 * the die-cut ring is drawn before the artwork.
 */
export function drawTexts(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  items: StickerText[],
  width: number,
  height: number,
) {
  for (const item of items) {
    if (!item.text.trim()) continue;
    const metrics = measure(item, width, height);
    context.save();
    context.font = fontOf(item, metrics.fontSize);
    context.textBaseline = 'alphabetic';
    context.lineJoin = 'round';
    context.miterLimit = 2;

    const arc = arcFor(item, metrics);
    if (!arc) drawStraight(context, item, metrics);
    else drawCurved(context, item, metrics, arc);
    context.restore();
  }
}

function paint(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  item: StickerText,
  size: number,
  text: string,
  x: number,
  y: number,
) {
  if (item.outline && item.outline.width > 0) {
    context.strokeStyle = item.outline.colour;
    // Twice, because half of a stroke falls inside the letter: to put `width`
    // outside it, stroke twice that and let the fill take the inner half back.
    context.lineWidth = item.outline.width * size * 2;
    context.strokeText(text, x, y);
  }
  context.fillStyle = item.colour;
  context.fillText(text, x, y);
}

function drawStraight(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  item: StickerText,
  metrics: TextMetrics,
) {
  context.textAlign = item.align === 'center' ? 'center' : item.align === 'right' ? 'right' : 'left';
  const x =
    item.align === 'center'
      ? metrics.centreX
      : item.align === 'right'
        ? metrics.centreX + metrics.boxWidth / 2
        : metrics.centreX - metrics.boxWidth / 2;
  // The block is centred on the point, so adding lines grows it both ways
  // rather than pushing it down the sticker.
  const top = metrics.baselineY - ((metrics.lines.length - 1) * metrics.lineGap) / 2;
  metrics.lines.forEach((line, i) => {
    paint(context, item, metrics.fontSize, line, x, top + i * metrics.lineGap);
  });
}

function drawCurved(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  item: StickerText,
  metrics: TextMetrics,
  arc: NonNullable<ReturnType<typeof textArc>>,
) {
  context.textAlign = 'center';
  metrics.lines.forEach((line, i) => {
    const radius = arc.radii[i] ?? arc.radii[arc.radii.length - 1];
    const letters = [...line];
    const widths = letters.map((letter) => context.measureText(letter).width);
    const placed = placeOnArc({
      letters,
      widths,
      radius,
      theta: arc.theta,
      up: arc.up,
      align: item.align,
    });

    for (const { letter, angle } of placed) {
      context.save();
      // The same three steps `glyphSpot` writes out in arithmetic, which is
      // where the rule they follow is explained and where it is tested.
      context.translate(metrics.centreX, metrics.baselineY + (arc.up ? radius : -radius));
      context.rotate(angle);
      context.translate(0, arc.up ? -radius : radius);
      paint(context, item, metrics.fontSize, letter, 0, 0);
      context.restore();
    }
  });
}
