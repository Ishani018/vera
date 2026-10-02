'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAssetUrl } from '@/lib/assets';
import { illustrationsOf } from '@/lib/contents';
import { fetchFontCss } from '@/lib/fontsClient';
import { PAGEDJS_SRC } from '@/lib/exportClient';
import { buildBookHtml } from '@/lib/render/bookHtml';
import { pageGeometry } from '@/lib/render/css';
import type { HighlightMessage, SpreadMessage, ViewMessage } from '@/lib/render/viewer';
import { useStore, type PageInfo } from '@/lib/store';
import type { Project } from '@/lib/types';
import { Button, SegmentedControl, cx } from './ui';

/** The pictures the book refers to, as URLs this document can render. */
async function illustrationUrls(project: Project): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    illustrationsOf(project)
      .map((plate) => plate.assetId)
      .filter(Boolean)
      .map(async (assetId) => {
        const url = await getAssetUrl(assetId);
        if (url) out[assetId] = url;
      }),
  );
  return out;
}

/** How long to wait after the last edit before re-paginating. */
const REPAGINATE_DELAY = 450;

type PaginatedMessage = {
  type: 'versecraft:paginated';
  pageCount: number;
  pages: PageInfo[];
};

export function BookPreview() {
  const project = useStore((s) => s.project);
  const guides = useStore((s) => s.guides);
  const toggleGuide = useStore((s) => s.toggleGuide);
  const previewMode = useStore((s) => s.previewMode);
  const setPreviewMode = useStore((s) => s.setPreviewMode);
  const currentSpread = useStore((s) => s.currentSpread);
  const setSpread = useStore((s) => s.setSpread);
  const pageCount = useStore((s) => s.pageCount);
  const pages = useStore((s) => s.pages);
  const paginating = useStore((s) => s.paginating);
  const setPagination = useStore((s) => s.setPagination);
  const setPaginating = useStore((s) => s.setPaginating);
  const highlight = useStore((s) => s.highlight);
  const positioned = useStore((s) => s.positioned);
  const setPositioned = useStore((s) => s.setPositioned);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [srcDoc, setSrcDoc] = useState('');
  const [shellWidth, setShellWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fontsUnavailable, setFontsUnavailable] = useState(false);

  const geometry = useMemo(() => (project ? pageGeometry(project) : null), [project]);

  // Rebuild and re-paginate only after edits settle: Paged.js lays out the
  // whole book, so doing it per keystroke would make typing unusable.
  useEffect(() => {
    if (!project) return;
    setPaginating(true);
    let live = true;
    const timer = setTimeout(() => {
      void (async () => {
        // The webfont CSS is fetched here rather than linked inside the iframe:
        // Paged.js blocks on stylesheets and fails outright if one does, so a
        // network problem has to degrade to a fallback face, not a dead preview.
        const fonts = await fetchFontCss(project);
        // Object URLs, not data URLs: the preview is same-origin, so it can use
        // the blob directly instead of copying megabytes of base64 per render.
        const assets = await illustrationUrls(project);
        if (!live) return;
        setFontsUnavailable(fonts.failed);
        setError(null);
        setSrcDoc(
          buildBookHtml(project, {
            mode: 'preview',
            fontStyle: fonts.style,
            pagedJsSrc: PAGEDJS_SRC,
            guides,
            assets,
            padPages: 0,
          }),
        );
      })();
    }, REPAGINATE_DELAY);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [project, guides, setPaginating]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as PaginatedMessage | { type: string; message?: string };
      if (data?.type === 'versecraft:spread') {
        // The reader turned a page inside the preview, by dragging the paper or
        // clicking a side. The pages have already moved; this only catches the
        // app's own idea of where the book is open up with them.
        setSpread((data as unknown as SpreadMessage).spread);
      } else if (data?.type === 'versecraft:paginated') {
        const paginated = data as PaginatedMessage;
        setPagination(paginated.pageCount, paginated.pages);
      } else if (data?.type === 'versecraft:error') {
        setError((data as { message?: string }).message ?? 'The preview failed to lay out.');
        setPaginating(false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [setPagination, setPaginating, setSpread]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(([entry]) => setShellWidth(entry.contentRect.width));
    observer.observe(shell);
    setShellWidth(shell.clientWidth);
    return () => observer.disconnect();
  }, []);

  /** Fit a spread (or a single page) to the pane, never magnifying past 1:1. */
  const zoom = useMemo(() => {
    if (!geometry || !shellWidth) return 1;
    const across = previewMode === 'spread' ? 2 : 1;
    const neededPx = geometry.pageWidth * 96 * across + 64;
    return Math.min(1, Math.max(0.2, shellWidth / neededPx));
  }, [geometry, shellWidth, previewMode]);

  const maxSpread = pageCount <= 1 ? 0 : Math.floor(pageCount / 2);

  const sendView = useCallback(
    (spread: number, turn: ViewMessage['turn'] = null) => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'versecraft:view', mode: previewMode, spread, zoom, turn } satisfies ViewMessage,
        '*',
      );
    },
    [previewMode, zoom],
  );

  useEffect(() => {
    sendView(currentSpread);
  }, [sendView, currentSpread, pageCount, srcDoc]);

  /**
   * A book opens on its half title, which is nearly blank and reads as a broken
   * preview. So the first pagination jumps to where the poems start — once
   * only, or it would fight every navigation afterwards.
   */
  useEffect(() => {
    if (positioned || !pages.length) return;
    const first = pages.findIndex((p) => p.kind === 'poem' || p.kind === 'section');
    setPositioned(true);
    if (first > 0) setSpread(Math.floor((first + 1) / 2));
  }, [pages, positioned, setPositioned, setSpread]);

  /** Flash whatever the last-touched setting governs, once the pages exist. */
  useEffect(() => {
    if (!highlight || !pageCount) return;
    const timer = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'versecraft:highlight', selector: highlight.selector } satisfies HighlightMessage,
        '*',
      );
    }, 80);
    return () => clearTimeout(timer);
  }, [highlight, pageCount, srcDoc]);

  const go = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(currentSpread + delta, maxSpread));
      if (next === currentSpread) return;
      sendView(next, delta > 0 ? 'forward' : 'back');
      setSpread(next);
    },
    [currentSpread, maxSpread, sendView, setSpread],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        go(1);
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        go(-1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        setSpread(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setSpread(maxSpread);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, maxSpread, setSpread]);

  const visible = spreadLabels(pages, currentSpread);

  return (
    <div className="flex h-full min-w-0 flex-col bg-paper">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-3 py-2">
        <SegmentedControl
          value={previewMode}
          onChange={setPreviewMode}
          options={[
            { value: 'spread', label: 'Spread' },
            { value: 'scroll', label: 'Scroll' },
            { value: 'grid', label: 'Grid' },
          ]}
        />

        {previewMode === 'spread' && (
          <div className="flex items-center gap-1">
            <Button onClick={() => go(-1)} disabled={currentSpread === 0} aria-label="Previous spread">
              ←
            </Button>
            <span className="min-w-48 px-1 text-center">
              <span className="block tabular-nums text-ink-700">{visible.folios}</span>
              <span className="block truncate text-[11px] text-ink-500" title={visible.captions}>
                {visible.captions}
              </span>
            </span>
            <Button onClick={() => go(1)} disabled={currentSpread >= maxSpread} aria-label="Next spread">
              →
            </Button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {(['margins', 'bleed', 'safe', 'gutter'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleGuide(key)}
              className={cx(
                'rounded border px-2 py-1 text-[11px] capitalize transition-colors',
                guides[key]
                  ? 'border-accent-500/60 bg-accent-500/15 text-accent-600'
                  : 'border-ink-300 text-ink-500 hover:text-ink-900',
              )}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <div ref={shellRef} className="relative min-h-0 flex-1 overflow-hidden bg-[var(--color-ground-deep)]">
        {srcDoc ? (
          <iframe
            ref={iframeRef}
            title="Book preview"
            srcDoc={srcDoc}
            className="h-full w-full border-0"
            /* Deliberately unsandboxed. The document is same-origin so the view
               controller can be driven from here by postMessage, and a sandbox
               that grants both allow-scripts and allow-same-origin is no
               sandbox at all — it would only be misleading. Everything the user
               types is escaped by the renderer, and colours and font names are
               sanitised before they reach the stylesheet. */
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-700">
            Preparing the preview…
          </div>
        )}

        {(paginating || error) && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
            <span
              className={cx(
                'rounded-full px-3 py-1 text-[11px] shadow-lg',
                error ? 'bg-red-900/90 text-red-100' : 'bg-ink-100/85 text-ink-700',
              )}
            >
              {error ?? 'Laying out pages…'}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-ink-200 px-3 py-1.5 text-[11px] text-ink-500">
        <span className="tabular-nums">
          {pageCount ? `${pageCount} pages` : 'Counting pages…'}
        </span>
        {geometry && (
          <span className="tabular-nums">
            {geometry.pageWidth.toFixed(3)}″ × {geometry.pageHeight.toFixed(3)}″ sheet
          </span>
        )}
        {fontsUnavailable && (
          <span className="text-amber-700" title="Type will still export correctly if the server can reach Google Fonts.">
            Google Fonts unreachable — previewing in a fallback face
          </span>
        )}
        <span className="ml-auto">Drag the page to turn it, or use ← / →</span>
      </div>
    </div>
  );
}

/**
 * What the reader is looking at, in folios and in words. A blank-looking page
 * should say "Half title" or "Blank page" rather than leave someone wondering
 * whether the preview has broken.
 */
function spreadLabels(pages: PageInfo[], spread: number): { folios: string; captions: string } {
  if (!pages.length) return { folios: '—', captions: '' };
  const left = spread <= 0 ? null : pages[spread * 2 - 1];
  const right = spread <= 0 ? pages[0] : pages[spread * 2];
  const shown = [left, right].filter((p): p is PageInfo => Boolean(p));

  const folios = shown.map((p) => (p.blank ? '·' : p.label)).join(' – ') || '—';
  const captions = [...new Set(shown.map((p) => p.caption).filter(Boolean))].join('  ·  ');
  return { folios, captions };
}
