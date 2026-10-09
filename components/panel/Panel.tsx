'use client';

import { useId, useState, type ReactNode } from 'react';
import { Info, Notice, Spinner, cx } from '../ui';

/**
 * The right-hand settings panel, as shared parts.
 *
 * Three panels grew up separately — the cover designer's rail, the sticker
 * studio's (the same component) and the Line Art Lab's own — and drifted. They
 * disagreed about the width of the rail (78 vs 102), the width of the panel
 * (300 vs 337), what a control's label looks like (sentence case with a grey
 * hint underneath, versus 10px uppercase mono with the hint behind an "i"), and
 * what a section heading is. None of those differences was a decision; they
 * were three people solving the same problem on three days.
 *
 * So the geometry lives in `PANEL` in lib/theme.ts and the parts live here.
 * What does NOT live here is anything only one tool needs: a panel is a frame,
 * a heading, a group and a labelled control, and the controls themselves are
 * still the app's existing `Slider`, `Toggle`, `Select` and the rest. This is
 * not a new control library.
 *
 * The one idiom worth keeping from the Lab is the hint behind an `i`: five
 * controls each with a grey line of prose under them is a wall nobody reads
 * twice, and the tooltip puts the explanation one press from the label that
 * needs it. `Control` does that for every panel now.
 */

/**
 * The frame: a fixed-width column whose MIDDLE scrolls.
 *
 * The header and the footer stay put, because a reset button that scrolls away
 * is a reset button you cannot find, and a heading that scrolls away loses you
 * the one word saying what you are adjusting.
 */
export function Panel({
  title,
  children,
  footer,
  onReset,
  resetLabel = 'Reset',
  resetDisabled = false,
  className,
}: {
  title?: string;
  children: ReactNode;
  /** Pinned under the scrolling middle: the actions this panel is for. */
  footer?: ReactNode;
  /** Shown beside the title when there is something to put back. */
  onReset?: () => void;
  resetLabel?: string;
  resetDisabled?: boolean;
  className?: string;
}) {
  return (
    <section
      aria-label={title ?? 'Settings'}
      // Full width where the panel lies down under the canvas on a phone, the
      // shared width where it stands beside it.
      className={cx('flex shrink-0 flex-col max-lg:w-full lg:w-[var(--panel-width)]', className)}
    >
      {title && (
        <PanelHeader title={title} onReset={onReset} resetLabel={resetLabel} resetDisabled={resetDisabled} />
      )}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ paddingLeft: 'var(--panel-pad)', paddingRight: 'var(--panel-pad)' }}
      >
        {children}
      </div>
      {footer && (
        <div
          className="shrink-0 border-t"
          style={{ borderColor: 'var(--studio-line)', padding: 'var(--panel-pad)' }}
        >
          {footer}
        </div>
      )}
    </section>
  );
}

/** The panel's name, and the way to put it back as it was. */
export function PanelHeader({
  title,
  onReset,
  resetLabel = 'Reset',
  resetDisabled = false,
}: {
  title: string;
  onReset?: () => void;
  resetLabel?: string;
  resetDisabled?: boolean;
}) {
  return (
    <header
      className="flex shrink-0 items-baseline justify-between gap-2"
      style={{ padding: 'var(--panel-pad)', paddingBottom: 'var(--space-2)' }}
    >
      <h3
        className="tracking-tight"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--studio-text-section)',
          color: 'var(--color-ink-900)',
        }}
      >
        {title}
      </h3>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          disabled={resetDisabled}
          className={cx(
            'shrink-0 rounded-[4px] px-1.5 py-0.5 text-[12px] transition-colors',
            resetDisabled ? 'cursor-not-allowed opacity-40' : 'hover:text-ink-900',
          )}
          style={{ color: 'var(--color-ink-500)' }}
        >
          {resetLabel}
        </button>
      )}
    </header>
  );
}

/**
 * A group of controls that belong together.
 *
 * `collapsible` is for the ones people reach for rarely: closed by default,
 * open on a press, and the heading is the button rather than a heading with a
 * button next to it. A panel where everything is equally prominent is a panel
 * where nothing is.
 */
export function PanelSection({
  title,
  children,
  collapsible = false,
  defaultOpen = false,
  note,
}: {
  title?: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** One short line under the heading, when the group needs a word of context. */
  note?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  if (!collapsible) {
    return (
      <section style={{ marginBottom: 'var(--panel-sectionGap)' }}>
        {title && <SectionLabel>{title}</SectionLabel>}
        {note && <SectionNote>{note}</SectionNote>}
        <div style={{ display: 'grid', gap: 'var(--panel-gap)' }}>{children}</div>
      </section>
    );
  }

  return (
    <section style={{ marginBottom: 'var(--panel-sectionGap)' }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((was) => !was)}
        className="flex w-full items-center justify-between gap-2 py-1 text-left transition-colors hover:text-ink-900"
      >
        <SectionLabel>{title}</SectionLabel>
        <span
          aria-hidden="true"
          className="shrink-0 transition-transform duration-[var(--motion-base)]"
          style={{ color: 'var(--color-ink-500)', transform: open ? 'rotate(90deg)' : 'none' }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M6 3.5L10.5 8L6 12.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && (
        <div id={bodyId} className="pt-2" style={{ display: 'grid', gap: 'var(--panel-gap)' }}>
          {note && <SectionNote>{note}</SectionNote>}
          {children}
        </div>
      )}
    </section>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mono-label block text-ink-500" style={{ fontSize: 10 }}>
      {children}
    </span>
  );
}

function SectionNote({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 mt-1 leading-snug" style={{ fontSize: 12, color: 'var(--color-ink-500)' }}>
      {children}
    </p>
  );
}

/**
 * One control: a label, its explanation one press away, and the control itself.
 *
 * The label is a `<span>` inside a `<label>` only when the control is a single
 * focusable thing; a slider plus a number is two, and wrapping both in one
 * label makes a click on the number move the slider. So the association is left
 * to the caller's own control, which already does it, and this is layout.
 *
 * `value` is the current reading, shown on the same line as the label where
 * there is room for it — which is where somebody looks when they are dragging.
 */
export function Control({
  label,
  hint,
  value,
  children,
  disabled = false,
  onReset,
}: {
  label: string;
  /** The explanation, behind an "i". One sentence; it is a tooltip, not a manual. */
  hint?: string;
  /** The current reading, if the control has one worth showing. */
  value?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  /** Put this one control back to its default. */
  onReset?: () => void;
}) {
  return (
    <div className={cx(disabled && 'pointer-events-none opacity-40')} data-control>
      <span className="mb-1.5 flex items-baseline gap-1.5">
        <span className="mono-label text-ink-900" style={{ fontSize: 10 }}>
          {label}
        </span>
        {hint && <Info label={label}>{hint}</Info>}
        <span className="ml-auto flex items-baseline gap-2">
          {value !== undefined && (
            <span className="mono-label tabular-nums text-ink-500" style={{ fontSize: 10 }}>
              {value}
            </span>
          )}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              title={`Put ${label.toLowerCase()} back`}
              className="rounded-[3px] px-1 text-[10px] text-ink-500 transition-colors hover:text-ink-900"
            >
              Reset
            </button>
          )}
        </span>
      </span>
      {children}
    </div>
  );
}

/**
 * The three things a panel has to be able to say when it has no controls to
 * show: nothing is selected, something is loading, something went wrong.
 *
 * One component rather than three, because they are the same shape and the
 * difference between them is a word and a tone.
 */
export function PanelState({
  kind,
  children,
}: {
  kind: 'empty' | 'loading' | 'error';
  children: ReactNode;
}) {
  if (kind === 'error') {
    return (
      <div className="py-2">
        <Notice level="error">{children}</Notice>
      </div>
    );
  }
  return (
    <p
      className="flex items-center gap-2 py-6 leading-snug"
      style={{ fontSize: 'var(--studio-text-body)', color: 'var(--color-ink-500)' }}
    >
      {kind === 'loading' && <Spinner />}
      {children}
    </p>
  );
}
