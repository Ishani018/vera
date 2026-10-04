'use client';

import { useEffect, useState } from 'react';
import type { SmartProgress as Progress } from '@/lib/lab/smart';
import { Button, cx } from '../ui';

/**
 * Where a Smart redraw has got to, over the canvas, with a way out.
 *
 * It takes a minute and a half or more, and the one thing worse than waiting
 * that long is waiting without being told anything. So it says which step it
 * is on, counts the real steps of the slowest one (the image model reports
 * "step 2 of 4"), keeps a clock, and has a Cancel that really cancels: the
 * helper treats a closed connection as "stop".
 *
 * The bar is an ESTIMATE and is labelled as one. The steps are real; how long
 * each takes is averaged from timed runs, so the bar can sit still for a while
 * inside a step. That is why the clock and the step count are there as well.
 */
const STEPS: Array<{ id: Progress['stage']; label: string }> = [
  { id: 'cutout', label: 'Cutting out the subject' },
  { id: 'analyse', label: 'Looking at it' },
  { id: 'redraw', label: 'Redrawing' },
  { id: 'vector', label: 'Tracing the lines' },
];

const ORDER = ['queued', 'start', 'cutout', 'analyse', 'redraw', 'retry', 'vector'];

export function SmartProgress({
  progress,
  startedAt,
  onCancel,
}: {
  progress: Progress | null;
  startedAt: number;
  onCancel: () => void;
}) {
  // The clock is counted here, once a second, so it moves even while the helper is quiet.
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const here = progress ? ORDER.indexOf(progress.stage === 'retry' ? 'redraw' : progress.stage) : -1;
  const pct = Math.round((progress?.pct ?? 0) * 100);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div
      className="absolute inset-0 z-20 grid place-items-center p-4"
      style={{ background: 'color-mix(in srgb, var(--color-paper-50) 84%, transparent)' }}
    >
      <div
        role="status"
        aria-live="polite"
        aria-label="Smart redraw progress"
        className="plate w-full max-w-[340px] rounded-[8px] bg-paper-100 p-4"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17 }}>Smart redraw</h3>
          <span className="mono-label text-ink-500" style={{ fontSize: 11 }} aria-label={`${seconds} seconds so far`}>
            {clock}
          </span>
        </div>
        {progress?.subject && (
          <p className="mono-label mt-0.5 truncate text-ink-500" style={{ fontSize: 10 }}>
            {progress.subject}
          </p>
        )}

        <ol className="mt-3 flex flex-col gap-1.5">
          {STEPS.map((step) => {
            const at = ORDER.indexOf(step.id);
            const done = here > at || (here === at && progress?.state === 'done');
            const current = here === at && !done;
            return (
              <li
                key={step.id}
                aria-current={current ? 'step' : undefined}
                className={cx('flex items-center gap-2 text-[13px]', done || current ? 'text-ink-900' : 'text-ink-500')}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    'grid size-[14px] shrink-0 place-items-center rounded-full border text-[9px] leading-none',
                    done && 'border-accentb-500 bg-accentb-500',
                    current && 'border-accentb-500',
                    !done && !current && 'border-ink-300',
                  )}
                  style={done ? { color: 'var(--color-sheet)' } : undefined}
                >
                  {done ? '✓' : current ? <span className="block size-1.5 animate-pulse rounded-full bg-accentb-500" /> : null}
                </span>
                <span>
                  {step.label}
                  {step.id === 'redraw' && current && progress?.step && progress.of
                    ? `, step ${progress.step} of ${progress.of}`
                    : ''}
                </span>
              </li>
            );
          })}
        </ol>

        {progress?.stage === 'retry' && (
          <p className="mt-2 text-[12px] text-ink-700">The first try missed the outline. Trying once more.</p>
        )}

        <div className="mt-3">
          <div
            className="h-1.5 overflow-hidden rounded-full"
            style={{ background: 'var(--color-paper-200)' }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Estimated progress"
          >
            <div className="h-full rounded-full bg-accentb-500 transition-[width] duration-[var(--motion-slow)]" style={{ width: `${Math.max(3, pct)}%` }} />
          </div>
          <p className="mono-label mt-1 text-ink-500" style={{ fontSize: 10 }}>
            Estimate. Usually about 90 seconds.
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="mono-label text-ink-500" style={{ fontSize: 10 }}>
            Runs on this Mac only
          </p>
          <Button variant="accent-outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
