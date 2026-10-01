'use client';

import type { ReactNode } from 'react';
import { Slider, cx } from '../ui';

/**
 * The controls the line-art pipeline is driven by, in one place.
 *
 * Written for the colouring book and now used by the Sticker Studio as well.
 * Shared rather than copied because they are not really widgets — they are the
 * shape of an explanation: a name, a sentence saying what moving it does, and
 * then the control. Two copies would drift, and the sentence is the part that
 * matters most to someone who has never traced a drawing before.
 */

/** A slider with a name and a sentence about what it does. */
export function Control({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <span className="block font-[570]">{label}</span>
      <span className="mt-0.5 block text-[14px] text-ink-500">{hint}</span>
      <div className="mt-3">
        <Slider value={value} onChange={onChange} min={min} max={max} step={step} />
      </div>
    </div>
  );
}

export type Choice<T extends string> = {
  value: T;
  label: string;
  note: string;
  /** The longer explanation, which belongs on the card rather than under it. */
  hint?: string;
};

/**
 * A row of big labelled cards, one of which is chosen.
 *
 * Cards rather than a dropdown because each option needs a sentence to be
 * choosable at all — "Already line art" means nothing without "cleaned up,
 * never traced" beside it — and a dropdown has nowhere to put that.
 */
export function ModeChoice<T extends string>({
  title,
  hint,
  value,
  choices,
  onChange,
  columns = 2,
  children,
}: {
  /** Left out when the panel it sits in already says where you are. */
  title?: string;
  hint?: ReactNode;
  value: T;
  choices: Array<Choice<T>>;
  onChange: (value: T) => void;
  /**
   * How many across. One is for a narrow panel: these cards are decided by the
   * sentence under each label, and three of them in three hundred pixels wraps
   * every one of those sentences into a column of single words.
   */
  columns?: 1 | 2 | 3;
  /** Anything to say once a particular choice has been made. */
  children?: ReactNode;
}) {
  return (
    <div>
      {title && <span className="block font-[570]">{title}</span>}
      {hint && <span className="mt-0.5 block text-[14px] text-ink-500">{hint}</span>}
      <div
        className={cx(
          'mt-3 grid gap-2.5',
          columns === 1 ? 'grid-cols-1' : columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
        )}
      >
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            title={choice.hint}
            aria-pressed={choice.value === value}
            onClick={() => onChange(choice.value)}
            className={cx(
              'rounded-xl border-2 px-3 py-3 text-left transition-colors',
              choice.value === value
                ? 'border-accent-500 bg-accent-50'
                : 'border-ink-200 hover:border-ink-300',
            )}
          >
            <span className="block text-[15px] font-[570]">{choice.label}</span>
            <span className="mt-0.5 block text-[13px] text-ink-500">{choice.note}</span>
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
