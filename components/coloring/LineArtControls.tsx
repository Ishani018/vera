'use client';

import type { ReactNode } from 'react';
import { Info, Slider, cx } from '../ui';
import { Control as PanelControl } from '../panel/Panel';
import { CHEQUER } from '../stickers/Thumb';

/**
 * The controls the line-art pipeline is driven by, in one place.
 *
 * Written for the colouring book and now used by the Sticker Studio as well.
 * Shared rather than copied because they are not really widgets — they are the
 * shape of an explanation: a name, a sentence saying what moving it does, and
 * then the control. Two copies would drift, and the sentence is the part that
 * matters most to someone who has never traced a drawing before.
 */

/**
 * A slider with a name, a sentence one press away, its reading, and a reset.
 *
 * This used to draw itself — a `font-[570]` label, an `Info`, a `Slider` — and
 * the Lab's panel drew the same thing in 10px uppercase mono. Two shapes for
 * one idea, on two tools that sit side by side in the same app. It is now the
 * shared `Control` from `components/panel`, so the Sticker Studio, the
 * colouring book's line art and the Lab all label a slider the same way.
 *
 * The signature is unchanged, because thirty-two call sites pass `value` and
 * `onChange` and renaming them would be churn rather than a change. What is
 * new is `defaultValue`: pass it and the control offers a Reset once it has
 * moved, which is the behaviour the shared panel gives every other slider.
 */
export function Control({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  defaultValue,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** What this slider started as. Omitted, no Reset is offered. */
  defaultValue?: number;
}) {
  const moved = defaultValue !== undefined && Math.round(value) !== Math.round(defaultValue);
  return (
    <PanelControl
      label={label}
      hint={hint}
      onReset={moved ? () => onChange(defaultValue) : undefined}
    >
      <Slider value={value} onChange={onChange} min={min} max={max} step={step} />
    </PanelControl>
  );
}

export type Choice<T extends string> = {
  value: T;
  label: string;
  note: string;
  /** The longer explanation, which belongs on the card rather than under it. */
  hint?: string;
  /**
   * A small picture of what this choice does to *your* picture.
   *
   * Three words about tracing are three words; the same three cards with the
   * actual result on each are a decision somebody can make by looking. Left
   * out, the card is a card.
   */
  preview?: string | null;
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
      {/* The title, and its sentence one press away in the (i). */}
      {title && (
        <span className="block font-[570]">
          {title}
          {typeof hint === 'string' && <Info label={title}>{hint}</Info>}
        </span>
      )}
      {hint && typeof hint !== 'string' && (
        <span className="mt-0.5 block text-[14px] text-ink-500">{hint}</span>
      )}
      {!title && typeof hint === 'string' && (
        <span className="block">
          <Info label="these">{hint}</Info>
        </span>
      )}
      <div
        className={cx(
          'mt-2 grid gap-2',
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
              'pop-chosen flex items-center gap-2.5 rounded-xl border-2 px-2.5 py-1.5 text-left',
              'transition-[transform,background-color,border-color] duration-[var(--motion-base)] ease-[var(--ease-out)]',
              choice.value === value
                ? 'border-accent-500 bg-accent-50'
                : 'border-ink-200 hover:border-ink-300',
            )}
          >
            {choice.preview !== undefined && (
              <span
                className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-200"
                style={CHEQUER}
              >
                {choice.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={choice.preview} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[9px] text-ink-500">…</span>
                )}
              </span>
            )}
            <span className="min-w-0">
              <span className="block text-[14px] font-[570]">{choice.label}</span>
              <span className="block truncate text-[12px] text-ink-500">{choice.note}</span>
            </span>
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
