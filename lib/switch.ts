/**
 * The geometry of a switch, in one place, because it has to add up.
 *
 * It did not. The knob was positioned `absolute` with no `left`, so it sat at
 * its *static* position — where it would have landed in normal flow — and a
 * `<button>` centres its contents, so that was the middle of the track. The
 * slide was then applied from the middle rather than from the left edge: at
 * rest the knob already hung two pixels past the right end of the track, and
 * switched on it hung twenty-two past it. Measured rather than guessed:
 * computed `left` came back as 25px on a 50px track.
 *
 * The lesson worth keeping is general. **An absolutely positioned element with
 * no `left` is not at the left.** It is wherever it would have been in flow,
 * which inside a button is the centre. Positioning something from an edge means
 * naming that edge.
 *
 * Out here rather than beside the component because the component is a `.tsx`
 * and the tests cannot load one — and because numbers that have to add up are
 * worth a test more than they are worth being nearby.
 */
export const SWITCH = {
  trackWidth: 50,
  trackHeight: 30,
  /** The gap between knob and track, on every side. */
  inset: 3,
  knob: 24,
  /** The smallest comfortable target, which the track alone is shorter than. */
  touchTarget: 44,
} as const;

export type SwitchGeometry = {
  trackWidth: number;
  trackHeight: number;
  inset: number;
  knob: number;
  touchTarget: number;
};

/** How far the knob travels: whatever the track has left over. */
export const switchTravel = (g: SwitchGeometry = SWITCH): number =>
  g.trackWidth - g.inset - g.knob - g.inset;

/** How far past the track the hit area reaches, to make a finger-sized target. */
export const switchReach = (g: SwitchGeometry = SWITCH): number =>
  Math.max(0, (g.touchTarget - g.trackHeight) / 2);
