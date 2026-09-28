'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ACTIVE_PROJECT_KEY, getDb } from '@/lib/db';
import { migrateProject } from '@/lib/projects';
import type { ColoringBook } from '@/lib/types';
import { StudioHeader } from '../StudioHeader';

/**
 * The coloring-book editor.
 *
 * Stage 1 opens the book and proves the routing and the store around it. The
 * upload grid and the line-art pipeline arrive next; nothing here pretends to
 * do either yet.
 */
export function ColoringWorkspace() {
  const [book, setBook] = useState<ColoringBook | null | 'missing'>(null);

  useEffect(() => {
    void (async () => {
      const db = getDb();
      const id = window.localStorage.getItem(ACTIVE_PROJECT_KEY);
      const stored = db && id ? await db.projects.get(id) : undefined;
      if (!stored) return setBook('missing');
      const project = migrateProject(stored);
      setBook(project.kind === 'coloring' ? project : 'missing');
    })();
  }, []);

  return (
    <main className="flex h-dvh flex-col">
      <StudioHeader>
        <span className="truncate text-ink-700">
          {book && book !== 'missing' ? book.name : 'Coloring book'}
        </span>
      </StudioHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-14">
          {book === 'missing' ? (
            <>
              <h1 className="text-[26px] font-semibold tracking-tight">
                That book isn&rsquo;t open
              </h1>
              <p className="mt-2 text-[16px] text-ink-500">
                Pick one from the front page, or start a new coloring book there.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-[26px] font-semibold tracking-tight">
                {book?.name ?? 'Coloring book'}
              </h1>
              <p className="mt-2 text-[16px] leading-relaxed text-ink-500">
                The book exists and is saved. Uploading pictures and turning them into line art is
                the next stage.
              </p>
              <ul className="mt-7 flex flex-col gap-3 text-[15.5px]">
                {[
                  'Drop in paintings and photographs, reorder them, replace one',
                  'Turn each into black-and-white line art, with detail, thickness and cleanup to set',
                  'Bind it: square or letter, bleed, a blank back behind every page',
                  'A wrap cover with the spine width worked out from the page count',
                  'Print-ready PDFs, and what the royalty comes to',
                ].map((line, i) => (
                  <li key={line} className="flex gap-3.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-100 text-[13px] font-semibold tabular-nums text-ink-500">
                      {i + 1}
                    </span>
                    <span className={i === 0 ? 'text-ink-900' : 'text-ink-500'}>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-8 text-[15px] text-ink-500">
                Meanwhile the <Link href="/poetry" className="text-accent-500 underline">poetry
                side</Link> is untouched.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
