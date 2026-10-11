'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { poemsOf } from '@/lib/contents';
import { useStore } from '@/lib/store';
import { Button, cx } from './ui';

/**
 * The first-run walkthrough.
 *
 * It does not block anything and it does not point at pixels — a tour that
 * covers the screen in cut-outs is worse than the confusion it replaces. It
 * sits in a corner, says what the next move is, opens the panel that move needs,
 * and ticks itself off when it can tell the step is done.
 *
 * Progress lives in localStorage, not in the project: it is about this person
 * learning the app once, not about the book.
 */

const STORAGE_KEY = 'versecraft:walkthrough';

type Step = {
  id: string;
  title: string;
  body: string;
  /** Settings panel to open when the step becomes current. */
  panel?: string;
  action?: { label: string; run: (helpers: Helpers) => void };
};

type Helpers = {
  openImport: () => void;
  setPanel: (panel: string) => void;
};

const STEPS: Step[] = [
  {
    id: 'import',
    title: 'Bring your poems in',
    body: 'Import drops a folder of .docx, .txt or .md straight in — one poem per file keeps each filename as its title. Or paste a whole manuscript and split it on a delimiter.',
    action: { label: 'Open import', run: (h) => h.openImport() },
  },
  {
    id: 'trim',
    title: 'Choose the page size',
    body: 'Trim decides everything else, and changing it later reflows the whole book. 5.5 × 8.5 and 6 × 9 are the poetry standards. Paper stock sets the spine width for the cover.',
    panel: 'trim',
  },
  {
    id: 'type',
    title: 'Set the type',
    body: 'A serif around 11pt on generous leading is where poetry usually wants to be. Every setting flashes the part of the book it changes, so you can see what it did.',
    panel: 'type',
  },
  {
    id: 'preview',
    title: 'Read the proof',
    body: 'The middle pane is the real book, paginated the same way the PDF will be. Turn pages with ← and →, switch to Grid to see the whole shape, and use the guides to check margins.',
  },
  {
    id: 'export',
    title: 'Export for KDP',
    body: 'Two PDFs: the interior and the wraparound cover. The panel checks page parity, margins and image resolution first, and lists anything worth fixing.',
    panel: 'export',
  },
];

type Progress = { step: number; dismissed: boolean };

function readProgress(): Progress {
  if (typeof window === 'undefined') return { step: 0, dismissed: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { step: 0, dismissed: false };
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return {
      step: Math.min(Math.max(parsed.step ?? 0, 0), STEPS.length - 1),
      dismissed: Boolean(parsed.dismissed),
    };
  } catch {
    return { step: 0, dismissed: false };
  }
}

function writeProgress(progress: Progress) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* a private window just gets the walkthrough again next time */
  }
}

export function useWalkthrough() {
  const [progress, setProgress] = useState<Progress>({ step: 0, dismissed: true });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProgress(readProgress());
    setHydrated(true);
  }, []);

  const update = useCallback((next: Progress) => {
    setProgress(next);
    writeProgress(next);
  }, []);

  return { progress, hydrated, update };
}

export function Walkthrough({
  progress,
  hydrated,
  update,
  onOpenImport,
}: ReturnType<typeof useWalkthrough> & { onOpenImport: () => void }) {
  const project = useStore((s) => s.project);
  const setPanel = useStore((s) => s.setPanel);
  const pageCount = useStore((s) => s.pageCount);

  const poemCount = project ? poemsOf(project).length : 0;
  const step = STEPS[progress.step];

  const helpers = useMemo<Helpers>(
    () => ({ openImport: onOpenImport, setPanel: (panel) => setPanel(panel) }),
    [onOpenImport, setPanel],
  );

  // Opening the panel a step is about is the whole point of the step.
  useEffect(() => {
    if (progress.dismissed || !step?.panel) return;
    setPanel(step.panel);
  }, [progress.dismissed, step, setPanel]);

  /** The import step can tell when it is finished; the rest cannot. */
  useEffect(() => {
    if (progress.dismissed) return;
    if (STEPS[progress.step]?.id === 'import' && poemCount > 0) {
      update({ ...progress, step: 1 });
    }
  }, [poemCount, progress, update]);

  if (!hydrated || progress.dismissed || !step) return null;

  const isLast = progress.step === STEPS.length - 1;

  return (
    <aside
      aria-label="Getting started"
      className="pointer-events-auto fixed bottom-4 left-4 z-40 w-80 rounded-xl border border-accent-500/40 bg-[color-mix(in_srgb,var(--studio-card)_97%,transparent)] p-3.5 shadow-2xl backdrop-blur"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-600">
          Getting started
        </span>
        <span className="text-[10px] tabular-nums text-ink-500">
          {progress.step + 1} of {STEPS.length}
        </span>
        <button
          type="button"
          onClick={() => update({ ...progress, dismissed: true })}
          aria-label="Dismiss the walkthrough"
          // The one control that dismisses this thing, so it gets a real target.
          className="ml-auto grid size-8 place-items-center rounded text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          ✕
        </button>
      </div>

      <h3 className="text-[13px] font-semibold text-ink-900">{step.title}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-700">{step.body}</p>

      {step.id === 'preview' && pageCount > 0 && (
        <p className="mt-1.5 text-[11px] text-ink-500">
          {pageCount} pages laid out so far.
        </p>
      )}

      <div className="mt-3 flex items-center gap-1.5">
        {step.action && (
          <Button variant="primary" onClick={() => step.action!.run(helpers)}>
            {step.action.label}
          </Button>
        )}
        <Button
          onClick={() =>
            isLast
              ? update({ step: 0, dismissed: true })
              : update({ ...progress, step: progress.step + 1 })
          }
        >
          {isLast ? 'Finish' : 'Next'}
        </Button>
        {progress.step > 0 && (
          <Button
            variant="ghost"
            onClick={() => update({ ...progress, step: progress.step - 1 })}
            aria-label="Previous step"
          >
            ←
          </Button>
        )}
        <span className="ml-auto flex gap-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={cx(
                'h-1 w-4 rounded-full transition-colors',
                i === progress.step ? 'bg-accent-500' : i < progress.step ? 'bg-ink-300' : 'bg-ink-100',
              )}
            />
          ))}
        </span>
      </div>
    </aside>
  );
}
