'use client';

import { useEffect, useRef, useState } from 'react';
import { UnsupportedImageError, getAssetUrl, putAsset } from '@/lib/assets';
import { ACCEPTED_TYPES } from '../coloring/PageGrid';
import { cx } from '../ui';
import { SectionHeading } from '../panel/Panel';

/** A picture the tray can offer: whatever it is, it has bytes and a size. */
export type TrayItem = {
  key: string;
  name: string;
  assetId: string;
  width: number;
  height: number;
};

/**
 * The pictures available to put on the cover.
 *
 * Two ways in, because there are two habits: drag one onto the exact spot it
 * belongs, or click it and have it appear somewhere sensible to be dragged
 * afterwards. Neither is more correct, and the second is far quicker when the
 * cover is mostly empty.
 */
export function StickerTray({
  title,
  items,
  empty,
  onPlace,
  onUpload,
}: {
  title: string;
  items: TrayItem[];
  empty: string;
  /** Dropped at a point on the cover, or in the middle of the back with none. */
  onPlace: (item: TrayItem, at: { x: number; y: number } | null) => void;
  onUpload?: (file: File) => Promise<void> | void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const take = async (file: File | undefined) => {
    setError(null);
    if (!file || !onUpload) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only JPG, PNG and WebP come in.');
      return;
    }
    try {
      await onUpload(file);
    } catch (failure) {
      setError(
        failure instanceof UnsupportedImageError || failure instanceof Error
          ? failure.message
          : 'That image could not be read.',
      );
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <SectionHeading>{title}</SectionHeading>
        {onUpload && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-[11px] text-accent-500 underline"
          >
            Upload…
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {items.length === 0 ? (
        <p className="mt-2 text-[12px] leading-snug text-ink-500">{empty}</p>
      ) : (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {items.map((item) => (
            <TrayThumb key={item.key} item={item} onPlace={() => onPlace(item, null)} />
          ))}
        </div>
      )}

      {error && <p className="mt-1.5 text-[12px] text-red-800">{error}</p>}
    </div>
  );
}

function TrayThumb({ item, onPlace }: { item: TrayItem; onPlace: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getAssetUrl(item.assetId).then((next) => live && setUrl(next));
    return () => {
      live = false;
    };
  }, [item.assetId]);

  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        // The stage reads this back to know what was dropped on it.
        e.dataTransfer.setData('application/x-versecraft-sticker', JSON.stringify(item));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={onPlace}
      title={`${item.name} · drag onto the cover, or click to drop it on the back`}
      className={cx(
        'grid aspect-square place-items-center overflow-hidden rounded border border-ink-200',
        'bg-ink-100 transition-colors hover:border-accent-500',
      )}
    >
      {url ? (
        <img src={url} alt={item.name} className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-[10px] text-ink-500">…</span>
      )}
    </button>
  );
}
