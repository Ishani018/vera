'use client';

import type { ReactNode } from 'react';
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
  hint,
  now,
  onToggle,
}: {
  title?: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** One short line under the heading, when the group needs a word of context. */
  note?: string;
  /**
   * The same thing as `note`, but behind an "i" on the heading.
   *
   * Preferred. A panel of five groups each with a visible line of prose is a
   * panel nobody reads twice; one press is enough for a sentence somebody
   * needs once.
   */
  hint?: string;
  /**
   * What this group currently says, shown on the heading while it is SHUT.
   *
   * From the poetry book's trays, which had it and the rest of the app did
   * not: "Type — 11.5pt" tells you the answer without opening anything, and a
   * panel of five shut groups becomes a summary of the whole book rather than
   * five doors. Only meaningful with `collapsible`.
   */
  now?: ReactNode;
  /** Called when a collapsible group is opened or shut, for a caller that remembers. */
  onToggle?: (open: boolean) => void;
}) {
  const body = (
    <>
      {note && <SectionNote>{note}</SectionNote>}
      <div style={{ display: 'grid', gap: 'var(--panel-gap)' }}>{children}</div>
    </>
  );

  if (!collapsible) {
    return (
      <section style={{ marginBottom: 'var(--panel-sectionGap)' }}>
        {title && (
          <SectionLabel hint={hint} label={title}>
            {title}
          </SectionLabel>
        )}
        {title && <span className="block h-2" aria-hidden="true" />}
        {body}
      </section>
    );
  }

  /*
    `<details>` rather than a button and a piece of state.

    It is open to the keyboard without any work, the browser's own
    find-on-page opens it to reach a control inside, and it needs no
    JavaScript. The Sticker Studio's old `Advanced` was already a `<details>`
    for exactly those reasons, and replacing it with a button would have been
    a quiet accessibility regression dressed up as consistency.
  */
  return (
    <details
      className="group"
      open={defaultOpen}
      style={{ marginBottom: 'var(--panel-sectionGap)' }}
    >
      <summary
        onClick={onToggle ? (event) => onToggle(!(event.currentTarget.parentElement as HTMLDetailsElement).open) : undefined}
        className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 transition-colors hover:text-ink-900"
      >
        <SectionLabel hint={hint} label={title}>
          {title}
        </SectionLabel>
        {now !== undefined && (
          <span
            className="ml-auto mr-1 truncate text-right"
            style={{ fontSize: 'var(--studio-text-caption)', color: 'var(--color-ink-500)' }}
          >
            {/* Only while shut: once it is open the controls themselves say it,
                and two readings of one thing is one too many. */}
            <span className="group-open:hidden">{now}</span>
          </span>
        )}
        <span
          aria-hidden="true"
          className="shrink-0 transition-transform duration-[var(--motion-base)] group-open:rotate-90"
          style={{ color: 'var(--color-ink-500)' }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M6 3.5L10.5 8L6 12.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <div className="pt-2">{body}</div>
    </details>
  );
}

/**
 * A section's name, on its own.
 *
 * Exported for the few places whose section is not a stack of controls — a
 * table of page counts, a list of warnings — and so cannot be a
 * `PanelSection`, but should still be headed the same way as one.
 */
export function SectionHeading({ children }: { children: ReactNode }) {
  return <SectionLabel>{children}</SectionLabel>;
}

function SectionLabel({
  children,
  hint,
  label,
}: {
  children: ReactNode;
  hint?: string;
  label?: string;
}) {
  return (
    <span className="mono-label text-ink-500" style={{ fontSize: 10 }}>
      {children}
      {hint && <Info label={label ?? 'this group'}>{hint}</Info>}
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
      <ControlLabel label={label} hint={hint} value={value} onReset={onReset} />
      {children}
    </div>
  );
}

/**
 * A control's label row on its own: the name, its "i", its reading, its reset.
 *
 * Exported for the handful of places whose control is already wrapped in its
 * own markup and cannot become a `Control` without restructuring the JSX around
 * it. Using this keeps them on one definition of what a label is instead of
 * copying the classes.
 */
export function ControlLabel({
  label,
  hint,
  value,
  onReset,
}: {
  label: ReactNode;
  hint?: string;
  value?: ReactNode;
  onReset?: () => void;
}) {
  const named = typeof label === 'string' ? label : 'this';
  return (
    <span className="mb-1.5 flex items-baseline gap-1.5">
      <span className="mono-label text-ink-900" style={{ fontSize: 10 }}>
        {label}
      </span>
      {hint && <Info label={named}>{hint}</Info>}
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
            title={`Put ${named.toLowerCase()} back`}
            className="rounded-[3px] px-1 text-[10px] text-ink-500 transition-colors hover:text-ink-900"
          >
            Reset
          </button>
        )}
      </span>
    </span>
  );
}

/**
 * One control whose label is the `<label>` itself.
 *
 * `Control` is deliberately a `<div>`: a slider plus its number box is two
 * focusable things, and wrapping both in one `<label>` makes a click on the
 * number drag the slider. But most of the poetry book's fields are a single
 * input, and there the wrapping label is what makes the name clickable and what
 * a screen reader reads out with the value. Losing that in the name of
 * consistency would be a regression dressed up as tidying, so this variant
 * keeps the wrapper and takes the shared label row.
 */
export function PanelField({
  label,
  hint,
  children,
  inline = false,
}: {
  label: string;
  /** The explanation, behind an "i". One sentence; it is a tooltip, not a manual. */
  hint?: string;
  children: ReactNode;
  /** Name on the left, control on the right: for a toggle or a short number. */
  inline?: boolean;
}) {
  if (inline) {
    return (
      <label className="flex items-center justify-between gap-3" data-control>
        <span className="mono-label text-ink-900" style={{ fontSize: 10 }}>
          {label}
          {hint && <Info label={label}>{hint}</Info>}
        </span>
        <span className="shrink-0">{children}</span>
      </label>
    );
  }
  return (
    <label className="block" data-control>
      <ControlLabel label={label} hint={hint} />
      {children}
    </label>
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

export function Tray({
  title,
  now,
  children,
  open,
  onToggle,
  onAnyChange,
}: {
  title: string;
  /** The current value, shown on the shut header. */
  now?: ReactNode;
  children: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Flashes what this tray governs in the preview when anything inside changes. */
  onAnyChange?: () => void;
}) {
  /*
    The poetry book's trays, on the shared `PanelSection`.

    They used to be their own thing: a rounded, bordered card with a 16.5px
    bold heading and a tinted bar when open. Three of those stacked inside a
    panel that already has a border is three nested containers to say "these
    controls belong together", which space says on its own — and the heading
    was a fourth size of heading in an app that now has one.

    What this pattern had and the shared one did not is the CURRENT VALUE on the
    shut header: "Type — 11.5pt" answers the question without opening anything.
    That moved into `PanelSection` as `now` rather than being lost, so the
    poetry book keeps what was good about its trays and drops what was only
    different.

    `open` stays controlled by the caller, because the book editor keeps which
    tray is open in its store so that it survives changing mode.
  */
  return (
    <PanelSection
      title={title}
      now={now}
      collapsible
      defaultOpen={open}
      onToggle={onToggle}
    >
      <div onChangeCapture={onAnyChange} onClickCapture={onAnyChange} className="contents">
        {children}
      </div>
    </PanelSection>
  );
}
