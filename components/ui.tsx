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
      <span className="block text-[11px] font-medium uppercase tracking-wider text-ink-400">
        {label}
      </span>
      <div className={cx(inline ? 'shrink-0' : 'mt-1.5')}>{children}</div>
      {hint && !inline && <span className="mt-1 block text-[11px] text-ink-400">{hint}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-md border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-ink-200 ' +
  'transition-colors hover:border-ink-600 focus:border-brass-500 focus:outline-none';

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
        className={cx(inputClass, suffix && 'pr-8')}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-400">
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
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-brass-500"
      />
      <span className="w-11 shrink-0 text-right tabular-nums text-[11px] text-ink-300">
        {Number(value.toFixed(2))}
      </span>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  /** For a switch that is on because another setting implies it. */
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <label
        htmlFor={id}
        className={cx('select-none text-ink-200', disabled ? 'text-ink-400' : 'cursor-pointer')}
      >
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brass-500' : 'bg-ink-700',
          disabled && 'opacity-60',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-4 w-4 rounded-full bg-ink-950 transition-transform',
            checked ? 'translate-x-4.5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
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
    default: 'border border-ink-700 bg-ink-800 hover:bg-ink-700',
    primary: 'border border-brass-500 bg-brass-500 text-ink-950 font-medium hover:bg-brass-400',
    ghost: 'border border-transparent hover:bg-ink-800',
    danger: 'border border-ink-700 bg-ink-800 text-red-300 hover:border-red-500/60 hover:bg-red-500/10',
  };
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5',
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
    <div className="inline-flex rounded-md border border-ink-700 bg-ink-900 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded px-2.5 py-1 transition-colors',
            value === o.value ? 'bg-ink-700 text-ink-200' : 'text-ink-400 hover:text-ink-200',
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
    <section className="border-b border-ink-800">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-ink-850"
      >
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className={cx(
            'mt-0.5 h-3 w-3 shrink-0 text-ink-400 transition-transform',
            open && 'rotate-90',
          )}
        >
          <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-300">
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
    info: 'border-ink-700 bg-ink-850 text-ink-300',
    ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
  };
  return <div className={cx('rounded-md border px-2.5 py-2 text-[12px]', styles[level])}>{children}</div>;
}
