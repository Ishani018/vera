'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BUNDLED_FAMILIES, CATEGORY_FALLBACK, type FontFamily } from '@/lib/fonts';
import { Button, TextInput, cx } from './ui';

/** One fetch per session, shared by every picker on screen. */
let familiesPromise: Promise<{ families: FontFamily[]; source: string }> | null = null;

function loadFamilies() {
  familiesPromise ??= fetch('/api/fonts')
    .then((r) => r.json())
    .catch(() => ({ families: BUNDLED_FAMILIES, source: 'bundled' }));
  return familiesPromise;
}

export function useFontFamilies() {
  const [families, setFamilies] = useState<FontFamily[]>(BUNDLED_FAMILIES);
  const [source, setSource] = useState('bundled');

  useEffect(() => {
    let live = true;
    void loadFamilies().then((data) => {
      if (!live) return;
      setFamilies(data.families?.length ? data.families : BUNDLED_FAMILIES);
      setSource(data.source ?? 'bundled');
    });
    return () => {
      live = false;
    };
  }, []);

  return { families, source };
}

/**
 * Loads just the families currently on screen, so the picker can show each one
 * set in its own face. Loading the whole Google catalogue to render a list
 * would be thousands of requests; loading a page of results is a handful.
 */
function usePreviewFonts(families: string[]) {
  const key = families.join('|');
  const linkRef = useRef<HTMLLinkElement | null>(null);

  useEffect(() => {
    if (!families.length) return;
    const href =
      'https://fonts.googleapis.com/css2?' +
      families.map((f) => `family=${encodeURIComponent(f)}:wght@400`).join('&') +
      '&display=swap';

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
    linkRef.current = link;
    return () => {
      link.remove();
    };
    // `key` is the stable identity of this family set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

const PAGE_SIZE = 36;

export function FontPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (family: string, fallback: string) => void;
  label?: string;
}) {
  const { families, source } = useFontFamilies();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | FontFamily['category']>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return families
      .filter((f) => (category === 'all' ? true : f.category === category))
      .filter((f) => (needle ? f.family.toLowerCase().includes(needle) : true))
      .slice(0, PAGE_SIZE);
  }, [families, query, category]);

  usePreviewFonts(open ? results.map((f) => f.family) : []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (family: FontFamily) => {
    onChange(family.family, CATEGORY_FALLBACK[family.category]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-ink-500">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-ink-300 bg-paper px-2.5 py-1.5 text-left transition-colors hover:border-ink-300"
      >
        <span className="truncate">{value}</span>
        <span className="shrink-0 text-ink-500">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-lg border border-ink-300 bg-ink-50 shadow-2xl">
          <div className="space-y-2 border-b border-ink-200 p-2">
            <TextInput
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search families…"
            />
            <div className="flex flex-wrap gap-1">
              {(['all', 'serif', 'sans-serif', 'display', 'handwriting', 'monospace'] as const).map(
                (c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cx(
                      'rounded px-1.5 py-0.5 text-[11px] transition-colors',
                      category === c
                        ? 'bg-ink-200 text-ink-900'
                        : 'text-ink-500 hover:text-ink-900',
                    )}
                  >
                    {c}
                  </button>
                ),
              )}
            </div>
          </div>

          <ul className="max-h-72 overflow-y-auto py-1">
            {results.length === 0 && (
              <li className="px-3 py-4 text-center text-ink-500">No families match.</li>
            )}
            {results.map((family) => (
              <li key={family.family}>
                <button
                  type="button"
                  onClick={() => pick(family)}
                  className={cx(
                    'flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition-colors hover:bg-ink-100',
                    family.family === value && 'bg-accent-500/10',
                  )}
                >
                  <span
                    className="min-w-0 flex-1 truncate text-[15px]"
                    style={{
                      fontFamily: `'${family.family}', ${CATEGORY_FALLBACK[family.category]}`,
                    }}
                  >
                    {family.family}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-500">
                    {family.category}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 border-t border-ink-200 px-3 py-1.5 text-[10px] text-ink-500">
            <span>
              {families.length} families ·{' '}
              {source === 'google' ? 'Google Fonts API' : 'curated list'}
            </span>
            {source !== 'google' && (
              <span className="ml-auto" title="Set GOOGLE_FONTS_API_KEY for the full catalogue">
                set an API key for all of them
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function FontPreviewButton({ onClick }: { onClick: () => void }) {
  return <Button onClick={onClick}>Change…</Button>;
}
