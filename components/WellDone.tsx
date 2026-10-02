'use client';

import { useEffect, useState } from 'react';

/**
 * A few shapes floating up, the first time something is finished in a session.
 *
 * The first export is the moment the whole app was for, and it used to be a line
 * of grey text saying a file had been saved. Six shapes rising for under a second
 * is the difference between a tool reporting a result and a tool agreeing that
 * something good happened.
 *
 * Once. The flag lives in `sessionStorage`, so it is per tab and per visit: it
 * comes back tomorrow and it does not come back on the fourth export this
 * afternoon. A celebration that happens every time is not a celebration, it is a
 * delay — and the fourth export of the day is a chore, not an achievement.
 *
 * `sessionStorage` rather than a module variable because a page navigation inside
 * the app can remount this, and a module variable would survive that but not a
 * refresh, which is the wrong way round: a refresh is the same session and a new
 * tab is not.
 */

const ONCE = 'isnaevy:welldone';

/** Six, which reads as a handful. Twelve reads as a problem with the page. */
const SHAPES = [
  { glyph: '✦', drift: '-38px', spin: '-120deg', tint: 'text-coral-500' },
  { glyph: '●', drift: '18px', spin: '60deg', tint: 'text-sun-500' },
  { glyph: '◆', drift: '-14px', spin: '140deg', tint: 'text-lilac-500' },
  { glyph: '✦', drift: '42px', spin: '-80deg', tint: 'text-sage-500' },
  { glyph: '▲', drift: '-30px', spin: '100deg', tint: 'text-denim-500' },
  { glyph: '●', drift: '30px', spin: '-150deg', tint: 'text-accent-500' },
];

/** Has this session already had its moment? */
export function alreadyCelebrated(): boolean {
  try {
    return sessionStorage.getItem(ONCE) === 'yes';
  } catch {
    // Storage blocked: better to celebrate every time than to crash, and the
    // animation is under a second and cannot be clicked through.
    return false;
  }
}

export function markCelebrated() {
  try {
    sessionStorage.setItem(ONCE, 'yes');
  } catch {
    // Nothing to do. See above.
  }
}

/**
 * Shows the shapes when `when` becomes true, once per session, then removes
 * itself. Driven by a counter from the caller rather than by a boolean, so two
 * exports in a row cannot leave it stuck on.
 */
export function WellDone({ at }: { at: number }) {
  const [playing, setPlaying] = useState(0);

  useEffect(() => {
    if (!at || alreadyCelebrated()) return;
    markCelebrated();
    setPlaying(at);
  }, [at]);

  /*
    The stop is its own effect, keyed on what is playing rather than on `at`.

    With both in one effect, a second export changed `at`, React ran the cleanup
    and cancelled the timer that was about to take the shapes away, and then the
    `alreadyCelebrated` guard returned early without setting a new one — so the
    shapes stayed on the screen for the rest of the session. Keyed on `playing`,
    the timer belongs to the thing it stops.
  */
  useEffect(() => {
    if (!playing) return;
    const clear = setTimeout(() => setPlaying(0), 1500);
    return () => clearTimeout(clear);
  }, [playing]);

  if (!playing) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 grid place-items-center"
    >
      <div className="relative h-px w-px">
        {SHAPES.map((shape, n) => (
          <span
            key={n}
            className={`rise absolute text-[22px] leading-none ${shape.tint}`}
            style={
              {
                left: `${(n - 2.5) * 26}px`,
                '--drift': shape.drift,
                '--spin': shape.spin,
                '--n': n,
              } as React.CSSProperties
            }
          >
            {shape.glyph}
          </span>
        ))}
      </div>
    </div>
  );
}
