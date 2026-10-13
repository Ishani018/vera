'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAssetUrl } from '@/lib/assets';
import { PAGEDJS_SRC } from '@/lib/exportClient';
import { fetchFontCss } from '@/lib/fontsClient';
import { buildColoringHtml } from '@/lib/render/coloringHtml';
import { matterArtwork, sheetOf } from '@/lib/render/coloringLayout';
import type { ViewMessage } from '@/lib/render/viewer';
import type { ColoringBook } from '@/lib/types';
import { Button, SegmentedControl, cx } from '../ui';

/** How long to wait after the last change before laying the book out again. */
const SETTLE = 400;

type PageInfo = { label: string; caption: string; blank: boolean };
type Paginated = { type: 'versecraft:paginated'; pageCount: number; pages: PageInfo[] };

/** Every picture the book needs, as URLs this document can render. */
async function pictureUrls(book: ColoringBook): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const ids = [...book.pages, ...matterArtwork(book)].flatMap((page) => [
    page.lineArtAssetId,
    page.sourceAssetId,
  ]);
  await Promise.all(
    [...new Set(ids.filter((id): id is string => Boolean(id)))].map(async (id) => {
      const url = await getAssetUrl(id);
      if (url) out[id] = url;
    }),
  );
  return out;
}

/**
 * The whole book, laid out by the same Paged.js that lays out the PDF.
 *
 * Its own component rather than the poetry preview with the poetry taken out:
 * that one reads and writes the poetry store — the spread, the guides, the page
 * list, the flash after an edit — and a coloring book shares none of that
 * state. What the two do share is the renderer and the view controller inside
 * the frame, which is what makes this preview the same pages as the export.
 */
export function ColoringPreview({
  book,
  onPageCount,
}: {
  book: ColoringBook;
  onPageCount?: (count: number) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [srcDoc, setSrcDoc] = useState('');
  const [mode, setMode] = useState<'spread' | 'scroll' | 'grid'>('spread');
  const [spread, setSpread] = useState(0);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shellWidth, setShellWidth] = useState(0);

  const sheet = useMemo(() => sheetOf(book), [book]);

  // Only what the rendered page actually depends on, so moving a slider in the
  // pictures view does not re-lay-out the whole book on every frame.
  const signature = JSON.stringify([
    book.trim,
    book.margins,
    book.meta,
    book.coloring.singleSided,
    book.coloring.lineArtOn,
    book.coloring.titlePage,
    book.coloring.copyrightPage,
    book.coloring.belongsToPage,
    book.coloring.colorTestPage,
    matterArtwork(book).map((art) => [art.id, art.lineArtAssetId]),
    book.typography,
    book.pages.map((p) => [p.id, p.lineArtAssetId, p.fit, p.rotate, p.naturalWidth, p.naturalHeight]),
  ]);

  useEffect(() => {
    let live = true;
    setBusy(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const fonts = await fetchFontCss(book);
          const assets = await pictureUrls(book);
          if (!live) return;
          setError(null);
          setSrcDoc(
            buildColoringHtml(book, {
              mode: 'preview',
              fontStyle: fonts.style,
              pagedJsSrc: PAGEDJS_SRC,
              guides: { margins: false, bleed: false, safe: false, gutter: false },
              assets,
              padPages: 0,
            }),
          );
        } catch (failure) {
          // Without this the preview sits on "Preparing…" for ever and says
          // nothing about why, which is the least useful failure there is.
          if (!live) return;
          setError(failure instanceof Error ? failure.message : 'The preview could not be built.');
          setBusy(false);
        }
      })();
    }, SETTLE);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: string; message?: string; spread?: number };
      if (data?.type === 'versecraft:paginated') {
        const paginated = event.data as Paginated;
        setPages(paginated.pages);
        setPageCount(paginated.pageCount);
        setBusy(false);
        onPageCount?.(paginated.pageCount);
      } else if (data?.type === 'versecraft:spread') {
        setSpread(data.spread ?? 0);
      } else if (data?.type === 'versecraft:error') {
        setError(data.message ?? 'The preview could not lay the book out.');
        setBusy(false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onPageCount]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(([entry]) => setShellWidth(entry.contentRect.width));
    observer.observe(shell);
    setShellWidth(shell.clientWidth);
    return () => observer.disconnect();
  }, []);

  /** Fit a spread to the pane, never magnifying past actual size. */
  const zoom = useMemo(() => {
    if (!shellWidth) return 1;
    const across = mode === 'spread' ? 2 : 1;
    return Math.min(1, Math.max(0.15, shellWidth / (sheet.width * 96 * across + 64)));
  }, [shellWidth, mode, sheet.width]);

  const sendView = useCallback(
    (next: number, turn: ViewMessage['turn'] = null) => {
      frameRef.current?.contentWindow?.postMessage(
        { type: 'versecraft:view', mode, spread: next, zoom, turn } satisfies ViewMessage,
        '*',
      );
    },
    [mode, zoom],
  );

  useEffect(() => {
    sendView(spread);
  }, [sendView, spread, pageCount, srcDoc]);

  const maxSpread = pageCount <= 1 ? 0 : Math.floor(pageCount / 2);
  const go = (delta: number) => {
    const next = Math.max(0, Math.min(spread + delta, maxSpread));
    if (next === spread) return;
    sendView(next, delta > 0 ? 'forward' : 'back');
    setSpread(next);
  };

  const showing = describeSpread(pages, spread);

  return (
    <div className="flex h-full min-w-0 flex-col" style={{ background: 'var(--studio-card)' }}>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--studio-line)' }}>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'spread', label: 'Spread' },
            { value: 'scroll', label: 'Scroll' },
            { value: 'grid', label: 'Grid' },
          ]}
        />
        {mode === 'spread' && (
          <div className="flex items-center gap-1">
            <Button onClick={() => go(-1)} disabled={spread === 0} aria-label="Previous spread">
              ←
            </Button>
            <span className="min-w-44 px-1 text-center">
              <span className="block tabular-nums text-ink-700">{showing.folios}</span>
              <span className="block truncate text-[11px] text-ink-500">{showing.captions}</span>
            </span>
            <Button onClick={() => go(1)} disabled={spread >= maxSpread} aria-label="Next spread">
              →
            </Button>
          </div>
        )}
        <span className="ml-auto tabular-nums text-[12px] text-ink-500">
          {pageCount ? `${pageCount} pages` : 'Counting…'} · {sheet.width.toFixed(3)}″ ×{' '}
          {sheet.height.toFixed(3)}″
        </span>
      </div>

      <div ref={shellRef} className="relative min-h-0 flex-1 overflow-hidden bg-ground">
        {srcDoc ? (
          <iframe
            ref={frameRef}
            title="Coloring book preview"
            srcDoc={srcDoc}
            className="h-full w-full border-0"
          />
        ) : (
          <div className="grid h-full place-items-center text-[15px] text-paper">
            Preparing the preview…
          </div>
        )}
        {(busy || error) && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
            <span
              className={cx(
                'rounded-full px-3 py-1 text-[12px] shadow-lg',
                error ? 'bg-red-800 text-white' : 'bg-paper/90 text-ink-700',
              )}
            >
              {error ?? 'Laying out pages…'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** What the reader is looking at, so a blank page reads as deliberate. */
function describeSpread(pages: PageInfo[], spread: number) {
  if (!pages.length) return { folios: '—', captions: '' };
  const left = spread <= 0 ? null : pages[spread * 2 - 1];
  const right = spread <= 0 ? pages[0] : pages[spread * 2];
  const shown = [left, right].filter((p): p is PageInfo => Boolean(p));
  return {
    folios: shown.map((p) => (p.blank ? '·' : p.label)).join(' – ') || '—',
    captions: [...new Set(shown.map((p) => p.caption).filter(Boolean))].join('  ·  '),
  };
}
