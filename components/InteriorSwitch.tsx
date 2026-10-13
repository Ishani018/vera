'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ACTIVE_PROJECT_KEY, getDb } from '@/lib/db';
import { createColoringBook, listProjects } from '@/lib/projects';
import { createProject } from '@/lib/defaults';
import type { AnyProject } from '@/lib/types';
import { cx } from './ui';

/**
 * Which kind of interior this book is, and a way to the other.
 *
 * "Book interior" is one thing on the home screen. Whether the pages are verse
 * or pictures to colour is a choice made inside it, here, in the bar — not a
 * question asked before you have seen anything. The two kinds keep their own
 * books, so switching opens the latest book of the other kind, or starts one if
 * there is none. Nothing is converted and nothing is lost.
 *
 * The bar it sits in is white in every palette, so this is coloured for white.
 */
export function InteriorSwitch({ kind }: { kind: AnyProject['kind'] }) {
  const router = useRouter();
  const [going, setGoing] = useState<AnyProject['kind'] | null>(null);

  const choose = async (next: AnyProject['kind']) => {
    if (next === kind || going) return;
    setGoing(next);
    try {
      const books = await listProjects();
      let id = books.find((book) => book.kind === next)?.id;
      if (!id) {
        const fresh = next === 'coloring' ? createColoringBook() : createProject();
        await getDb()?.projects.put(fresh);
        id = fresh.id;
      }
      window.localStorage.setItem(ACTIVE_PROJECT_KEY, id);
      router.push(next === 'coloring' ? '/coloring' : '/poetry');
    } finally {
      setGoing(null);
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        className="hidden text-[10.5px] uppercase tracking-[0.12em] lg:inline"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted-on-sheet)' }}
      >
        Interior
      </span>
      <div
        role="group"
        aria-label="Kind of interior"
        className="inline-flex rounded-full border p-0.5"
        style={{ borderColor: 'var(--color-ink-200)', background: 'var(--color-ink-100)' }}
      >
        {(
          [
            { id: 'poetry', label: 'Poetry', title: 'Verse, set on the page' },
            { id: 'coloring', label: 'Colouring', title: 'Pictures to colour, turned into line art' },
          ] as const
        ).map((option) => {
          const on = kind === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              title={on ? option.title : `${option.title} — opens your latest, or starts one`}
              onClick={() => void choose(option.id)}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-[550]',
                'transition-[background-color,color,box-shadow] duration-[var(--motion-base)]',
                !on && 'hover:text-[var(--text-on-sheet)]',
                going === option.id && 'opacity-60',
              )}
              style={
                on
                  ? { background: 'var(--text-on-sheet)', color: '#fff' }
                  : { color: 'var(--text-muted-on-sheet)' }
              }
            >
              <Glyph kind={option.id} />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Glyph({ kind }: { kind: AnyProject['kind'] }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === 'poetry' ? (
        <>
          <path d="M3 3.5h10M4.5 6.5h7M3 9.5h10M5.5 12.5h5" />
        </>
      ) : (
        <>
          <circle cx="8" cy="6" r="2.2" />
          <circle cx="8" cy="2.9" r="1.4" />
          <circle cx="11.1" cy="6" r="1.4" />
          <circle cx="4.9" cy="6" r="1.4" />
          <path d="M8 8.4v5.2M8 11c1.6-.2 2.6-.9 3-2" />
        </>
      )}
    </svg>
  );
}
