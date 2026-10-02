'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { cx } from './ui';

/**
 * Messages that arrive at the corner, stack, and leave by themselves.
 *
 * The app said things by growing a coloured box inside whichever panel the work
 * had happened in. That works for a warning somebody has to act on, and it works
 * badly for "saved": the box appears in a sidebar the eye has already left,
 * pushes the controls under it down, and stays until something else replaces it.
 *
 * So the transient ones move here. Warnings and errors stay where they are —
 * a message you must do something about belongs beside the thing you must do it
 * to, not in a corner on a timer.
 *
 * Newest at the bottom, older ones above: that is the order they happened in and
 * the order they are read in. Several at once rather than one replacing the last,
 * because "kept it" and "added four" are two things and showing only the second
 * loses the first.
 */

export type ToastTone = 'ok' | 'info';

type Toast = { id: number; text: string; tone: ToastTone; leaving: boolean };

type Say = (text: string, tone?: ToastTone) => void;

const Channel = createContext<Say>(() => undefined);

/** How long one stays up. Long enough to read twice, at reading speed. */
const SHOWN = 4200;
/** The fade out, which must match `.toast[data-leaving]` in surfaces.css. */
const LEAVING = 200;
/** More than this on screen at once is a wall of text, not feedback. */
const MOST = 3;

export function Toasts({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState<Toast[]>([]);
  const next = useRef(1);

  const say = useCallback<Say>((text, tone = 'ok') => {
    const id = next.current++;
    setShown((was) => [...was.slice(-(MOST - 1)), { id, text, tone, leaving: false }]);
    // Marked as leaving first, so it fades rather than vanishing, and removed
    // once the fade has had its time.
    setTimeout(() => {
      setShown((was) => was.map((one) => (one.id === id ? { ...one, leaving: true } : one)));
      setTimeout(() => setShown((was) => was.filter((one) => one.id !== id)), LEAVING);
    }, SHOWN);
  }, []);

  const value = useMemo(() => say, [say]);

  return (
    <Channel.Provider value={value}>
      {children}
      {/*
        Bottom right, over everything, and deaf to the pointer apart from each
        message itself — a toast that swallowed a click on the button underneath
        it would be worse than no toast.
      */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-end gap-2 p-4 sm:items-end"
      >
        {shown.map((one) => (
          <div
            key={one.id}
            data-toast
            data-leaving={one.leaving ? 'yes' : 'no'}
            className={cx(
              'toast pointer-events-auto max-w-[min(92vw,26rem)] rounded-xl border px-3.5 py-2.5',
              'text-[13px] leading-snug',
              one.tone === 'ok'
                ? 'border-sage-500/40 bg-sage-50 text-sage-600'
                : 'border-ink-200 bg-paper text-ink-700',
            )}
          >
            {one.text}
          </div>
        ))}
      </div>
    </Channel.Provider>
  );
}

/**
 * Says something in the corner.
 *
 * Safe to call from anywhere, including from a tree with no `Toasts` above it:
 * the default does nothing, so a component used in two places does not have to
 * know which of them wrapped it.
 */
export function useSay(): Say {
  return useContext(Channel);
}
