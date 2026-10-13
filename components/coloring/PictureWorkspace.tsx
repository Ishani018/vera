'use client';

import { useEffect, useState } from 'react';
import { getAssetUrl } from '@/lib/assets';
import { pictureAssetId, usesLineArt } from '@/lib/coloring/picture';
import { pageQuality, placeOnPage, printedSize, shapesAgree } from '@/lib/coloring/quality';
import { useColoring } from '@/lib/coloring/store';
import { pageName } from '@/lib/home/naming';
import { MIN_COVER_DPI } from '@/lib/kdp';
import { DEFAULT_LINE_ART } from '@/lib/projects';
import type { ColoringBook, ColoringPage, LineArtSettings, SourceKind } from '@/lib/types';
import { Button, Toggle, cx } from '../ui';
import { Panel, PanelSection, PanelState } from '../panel/Panel';
import { Control } from './LineArtControls';

/**
 * The picture being worked on: a stage to look at it, and a panel to change it.
 *
 * Two components rather than one, because they live in different columns — the
 * stage in the middle, the panel on the right, exactly as the cover designer and
 * the Sticker Studio lay out theirs — and so the screen reads the same as the
 * other two editors in the app.
 *
 * The stage only shows. The conversion queue in lib/coloring/convert.ts owns the
 * running: two places deciding to convert the same page would race to write the
 * result. Every conversion starts from the original rather than the last result,
 * so moving a slider back and forth cannot accumulate: what is on the right is
 * exactly what these settings do to what is on the left.
 */

/** The page in hand, or null. Shared by the stage and the panel so they cannot disagree about it. */
function useSelected() {
  const book = useColoring((s) => s.book);
  const selectedId = useColoring((s) => s.selectedId);
  const page = book?.pages.find((p) => p.id === selectedId) ?? null;
  return { book, page };
}

function useAssetUrl(assetId: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!assetId) return setUrl(null);
    void getAssetUrl(assetId).then((next) => live && setUrl(next));
    return () => {
      live = false;
    };
  }, [assetId]);
  return url;
}

/* ------------------------------------------------------------------- stage */

export function PictureStage() {
  const { book, page } = useSelected();
  const busy = useColoring((s) => s.busy);
  const original = useAssetUrl(page?.sourceAssetId ?? null);
  const lineArt = book ? usesLineArt(book) : true;
  // What actually prints: the line art when that is on and made, the upload when off.
  const printsFrom = page && book ? pictureAssetId(book, page) : null;
  const printed = useAssetUrl(lineArt && !page?.lineArtAssetId ? null : printsFrom);

  if (!book) return null;
  if (!page) {
    return (
      <div className="grid h-full place-items-center px-8 py-16 text-center">
        <div>
          <p className="display text-[24px] tracking-tight">
            {book.pages.length ? 'Pick a page' : 'Add your first picture'}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[15px] leading-snug" style={{ color: 'var(--color-ink-500)' }}>
            {book.pages.length
              ? 'Choose one on the left to see it as it will print and adjust it.'
              : 'Drop pictures on the left. Each one becomes a page.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-8 pb-2 pt-6">
        <h2 className="min-w-0 flex-1 truncate text-[22px] font-semibold tracking-tight">{pageName(page, 0)}</h2>
        {lineArt && busy.has(page.id) && <Chip tone="quiet">Converting…</Chip>}
        {!lineArt && <Chip tone="quiet">Prints as uploaded</Chip>}
        <Quality page={page} book={book} />
      </header>

      <div className="grid min-h-0 flex-1 content-start items-start gap-6 overflow-y-auto px-8 pb-8 pt-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] max-lg:grid-cols-1">
        {lineArt && (
          <Sheet label={page.source === 'lineart' ? 'What you uploaded' : 'Your painting'}>
            <div className="grid aspect-square place-items-center overflow-hidden rounded-[6px] bg-white">
              {original ? (
                <img src={original} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-[14px]" style={{ color: 'var(--color-ink-500)' }}>…</span>
              )}
            </div>
          </Sheet>
        )}
        <div className={cx(!lineArt && 'lg:col-span-2 mx-auto w-full max-w-[560px]')}>
          <OnThePage page={page} book={book} url={printed} />
        </div>
      </div>
    </div>
  );
}

/** A labelled picture on the stage, sitting on a soft shadow like a card. */
function Sheet({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <figure className="m-0">
      <figcaption className="mono-label mb-2 flex items-baseline gap-2" style={{ fontSize: 10, color: 'var(--color-ink-500)' }}>
        {label}
        {note && <span className="normal-case tracking-normal">{note}</span>}
      </figcaption>
      <div
        className="rounded-[10px] border p-3"
        style={{
          background: 'var(--studio-card)',
          borderColor: 'var(--studio-line)',
          boxShadow: 'var(--studio-shadow-card)',
        }}
      >
        {children}
      </div>
    </figure>
  );
}

/**
 * The picture as it will be printed: on a page of the right shape, placed the way
 * it was asked for. A square preview flatters everything — a wide picture floating
 * in the middle of a square one looks fine there and like a mistake on paper — so
 * the preview is the page.
 */
function OnThePage({ page, book, url }: { page: ColoringPage; book: ColoringBook; url: string | null }) {
  const sheet = printedSize(book);
  const { turned, boxWidth, cropped } = placeOnPage(page, book);
  return (
    <Sheet label="On the page" note={cropped ? '· cropped at the edge' : undefined}>
      <div
        className="relative mx-auto grid place-items-center overflow-hidden rounded-[3px] bg-white"
        style={{ aspectRatio: `${sheet.width} / ${sheet.height}`, maxHeight: '58vh', boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.08)' }}
      >
        {url && page.naturalWidth ? (
          <img
            src={url}
            alt=""
            className="absolute left-1/2 top-1/2"
            style={{
              width: `${boxWidth}%`,
              aspectRatio: `${page.naturalWidth} / ${page.naturalHeight}`,
              transform: `translate(-50%, -50%)${turned ? ' rotate(90deg)' : ''}`,
            }}
          />
        ) : (
          <span className="text-[14px]" style={{ color: 'var(--color-ink-500)' }}>…</span>
        )}
      </div>
    </Sheet>
  );
}

/**
 * The resolution this page will print at, as one chip.
 *
 * It used to be a paragraph in an amber box under the pictures. The number is
 * what matters, and the sentence only when there is something to be told.
 */
function Quality({ page, book }: { page: ColoringPage; book: ColoringBook }) {
  const { dpi, factor, natural, stretched, soft } = pageQuality(page, book);
  if (!natural) return null;
  const bad = stretched || soft;
  const detail =
    `${natural}px across${factor > 1.01 ? `, enlarged ${factor.toFixed(1)}×` : ''}. ` +
    (stretched
      ? 'That is a long way to stretch a small picture. It will print, but the lines may come out soft — a bigger original would do better.'
      : soft
        ? `Under the ${MIN_COVER_DPI} DPI KDP asks for. It will still print, but the lines will look a little rough.`
        : `Comfortably above the ${MIN_COVER_DPI} DPI KDP asks for.`);
  return (
    <Chip tone={bad ? 'warn' : 'good'} title={detail}>
      {Math.round(dpi)} dpi
      {stretched ? ` · enlarged ${factor.toFixed(1)}×` : soft ? ' · low' : ''}
    </Chip>
  );
}

function Chip({
  tone,
  children,
  title,
}: {
  tone: 'good' | 'warn' | 'quiet';
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-[600] tabular-nums',
        tone === 'good' && 'bg-emerald-100 text-emerald-800',
        tone === 'warn' && 'bg-amber-100 text-amber-800',
        tone === 'quiet' && 'bg-ink-100 text-ink-700',
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------- panel */

export function PictureInspector() {
  const { book, page } = useSelected();
  const setPageSettings = useColoring((s) => s.setPageSettings);
  const applyToAll = useColoring((s) => s.applyToAll);
  const setSource = useColoring((s) => s.setSource);
  const setBookSetting = useColoring((s) => s.setBookSetting);
  const setPlacement = useColoring((s) => s.setPlacement);
  const [appliedAll, setAppliedAll] = useState(false);

  if (!book) return null;
  const lineArt = usesLineArt(book);

  const wholeBook = (
    <PanelSection title="This book" collapsible defaultOpen={book.coloring.containsAiImages}>
      <Toggle
        label="Contains AI-generated images"
        hint="Shown again at export. KDP asks to be told when it publishes. Pages made from your own paintings do not need this; if the book mixes the two, it is simplest to split them into separate books."
        checked={book.coloring.containsAiImages}
        onChange={(value) => setBookSetting('containsAiImages', value)}
      />
    </PanelSection>
  );

  if (!page) {
    return (
      <Panel title="Picture">
        <PanelState kind="empty">
          {book.pages.length ? 'Pick a page to adjust it.' : 'Nothing to adjust yet.'}
        </PanelState>
        {wholeBook}
      </Panel>
    );
  }

  const set = (patch: Partial<LineArtSettings>) => setPageSettings(page.id, { ...page.settings, ...patch });
  const painting = page.source === 'painting';
  const fits = shapesAgree(page, book);

  return (
    <Panel
      title="Picture"
      footer={
        lineArt ? (
          <Button
            className="w-full"
            onClick={() => {
              applyToAll(page.settings);
              setAppliedAll(true);
              setTimeout(() => setAppliedAll(false), 2200);
            }}
          >
            {appliedAll ? 'Applied to every page' : `Use these for all ${book.pages.length} pages`}
          </Button>
        ) : undefined
      }
    >
      <PanelSection
        title="On the page"
        hint={
          fits
            ? 'This picture is about the shape of the page already.'
            : 'This picture is not the shape of the page, so something has to give: fit leaves paper at the sides, fill runs to the edge and trims the rest.'
        }
      >
        <Two
          value={page.fit}
          onChange={(fit) => setPlacement(page.id, { fit })}
          options={[
            ['contain', 'Fit', 'Whole picture, paper left over'],
            ['cover', 'Fill', 'Runs to the edge, rest trimmed'],
          ]}
        />
        <Toggle
          label="Turn it sideways"
          hint="A wide picture on a tall page is worth a quarter turn."
          checked={page.rotate === 90}
          onChange={(on) => setPlacement(page.id, { rotate: on ? 90 : 0 })}
        />
      </PanelSection>

      {lineArt && (
        <>
          <PanelSection
            title="This picture is"
            hint={
              page.sourceGuessed
                ? 'Worked out from the picture — change it if that is wrong. A drawing is never traced: tracing one finds both sides of every stroke and gives a hollow, doubled outline, so it is thresholded to pure black and white instead.'
                : 'You chose this. A drawing is never traced: tracing one finds both sides of every stroke and gives a hollow, doubled outline.'
            }
          >
            <Two
              value={page.source}
              onChange={(source: SourceKind) => setSource(page.id, source)}
              options={[
                ['painting', 'Painting or photo', 'Traced into line art'],
                ['lineart', 'Already line art', 'Cleaned up, never traced'],
              ]}
            />
          </PanelSection>

          <PanelSection title="Lines">
            {painting && (
              <Two
                value={page.settings.mode}
                onChange={(mode: LineArtSettings['mode']) => set({ mode })}
                options={[
                  ['threshold', 'Shading', 'Keeps tonal areas as texture'],
                  ['edges', 'Outlines', 'Only the edges, for soft paintings'],
                ]}
              />
            )}
            <Control
              label={painting ? 'Detail' : 'Grey to keep'}
              hint={painting ? 'How much of the fine texture survives' : 'Lower drops soft shading and background texture'}
              value={page.settings.detail}
              defaultValue={DEFAULT_LINE_ART.detail}
              onChange={(detail) => set({ detail })}
            />
            <Control
              label="Thickness"
              hint="Heavier lines are easier to colour inside, and print better"
              value={page.settings.thickness}
              defaultValue={DEFAULT_LINE_ART.thickness}
              onChange={(thickness) => set({ thickness })}
            />
            <Control
              label="Cleanup"
              hint={painting ? 'Softens first, then lifts off the specks' : 'Lifts off stray specks'}
              value={page.settings.cleanup}
              defaultValue={DEFAULT_LINE_ART.cleanup}
              onChange={(cleanup) => set({ cleanup })}
            />
            {/* Only tracing makes an edge ragged. A page that arrived already drawn
                has nothing to straighten, and small lettering to lose. */}
            {painting && (
              <Control
                label="Smoothing"
                hint="Straightens a wobbly traced edge. It will not go further than the lines can take."
                value={page.settings.smoothing}
                defaultValue={DEFAULT_LINE_ART.smoothing}
                onChange={(smoothing) => set({ smoothing })}
              />
            )}
            <Toggle
              label={painting ? 'Light on dark' : 'White lines on black'}
              hint="Flips it before anything else happens"
              checked={page.settings.invert}
              onChange={(invert) => set({ invert })}
            />
          </PanelSection>
        </>
      )}

      {wholeBook}
    </Panel>
  );
}

/**
 * Two choices side by side, each with a line saying what it does.
 *
 * Cards rather than a pill: the second line is the point, and a pill has no room
 * for it. The same shape the Sticker Studio uses for its own pairs of choices.
 */
function Two<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<[T, string, string]>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(([id, label, note]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cx(
            'rounded-[8px] border-2 px-2.5 py-2 text-left transition-colors',
            value === id ? 'border-accent-500 bg-accent-50' : 'border-ink-200 hover:border-ink-300',
          )}
        >
          <span className="block text-[13.5px] font-[600] leading-tight">{label}</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug" style={{ color: 'var(--color-ink-500)' }}>
            {note}
          </span>
        </button>
      ))}
    </div>
  );
}
