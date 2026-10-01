/**
 * How big a preview drawing is, and the shape of the box it sits in.
 *
 * Here, as numbers, because the bug this exists to prevent was a size written
 * into the drawing itself. Every drawing in this app is a 120 by 80 viewBox,
 * which is a *proportion*, not a size — it tells a browser the shape, and the
 * CSS tells it how big. When the CSS said `h-20` on the svg, the drawing was 80
 * px tall and 120 px wide wherever it was put, including inside a 44 px box,
 * where it hung 23 px below the card and sat over the title.
 *
 * So the rule, and it is the whole fix: **a drawing never says how big it is.**
 * It fills the box it is given, keeping its proportions, and the box is the
 * only thing with a size.
 */

/** The preview box, square, in CSS pixels. */
export const PREVIEW_BOX = 56;

/** The round one beside a shortcut. Bigger, because it is the thing pressed. */
export const PREVIEW_ROUND = 48;

/**
 * Space between the drawing and the edge of its box.
 *
 * A drawing is mostly a rectangle with a stroke on it; flush against the edge
 * of a tinted box the stroke reads as the box's own border.
 */
export const PREVIEW_INSET = 4;

/** The drawing's own coordinate space, which is a shape and not a size. */
export const VIEW_BOX = { width: 120, height: 80 } as const;

/**
 * What a drawing's svg must carry, and must not.
 *
 * `width`/`height` of 100% with `preserveAspectRatio: meet` is what makes it
 * scale down into whatever box it is given rather than overflow it. A class
 * naming a size — `h-20`, `w-28` — is exactly the mistake that caused the
 * overflow, so the test for this looks for one.
 */
export const DRAWING_FITS = {
  width: '100%',
  height: '100%',
  preserveAspectRatio: 'xMidYMid meet',
} as const;

/** How big a drawing comes out in a box, for a test to check the arithmetic. */
export function fittedInto(box: number, inset: number = PREVIEW_INSET): {
  width: number;
  height: number;
} {
  const room = Math.max(0, box - inset * 2);
  const scale = Math.min(room / VIEW_BOX.width, room / VIEW_BOX.height);
  return { width: VIEW_BOX.width * scale, height: VIEW_BOX.height * scale };
}
