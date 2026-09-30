'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getAssetUrl } from '@/lib/assets';
import { listStickers } from '@/lib/cover/library';
import { cutLine } from '@/lib/stickers/cutline';
import {
  DEFAULT_SHEET,
  PAGES,
  atDpi,
  layOutSheet,
  type SheetSettings,
} from '@/lib/stickers/sheet';
import type { LibrarySticker } from '@/lib/types';
import { Control } from '../coloring/LineArtControls';
import { StudioHeader } from '../StudioHeader';
import { Button, Notice, Toggle, cx } from '../ui';

/**
 * A sheet of stickers, arranged and exported as a PNG.
 *
 * Made entirely in the browser, on a canvas. It goes nowhere near the export
 * routes — those render pages of a book through Chrome, and this is a picture
 * of some stickers on a piece of paper. The two have nothing to say to each
 * other and there is no reason to make them share anything.
 *
 * The same `layOutSheet` decides the preview and the file, so what is on screen
 * is what comes out; only the resolution differs between them.
 */

/** Big enough to judge by on screen, small enough to redraw instantly. */
const PREVIEW_DPI = 72;

export function StickerSheet() {
  const [stickers, setStickers] = useState<LibrarySticker[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<SheetSettings>({ ...DEFAULT_SHEET });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void listStickers().then(setStickers);
  }, []);

  // One object URL per sticker, kept while the screen is open and let go of
  // when it is not. Asking for them again on every redraw would flicker.
  useEffect(() => {
    let live = true;
    const mine: string[] = [];
    void Promise.all(
      stickers.map(async (sticker) => {
        const url = sticker.assetId ? await getAssetUrl(sticker.assetId) : null;
        return [sticker.id, url] as const;
      }),
    ).then((pairs) => {
      if (!live) return;
      const next: Record<string, string> = {};
      for (const [id, url] of pairs) if (url) next[id] = url;
      setUrls(next);
    });
    return () => {
      live = false;
      for (const url of mine) URL.revokeObjectURL(url);
    };
  }, [stickers]);

  const chosen = useMemo(
    () =>
      stickers.flatMap((sticker) =>
        Array.from({ length: counts[sticker.id] ?? 0 }, (_, n) => ({
          id: `${sticker.id}#${n}`,
          stickerId: sticker.id,
          aspect: (sticker.width || 1) / (sticker.height || 1),
        })),
      ),
    [stickers, counts],
  );

  const sheet = useMemo(() => layOutSheet(chosen, settings), [chosen, settings]);
  const total = chosen.length;

  /**
   * Draws the sheet at a given resolution.
   *
   * One function for the preview and the file, so the picture on screen cannot
   * disagree with what is downloaded — the only thing that changes is the
   * number of pixels an inch.
   */
  const draw = useCallback(
    async (target: HTMLCanvasElement, dpi: number) => {
      const laid = layOutSheet(chosen, { ...settings, dpi });
      target.width = atDpi(laid.page.width, dpi);
      target.height = atDpi(laid.page.height, dpi);
      const context = target.getContext('2d');
      if (!context) return laid;

      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, target.width, target.height);

      for (const piece of laid.placed) {
        const stickerId = piece.id.split('#')[0];
        const url = urls[stickerId];
        if (!url) continue;
        const image = await loadImage(url);
        const x = atDpi(piece.x, dpi);
        const y = atDpi(piece.y, dpi);
        const w = atDpi(piece.width, dpi);
        const h = atDpi(piece.height, dpi);
        context.drawImage(image, x, y, w, h);

        if (settings.cutLines) {
          // Traced from the sticker as it sits on the sheet, at the size it
          // sits there — a line traced at one size and drawn at another is a
          // line that no longer follows the edge.
          const shape = document.createElement('canvas');
          shape.width = Math.max(1, w);
          shape.height = Math.max(1, h);
          const shapeContext = shape.getContext('2d', { willReadFrequently: true });
          if (!shapeContext) continue;
          shapeContext.drawImage(image, 0, 0, shape.width, shape.height);
          const pixels = shapeContext.getImageData(0, 0, shape.width, shape.height).data;
          const alpha = new Uint8Array(shape.width * shape.height);
          for (let p = 0, i = 3; p < alpha.length; p++, i += 4) alpha[p] = pixels[i];
          const line = cutLine({ width: shape.width, height: shape.height, data: alpha }, 1.5);
          if (!line.path) continue;
          context.save();
          context.translate(x, y);
          context.strokeStyle = '#D14B4B';
          context.lineWidth = Math.max(1, dpi / 300);
          context.setLineDash([dpi / 25, dpi / 50]);
          context.stroke(new Path2D(line.path));
          context.restore();
        }
      }
      return laid;
    },
    [chosen, settings, urls],
  );

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    void draw(node, PREVIEW_DPI);
  }, [draw]);

  const download = async () => {
    setBusy(true);
    setSaid(null);
    setProblem(null);
    try {
      const target = document.createElement('canvas');
      const laid = await draw(target, settings.dpi);
      const blob = await new Promise<Blob | null>((resolve) => target.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('That sheet could not be made.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sticker-sheet-${laid.page.id}-${settings.dpi}dpi.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSaid(
        `Saved a ${target.width} × ${target.height} PNG — ${laid.placed.length} stickers on ` +
          `${laid.page.name} at ${settings.dpi} DPI.`,
      );
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That sheet could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<SheetSettings>) => setSettings((was) => ({ ...was, ...patch }));

  return (
    <main className="flex h-dvh flex-col">
      <StudioHeader>
        <span className="text-[16px] font-[560]">Sticker sheet</span>
        <span className="ml-auto shrink-0 text-[13px] text-ink-500">made in this browser</span>
      </StudioHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
          <Link href="/stickers" className="text-[13px] text-accent-500 underline">
            ← Sticker Studio
          </Link>

          {!stickers.length ? (
            <div className="mt-6">
              <h1 className="text-[26px] font-semibold tracking-tight">Nothing to arrange yet</h1>
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-500">
                A sheet is made from the stickers in My stickers. Make one in the studio and save
                it, then come back.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div>
                <div className="overflow-hidden rounded-2xl border border-ink-200 bg-ink-100 p-4">
                  <canvas
                    ref={canvas}
                    aria-label="The sheet"
                    className="mx-auto block h-auto max-h-[62vh] w-auto max-w-full bg-paper shadow-sm"
                  />
                </div>
                <p className="mt-2 text-[12.5px] text-ink-500">
                  {total === 0
                    ? 'Choose how many of each sticker to put on the sheet.'
                    : `${sheet.placed.length} of ${total} on the sheet.`}
                  {sheet.overflow > 0 &&
                    ` ${sheet.overflow} did not fit — make them smaller, or print a second sheet.`}
                </p>
                {problem && (
                  <div className="mt-3">
                    <Notice level="error">{problem}</Notice>
                  </div>
                )}
                {said && (
                  <div className="mt-3">
                    <Notice level="ok">{said}</Notice>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-6">
                <div>
                  <span className="block font-[570]">Paper</span>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {PAGES.map((page) => (
                      <button
                        key={page.id}
                        type="button"
                        aria-pressed={settings.pageId === page.id}
                        onClick={() => set({ pageId: page.id })}
                        className={cx(
                          'rounded-lg border px-3 py-2 text-left text-[13.5px] transition-colors',
                          settings.pageId === page.id
                            ? 'border-accent-500 bg-accent-50'
                            : 'border-ink-200 hover:border-ink-300',
                        )}
                      >
                        <span className="font-[560]">{page.name}</span>
                        <span className="ml-2 text-ink-500">
                          {page.width} × {page.height} in
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <Control
                  label="How big each sticker is"
                  hint="Across, in tenths of an inch. Every sticker on the sheet shares this width and keeps its own shape."
                  value={Math.round(settings.stickerWidth * 10)}
                  min={5}
                  max={60}
                  onChange={(n) => set({ stickerWidth: n / 10 })}
                />
                <Control
                  label="Margin"
                  hint="Blank paper at every edge, in hundredths of an inch. A quarter inch is inside what most printers can reach."
                  value={Math.round(settings.margin * 100)}
                  min={0}
                  max={100}
                  onChange={(n) => set({ margin: n / 100 })}
                />
                <Control
                  label="Space between them"
                  hint="In hundredths of an inch. Enough to get scissors or a blade between them."
                  value={Math.round(settings.gap * 100)}
                  min={0}
                  max={75}
                  onChange={(n) => set({ gap: n / 100 })}
                />

                <Toggle
                  label="Show cut lines"
                  checked={settings.cutLines}
                  onChange={(cutLines) => set({ cutLines })}
                />
                <p className="-mt-3 text-[13px] leading-snug text-ink-500">
                  A dashed red line round each one, traced from its own edge at the size it sits on
                  the sheet. For cutting by hand — a cutting machine wants the SVG from the studio.
                </p>

                <div>
                  <span className="block font-[570]">Resolution</span>
                  <div className="mt-2 flex gap-1.5">
                    {[150, 300, 600].map((dpi) => (
                      <button
                        key={dpi}
                        type="button"
                        aria-pressed={settings.dpi === dpi}
                        onClick={() => set({ dpi })}
                        className={cx(
                          'flex-1 rounded-lg border px-2 py-2 text-[13.5px] font-[560] transition-colors',
                          settings.dpi === dpi
                            ? 'border-accent-500 bg-accent-50'
                            : 'border-ink-200 hover:border-ink-300',
                        )}
                      >
                        {dpi} DPI
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-ink-200 pt-5">
                  <span className="block font-[570]">Which stickers</span>
                  <div className="mt-3 flex flex-col gap-2">
                    {stickers.map((sticker) => (
                      <div key={sticker.id} className="flex items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
                          {urls[sticker.id] && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={urls[sticker.id]}
                              alt=""
                              className="max-h-full max-w-full object-contain"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13.5px]">{sticker.name}</span>
                        <span className="flex items-center gap-1">
                          <Button
                            onClick={() =>
                              setCounts((was) => ({
                                ...was,
                                [sticker.id]: Math.max(0, (was[sticker.id] ?? 0) - 1),
                              }))
                            }
                          >
                            −
                          </Button>
                          <span className="w-7 text-center text-[13.5px] tabular-nums">
                            {counts[sticker.id] ?? 0}
                          </span>
                          <Button
                            onClick={() =>
                              setCounts((was) => ({
                                ...was,
                                [sticker.id]: Math.min(200, (was[sticker.id] ?? 0) + 1),
                              }))
                            }
                          >
                            +
                          </Button>
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      disabled={busy || !sheet.placed.length}
                      onClick={() => void download()}
                    >
                      Download the sheet (PNG)
                    </Button>
                    <Button disabled={busy} onClick={() => setCounts({})}>
                      Clear
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

const cache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string): Promise<HTMLImageElement> {
  const had = cache.get(url);
  if (had) return had;
  const made = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That picture could not be read.'));
    image.src = url;
  });
  cache.set(url, made);
  return made;
}
