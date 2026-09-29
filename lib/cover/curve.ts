import type { CoverTextBox } from '../types';

/**
 * Text bent around a circle, the way a title arches over a picture.
 *
 * The arithmetic lives out here, away from both renderers, because the
 * designer and the PDF have to agree about it exactly. A curve that looked
 * right on screen and printed a little lower would be worse than no curve at
 * all: you would only find out after paying for a proof copy.
 *
 * Everything is in points — the SVG's own coordinates, the type size, and the
 * cover around it — so nothing here converts between units at all.
 */

/** A whole turn would close the path on itself, which an SVG arc cannot express. */
export const MAX_SWEEP_DEGREES = 350;

/**
 * How far above its baseline a capital letter reaches, as a fraction of the
 * type size. A stand-in for the font's real metrics, which neither renderer
 * can ask for without loading the font and measuring it. It decides only where
 * a curve of nearly nothing sits relative to the straight text it replaces, so
 * being a shade off costs a shade of movement as the slider leaves zero — and
 * costs it identically on screen and on paper, which is the part that matters.
 */
const ASCENT = 0.8;

export type CurvedLine = {
  /** An SVG path, left to right, that the line's letters sit on. */
  path: string;
  /** Where along it the text starts, honouring the box's alignment. */
  startOffset: string;
  anchor: 'start' | 'middle' | 'end';
  text: string;
};

export type CurvedText = {
  /**
   * The arc over just the width the box asked for, without the spare path
   * either side. The designer strokes this invisibly and fat, so a curved title
   * can be grabbed anywhere along the words rather than only on a letter —
   * while the space under an arch stays free for whatever is meant to sit
   * there.
   */
  grabPath: string;
  /**
   * Where to put the SVG, in points from the text box's own top-left corner.
   * Vertical is usually negative: an arch rises above the line it replaces.
   */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  viewBox: string;
  lines: CurvedLine[];
};

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** Rounded hard, so the same numbers come out of both renderers every time. */
const pt = (value: number) => Number(value.toFixed(3));

const ANCHORS = {
  left: { anchor: 'start', offset: 0 },
  center: { anchor: 'middle', offset: 0.5 },
  right: { anchor: 'end', offset: 1 },
  justify: { anchor: 'middle', offset: 0.5 },
} as const;

/** How many box widths of path to draw, for the reason given where it is used. */
const HEADROOM = 3;

/**
 * An arc of any sweep at all, as quarter turns.
 *
 * A single SVG arc command cannot express a whole turn — its ends would meet,
 * and there would be no telling which way round it went — but a run of shorter
 * ones can wind as far as it likes. Which matters because the path drawn here
 * is three times the sweep asked for.
 */
function drawArc(
  radius: number,
  cx: number,
  sweep: number,
  up: boolean,
  sweepFlag: number,
): string {
  const at = (angle: number) => {
    const x = cx + radius * Math.sin(angle);
    const y = up ? -radius * Math.cos(angle) : radius * Math.cos(angle);
    return `${pt(x)} ${pt(y)}`;
  };
  const steps = Math.max(1, Math.ceil(sweep / (Math.PI / 2)));
  const step = sweep / steps;
  let path = `M ${at(-sweep / 2)}`;
  for (let i = 1; i <= steps; i += 1) {
    path += ` A ${pt(radius)} ${pt(radius)} 0 0 ${sweepFlag} ${at(-sweep / 2 + i * step)}`;
  }
  return path;
}

/**
 * The geometry for a curved text box, or null when it is straight.
 *
 * Null rather than a zero-curve arc on purpose: a box nobody has curved must
 * render through exactly the path it always did. An arc of a millionth of a
 * degree is not the same thing as a line, and every cover made before this
 * existed is a box nobody has curved.
 */
export function curvedText(box: CoverTextBox): CurvedText | null {
  const curve = box.curve ?? 0;
  if (!curve) return null;

  // Already points, which is also what the SVG works in, so nothing converts.
  const width = box.width;
  const size = box.font.sizePt;
  if (width <= 0 || size <= 0) return null;

  const sweep = (clamp(Math.abs(curve), 0, 100) / 100) * MAX_SWEEP_DEGREES;
  const theta = (sweep * Math.PI) / 180;
  if (theta <= 0) return null;

  // Arcing upward puts the circle's centre below the text, and the letters ride
  // over the top of it.
  const up = curve > 0;
  const half = theta / 2;
  const cos = Math.cos(half);
  const sin = Math.sin(half);

  // The baseline keeps the length it had, so curving bends the words without
  // stretching or squeezing them.
  const outer = width / theta;
  const gap = size * box.font.lineHeight;

  const lines = box.text.split('\n');
  // Each further line sits inside the one above it when the text arches up, and
  // outside it when it hangs down — which in both cases is one line lower.
  const radii = lines.map((_, i) => Math.max(size, outer + (up ? -i * gap : i * gap)));

  const cx = width / 2;
  // Read left to right along the top of the circle and you are going clockwise;
  // along the bottom of it, anticlockwise.
  const sweepFlag = up ? 1 : 0;

  // The path is drawn three times longer than the words were given room for,
  // with the extra split evenly off both ends.
  //
  // A letter whose middle falls past the end of its path is not drawn at all —
  // so a title one letter too long for its box silently loses its first and
  // last letter, which is the sort of thing you find out about from a proof
  // copy. The spare path costs nothing, is never seen, and means long text
  // bulges out past the box the way it does everywhere else in this app
  // instead of quietly going missing.
  const drawn = theta * HEADROOM;

  const paths = radii.map((r) => drawArc(r, cx, drawn, up, sweepFlag));
  const grabPath = drawArc(radii[0], cx, theta, up, sweepFlag);

  // The extremes of the baselines themselves, before any letters are drawn on
  // them. Past a half turn the arc bulges out to the full width of the circle.
  const wide = theta >= Math.PI;
  const maxRadius = Math.max(...radii);
  const minX = cx - (wide ? maxRadius : maxRadius * sin);
  const maxX = cx + (wide ? maxRadius : maxRadius * sin);
  const ends = radii.map((r) => (up ? -r * cos : r * cos));
  const middles = radii.map((r) => (up ? -r : r));
  const minY = Math.min(...ends, ...middles);
  const maxY = Math.max(...ends, ...middles);

  // Room for the letters standing on those baselines. Generous, and the SVG
  // does not clip in any case: this decides the size of the box the designer
  // draws a selection outline around, not what is visible.
  const pad = size * 1.2;
  // Rounded once, here, and used for both the viewBox and the element that
  // holds it. Rounding them separately would leave the drawing a thousandth of
  // a point adrift from the box it is drawn in, which is invisible until it is
  // the difference between two renderers agreeing and not.
  const boxMinX = pt(minX - pad);
  const boxMinY = pt(minY - pad);
  const boxWidth = pt(maxX - minX + 2 * pad);
  const boxHeight = pt(maxY - minY + 2 * pad);

  // Hold the middle of the arc where the straight first line's baseline was, so
  // the words stay put and bow out around them as the slider moves.
  const straightBaseline = ((box.font.lineHeight - 1) / 2 + ASCENT) * size;
  const centreY = (minY + maxY) / 2;

  // Measured from the start of the drawn path rather than as a share of it, so
  // the spare either side stays spare and the words still sit where the box's
  // own alignment says they should.
  const spare = (width * (HEADROOM - 1)) / 2;
  const { anchor, offset } = ANCHORS[box.font.align] ?? ANCHORS.center;

  return {
    grabPath,
    offsetX: boxMinX,
    offsetY: pt(straightBaseline - centreY + boxMinY),
    width: boxWidth,
    height: boxHeight,
    viewBox: `${boxMinX} ${boxMinY} ${boxWidth} ${boxHeight}`,
    lines: paths.map((path, i) => ({
      path,
      startOffset: String(pt(spare + offset * width)),
      anchor,
      text: lines[i],
    })),
  };
}
