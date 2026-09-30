/**
 * Three sizes of type, in proportion to the board they are going on.
 *
 * A heading is a heading whether the board is a 1080-pixel square or a
 * two-inch bookmark, so the sizes are a share of the board's shorter side
 * rather than a fixed number of points — forty points is a title on a post and
 * most of the width of a bookmark.
 *
 * Clamped at both ends because proportion stops being sensible eventually: a
 * heading under eighteen points is not a heading, and one over seventy-two is
 * a poster.
 */
export type TextPresetKind = 'heading' | 'subheading' | 'body';

export type TextPreset = {
  kind: TextPresetKind;
  label: string;
  /** What the box says before anyone types in it. */
  text: string;
  /** Of the board's shorter side. */
  share: number;
  min: number;
  max: number;
  weight: number;
  lineHeight: number;
};

export const TEXT_PRESETS: TextPreset[] = [
  {
    kind: 'heading',
    label: 'Heading',
    text: 'Your heading',
    share: 0.08,
    min: 18,
    max: 72,
    weight: 700,
    lineHeight: 1.1,
  },
  {
    kind: 'subheading',
    label: 'Subheading',
    text: 'A line underneath',
    share: 0.045,
    min: 12,
    max: 36,
    weight: 500,
    lineHeight: 1.2,
  },
  {
    kind: 'body',
    label: 'Body text',
    text: 'A sentence or two of the smaller stuff.',
    share: 0.028,
    min: 9,
    max: 18,
    weight: 400,
    lineHeight: 1.45,
  },
];

export const presetByKind = (kind: TextPresetKind): TextPreset =>
  TEXT_PRESETS.find((preset) => preset.kind === kind) ?? TEXT_PRESETS[2];

/** The size this preset comes out at on a board of these proportions. */
export function presetSizePt(preset: TextPreset, board: { width: number; height: number }): number {
  const shorter = Math.min(board.width, board.height);
  const wanted = shorter * preset.share;
  // Quarter points, because that is the step the size control uses and a
  // heading of 64.8 is a number nobody typed on purpose.
  const stepped = Math.round(wanted * 4) / 4;
  return Math.min(preset.max, Math.max(preset.min, stepped));
}

/**
 * Where a new box of this preset goes, and how wide it is, in board points.
 *
 * Headings start a fifth of the way down because that is where a title sits on
 * almost everything; the other two follow underneath. Each is inset by a
 * twelfth of the width on both sides, which keeps them clear of the safe area
 * on every board here.
 */
export function presetBox(
  preset: TextPreset,
  board: { width: number; height: number },
): { x: number; y: number; width: number } {
  const inset = board.width / 12;
  const top = { heading: 0.2, subheading: 0.38, body: 0.52 }[preset.kind];
  return {
    x: Math.round(inset * 100) / 100,
    y: Math.round(board.height * top * 100) / 100,
    width: Math.round((board.width - inset * 2) * 100) / 100,
  };
}
