'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useConversionQueue } from '@/lib/coloring/convert';
import { useColoring } from '@/lib/coloring/store';
import { picturesOf } from '@/lib/pictures';
import { sheetCount } from '@/lib/render/coloringLayout';
import { useOpenIntent } from '../openIntent';
import { StudioHeader } from '../StudioHeader';
import { SegmentedControl } from '../ui';
import { AssemblyPanel } from './AssemblyPanel';
import { LaunchKit } from '../LaunchKit';
import { ColoringCover } from './ColoringCover';
import { ExportView } from './ExportView';
import { ColoringPreview } from './ColoringPreview';
import { PictureInspector, PictureStage } from './PictureWorkspace';
import { PageGrid } from './PageGrid';
import { PageSwitches } from './PageSwitches';

/**
 * Three steps, not five: make the pages, make the cover, publish.
 *
 * `kit` is not a step. It is the launch-day posts, reached from Export (or from
 * a home-screen tile that asks for it by name), and it still reads as Export in
 * the bar because that is where it came from and where Back goes.
 */
type Mode = 'pictures' | 'cover' | 'export' | 'kit';

/**
 * The coloring-book editor.
 *
 * Pages: the switches, the pictures, the book's details, and the picture being
 * worked on. Cover. Export: the checks, the whole book as it will print, and the
 * two files. The whole-book preview lives with Export rather than in a tab of its
 * own, because "does it look right" is the question asked just before it is made.
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
            <h1 className="display text-[24px] tracking-tight">That book isn’t open</h1>
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
        {/* The bar is white in every palette, so its text is coloured for white. */}
        <span className="truncate" style={{ color: 'var(--text-on-sheet)' }}>
          {book.name}
        </span>
        <div className="ml-4">
          <SegmentedControl
            value={mode === 'kit' ? 'export' : mode}
            onChange={setMode}
            options={[
              { value: 'pictures', label: 'Pages' },
              { value: 'cover', label: 'Cover' },
              { value: 'export', label: 'Export' },
            ]}
          />
        </div>
        {/* The way back lives in the bar, not in a strip above the posts: the
            board's size is worked out from the room it is given, and a strip
            would take some of it. */}
        {mode === 'kit' && (
          <button
            type="button"
            onClick={() => setMode('export')}
            className="shrink-0 rounded-lg px-3 py-1.5 text-[14px] transition-colors hover:bg-ink-100"
            style={{ color: 'var(--text-on-sheet)' }}
          >
            ← Back to Export
          </button>
        )}
        <span
          className="ml-auto hidden shrink-0 whitespace-nowrap text-[14px] sm:inline"
          style={{ color: 'var(--text-muted-on-sheet)' }}
        >
          {book.pages.length} picture{book.pages.length === 1 ? '' : 's'} · {pageCount} pages ·
          saved on this computer
        </span>
      </StudioHeader>

      {mode === 'export' ? (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
          <div className="min-h-0 overflow-y-auto" style={{ background: 'var(--studio-page)' }}>
            <ExportView pageCount={pageCount} onLaunchKit={() => setMode('kit')} />
          </div>
          {/* Only where there is room beside it; below that the files and the
              checks are the point, and a postage-stamp preview is not. */}
          <section className="hidden min-h-0 border-l lg:block" style={{ borderColor: 'var(--studio-line)' }}>
            <ColoringPreview book={book} onPageCount={onPageCount} />
          </section>
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
            // What actually prints, so a page from inside the book can go on a post.
            pictures={picturesOf(book)}
          />
        </div>
      ) : mode === 'pictures' ? (
        /*
          Pages | stage | panel: the same three columns as the cover designer and
          the Sticker Studio, so the three editors read as one app. Below `lg` the
          columns stack and the page scrolls.
        */
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[340px_minmax(0,1fr)_var(--panel-width)] lg:overflow-visible">
          <aside
            className="shrink-0 border-b px-5 py-6 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r"
            style={{ background: 'var(--studio-card)', borderColor: 'var(--studio-line)' }}
          >
            <h2 className="text-[22px] font-semibold tracking-tight">Pages</h2>
            <p className="mb-5 mt-1 text-[14.5px]" style={{ color: 'var(--color-ink-500)' }}>
              Drag to set the order they are bound in.
            </p>
            {/* Where pictures are added: the first thing an activity book needs
                is for them not to be traced. */}
            <PageSwitches />
            <PageGrid />
            <div className="mt-8 border-t pt-6" style={{ borderColor: 'var(--studio-line)' }}>
              <AssemblyPanel />
            </div>
          </aside>

          <section
            className="shrink-0 lg:min-h-0 lg:overflow-y-auto"
            style={{ background: 'var(--studio-page)' }}
          >
            <PictureStage />
          </section>

          <div
            className="flex shrink-0 flex-col border-t lg:min-h-0 lg:border-l lg:border-t-0"
            style={{ background: 'var(--studio-card)', borderColor: 'var(--studio-line)' }}
          >
            <PictureInspector />
          </div>
        </div>
      ) : null}
    </main>
  );
}
