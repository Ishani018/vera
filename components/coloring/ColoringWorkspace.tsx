'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useConversionQueue } from '@/lib/coloring/convert';
import { useColoring } from '@/lib/coloring/store';
import { sheetCount } from '@/lib/render/coloringLayout';
import { useOpenIntent } from '../openIntent';
import { StudioHeader } from '../StudioHeader';
import { SegmentedControl } from '../ui';
import { AssemblyPanel } from './AssemblyPanel';
import { LaunchKit } from '../LaunchKit';
import { ColoringCover } from './ColoringCover';
import { ExportView } from './ExportView';
import { ColoringPreview } from './ColoringPreview';
import { LineArtStudio } from './LineArtStudio';
import { PageGrid } from './PageGrid';

type Mode = 'pictures' | 'book' | 'cover' | 'export' | 'kit';

/**
 * The coloring-book editor.
 *
 * Two jobs, kept apart: making the pictures, and making the book out of them.
 * Trying to show both at once would mean a preview of the whole book beside a
 * slider that changes one page of it, which is two things to watch and neither
 * of them well.
 */
export function ColoringWorkspace() {
  const status = useColoring((s) => s.status);
  const book = useColoring((s) => s.book);
  const load = useColoring((s) => s.load);
  const update = useColoring((s) => s.update);
  const [mode, setMode] = useState<Mode>('pictures');

  // The front page can ask for a part of the book directly, so that a tile
  // called "Instagram post" opens one rather than the picture tray.
  const intent = useOpenIntent();
  useEffect(() => {
    if (intent) setMode(intent.open === 'cover' ? 'cover' : 'kit');
  }, [intent]);

  // What Paged.js actually laid out, once it has. Until then the count worked
  // out from the settings, so the panel is never blank.
  const [laidOut, setLaidOut] = useState(0);
  const onPageCount = useCallback((count: number) => setLaidOut(count), []);

  useEffect(() => {
    void load();
  }, [load]);

  // One queue for the whole book, mounted once and above the modes, so
  // switching to the book view does not abandon a conversion halfway.
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

  const pageCount = laidOut || sheetCount(book);

  return (
    <main className="flex h-dvh flex-col">
      <StudioHeader>
        <span className="truncate text-ink-700">{book.name}</span>
        <div className="ml-4">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: 'pictures', label: 'Pictures' },
              { value: 'book', label: 'Book' },
              { value: 'cover', label: 'Cover' },
              { value: 'kit', label: 'Launch kit' },
              { value: 'export', label: 'Export' },
            ]}
          />
        </div>
        <span className="ml-auto text-[14px] text-ink-500">
          {book.pages.length} picture{book.pages.length === 1 ? '' : 's'} · {pageCount} pages ·
          saved on this computer
        </span>
      </StudioHeader>

      {mode === 'export' ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-ink-100">
          <ExportView pageCount={pageCount} />
        </div>
      ) : mode === 'cover' ? (
        <div className="min-h-0 flex-1">
          <ColoringCover pageCount={pageCount} />
        </div>
      ) : mode === 'kit' ? (
        <div className="min-h-0 flex-1">
          <LaunchKit
            project={book}
            update={update}
            openDesign={intent?.open === 'kit' ? intent.designId : null}
            displayFont={book.typography.title}
            // The line art, so a page from inside the book can go on a post.
            pictures={book.pages
              .filter((page) => page.lineArtAssetId)
              .map((page) => ({
                key: page.id,
                name: page.title || 'Picture',
                assetId: page.lineArtAssetId!,
                width: Math.round(page.naturalWidth * (page.upscaled || 1)),
                height: Math.round(page.naturalHeight * (page.upscaled || 1)),
              }))}
          />
        </div>
      ) : mode === 'pictures' ? (
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
                The converter itself is not generative: every picture is filtered by a fixed
                sequence of arithmetic on its own pixels, so the same painting and the same
                settings always give the same page. What it cannot know is where a picture came
                from before you added it — that is what the disclosure switch is for, and it will
                be shown again when you export.
              </p>
            </div>
          </section>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[420px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-r border-ink-200 bg-paper px-6 py-6">
            <h2 className="text-[22px] font-semibold tracking-tight">Book</h2>
            <p className="mb-5 mt-1.5 text-[15px] text-ink-500">
              How the pictures are bound into something KDP will print.
            </p>
            <AssemblyPanel pageCount={pageCount} />
          </aside>
          <section className="min-h-0">
            <ColoringPreview book={book} onPageCount={onPageCount} />
          </section>
        </div>
      )}
    </main>
  );
}
