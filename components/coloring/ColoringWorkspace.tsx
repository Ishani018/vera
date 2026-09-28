'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useConversionQueue } from '@/lib/coloring/convert';
import { useColoring } from '@/lib/coloring/store';
import { StudioHeader } from '../StudioHeader';
import { LineArtStudio } from './LineArtStudio';
import { PageGrid } from './PageGrid';

/**
 * The coloring-book editor.
 *
 * Two columns: everything in the book on the left, and the one picture being
 * worked on beside it. The binding, the cover and the export are the stages
 * after this one, and nothing here pretends otherwise.
 */
export function ColoringWorkspace() {
  const status = useColoring((s) => s.status);
  const book = useColoring((s) => s.book);
  const load = useColoring((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  // One queue for the whole book, mounted once, above both panes.
  useConversionQueue();

  if (status === 'loading') {
    return (
      <main className="flex h-dvh items-center justify-center">
        <p className="text-ink-500">Opening…</p>
      </main>
    );
  }

  if (status === 'missing' || !book) {
    return (
      <main className="flex h-dvh flex-col">
        <StudioHeader />
        <div className="grid flex-1 place-items-center px-6">
          <div className="text-center">
            <h1 className="text-[24px] font-semibold tracking-tight">That book isn’t open</h1>
            <p className="mt-2 text-[16px] text-ink-500">
              Pick one from{' '}
              <Link href="/" className="text-accent-500 underline">
                the front page
              </Link>
              , or start a new coloring book there.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col">
      <StudioHeader>
        <span className="truncate text-ink-700">{book.name}</span>
        <span className="ml-auto text-[14px] text-ink-500">
          {book.pages.length} picture{book.pages.length === 1 ? '' : 's'} · saved on this computer
        </span>
      </StudioHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[420px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-r border-ink-200 bg-paper px-6 py-6">
          <h2 className="text-[22px] font-semibold tracking-tight">Pictures</h2>
          <p className="mb-5 mt-1.5 text-[15px] text-ink-500">
            Drag to set the order they are bound in.
          </p>
          <PageGrid />
        </aside>

        <section className="min-h-0 overflow-y-auto bg-ink-100 px-8 py-6">
          <div className="mx-auto max-w-6xl">
            <LineArtStudio />
            <p className="mt-10 border-t border-ink-200 pt-5 text-[14.5px] leading-relaxed text-ink-500">
              Binding, the cover and the PDFs come next. The converter itself is not generative:
              every picture is filtered by a fixed sequence of arithmetic on its own pixels, so the
              same painting and the same settings always give the same page. What it cannot know is
              where a picture came from before you added it — that is what the disclosure switch is
              for, and it will be shown again when you export.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
