'use client';

import { useEffect, useState } from 'react';
import { UnsupportedImageError, getAssetUrl, putAsset } from '@/lib/assets';
import { illustrationsOf } from '@/lib/contents';
import { id } from '@/lib/defaults';
import { MIN_COVER_DPI, effectiveDpi, getTrim } from '@/lib/kdp';
import { useStore } from '@/lib/store';
import type { Illustration } from '@/lib/types';
import { Button, Notice, cx } from './ui';
import { plateName } from '@/lib/home/naming';

/**
 * The pictures the book uses.
 *
 * Every plate is a page in the running order, so this is a view of what is
 * already in Write rather than a separate library: picking one here opens it,
 * and dropping a file in makes a new plate at the end.
 */
export function ImagesMode() {
  const project = useStore((s) => s.project)!;
  const update = useStore((s) => s.update);
  const select = useStore((s) => s.select);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const plates = illustrationsOf(project);
  const trim = getTrim(project.trim.trimId);

  const add = async (files: FileList | File[] | null | undefined) => {
    if (!files) return;
    setError(null);
    for (const file of Array.from(files)) {
      try {
        const record = await putAsset(file);
        update(
          (draft) => {
            draft.contents.push({
              kind: 'illustration',
              id: id('plate'),
              title: '',
              caption: '',
              assetId: record.id,
              naturalWidth: record.width,
              naturalHeight: record.height,
              fit: 'contain',
              startsRecto: false,
              facingBlank: false,
            });
          },
          { discrete: true },
        );
      } catch (problem) {
        setError(
          problem instanceof UnsupportedImageError || problem instanceof Error
            ? problem.message
            : 'That image could not be read.',
        );
      }
    }
  };

  return (
    <>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void add(e.dataTransfer.files);
        }}
        className={cx(
          'block cursor-pointer rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors',
          over ? 'border-accent-500 bg-accent-50' : 'border-ink-300 hover:border-accent-500 hover:bg-accent-50',
        )}
      >
        <strong className="block text-[17px] font-semibold">Drop pictures here</strong>
        <span className="mt-1 block text-[14.5px] text-ink-500">
          JPEG, PNG or WebP · 300 dpi or better at print size
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => void add(e.target.files)}
        />
      </label>

      {error && <Notice level="error">{error}</Notice>}

      {plates.length === 0 ? (
        <p className="py-6 text-center text-[15px] text-ink-500">
          No pictures yet. Every one you add becomes a full page, which you can then set to sit
          inside the margins or run off the edge.
        </p>
      ) : (
        <div>
          <span className="block font-[570]">In this book</span>
          <span className="mt-0.5 block text-[14px] text-ink-500">
            {plates.length} plate{plates.length === 1 ? '' : 's'} · stored on this computer only
          </span>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {plates.map((plate) => (
              <PlateTile
                key={plate.id}
                plate={plate}
                printedWidth={
                  plate.fit === 'bleed'
                    ? trim.width
                    : trim.width - project.margins.inside - project.margins.outside
                }
                onOpen={() => select(plate.id)}
              />
            ))}
          </div>
        </div>
      )}

      <Button
        onClick={() => {
          const newId = id('plate');
          update((draft) => {
            draft.contents.push({
              kind: 'illustration',
              id: newId,
              title: '',
              caption: '',
              assetId: '',
              naturalWidth: 0,
              naturalHeight: 0,
              fit: 'contain',
              startsRecto: false,
              facingBlank: false,
            });
          });
          select(newId);
        }}
      >
        Add an empty plate
      </Button>
    </>
  );
}

function PlateTile({
  plate,
  printedWidth,
  onOpen,
}: {
  plate: Illustration;
  printedWidth: number;
  onOpen: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (!plate.assetId) {
      setUrl(null);
      return;
    }
    void getAssetUrl(plate.assetId).then((next) => live && setUrl(next));
    return () => {
      live = false;
    };
  }, [plate.assetId]);

  const dpi = plate.naturalWidth ? effectiveDpi(plate.naturalWidth, printedWidth) : 0;
  const soft = dpi > 0 && dpi < MIN_COVER_DPI;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="overflow-hidden rounded-xl border-2 border-ink-200 bg-paper text-left transition-colors hover:border-ink-300"
    >
      <span className="block h-24 bg-ink-100">
        {url && <img src={url} alt="" className="h-24 w-full object-cover" />}
      </span>
      <span className="block px-3 py-2.5">
        <span className="block truncate text-[14px] font-[550]">
          {plateName(plate, 0)}
        </span>
        <span
          className={cx(
            'mt-1.5 inline-block rounded-full px-2.5 py-1 text-[12px] font-semibold',
            !plate.assetId
              ? 'bg-ink-100 text-ink-500'
              : soft
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-800',
          )}
        >
          {!plate.assetId ? 'no picture' : `${Math.round(dpi)} dpi`}
        </span>
      </span>
    </button>
  );
}
