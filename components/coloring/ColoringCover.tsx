'use client';

import { useEffect, useState } from 'react';
import { getAssetUrl } from '@/lib/assets';
import { useColoring } from '@/lib/coloring/store';
import { MIN_COVER_DPI, effectiveDpi, getTrim } from '@/lib/kdp';
import { picturesOf } from '@/lib/pictures';
import type { ColoringPage } from '@/lib/types';
import { CoverDesigner } from '../CoverDesigner';
import { cx } from '../ui';
import { pageName } from '@/lib/home/naming';

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
      <div
        className="flex items-center gap-4 border-b px-5 py-3"
        style={{ background: 'var(--studio-card)', borderColor: 'var(--studio-line)' }}
      >
        <div className="shrink-0">
          <h3 className="text-[15px] font-[600] leading-tight">Front cover picture</h3>
          <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--color-ink-500)' }}>
            {book.pages.length === 0
              ? 'Add pictures first, or just set a colour and some type.'
              : 'In colour, as you painted it.'}
          </p>
        </div>
        {book.pages.length > 0 && (
          <div className="flex min-w-0 gap-2 overflow-x-auto py-0.5">
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
          pictures={picturesOf(book)}
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
      title={`${pageName(page, 0)} · ${Math.round(dpi)} dpi on the front`}
      className={cx(
        'shrink-0 overflow-hidden rounded-[8px] border-2 transition-colors',
        selected ? 'border-accent-500' : 'border-ink-200 hover:border-ink-300',
      )}
    >
      <span className="relative block size-14 bg-white">
        {url && <img src={url} alt="" className="size-14 object-cover" />}
        {dpi > 0 && dpi < MIN_COVER_DPI && (
          <span className="absolute inset-x-0 bottom-0 bg-amber-100/90 py-0.5 text-[11px] font-semibold text-amber-900">
            {Math.round(dpi)} dpi
          </span>
        )}
      </span>
    </button>
  );
}
