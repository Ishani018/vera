'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../ui';

/** Where the selected thing is, in pixels inside the canvas pane. */
export type SelectionBox = { x: number; y: number; width: number; height: number };

const GAP = 10;
const ASSUMED_HEIGHT = 44;

/**
 * The controls for whatever is selected, floating over the canvas above it.
 *
 * Above the thing rather than beside the board, because the hand is already
 * there and the eye is already there. It follows what it belongs to — through
 * a drag, a zoom, a scroll — and it stays inside the canvas: a toolbar that
 * wanders off the edge with the picture it belongs to is a toolbar you cannot
 * reach at exactly the moment you want it.
 *
 * It is given a box rather than measuring one, because the thing it points at
 * is drawn from the same numbers the board is, and those numbers are already
 * to hand where this is rendered.
 */
export function SelectionToolbar({
  box,
  pane,
  children,
}: {
  box: SelectionBox | null;
  /** The visible canvas, which the toolbar may not leave. */
  pane: { width: number; height: number };
  children: ReactNode;
}) {
  const self = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: ASSUMED_HEIGHT });

  useLayoutEffect(() => {
    const el = self.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize((was) =>
        Math.abs(was.width - rect.width) < 1 && Math.abs(was.height - rect.height) < 1
          ? was
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);

  if (!box || !pane.width) return null;

  // Zoomed in far enough, the selected thing can be off the visible canvas
  // altogether. A bar pointing at something nobody can see is furniture.
  const offCanvas =
    box.y + box.height < 0 || box.y > pane.height || box.x + box.width < 0 || box.x > pane.width;
  if (offCanvas) return null;

  // Above by preference; below when the thing is near the top, which is where
  // a title usually is. Clamped both ways afterwards, because either choice
  // can still land outside a canvas that has been scrolled or zoomed.
  const above = box.y - size.height - GAP;
  const preferred = above >= 4 ? above : box.y + box.height + GAP;
  const top = Math.max(4, Math.min(preferred, pane.height - size.height - 4));
  const wanted = box.x + box.width / 2 - size.width / 2;
  const left = Math.max(4, Math.min(wanted, pane.width - size.width - 4));

  return (
    <div
      ref={self}
      role="toolbar"
      data-selection-toolbar
      className={cx(
        'pointer-events-auto absolute z-20 flex max-w-[calc(100%-8px)] flex-wrap items-center gap-1',
        'rounded-xl border border-ink-200 bg-paper/97 px-1.5 py-1 shadow-xl backdrop-blur-sm',
      )}
      style={{ left: Math.round(left), top: Math.round(Math.max(4, top)) }}
      // The canvas clears the selection when it is clicked; the toolbar is over
      // the canvas and is not the canvas.
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

/** A square button in the toolbar: one glyph, one job. */
export function ToolButton({
  label,
  onClick,
  active = false,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'grid h-8 min-w-8 place-items-center rounded-lg px-1.5 text-[14px] transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active ? 'bg-accent-50 text-accent-600' : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
      )}
    >
      {children}
    </button>
  );
}

/** A labelled slider, small enough to live in a bar. */
export function ToolSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onStart,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onStart?: () => void;
}) {
  return (
    <label className="flex items-center gap-1.5 px-1" title={label}>
      <span className="text-[11px] text-ink-500">{label}</span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onPointerDown={onStart}
        onKeyDown={onStart}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-[90px] cursor-pointer accent-accent-500"
      />
    </label>
  );
}

export function ToolDivider() {
  return <span className="mx-0.5 h-5 w-px bg-ink-200" />;
}
