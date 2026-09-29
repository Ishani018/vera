import { plainBoard, type Board } from './board';
import { inchesToPt } from './kdp';

/**
 * The boards someone launching a book actually needs.
 *
 * Sizes are given the way each platform or printer states them — pixels for a
 * screen, inches for something printed — and converted here, so nobody has to
 * remember that Facebook's 1200 by 628 is 900 by 471 points. Points are exact
 * for both; see `docs/DECISIONS.md`.
 */

/** A CSS pixel is three quarters of a point, exactly. */
const px = (pixels: number) => pixels * 0.75;

export type PresetKind = 'screen' | 'print';

export type Preset = {
  id: string;
  name: string;
  /** What it is for, in the words someone would use asking for it. */
  note: string;
  kind: PresetKind;
  width: number;
  height: number;
  bleed: number;
  /** How far inside the trim to keep anything that must not be lost. */
  safeInset: number;
  /** What the platform or printer calls the size, for the interface to echo. */
  stated: string;
};

/**
 * A screen board has no bleed — nothing is trimmed — but it does have a margin
 * worth respecting, because feeds crop and overlay. A printed one bleeds an
 * eighth of an inch like everything else here.
 */
export const PRESETS: Preset[] = [
  {
    id: 'instagram-post',
    name: 'Instagram post',
    note: 'The square one, for announcing a book',
    kind: 'screen',
    width: px(1080),
    height: px(1080),
    bleed: 0,
    safeInset: px(48),
    stated: '1080 × 1080 px',
  },
  {
    id: 'instagram-story',
    name: 'Instagram story',
    note: 'Full screen and vertical; the top and bottom get covered',
    kind: 'screen',
    width: px(1080),
    height: px(1920),
    bleed: 0,
    // Stories put controls over roughly 250px at each end.
    safeInset: px(250),
    stated: '1080 × 1920 px',
  },
  {
    id: 'pinterest-pin',
    name: 'Pinterest pin',
    note: 'Tall, and the one that keeps being found months later',
    kind: 'screen',
    width: px(1000),
    height: px(1500),
    bleed: 0,
    safeInset: px(40),
    stated: '1000 × 1500 px',
  },
  {
    id: 'link-image',
    name: 'Link image',
    note: 'What shows when the book is linked on Facebook or X',
    kind: 'screen',
    width: px(1200),
    height: px(628),
    bleed: 0,
    safeInset: px(40),
    stated: '1200 × 628 px',
  },
  {
    id: 'postcard-a6',
    name: 'Postcard',
    note: 'A6, for a signing table or a parcel insert',
    kind: 'print',
    width: inchesToPt(4.25),
    height: inchesToPt(6),
    bleed: inchesToPt(0.125),
    safeInset: inchesToPt(0.25),
    stated: '4.25 × 6 in',
  },
  {
    id: 'bookmark',
    name: 'Bookmark',
    note: 'The obvious thing to put a colouring page on',
    kind: 'print',
    width: inchesToPt(2),
    height: inchesToPt(6),
    bleed: inchesToPt(0.125),
    safeInset: inchesToPt(0.1875),
    stated: '2 × 6 in',
  },
];

export const presetById = (id: string): Preset | null =>
  PRESETS.find((p) => p.id === id) ?? null;

/**
 * The board a preset describes.
 *
 * A printed preset states the size of the finished thing, so the bleed is
 * added around it — ask for a 4.25 inch postcard and the board is 4.5 inches
 * wide with a quarter of an inch coming off. A screen preset is already the
 * final size and nothing is added.
 */
export function boardFor(preset: Preset): Board<'board'> {
  const bleed = preset.bleed;
  return plainBoard({
    width: preset.width + 2 * bleed,
    height: preset.height + 2 * bleed,
    bleed,
    safeInset: preset.safeInset,
    safeLabel: preset.kind === 'screen' ? 'the visible area' : 'the safe margin',
  });
}

/** A CSS pixel is a ninety-sixth of an inch, and a point a seventy-second. */
const CSS_PX_PER_PT = 96 / 72;

/** Chromium refuses past eight, and a tall story at 600 DPI is already six. */
const clamp = (n: number, low: number, high: number, fallback: number) =>
  Number.isFinite(n) ? Math.max(low, Math.min(high, n)) : fallback;

export type OutputSize = {
  /** The board laid out at browser scale, which is what gets rendered. */
  cssWidth: number;
  cssHeight: number;
  /** How many device pixels to put in each of those. */
  shotScale: number;
  /** What comes out. */
  widthPx: number;
  heightPx: number;
  /** What that works out to on paper, however it was asked for. */
  dpi: number;
};

/**
 * How big to make the file, in whichever terms the board is stated in.
 *
 * A screen board is a number of pixels, so `scale` is a multiple of them: 1 is
 * Instagram's 1080 square, 2 is the same design at 2160 for a dense screen. A
 * printed board is a number of inches, so `dpi` is dots per inch.
 *
 * Asking a screen board for 300 DPI is the mistake this exists to prevent. It
 * produces a 3375 pixel square where the platform asked for 1080, and the
 * platform throws the difference away — a file three times the size for a
 * picture no better. The kind of board decides which question is being asked,
 * because only one of the two is meaningful for each.
 */
export function outputSize(
  preset: Pick<Preset, 'kind' | 'width' | 'height' | 'bleed'>,
  { scale, dpi }: { scale?: number; dpi?: number } = {},
): OutputSize {
  const boardWidth = preset.width + 2 * preset.bleed;
  const boardHeight = preset.height + 2 * preset.bleed;
  const cssWidth = Math.round(boardWidth * CSS_PX_PER_PT);
  const cssHeight = Math.round(boardHeight * CSS_PX_PER_PT);

  const shotScale =
    preset.kind === 'screen'
      ? clamp(scale ?? 1, 0.25, 8, 1)
      : clamp(clamp(dpi ?? 300, 72, 600, 300) / 96, 0.25, 8, 1);

  const widthPx = Math.round(cssWidth * shotScale);
  return {
    cssWidth,
    cssHeight,
    shotScale,
    widthPx,
    heightPx: Math.round(cssHeight * shotScale),
    dpi: Math.round(widthPx / (boardWidth / 72)),
  };
}
