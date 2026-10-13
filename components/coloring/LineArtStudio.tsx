'use client';

import { useEffect, useState } from 'react';
import { getAssetUrl } from '@/lib/assets';
import { pictureAssetId, usesLineArt } from '@/lib/coloring/picture';
import { pageQuality, placeOnPage, printedSize, shapesAgree } from '@/lib/coloring/quality';
import { MIN_COVER_DPI } from '@/lib/kdp';
import { useColoring } from '@/lib/coloring/store';
import type { ColoringBook, ColoringPage, LineArtSettings, SourceKind } from '@/lib/types';
import { Button, Toggle, cx } from '../ui';
import { Control } from './LineArtControls';
import { pageName } from '@/lib/home/naming';

/**
 * One picture, before and after, with the controls that decide what happens
 * between them.
 *
 * It only shows: the conversion queue in lib/coloring/convert.ts owns the
 * running. Two places deciding to convert the same page would race to write the
 * result, and the one that lost would leave the book pointing at art made from
 * settings nobody has any more.
 *
 * Every conversion starts from the original painting rather than the last
 * result, so sliding a slider back and forth cannot accumulate: what is on the
 * right is exactly what these settings do to what is on the left.
 */
export function LineArtStudio() {
  const book = useColoring((s) => s.book);
  const selectedId = useColoring((s) => s.selectedId);
  const setPageSettings = useColoring((s) => s.setPageSettings);
  const applyToAll = useColoring((s) => s.applyToAll);
  const setSource = useColoring((s) => s.setSource);
  const setBookSetting = useColoring((s) => s.setBookSetting);
  const setPlacement = useColoring((s) => s.setPlacement);
  const busy = useColoring((s) => s.busy);

  const page = book?.pages.find((p) => p.id === selectedId) ?? null;
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [lineUrl, setLineUrl] = useState<string | null>(null);
  const [appliedAll, setAppliedAll] = useState(false);

  useEffect(() => {
    let live = true;
    if (!page) return setSourceUrl(null);
    void getAssetUrl(page.sourceAssetId).then((url) => live && setSourceUrl(url));
    return () => {
      live = false;
    };
  }, [page?.sourceAssetId, page]);

  // What actually prints: the line art when that is on and made, the upload as
  // it came when line art is off.
  const printsFrom = page && book ? pictureAssetId(book, page) : null;
  const lineArt = book ? usesLineArt(book) : true;
  useEffect(() => {
    let live = true;
    if (!printsFrom || (lineArt && !page?.lineArtAssetId)) return setLineUrl(null);
    void getAssetUrl(printsFrom).then((url) => live && setLineUrl(url));
    return () => {
      live = false;
    };
  }, [printsFrom, lineArt, page?.lineArtAssetId]);

  if (!book) return null;
  if (!page) {
    return (
      <p className="rounded-2xl bg-ink-100 px-5 py-8 text-center text-[15px] text-ink-500">
        Add a picture, then pick one to work on it.
      </p>
    );
  }

  const set = (patch: Partial<LineArtSettings>) =>
    setPageSettings(page.id, { ...page.settings, ...patch });

  return (
    // The picture stays put and the controls move. Sliders under the preview
    // meant scrolling down to move one and back up to see what it did, which
    // is no way to judge a setting: the two have to be in view together.
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="sticky top-0 z-10 -mx-2 bg-ink-100 px-2 pb-4 pt-1">
        <div className="flex items-baseline gap-3">
          <h3 className="flex-1 truncate text-[18px] font-semibold">{pageName(page, 0)}</h3>
          {lineArt && busy.has(page.id) && <span className="text-[14px] text-ink-500">converting…</span>}
          {!lineArt && <span className="text-[14px] text-ink-500">prints as uploaded</span>}
        </div>
        {lineArt ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Pane label={page.source === 'lineart' ? 'What you uploaded' : 'Your painting'} url={sourceUrl} />
            <PagePane page={page} book={book} url={lineUrl} />
          </div>
        ) : (
          // One picture, not two: there is no before and after when nothing
          // happens to it, and the page it lands on is the thing worth seeing.
          <div className="mx-auto mt-3 max-w-[460px]">
            <PagePane page={page} book={book} url={lineUrl} />
          </div>
        )}
        <Resolution page={page} book={book} />
      </div>

      {/* Its own scroller on a wide screen, so a long list of settings never
          pushes the picture off the top. */}
      <div className="flex flex-col gap-6 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-8.5rem)] xl:overflow-y-auto xl:pr-1">
      <div>
        <span className="block font-[570]">How it sits on the page</span>
        <span className="mt-0.5 block text-[14px] text-ink-500">
          {shapesAgree(page, book)
            ? 'This picture is about the shape of the page already.'
            : 'This picture is not the shape of the page, so something has to give.'}
        </span>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {(
            [
              ['contain', 'Fit the whole picture', 'Paper left over at the sides'],
              ['cover', 'Fill the page', 'Runs to the edge; the rest is trimmed off'],
            ] as Array<[ColoringPage['fit'], string, string]>
          ).map(([value, label, note]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPlacement(page.id, { fit: value })}
              className={cx(
                'rounded-xl border-2 px-3 py-3 text-left transition-colors',
                page.fit === value ? 'border-accent-500 bg-accent-50' : 'border-ink-200 hover:border-ink-300',
              )}
            >
              <span className="block text-[15px] font-[570]">{label}</span>
              <span className="mt-0.5 block text-[13px] text-ink-500">{note}</span>
            </button>
          ))}
        </div>
        <div className="mt-4">
          <Toggle
            label="Turn it sideways"
            hint="A wide picture on a tall page is worth a quarter turn."
            checked={page.rotate === 90}
            onChange={(on) => setPlacement(page.id, { rotate: on ? 90 : 0 })}
          />
        </div>
      </div>

      {lineArt && (
      <>
      <div>
        <span className="block font-[570]">What kind of picture is this?</span>
        <span className="mt-0.5 block text-[14px] text-ink-500">
          {page.sourceGuessed ? 'Worked out from the picture — change it if that is wrong.' : 'You chose this.'}
        </span>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {(
            [
              ['painting', 'Painting or photo', 'Traced into line art'],
              ['lineart', 'Already line art', 'Cleaned up, never traced'],
            ] as Array<[SourceKind, string, string]>
          ).map(([value, label, note]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSource(page.id, value)}
              className={cx(
                'rounded-xl border-2 px-3 py-3 text-left transition-colors',
                page.source === value
                  ? 'border-accent-500 bg-accent-50'
                  : 'border-ink-200 hover:border-ink-300',
              )}
            >
              <span className="block text-[15px] font-[570]">{label}</span>
              <span className="mt-0.5 block text-[13px] text-ink-500">{note}</span>
            </button>
          ))}
        </div>
        {page.source === 'lineart' && (
          <p className="mt-3 rounded-xl bg-ink-100 px-4 py-3 text-[14px] leading-relaxed text-ink-700">
            Nothing is traced on this one — tracing a drawing would find both sides of every stroke
            and give you a hollow, doubled outline. It is thresholded to pure black and white
            instead, which takes off the soft edges and any grey shading.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-5">
        {/* Tracing is only a choice when there is something to trace. */}
        {page.source === 'painting' && (
          <div>
            <span className="block font-[570]">What to keep</span>
            <span className="mt-0.5 block text-[14px] text-ink-500">
              Shading keeps tonal areas as texture. Outlines keeps only the edges — better for
              soft, blended paintings, which have no edges inside the wash to find.
            </span>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {(
                [
                  ['threshold', 'Shading'],
                  ['edges', 'Outlines only'],
                ] as Array<[LineArtSettings['mode'], string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set({ mode: value })}
                  className={cx(
                    'rounded-xl border-2 px-3 py-3 text-[15px] font-[550] transition-colors',
                    page.settings.mode === value
                      ? 'border-accent-500 bg-accent-50 text-accent-500'
                      : 'border-ink-200 hover:border-ink-300',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <Control
          label={page.source === 'lineart' ? 'How much grey to keep' : 'Detail'}
          hint={
            page.source === 'lineart'
              ? 'Lower drops soft shading and background texture'
              : 'How much of the fine texture survives'
          }
          value={page.settings.detail}
          onChange={(detail) => set({ detail })}
        />
        <Control
          label="Line thickness"
          hint="Heavier lines are easier to colour inside, and print better"
          value={page.settings.thickness}
          onChange={(thickness) => set({ thickness })}
        />
        <Control
          label="Noise cleanup"
          hint={
            page.source === 'lineart'
              ? 'Lifts off stray specks'
              : 'Softens first, then lifts off the specks'
          }
          value={page.settings.cleanup}
          onChange={(cleanup) => set({ cleanup })}
        />
        {/* Only tracing makes an edge ragged. A page that arrived already drawn
            has nothing to straighten, and small lettering to lose. */}
        {page.source === 'painting' && (
          <Control
            label="Line smoothing"
            hint="Straightens a wobbly traced edge. It will not go further than the lines can take."
            value={page.settings.smoothing}
            onChange={(smoothing) => set({ smoothing })}
          />
        )}
        <Toggle
          label={page.source === 'lineart' ? 'It is white lines on black' : 'My painting is light on dark'}
          hint="Flips it before anything else happens"
          checked={page.settings.invert}
          onChange={(invert) => set({ invert })}
        />
      </div>

      </>
      )}

      {/* About the whole book, not about tracing, so it stays whichever way the
          pictures are made. */}
      <div className="rounded-2xl border border-ink-200 bg-paper px-5 py-4">
        <Toggle
          label="This book contains AI-generated images"
          hint="Shown again at export. KDP asks to be told when it publishes."
          checked={book.coloring.containsAiImages}
          onChange={(value) => setBookSetting('containsAiImages', value)}
        />
        {book.coloring.containsAiImages && (
          <p className="mt-3 text-[14px] leading-relaxed text-ink-500">
            Pages made from your own paintings do not need this. If this book mixes the two, it is
            simplest to split them into separate books — then only one of them carries the
            disclosure. Check KDP&rsquo;s current content guidelines when you publish; the wording
            is theirs and it moves.
          </p>
        )}
      </div>

      {lineArt && (
      <div className="flex items-center gap-3">
        <Button
          onClick={() => {
            applyToAll(page.settings);
            setAppliedAll(true);
            setTimeout(() => setAppliedAll(false), 2200);
          }}
        >
          {appliedAll ? 'Applied to every page' : 'Use these settings for every page'}
        </Button>
        <span className="text-[14px] text-ink-500">
          {book.pages.length} page{book.pages.length === 1 ? '' : 's'}
        </span>
      </div>
      )}
      </div>
    </div>
  );
}

function Pane({ label, url, pale }: { label: string; url: string | null; pale?: boolean }) {
  return (
    <div>
      <span className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.07em] text-ink-500">
        {label}
      </span>
      <div
        className={cx(
          'grid aspect-square place-items-center overflow-hidden rounded-xl border border-ink-200',
          pale ? 'bg-paper' : 'bg-ink-100',
        )}
      >
        {url ? (
          <img src={url} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-[14px] text-ink-500">…</span>
        )}
      </div>
    </div>
  );
}

/**
 * What resolution this page will actually print at.
 *
 * The number that matters is the long edge of what gets saved, against the long
 * edge 300 DPI needs at this trim. Enlarging is only honest for line art: a
 * drawing is a handful of hard edges and survives being made bigger, whereas a
 * painting cannot be given detail it never had, so its reading is left to stand
 * at whatever the camera gave.
 */
function Resolution({ page, book }: { page: ColoringPage; book: ColoringBook }) {
  const { dpi, factor, stored, natural, stretched, soft } = pageQuality(page, book);
  if (!natural) return null;

  return (
    <p
      className={cx(
        'mt-3 rounded-xl px-4 py-3 text-[14px] leading-relaxed',
        stretched || soft ? 'bg-amber-50 text-amber-900' : 'bg-ink-100 text-ink-700',
      )}
    >
      {natural}px across
      {factor > 1.01 ? `, enlarged ${factor.toFixed(1)}× to ${stored}px` : ''} — prints at about{' '}
      {Math.round(dpi)} DPI.{' '}
      {stretched
        ? 'That is a long way to stretch a small picture. It will print, but the lines may come out soft — a bigger original would do better.'
        : soft
          ? `Under the ${MIN_COVER_DPI} DPI KDP asks for. It will still print, but the lines will look a little rough.`
          : `Comfortably above the ${MIN_COVER_DPI} DPI KDP asks for.`}
    </p>
  );
}

/**
 * The line art as it will actually be printed: on a page of the right shape,
 * placed the way the poet asked for.
 *
 * A square preview flatters everything. A wide picture floating in the middle
 * of a square one looks fine there and looks like a mistake on paper, which is
 * the whole reason these controls exist — so the preview is the page.
 */
function PagePane({
  page,
  book,
  url,
}: {
  page: ColoringPage;
  book: ColoringBook;
  url: string | null;
}) {
  const printed = printedSize(book);
  const { turned, boxWidth, cropped } = placeOnPage(page, book);

  return (
    <div>
      <span className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.07em] text-ink-500">
        On the page{cropped ? ' · cropped' : ''}
      </span>
      <div
        className="relative grid place-items-center overflow-hidden rounded-xl border border-ink-200 bg-paper"
        style={{ aspectRatio: `${printed.width} / ${printed.height}` }}
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
          <span className="text-[14px] text-ink-500">…</span>
        )}
      </div>
    </div>
  );
}
