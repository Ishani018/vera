'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../ui';

export type RailPanel = {
  id: string;
  label: string;
  glyph: string;
  node: ReactNode;
};

/**
 * The way into a board: a column of named things, one panel open at a time.
 *
 * A single column holding everything at once is a column you scroll past
 * rather than read — the old one ran background, pictures, stickers, text and
 * whatever was selected down one strip. Here each is a door, and what is
 * behind it has room: bigger targets, real spacing, and a heading that says
 * where you are.
 *
 * What is not built yet is shown and not clickable, for the same reason the
 * front page does it: a door that opens onto an apology is worse than a door
 * that is plainly locked.
 *
 * On a narrow window the column lies down and becomes a bar along the bottom,
 * with the open panel above it. A 78-pixel column and a 300-pixel panel leave
 * a phone nothing to work in; across the bottom they cost one row and the
 * picture keeps the rest. Everything here is the same markup either way —
 * only where it sits changes, so there is one rail to be right about.
 */
export function Rail({
  panels,
  soon = [],
  footer,
  open,
  onOpen,
}: {
  panels: RailPanel[];
  soon?: Array<{ label: string; glyph: string }>;
  /** Undo and redo, which belong to the board rather than to any one panel. */
  footer?: ReactNode;
  open: string | null;
  onOpen: (id: string | null) => void;
}) {
  const shown = panels.find((panel) => panel.id === open) ?? null;

  /**
   * One highlight for the rail, slid to whichever panel is open.
   *
   * Measured from the buttons rather than worked out from a row height, so it
   * is right whether the rail is down the side or along the bottom — and moved
   * with a transform, so opening a panel costs a composited move and no layout.
   * The rail's own width is untouched: the board is measured from it.
   */
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<React.CSSProperties>({ opacity: 0 });

  useEffect(() => {
    const at = panels.findIndex((panel) => panel.id === open);
    const node = at >= 0 ? items.current[at] : null;
    const rail = node?.parentElement;
    if (!node || !rail) return setPill((was: React.CSSProperties) => ({ ...was, opacity: 0 }));
    const a = node.getBoundingClientRect();
    const b = rail.getBoundingClientRect();
    setPill({
      opacity: 1,
      width: a.width,
      height: a.height,
      transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)`,
    });
  }, [open, panels]);

  return (
    <>
      <nav
        className={cx(
          'relative flex shrink-0 gap-0.5 bg-paper',
          'w-[78px] flex-col border-r border-ink-200 p-1.5',
          // Narrow: along the bottom, scrollable sideways, ordered last.
          'max-lg:order-last max-lg:w-full max-lg:flex-row max-lg:overflow-x-auto max-lg:border-r-0 max-lg:border-t',
        )}
      >
        <span className="slider-pill" style={pill} aria-hidden="true" />
        {panels.map((panel, n) => (
          <button
            key={panel.id}
            ref={(node) => void (items.current[n] = node)}
            type="button"
            title={panel.id === open ? `Close ${panel.label}` : panel.label}
            aria-pressed={panel.id === open}
            onClick={() => onOpen(panel.id === open ? null : panel.id)}
            className={cx(
              'nudge-hover relative z-10 grid justify-items-center gap-1 rounded-xl px-1 pb-1.5 pt-2',
              'transition-colors duration-[var(--motion-base)]',
              'max-lg:min-w-[62px] max-lg:shrink-0',
              panel.id === open
                ? 'text-accent-600'
                : 'text-ink-500 hover:text-ink-900',
            )}
          >
            <span aria-hidden className="nudge text-[19px] leading-none">
              {panel.glyph}
            </span>
            {/*
              Centred, and it cannot poke out of the rail.

              "Background" is the longest label and it did: at 10.5px it is about
              61px wide, the button's inside is about 58px, and a single word has
              no break opportunity to wrap at — so it simply hung over the edge.
              A hair smaller fits it, and `anywhere` is the insurance for a label
              nobody has thought of yet. The rail's 78px may not change: the
              board's size is worked out from it.
            */}
            <span className="text-center text-[10px] font-[570] leading-tight [overflow-wrap:anywhere]">
              {panel.label}
            </span>
          </button>
        ))}

        {soon.length > 0 && <hr className="mx-1 my-1.5 border-ink-200 max-lg:hidden" />}
        {soon.map((item) => (
          <span
            key={item.label}
            title="Not built yet"
            className="grid cursor-not-allowed justify-items-center gap-1 rounded-xl px-1 pb-1.5 pt-2 text-ink-500 opacity-45 max-lg:min-w-[62px] max-lg:shrink-0"
          >
            <span aria-hidden className="text-[19px] leading-none">
              {item.glyph}
            </span>
            <span className="text-center text-[10px] font-[570] leading-tight [overflow-wrap:anywhere]">
              {item.label}
            </span>
            <span className="text-[9px] uppercase tracking-wide">Soon</span>
          </span>
        ))}

        {footer && <div className="mt-auto pt-2 max-lg:ml-auto max-lg:mt-0 max-lg:self-center max-lg:pt-0">{footer}</div>}
      </nav>

      {shown && (
        <section
          /* Slides in from the rail and fades, 200 ms. The width is fixed and
             unchanged, so nothing it does moves the board. */
          key={shown.id}
          className={cx(
            'panel-in flex shrink-0 flex-col overflow-y-auto bg-paper',
            'w-[300px] border-r border-ink-200',
            // Narrow: a drawer across the bottom, above the bar, capped so it
            // never takes the whole window.
            'max-lg:order-last max-lg:max-h-[46vh] max-lg:w-full max-lg:border-r-0 max-lg:border-t',
          )}
        >
          <header className="flex items-baseline justify-between gap-2 px-4 pb-2 pt-4">
            <h3 className="text-[17px] font-semibold tracking-tight">{shown.label}</h3>
            <button
              type="button"
              onClick={() => onOpen(null)}
              title="Close this panel"
              aria-label="Close this panel"
              /*
                A 24px cross with a 32px target.

                Drawn at 32 it made this header eight pixels taller, and the
                Picture panel then needed two pixels of scroll at 1280×720 —
                which the brief says it must not. So it reaches for its target
                with a pseudo-element instead of growing into it, the same way
                the switch in `lib/switch.ts` does and for the same reason: the
                thing you aim at and the thing you see are not the same size.
              */
              className={cx(
                'relative grid size-6 place-items-center rounded text-[15px] text-ink-500',
                "before:absolute before:-inset-1 before:content-['']",
                'transition-colors hover:text-ink-900',
              )}
            >
              ✕
            </button>
          </header>
          <div className="space-y-4 px-4 pb-6">{shown.node}</div>
        </section>
      )}
    </>
  );
}
