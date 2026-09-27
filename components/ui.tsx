'use client';

import { useId, useState, type ReactNode } from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function Field({
  label,
  hint,
  children,
  inline,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <label className={cx('block', inline && 'flex items-center justify-between gap-3')}>
      <span className="block font-[570] text-ink-900">{label}</span>
      {hint && !inline && (
        <span className="mt-0.5 block text-[14px] leading-snug text-ink-500">{hint}</span>
      )}
      <div className={cx(inline ? 'shrink-0' : 'mt-3')}>{children}</div>
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-ink-300 bg-paper px-3.5 py-3 text-[15.5px] text-ink-900 ' +
  'transition-colors hover:border-ink-400 focus:border-accent-500 focus:outline-none';

// ComponentPropsWithRef rather than the HTML attribute types: React 19 passes
// `ref` to function components as an ordinary prop, and the editor needs one on
// the body field to put the cursor back after wrapping a selection.
export function TextInput(props: React.ComponentPropsWithRef<'input'>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function TextArea(props: React.ComponentPropsWithRef<'textarea'>) {
  return <textarea {...props} className={cx(inputClass, 'resize-y leading-relaxed', props.className)} />;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cx(inputClass, 'cursor-pointer', className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * A number field that keeps what the user is typing intact. Committing on every
 * keystroke makes "0.5" impossible to type, because "0." parses to 0 and the
 * value snaps back under the cursor.
 */
export function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Number(value.toFixed(4)));

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw);
    setDraft(null);
    if (Number.isNaN(parsed)) return;
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onChange(next);
  };

  return (
    <div className={cx('relative', className)}>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className={cx(inputClass, suffix && 'pr-10')}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] text-ink-500">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 0.1,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-ink-200 accent-accent-500"
      />
      <span className="w-14 shrink-0 text-right tabular-nums text-[15px] text-ink-700">
        {Number(value.toFixed(2))}
      </span>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  /** For a switch that is on because another setting implies it. */
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** The real term, or what turning it on costs. */
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <label
        htmlFor={id}
        className={cx('min-w-0 select-none', disabled ? 'text-ink-500' : 'cursor-pointer')}
      >
        <span className="block font-[570] text-ink-900">{label}</span>
        {hint && <span className="mt-0.5 block text-[14px] leading-snug text-ink-500">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent-500' : 'bg-ink-300',
          disabled && 'opacity-60',
        )}
      >
        <span
          className={cx(
            'absolute top-[3px] h-6 w-6 rounded-full bg-paper shadow transition-transform',
            checked ? 'translate-x-[23px]' : 'translate-x-[3px]',
          )}
        />
      </button>
    </div>
  );
}

/**
 * A tray.
 *
 * Shut, it names itself and says what it is currently set to, so a mode at rest
 * is a short list of answers rather than a wall of controls — you open one to
 * change something, not to find out what it says.
 */
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
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-paper">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cx(
          'flex w-full items-center gap-3 px-5 py-4 text-left transition-colors',
          open ? 'border-b border-ink-200 bg-ink-100' : 'hover:bg-ink-50',
        )}
      >
        <span
          aria-hidden
          className={cx(
            'text-ink-500 transition-transform',
            open ? 'rotate-90' : '',
          )}
        >
          ›
        </span>
        <span className="flex-1 truncate text-[16.5px] font-semibold text-ink-900">{title}</span>
        {now !== undefined && (
          <span className="shrink-0 truncate whitespace-nowrap text-right text-[14.5px] text-ink-500">
            {now}
          </span>
        )}
      </button>
      {open && (
        <div
          className="flex flex-col gap-6 px-5 pb-6 pt-5"
          onChangeCapture={onAnyChange}
          onClickCapture={onAnyChange}
        >
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * A row of choices that scrolls sideways.
 *
 * A page shape or a typeface is something you look at, so it gets a card big
 * enough to look at and the row scrolls — rather than three of them shrunk
 * until they all fit the panel. It bleeds past the panel padding so the next
 * card is half-visible, which is what says there is more.
 */
export function Scroller({ children }: { children: ReactNode }) {
  return (
    <div className="relative -mx-5">
      <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5 pb-3 pt-1">
        {children}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 bottom-3 w-6 bg-gradient-to-l from-paper" />
    </div>
  );
}

/** One card in a Scroller: a picture of the choice, with its name under it. */
export function Choice({
  selected,
  onSelect,
  caption,
  note,
  children,
  wide,
}: {
  selected: boolean;
  onSelect: () => void;
  caption: string;
  note?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        'flex shrink-0 snap-start flex-col items-center gap-3 rounded-2xl border-2 p-3 pb-2.5 text-center transition-colors',
        wide ? 'w-[138px]' : 'w-[112px]',
        selected
          ? 'border-accent-500 bg-accent-50'
          : 'border-ink-200 hover:border-ink-300',
      )}
    >
      <span className="flex min-h-[70px] items-center justify-center">{children}</span>
      <span className="text-[14px] font-[570] tabular-nums leading-tight">{caption}</span>
      {note && <span className="-mt-2 text-[12.5px] text-ink-500">{note}</span>}
    </button>
  );
}

export function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 shrink-0"
      />
      <TextInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="font-mono text-[11px] uppercase"
      />
    </div>
  );
}

export function Button({
  variant = 'default',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
}) {
  const variants = {
    default: 'border border-ink-300 bg-paper hover:bg-ink-50 hover:border-ink-400',
    primary: 'border border-accent-500 bg-accent-500 text-paper font-semibold hover:bg-accent-600',
    ghost: 'border border-transparent text-ink-500 hover:bg-ink-100 hover:text-ink-900',
    danger: 'border border-red-200 bg-paper text-red-700 hover:bg-red-50',
  };
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-[550]',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        variants[variant],
        className,
      )}
    />
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; title?: string }>;
}) {
  return (
    <div className="inline-flex rounded-xl bg-ink-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-lg px-4 py-2 text-[15px] font-[550] transition-colors',
            value === o.value
              ? 'bg-paper text-ink-900 shadow-[0_1px_4px_rgba(0,0,0,0.12)]'
              : 'text-ink-500 hover:text-ink-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Accordion({
  title,
  description,
  open,
  onToggle,
  badge,
  onAnyChange,
  children,
}: {
  title: string;
  /** One line saying what this section does, so a collapsed heading is not a riddle. */
  description?: string;
  open: boolean;
  onToggle: () => void;
  badge?: ReactNode;
  /**
   * Fired when any control inside changes. Used to flash the part of the
   * preview this section governs — captured rather than wired per control, so
   * adding a control never means remembering to wire it.
   */
  onAnyChange?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-ink-200">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-ink-50"
      >
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className={cx(
            'mt-0.5 h-3 w-3 shrink-0 text-ink-500 transition-transform',
            open && 'rotate-90',
          )}
        >
          <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-700">
            {title}
          </span>
          {description && (
            <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">
              {description}
            </span>
          )}
        </span>
        {badge}
      </button>
      {open && (
        <div
          className="space-y-3 px-3.5 pb-4 pt-0.5"
          onChangeCapture={onAnyChange}
          onInputCapture={onAnyChange}
          onClickCapture={onAnyChange}
        >
          {children}
        </div>
      )}
    </section>
  );
}

export function Notice({
  level,
  children,
}: {
  level: 'error' | 'warning' | 'info' | 'ok';
  children: ReactNode;
}) {
  const styles = {
    error: 'border-red-500/40 bg-red-500/10 text-red-200',
    warning: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
    info: 'border-ink-300 bg-ink-50 text-ink-700',
    ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
  };
  return <div className={cx('rounded-md border px-2.5 py-2 text-[12px]', styles[level])}>{children}</div>;
}
