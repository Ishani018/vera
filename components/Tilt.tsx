'use client';

import { useRef, type ReactNode } from 'react';
import { cx } from './ui';

/**
 * A card that leans towards the pointer.
 *
 * Two custom properties and nothing else: the handler writes `--tilt-x` and
 * `--tilt-y` straight onto the element's style, and CSS turns them into one
 * composited transform. No React state, so a pointer crossing a grid of twelve
 * cards does not re-render any of them — which is the difference between this
 * being free and this being the slowest thing on the page.
 *
 * Six degrees is the ceiling, because past that a card reads as broken rather
 * than as responsive. With `prefers-reduced-motion` the handler does not run at
 * all and the CSS ignores the properties anyway, so there are two reasons it
 * cannot move.
 */

const MAX_DEGREES = 6;

export function Tilt({
  children,
  className,
  lift = 3,
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  /** How far it rises as well as leans, in pixels. */
  lift?: number;
  as?: 'div' | 'li' | 'span';
}) {
  const node = useRef<HTMLElement>(null);

  const still = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const lean = (event: React.PointerEvent) => {
    const el = node.current;
    if (!el || still()) return;
    const box = el.getBoundingClientRect();
    // -0.5 … 0.5 from the middle of the card, whichever way the pointer is.
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    el.style.setProperty('--tilt-y', `${(x * MAX_DEGREES * 2).toFixed(2)}deg`);
    el.style.setProperty('--tilt-x', `${(-y * MAX_DEGREES * 2).toFixed(2)}deg`);
    el.style.setProperty('--tilt-lift', `${-lift}px`);
  };

  const level = () => {
    const el = node.current;
    if (!el) return;
    el.style.setProperty('--tilt-y', '0deg');
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-lift', '0px');
  };

  return (
    <As
      ref={node as never}
      onPointerMove={lean}
      onPointerLeave={level}
      className={cx('tilt', className)}
    >
      {children}
    </As>
  );
}
