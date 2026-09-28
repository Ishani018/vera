'use client';

import { useEffect, useRef } from 'react';
import { forgetAssetUrl, getAsset, putAssetBlob } from '../assets';
import { renderLineArt } from '../lineart/client';
import type { ColoringPage } from '../types';
import { targetLongEdge } from './quality';
import { useColoring } from './store';

/** Settle time after the last change before anything is converted. */
const SETTLE_MS = 260;

const sameSettings = (page: ColoringPage) =>
  page.renderedWith !== null &&
  (Object.keys(page.settings) as Array<keyof typeof page.settings>).every(
    (key) => page.settings[key] === page.renderedWith![key],
  );

/** Pages whose stored line art no longer matches their settings, or is missing. */
const stale = (pages: ColoringPage[]) => pages.filter((page) => !sameSettings(page));

/**
 * Converts every page that needs it, one at a time.
 *
 * One queue for the whole book rather than a conversion inside each component:
 * dropping in twelve paintings has to convert twelve paintings, not only the
 * one that happens to be selected, and two components both deciding to convert
 * the same page would race to write the result.
 *
 * The selected page goes first, because that is the one being watched.
 */
export function useConversionQueue() {
  const book = useColoring((s) => s.book);
  const selectedId = useColoring((s) => s.selectedId);
  const setLineArt = useColoring((s) => s.setLineArt);
  const setBusy = useColoring((s) => s.setBusy);
  const running = useRef(false);

  // The queue is driven off what the pages say they need, so this signature is
  // the whole of the dependency: nothing else can make work appear.
  const signature = (book?.pages ?? [])
    .map((page) => `${page.id}:${JSON.stringify(page.settings)}:${page.lineArtAssetId ?? ''}`)
    .join('|');

  useEffect(() => {
    if (!book || running.current) return;
    const waiting = stale(book.pages);
    if (!waiting.length) return;

    const timer = setTimeout(() => void run(), SETTLE_MS);
    return () => clearTimeout(timer);

    async function run() {
      if (running.current) return;
      running.current = true;
      try {
        // Re-read from the store each time round: settings may have moved on
        // while the previous page was being converted.
        for (;;) {
          const current = useColoring.getState().book;
          if (!current) break;
          const pending = stale(current.pages);
          if (!pending.length) break;

          const selected = useColoring.getState().selectedId;
          const page = pending.find((p) => p.id === selected) ?? pending[0];
          const settings = { ...page.settings };

          setBusy(page.id, true);
          try {
            const record = await getAsset(page.sourceAssetId);
            if (!record) continue;
            const result = await renderLineArt(record.blob, settings, {
              // Undefined while the guess stands, which is what asks the
              // converter to look at the picture and decide.
              source: page.sourceGuessed ? undefined : page.source,
              targetLongEdge: targetLongEdge(current),
              // The converter keeps the expensive half of tracing against this
              // key, so moving a slider on one picture does not pay for it
              // again. Tied to the upload, not the page, so two pages made
              // from the same file can share one.
              cacheKey: page.sourceAssetId,
            });
            const saved = await putAssetBlob(
              result.blob,
              `${page.title || 'page'} line art`,
              result.width,
              result.height,
            );
            // The old line art is no longer referenced, so its cached object
            // URL is stale; the bytes are swept with the rest later.
            if (page.lineArtAssetId) forgetAssetUrl(page.lineArtAssetId);
            setLineArt(page.id, saved.id, settings, {
              source: result.source,
              guessed: result.guessed,
              upscaled: result.upscaled,
            });
          } finally {
            setBusy(page.id, false);
          }
        }
      } finally {
        running.current = false;
      }
    }
  }, [signature, selectedId, book, setBusy, setLineArt]);
}
