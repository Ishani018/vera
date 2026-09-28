'use client';

import { useEffect, useState } from 'react';
import { getAssetUrl } from '@/lib/assets';
import { useColoring } from '@/lib/coloring/store';
import { MIN_COVER_DPI, effectiveDpi, getTrim } from '@/lib/kdp';
import type { ColoringPage } from '@/lib/types';
import { CoverDesigner } from '../CoverDesigner';
import { cx } from '../ui';

/**
 * The cover of a coloring book.
 *
 * The designer underneath is the same one the poetry side uses — a cover is
 * about the outside of a book, and the outside of a book of verse and of a
 * book of pictures are the same thing. What is added here is the one thing
 * that is particular: the front can be one of the pictures already in the
 * book, in its original colour rather than as line art. Nobody buys a coloring
 * book because the cover is black and white.
 */
export function ColoringCover({ pageCount }: { pageCount: number }) {
  const book = useColoring((s) => s.book);
  const update = useColoring((s) => s.update);
  if (!book) return null;

  const chosen = book.cover.frontImage?.assetId ?? null;
  const trim = getTrim(book.trim.trimId);

  const choose = (page: ColoringPage) =>
    update((draft) => {
      draft.cover.frontImage = {
        assetId: page.sourceAssetId,
        naturalWidth: page.naturalWidth,
        naturalHeight: page.naturalHeight,
        fit: draft.cover.frontImage?.fit ?? 'cover',
      };
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-ink-200 bg-paper px-5 py-3.5">
        <div className="flex items-baseline gap-3">
          <h3 className="text-[16px] font-semibold">Put one of your pictures on the front</h3>
          <span className="text-[13.5px] text-ink-500">
            In colour, the way you painted it — not the line art.
          </span>
        </div>
        {book.pages.length === 0 ? (
          <p className="mt-2 text-[14px] text-ink-500">
            There are no pictures in this book yet. You can still set a colour and some type.
          </p>
        ) : (
          <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1.5">
            {book.pages.map((page) => (
              <CoverChoice
                key={page.id}
                page={page}
                trimWidth={trim.width}
                selected={page.sourceAssetId === chosen}
                onChoose={() => choose(page)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <CoverDesigner
          project={book}
          update={update}
          pageCount={pageCount}
          displayFont={book.typography.title}
          // The line art, so a page from inside can be stuck on the outside.
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
    </div>
  );
}

function CoverChoice({
  page,
  trimWidth,
  selected,
  onChoose,
}: {
  page: ColoringPage;
  trimWidth: number;
  selected: boolean;
  onChoose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getAssetUrl(page.sourceAssetId).then((next) => live && setUrl(next));
    return () => {
      live = false;
    };
  }, [page.sourceAssetId]);

  // The front cover is one trim width across, so that is what the picture has
  // to fill. Said before it is chosen rather than after.
  const dpi = page.naturalWidth ? effectiveDpi(page.naturalWidth, trimWidth) : 0;

  return (
    <button
      type="button"
      onClick={onChoose}
      title={`${page.title || 'Untitled'} · ${Math.round(dpi)} dpi on the front`}
      className={cx(
        'shrink-0 overflow-hidden rounded-lg border-2 transition-colors',
        selected ? 'border-accent-500' : 'border-ink-200 hover:border-ink-300',
      )}
    >
      <span className="relative block h-20 w-20 bg-ink-100">
        {url && <img src={url} alt="" className="h-20 w-20 object-cover" />}
        {dpi > 0 && dpi < MIN_COVER_DPI && (
          <span className="absolute inset-x-0 bottom-0 bg-amber-100/90 py-0.5 text-[11px] font-semibold text-amber-900">
            {Math.round(dpi)} dpi
          </span>
        )}
      </span>
    </button>
  );
}
