'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  CUSTOM_ID,
  CUSTOM_KEY,
  DEFAULT_THEME,
  PALETTES,
  THEME_KEY,
  type Palette,
} from '@/lib/theme';
import { cx } from './ui';
import { recordUsageAction } from '@/lib/usageGate';

/**
 * Choosing the palette, from the top bar.
 *
 * The button carries a dot in the palette's own primary, so the control shows
 * its own state rather than needing a label that says which one is on. The
 * popover is a card per palette: a strip of sidebar, a page with a line of
 * text on it, and the accent button — the three things that actually differ,
 * at the size you can judge them at.
 *
 * Applying is instant and local. `data-theme` on the root is all it takes,
 * because every colour in the app is a variable that attribute redefines; there
 * is no reload, no server round trip, and nothing about a palette ever reaches
 * a file somebody keeps.
 */

/** What a palette looks like, without having to read `lib/theme.ts` to know. */
function Swatch({ palette, size = 14 }: { palette: Palette; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-[3px] border border-ink-300"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${palette.accentA500} 0 50%, ${palette.accentB500} 50% 100%)`,
      }}
    />
  );
}

/** The little picture of a palette on its card: sidebar, page, button. */
function Preview({ palette }: { palette: Palette }) {
  const sidebar =
    palette.sidebarStyle === 'dark'
      ? palette.isDark
        ? palette.outline
        : palette.ink900
      : palette.paper200;
  const navLabel =
    palette.sidebarStyle === 'dark'
      ? palette.isDark
        ? palette.ink900
        : palette.paper50
      : palette.ink900;
  const onAccent = palette.textOnAccentA === 'ink' ? palette.outline : palette.sheet;
  return (
    <span
      aria-hidden="true"
      className="flex h-[54px] w-full overflow-hidden rounded-[3px] border border-ink-300"
      style={{ background: palette.paper50 }}
    >
      <span className="flex w-[26px] shrink-0 flex-col gap-[3px] p-[5px]" style={{ background: sidebar }}>
        <span className="block h-[3px] w-full rounded-[1px]" style={{ background: navLabel, opacity: 0.9 }} />
        <span className="block h-[3px] w-3/4 rounded-[1px]" style={{ background: navLabel, opacity: 0.45 }} />
        <span className="block h-[3px] w-3/4 rounded-[1px]" style={{ background: navLabel, opacity: 0.45 }} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-between p-[6px]">
        <span className="flex flex-col gap-[3px]">
          <span className="block h-[4px] w-4/5 rounded-[1px]" style={{ background: palette.ink900 }} />
          <span className="block h-[3px] w-3/5 rounded-[1px]" style={{ background: palette.ink500 }} />
        </span>
        <span className="flex items-center gap-[4px]">
          <span
            className="grid h-[12px] place-items-center rounded-[2px] px-[5px]"
            style={{ background: palette.accentA500 }}
          >
            <span className="block h-[2px] w-[12px] rounded-[1px]" style={{ background: onAccent }} />
          </span>
          <span className="block h-[12px] w-[12px] rounded-[2px]" style={{ background: palette.accentB500 }} />
          <span className="block h-[12px] w-[12px] rounded-[2px]" style={{ background: palette.accentC400 }} />
        </span>
      </span>
    </span>
  );
}

/** The palette on the root right now, including one that was mixed. */
function current(): string {
  if (typeof document === 'undefined') return 'riso';
  return document.documentElement.dataset.theme ?? 'riso';
}

export function PalettePicker({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string>('riso');
  const [mixed, setMixed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    setChosen(current());
    try {
      setMixed(Boolean(localStorage.getItem(CUSTOM_KEY)));
    } catch {
      /* storage blocked: there is no mixed palette to offer, which is fine */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // Back to the button, so the keyboard does not lose its place.
      button.current?.focus();
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  /**
   * Apply, and remember.
   *
   * The cross fade is a class on the root for one duration, not a transition on
   * every element: a hundred colour transitions firing at once is a hundred
   * things the compositor has to interpolate, and this is one opacity. It is
   * skipped entirely under reduced motion and under the golden harness's
   * `data-motion="off"`, where an instant swap is the honest behaviour.
   */
  const apply = (palette: string) => {
    recordUsageAction('vera:change_palette');
    const root = document.documentElement;
    const still =
      root.dataset.motion === 'off' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!still) {
      root.dataset.repainting = 'yes';
      window.setTimeout(() => delete root.dataset.repainting, 240);
    }
    // A palette that is not the mixed one must not keep its inline overrides.
    if (palette !== CUSTOM_ID) {
      for (const name of [...root.style].filter((one) => one.startsWith('--'))) {
        root.style.removeProperty(name);
      }
    }
    root.dataset.theme = palette;
    setChosen(palette);
    try {
      localStorage.setItem(THEME_KEY, palette);
    } catch {
      /* a preference that cannot be remembered still applies for this visit */
    }
  };

  const now = PALETTES.find((one) => one.id === chosen) ?? PALETTES[0];

  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`Palette: ${chosen === CUSTOM_ID ? 'yours' : now.name}`}
        onClick={() => setOpen((was) => !was)}
        className={cx(
          'inline-flex min-h-9 items-center gap-2 rounded-[6px] border border-ink-300',
          'px-3 text-[12px] text-ink-700 transition-colors hover:border-ink-900',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
          'focus-visible:outline-ink-900',
          compact && 'px-2.5',
        )}
        // A studio surface, not the printed sheet: in Night the sheet stays white
        // while the label's ink turns cream.
        style={{ fontFamily: 'var(--font-mono)', background: 'var(--studio-card)' }}
      >
        <Swatch palette={now} />
        {!compact && <span className="uppercase tracking-[0.06em]">Palette</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a palette"
          className={cx(
            'absolute right-0 z-50 mt-2 w-[296px] rounded-[6px] border border-ink-300 bg-sheet p-3',
            'shadow-[var(--shadow-float)]',
          )}
        >
          <p
            className="mb-2 text-[11px] uppercase tracking-[0.12em] text-ink-500"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Palette
          </p>
          <div className="grid grid-cols-2 gap-2">
            {PALETTES.map((palette) => (
              <button
                key={palette.id}
                type="button"
                aria-pressed={chosen === palette.id}
                onClick={() => apply(palette.id)}
                title={palette.note}
                className={cx(
                  'flex flex-col gap-1.5 rounded-[6px] border p-1.5 text-left transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1',
                  'focus-visible:outline-ink-900',
                  chosen === palette.id
                    ? 'border-ink-900 bg-paper-100'
                    : 'border-ink-300 hover:border-ink-500',
                )}
              >
                <Preview palette={palette} />
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] font-[500] text-ink-900">{palette.name}</span>
                  {chosen === palette.id && (
                    <span
                      aria-hidden="true"
                      className="ml-auto block size-1.5 shrink-0 rounded-full bg-accenta-500"
                    />
                  )}
                </span>
              </button>
            ))}
          </div>
          {mixed && (
            <button
              type="button"
              aria-pressed={chosen === CUSTOM_ID}
              onClick={() => apply(CUSTOM_ID)}
              className={cx(
                'mt-2 flex w-full items-center gap-2 rounded-[6px] border px-2.5 py-2 text-left',
                'text-[12.5px] transition-colors focus-visible:outline focus-visible:outline-2',
                'focus-visible:outline-offset-1 focus-visible:outline-ink-900',
                chosen === CUSTOM_ID
                  ? 'border-ink-900 bg-paper-100'
                  : 'border-ink-300 hover:border-ink-500',
              )}
            >
              Yours
            </button>
          )}
        </div>
      )}
    </div>
  );
}
