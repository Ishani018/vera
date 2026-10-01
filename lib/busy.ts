/**
 * When to say something is happening, and what to say.
 *
 * Two different waits, and they want opposite treatment. A preview that takes
 * 200 ms wants a sign *immediately* — without one the app looks like it ignored
 * the control. An export that takes four seconds wants a sentence with a number
 * in it, and would look fussy if the same sentence flashed up for every slider
 * nudge. So: a soft mark almost at once, a spelled-out notice only once a job is
 * genuinely slow.
 *
 * Pure, so the rules can be checked without a browser.
 */

/**
 * How long before the working mark appears, in ms.
 *
 * Under a tenth of a second, so it reads as a response to the control rather
 * than as something that happened later — but not zero, which would flicker the
 * mark on and off for every render that finishes quickly.
 */
export const SHOW_WORKING_AFTER = 90;

/** How long a job runs before it is worth a sentence rather than a mark. */
export const SLOW_AFTER = 1000;

/**
 * The long edge of a preview made while a control is still moving.
 *
 * Small on purpose: the work is roughly quadratic in this number, so a quarter
 * of the edge is about a sixteenth of the work. At this size a drag keeps up,
 * and what it shows is the shape of the change, which is all the decision
 * needs. The real one follows the moment the control is let go.
 */
export const DRAFT_EDGE = 400;

export type Quality = 'draft' | 'full';

/**
 * Whether a result that has just arrived is still wanted.
 *
 * The id of a request that has been superseded is lower than the current one;
 * the answer to an old slider position must never replace the answer to a newer
 * one, however much sooner it arrives.
 */
export const wanted = (id: number, newest: number): boolean => id === newest;

/**
 * A draft's numbers, as if it had been made at full size.
 *
 * The caption reads out the size and the stage lays itself out from it, so a
 * draft that reported its own 400 px would shrink the picture and change the
 * numbers under the reader mid-drag. The picture is the same picture; only its
 * resolution is lower, so it is shown at the size the real one will be.
 */
export function asFullSize<T extends { width: number; height: number; pad: number }>(
  made: T,
  full: { width: number; height: number } | null,
): T {
  if (!full || !made.width) return made;
  const scale = full.width / made.width;
  const height = Math.round(made.height * scale);
  // Rounding a 400 px draft up to 800 can land a pixel either side of the real
  // height, and a number under the picture that flickers between 600 and 601
  // is worse than one that is a pixel stale. A genuinely different shape — a
  // die-cut outline being widened, say — is kept, because there the growing is
  // the thing being judged.
  const sameShape = Math.abs(height - full.height) <= Math.max(2, full.height * 0.01);
  return {
    ...made,
    width: full.width,
    height: sameShape ? full.height : height,
    pad: made.pad * scale,
  };
}

/** "Working… 3 of 12" — or just "Working…" when there is nothing to count. */
export function progressLine(
  what: string,
  done?: number,
  total?: number,
): string {
  const head = what.trim() || 'Working';
  if (typeof done !== 'number' || typeof total !== 'number' || total <= 0) return `${head}…`;
  return `${head}… ${Math.min(done, total)} of ${total}`;
}

/** How far along, 0 to 1, for a bar to draw. Unknown totals give null. */
export function progressFraction(done?: number, total?: number): number | null {
  if (typeof done !== 'number' || typeof total !== 'number' || total <= 0) return null;
  return Math.max(0, Math.min(1, done / total));
}
