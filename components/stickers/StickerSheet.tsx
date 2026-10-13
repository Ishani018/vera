'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAssetUrl } from '@/lib/assets';
import { listStickers } from '@/lib/cover/library';
import { cutLine } from '@/lib/stickers/cutline';
import {
  DEFAULT_SHEET,
  PAGES,
  atDpi,
  fromSteps,
  layOutSheet,
  readable,
  toSteps,
  unitsFor,
  type SheetSettings,
} from '@/lib/stickers/sheet';
import type { LibrarySticker } from '@/lib/types';
import { StudioHeader, StudioTitle } from '../StudioHeader';
import { PalettePicker } from '../PalettePicker';
import { StickerTabs } from './StickerTabs';
import { Thumb } from './Thumb';
import { MinusIcon } from './icons';
import { Button, Notice, Slider, Toggle, cx } from '../ui';

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
    void listStickers().then((rows) => {
      setStickers(rows);
      /*
        A selection handed over from the hub, in the address: "put these four
        on a sheet" arrives as ?add=id,id,id and becomes one of each. Read once,
        on the way in, and checked against what is actually in the library — an
        address can say anything, and an id that is not here is simply ignored.
      */
      const asked = new URLSearchParams(window.location.search).get('add');
      if (!asked) return;
      const here = new Set(rows.map((one) => one.id));
      const wanted = asked.split(',').filter((id) => here.has(id));
      if (wanted.length) setCounts(Object.fromEntries(wanted.map((id) => [id, 1])));
    });
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

  const units = unitsFor(settings.pageId);

  /** One measurement, in whatever units the chosen paper is sold in. */
  const Measure = ({
    label,
    hint,
    value,
    least,
    most,
    onChange,
  }: {
    label: string;
    hint: string;
    value: number;
    least: number;
    most: number;
    onChange: (inches: number) => void;
  }) => (
    <div>
      <span className="block text-[13px] font-[570]" title={hint}>
        {label}
      </span>
      <div className="mt-1.5">
        <Slider
          value={toSteps(value, units)}
          min={toSteps(least, units)}
          max={toSteps(most, units)}
          step={1}
          onChange={(steps) => onChange(fromSteps(steps, units))}
          // The number shown is the value actually stored, not the step the
          // slider is sitting on: the default 2 in is 50.8 mm, which is not on
          // the half-millimetre grid, and reading "51 mm" beside a caption
          // saying "50.8 mm" would be two answers to one question.
          format={() => readable(value, units)}
        />
      </div>
    </div>
  );

  return (
    <main className="flex h-dvh flex-col" style={{ background: 'var(--studio-page)' }}>
      <StudioHeader>
        <StudioTitle>Sticker Studio</StudioTitle>
        <span className="ml-auto flex shrink-0 items-center gap-3 self-stretch">
          <span className="flex items-stretch self-stretch">
            <StickerTabs />
          </span>
          <PalettePicker compact />
        </span>
      </StudioHeader>

      {!stickers.length ? (
        <div className="grid flex-1 place-items-center px-6">
          <div className="max-w-xl text-center">
            <h1 className="display text-[24px] tracking-tight">Nothing to arrange yet</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-500">
              A sheet is made from the stickers in My stickers. Make one in the studio and save it,
              then come back.
            </p>
          </div>
        </div>
      ) : (
        /*
          Two columns, both of them fixed to the window: the sheet on the left
          at whatever size the window allows, the controls on the right with
          their own scrollbar. The page itself never scrolls, so the Download
          button cannot be below the fold — which is where it was, under a
          column of sliders, on a 720px screen.
        */
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col p-4" style={{ background: 'var(--studio-page)' }}>
            {/*
              The pane is positioned and the canvas fills it absolutely. A
              canvas carries its own size — 612 by 792 at 72 DPI for Letter —
              and `max-height: 100%` against a flexible parent is a circular
              question a browser answers by letting it have its way, which
              pushed the window past 900 px tall on a 720 px screen.
            */}
            <div className="relative min-h-0 flex-1">
              {/*
                A hard 1px outline, because it is a sheet of paper and a proof
                sheet is drawn with a line rather than lifted with a blur.

                Nothing is animated onto it: the stickers on this canvas are
                drawn by the same `draw()` the download uses — that is the whole
                point of this file — so any motion here would be a change to the
                code that makes the exported PNG.
              */}
              <canvas
                ref={canvas}
                aria-label="The sheet"
                className={cx(
                  'absolute inset-0 m-auto max-h-full max-w-full bg-sheet object-contain',
                  'border border-ink-900',
                )}
              />
            </div>
            <p className="mt-2 shrink-0 text-center text-[12px] text-ink-500">
              {total === 0
                ? 'Press a sticker on the right to put it on the sheet.'
                : `${sheet.placed.length} of ${total} on the sheet · ${sheet.page.name} · ` +
                  `${readable(settings.stickerWidth, units)} across each`}
              {sheet.overflow > 0 && ` · ${sheet.overflow} did not fit`}
            </p>
          </div>

          <div
            className="flex w-[352px] shrink-0 flex-col border-l"
            style={{ background: 'var(--studio-card)', borderColor: 'var(--studio-line)' }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-12 shrink-0 text-[12px] text-ink-500">Paper</span>
                {PAGES.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    aria-pressed={settings.pageId === page.id}
                    title={`${page.name} — ${readable(page.width, unitsFor(page.id))} by ${readable(page.height, unitsFor(page.id))}`}
                    onClick={() => set({ pageId: page.id })}
                    className={cx(
                      'rounded-lg border px-2.5 py-1.5 text-[13px] font-[560] transition-colors',
                      settings.pageId === page.id
                        ? 'border-accent-500 bg-accent-50'
                        : 'border-ink-200 hover:border-ink-300',
                    )}
                  >
                    {page.name}
                  </button>
                ))}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="w-12 shrink-0 text-[12px] text-ink-500">Detail</span>
                {[150, 300, 600].map((dpi) => (
                  <button
                    key={dpi}
                    type="button"
                    aria-pressed={settings.dpi === dpi}
                    title={
                      dpi === 150
                        ? 'Fine for a draft on plain paper'
                        : dpi === 300
                          ? 'What a printer wants for something you sell'
                          : 'Twice that again — a much larger file, for glossy stock'
                    }
                    onClick={() => set({ dpi })}
                    className={cx(
                      'rounded-lg border px-2.5 py-1.5 text-[13px] font-[560] transition-colors',
                      settings.dpi === dpi
                        ? 'border-accent-500 bg-accent-50'
                        : 'border-ink-200 hover:border-ink-300',
                    )}
                  >
                    {dpi} DPI
                  </button>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-3.5">
                <Measure
                  label="Sticker width"
                  hint="How wide each one is on the paper. They all share this width and each keeps its own shape."
                  value={settings.stickerWidth}
                  least={0.5}
                  most={6}
                  onChange={(stickerWidth) => set({ stickerWidth })}
                />
                <Measure
                  label="Margin"
                  hint="Blank paper at every edge. A quarter inch is inside what most printers can reach."
                  value={settings.margin}
                  least={0}
                  most={1}
                  onChange={(margin) => set({ margin })}
                />
                <Measure
                  label="Space between"
                  hint="Enough to get scissors or a blade between them."
                  value={settings.gap}
                  least={0}
                  most={0.75}
                  onChange={(gap) => set({ gap })}
                />
                {/* The explanation is a tooltip: it is four lines of prose
                    about a switch whose label already says what it does. */}
                <span
                  className="block"
                  title="A dashed red line round each one, traced from its own edge. For cutting by hand — a cutting machine wants the SVG from the studio."
                >
                  <Toggle
                    label="Cut lines"
                    checked={settings.cutLines}
                    onChange={(cutLines) => set({ cutLines })}
                  />
                </span>
              </div>

              <div className="mt-5 border-t border-ink-200 pt-4">
                <span className="block text-[13px] font-[570]">
                  Which stickers
                  <span className="ml-2 font-normal text-ink-500">press to add one</span>
                </span>
                <div className="mt-2.5 grid grid-cols-3 gap-2.5">
                  {stickers.map((sticker) => {
                    const count = counts[sticker.id] ?? 0;
                    return (
                      <Thumb
                        key={sticker.id}
                        url={urls[sticker.id]}
                        name={sticker.name}
                        title={`${sticker.name} — press to add one${count ? `, ${count} on the sheet` : ''}`}
                        selected={count > 0}
                        onClick={() =>
                          setCounts((was) => ({
                            ...was,
                            [sticker.id]: Math.min(200, (was[sticker.id] ?? 0) + 1),
                          }))
                        }
                        badge={
                          count > 0 ? (
                            <span className="pointer-events-none absolute right-1 top-1 flex min-w-5 items-center justify-center rounded-full bg-accent-500 px-1.5 py-0.5 text-[11px] font-[600] tabular-nums text-paper shadow">
                              {count}
                            </span>
                          ) : null
                        }
                        corner={
                          count > 0 ? (
                            <button
                              type="button"
                              aria-label={`One fewer ${sticker.name}`}
                              title={`One fewer ${sticker.name}`}
                              onClick={() =>
                                setCounts((was) => ({
                                  ...was,
                                  [sticker.id]: Math.max(0, (was[sticker.id] ?? 0) - 1),
                                }))
                              }
                              className="absolute left-1 top-1 grid size-5 place-items-center rounded-full border border-ink-200 bg-paper/95 text-ink-700 shadow transition-colors hover:border-accent-500"
                            >
                              <MinusIcon size={12} />
                            </button>
                          ) : null
                        }
                      />
                    );
                  })}
                </div>
              </div>

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

            {/* Never below the fold: the one thing this page is for. */}
            <div className="shrink-0 border-t border-ink-200 px-4 py-3">
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  disabled={busy || !sheet.placed.length}
                  onClick={() => void download()}
                >
                  Download the sheet
                </Button>
                <Button disabled={busy || !total} onClick={() => setCounts({})}>
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
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
