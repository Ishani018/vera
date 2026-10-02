'use client';

import { SWITCH, switchReach, switchTravel } from '@/lib/switch';

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * The (i) that holds an explanation.
 *
 * A panel full of paragraphs is a panel nobody reads: the words are in the way
 * of the controls they describe, and every one of them is read once and then
 * skipped for ever. So the sentence goes in here, where it is one press away
 * at the moment somebody wants it.
 *
 * A real button with a `title`, not a hover-only tooltip: the browser's own
 * tooltip is reachable by keyboard and read by a screen reader, and pressing it
 * on a touch screen shows the same words in a line under the label. Nothing is
 * hidden from anybody — it is only out of the way.
 */
export function Info({ children, label }: { children: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title={children}
        aria-label={label ? `About ${label}` : 'What this does'}
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className={cx(
          'ml-1 inline-grid size-[15px] shrink-0 translate-y-[1px] place-items-center rounded-full',
          'border border-ink-300 text-[10px] font-[600] leading-none text-ink-500',
          'transition-colors duration-[--motion-fast] hover:border-accent-500 hover:text-accent-500',
          open && 'border-accent-500 bg-accent-50 text-accent-600',
        )}
      >
        i
      </button>
      {open && (
        <span className="mt-1 block text-[12px] leading-snug text-ink-500">{children}</span>
      )}
    </>
  );
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

/*
  Every field, one class. The look is `.field` in app/surfaces.css — a hairline,
  an inset shadow so it reads as a hole rather than a plate, and a ring on focus
  that is three pixels of the accent at 18% rather than a hard outline.

  The padding and the type size stay as utilities and stay as they were: they
  decide how tall a row of controls is, and the board is measured from what the
  chrome leaves behind.
*/
const inputClass = 'field w-full px-3.5 py-3 text-[15.5px] text-ink-900';

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

/**
 * Whether a control is being dragged right now.
 *
 * A slider fires a change for every pixel of a drag, and the difference between
 * the ones in the middle of a gesture and the one at the end is what the
 * preview can be fast and rough about. Sliders announce the gesture through a
 * context rather than a prop so that no caller has to thread a pair of
 * callbacks through every control it owns; where nothing is listening, this
 * costs nothing and changes nothing.
 */
const Sliding = createContext<{ begin: () => void; end: () => void } | null>(null);

export function WhileSliding({
  onChange,
  children,
}: {
  onChange: (sliding: boolean) => void;
  children: ReactNode;
}) {
  // Counted rather than flagged: a keyboard repeat can begin a second gesture
  // before the first has ended, and a flag would end both at the first release.
  const depth = useRef(0);
  const announce = useRef(onChange);
  announce.current = onChange;
  const value = useMemo(
    () => ({
      begin: () => {
        depth.current += 1;
        if (depth.current === 1) announce.current(true);
      },
      end: () => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) announce.current(false);
      },
    }),
    [],
  );
  // A gesture that was still in hand when this unmounted must not leave the
  // page believing a control is being dragged for ever.
  useEffect(() => () => announce.current(false), []);
  return <Sliding.Provider value={value}>{children}</Sliding.Provider>;
}

/** A spinner, for the places where a word would be too much furniture. */
export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="animate-spin"
      style={{ animationDuration: '900ms' }}
    >
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M8 1.5A6.5 6.5 0 0 1 14.5 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 0.1,
  format,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** How the number beside it reads — "6.5 mm" rather than 13. */
  format?: (value: number) => string;
}) {
  const sliding = useContext(Sliding);
  const held = useRef(false);

  /**
   * The gesture, start and end.
   *
   * The release is listened for on the window rather than on the input: a drag
   * that ends with the pointer outside the track — which is most of them —
   * never sends the input a pointerup at all, and the preview would stay in its
   * rough state until the next change.
   */
  const begin = () => {
    if (!sliding || held.current) return;
    held.current = true;
    sliding.begin();
    const done = () => {
      held.current = false;
      sliding.end();
      window.removeEventListener('pointerup', done);
      window.removeEventListener('pointercancel', done);
    };
    window.addEventListener('pointerup', done);
    window.addEventListener('pointercancel', done);
  };

  // Unmounting mid-drag would otherwise leave the count raised for ever.
  useEffect(() => () => {
    if (held.current) sliding?.end();
  }, [sliding]);

  /*
    Where the thumb is, as a fraction — so the bubble over it can be put in the
    right place with a transform rather than by measuring anything.
  */
  const along = max > min ? (value - min) / (max - min) : 0;

  return (
    <div className="has-bubble flex items-center gap-2.5">
      <span className="relative flex-1">
        <span
          className="tip value-bubble"
          aria-hidden="true"
          style={{ '--at': `calc(${along} * (100% - 18px) + 9px)` } as React.CSSProperties}
        >
          {format ? format(value) : Number(value.toFixed(2))}
        </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={begin}
        // An arrow key is a gesture too: held down it repeats as fast as a
        // drag, and it ends on the key going up.
        onKeyDown={(e) => {
          if (e.key.startsWith('Arrow') || e.key === 'PageUp' || e.key === 'PageDown') begin();
        }}
        onKeyUp={() => {
          if (held.current) {
            held.current = false;
            sliding?.end();
          }
        }}
        onBlur={() => {
          if (held.current) {
            held.current = false;
            sliding?.end();
          }
        }}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-200 accent-accent-500"
      />
      </span>
      <span className="w-[4.5rem] shrink-0 text-right tabular-nums text-[14px] text-ink-700">
        {format ? format(value) : Number(value.toFixed(2))}
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
      {/*
        The label stays short and the explanation moves into the (i) beside it.
        A switch with two lines of prose under it is a switch somebody has to
        read past every time they come back to the panel.
      */}
      <span className={cx('min-w-0 select-none', disabled ? 'text-ink-500' : '')}>
        <label htmlFor={id} className={cx('font-[570] text-ink-900', !disabled && 'cursor-pointer')}>
          {label}
        </label>
        {hint && <Info label={label}>{hint}</Info>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={
          {
            width: SWITCH.trackWidth,
            height: SWITCH.trackHeight,
            '--reach': `${-switchReach()}px`,
          } as React.CSSProperties
        }
        className={cx(
          'relative shrink-0 rounded-full transition-colors duration-[--motion-base]',
          // The track is shorter than a finger. A pseudo-element reaches out to
          // a proper target without making the switch look like a slab.
          "before:absolute before:inset-x-0 before:content-['']",
          'before:top-[var(--reach)] before:bottom-[var(--reach)]',
          checked ? 'bg-accent-500' : 'bg-ink-300',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        )}
      >
        <span
          data-switch-knob
          style={{
            width: SWITCH.knob,
            height: SWITCH.knob,
            top: SWITCH.inset,
            // Said from the left edge, which is the whole of the fix.
            left: SWITCH.inset,
            translate: `${checked ? switchTravel() : 0}px 0`,
          }}
          // `translate` rather than `transform`, so this transitions what it
          // actually sets. Reduced motion is handled once, in globals.css.
          // A gentle spring: it overshoots a hair and settles, which is what a
          // switch does. The travel is still the same number of pixels, so the
          // knob cannot leave the track — `tests/switch.test.mjs` holds that.
          className="absolute rounded-full bg-paper shadow-[--shadow-raised] transition-[translate] duration-[--motion-slow] ease-[--ease-spring]"
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
        'flex shrink-0 snap-start flex-col items-center gap-3 rounded-2xl border-2 p-3 pb-2.5 text-center',
        'transition-[transform,background-color,border-color,box-shadow] duration-[--motion-base] ease-[--ease-out]',
        'hover:-translate-y-0.5 active:scale-[0.98]',
        wide ? 'w-[138px]' : 'w-[112px]',
        selected
          ? 'border-accent-500 bg-accent-50 shadow-[--shadow-raised]'
          : 'border-ink-200 hover:border-ink-300 hover:shadow-[--shadow-rest]',
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
  variant?: 'default' | 'primary' | 'create' | 'ghost' | 'danger';
}) {
  /*
    The look lives in `app/surfaces.css`; this names which one. The padding and
    the type size stay here and stay as they were, because the header's height
    is the tallest thing in it and the board's size is measured from what is
    left over.
  */
  return (
    <button
      type="button"
      {...props}
      className={cx('btn', `btn-${variant}`, 'px-4 py-2.5 text-[15px]', className)}
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
            'rounded-lg px-4 py-2 text-[15px] font-[550]',
            'transition-[transform,background-color,color,box-shadow] duration-[--motion-base] ease-[--ease-out]',
            'active:scale-[0.98]',
            value === o.value
              ? 'bg-paper text-ink-900 shadow-[--shadow-raised]'
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
  // Written for a light page: the palette was reversed in the re-skin and these
  // were still carrying pale text meant for a dark one.
  /*
    The palette's own roles rather than Tailwind's reds and greens: a notice
    that stayed the same four colours in every theme would be the one part of
    the screen that had not been themed.
  */
  const styles = {
    error: 'border-clay-500/40 bg-clay-50 text-clay-600',
    warning: 'border-sun-500/50 bg-sun-50 text-sun-600',
    info: 'border-ink-200 bg-ink-100 text-ink-700',
    ok: 'border-sage-500/40 bg-sage-50 text-sage-600',
  };
  return (
    <div className={cx('rounded-lg border px-3 py-2 text-[13px] leading-relaxed', styles[level])}>
      {children}
    </div>
  );
}
