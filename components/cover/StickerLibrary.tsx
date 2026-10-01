'use client';

import { TRASH_DAYS } from '@/lib/deleted';
import { useEffect, useRef, useState } from 'react';
import { getAssetUrl } from '@/lib/assets';
import { Chequerboard } from '../stickers/Thumb';
import {
  allTags,
  listStickers,
  parseTags,
  removeSticker,
  saveFileToLibrary,
  searchStickers,
  updateSticker,
} from '@/lib/cover/library';
import type { LibrarySticker } from '@/lib/types';
import { ACCEPTED_TYPES } from '../coloring/PageGrid';
import type { TrayItem } from './StickerTray';
import { TextInput, cx } from '../ui';

/**
 * Stickers kept across every book.
 *
 * Deliberately its own section rather than mixed in with the book's own
 * pictures: these outlive the book, and knowing which is which is the
 * difference between tidying up and losing something.
 */
export function StickerLibrary({
  onPlace,
  onChanged,
  reloadKey,
}: {
  onPlace: (item: TrayItem, at: null) => void;
  /** So the panel that saves into the library can ask for a refresh. */
  onChanged?: () => void;
  reloadKey?: number;
}) {
  const [stickers, setStickers] = useState<LibrarySticker[]>([]);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => void listStickers().then(setStickers);
  useEffect(reload, [reloadKey]);

  const tags = allTags(stickers);
  const shown = searchStickers(stickers, query, tag);

  const take = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only JPG, PNG and WebP come in.');
      return;
    }
    try {
      await saveFileToLibrary(file);
      reload();
      onChanged?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That image could not be read.');
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          My stickers
        </h4>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-[11px] text-accent-500 underline"
        >
          Upload…
        </button>
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

      {stickers.length === 0 ? (
        <p className="mt-2 text-[12px] leading-snug text-ink-500">
          Nothing saved yet. Anything you put here is kept across every book — upload one, or use
          “Save to My stickers” on a sticker already on the cover.
        </p>
      ) : (
        <>
          <div className="mt-2">
            <TextInput
              value={query}
              placeholder="Search by name or tag"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tags.map((each) => (
                <button
                  key={each}
                  type="button"
                  onClick={() => setTag(tag === each ? null : each)}
                  className={cx(
                    'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                    tag === each
                      ? 'border-accent-500 bg-accent-50 text-accent-500'
                      : 'border-ink-300 text-ink-500 hover:text-ink-900',
                  )}
                >
                  {each}
                </button>
              ))}
            </div>
          )}

          {shown.length === 0 ? (
            <p className="mt-2 text-[12px] text-ink-500">Nothing matches that.</p>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {shown.map((sticker) => (
                <LibraryThumb
                  key={sticker.id}
                  sticker={sticker}
                  onPlace={() =>
                    onPlace(
                      {
                        key: sticker.id,
                        name: sticker.name,
                        assetId: sticker.assetId,
                        width: sticker.width,
                        height: sticker.height,
                      },
                      null,
                    )
                  }
                  onEdit={() => setEditing(editing === sticker.id ? null : sticker.id)}
                />
              ))}
            </div>
          )}

          {editing && (
            <StickerDetails
              sticker={stickers.find((s) => s.id === editing) ?? null}
              onSave={async (patch) => {
                await updateSticker(editing, patch);
                reload();
                onChanged?.();
              }}
              onDelete={async () => {
                await removeSticker(editing);
                setEditing(null);
                reload();
                onChanged?.();
              }}
              onClose={() => setEditing(null)}
            />
          )}
        </>
      )}

      {error && <p className="mt-1.5 text-[12px] text-red-800">{error}</p>}
    </div>
  );
}

function LibraryThumb({
  sticker,
  onPlace,
  onEdit,
}: {
  sticker: LibrarySticker;
  onPlace: () => void;
  onEdit: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getAssetUrl(sticker.assetId).then((next) => live && setUrl(next));
    return () => {
      live = false;
    };
  }, [sticker.assetId]);

  return (
    <div className="group relative">
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(
            'application/x-versecraft-sticker',
            JSON.stringify({
              key: sticker.id,
              name: sticker.name,
              assetId: sticker.assetId,
              width: sticker.width,
              height: sticker.height,
            }),
          );
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={onPlace}
        title={`${sticker.name}${sticker.tags.length ? ` · ${sticker.tags.join(', ')}` : ''}`}
        className="block w-full text-left"
      >
        {/* A chequerboard, not a grey square: a white sticker on grey is a
            grey square, and white is the commonest sticker there is. */}
        <Chequerboard className="aspect-square w-full rounded border border-ink-200 transition-colors group-hover:border-accent-500">
          {url ? (
            <img src={url} alt={sticker.name} className="max-h-[88%] max-w-[88%] object-contain" />
          ) : (
            <span className="text-[10px] text-ink-500">…</span>
          )}
        </Chequerboard>
        {/* The name small and underneath, so the picture is what you scan and
            the name is there when two pictures look alike. */}
        <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-ink-500">
          {sticker.name}
        </span>
      </button>
      <button
        type="button"
        onClick={onEdit}
        title="Rename or tag"
        aria-label={`Rename ${sticker.name}`}
        className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded bg-ink-900/70 text-[10px] text-paper opacity-0 transition-opacity group-hover:opacity-100"
      >
        ✎
      </button>
    </div>
  );
}

function StickerDetails({
  sticker,
  onSave,
  onDelete,
  onClose,
}: {
  sticker: LibrarySticker | null;
  onSave: (patch: { name: string; tags: string[] }) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(sticker?.name ?? '');
  const [tagText, setTagText] = useState(sticker?.tags.join(', ') ?? '');
  // Deleting used to happen on one press, and used to be permanent. It is
  // neither now, but a press that removes something still gets to be asked
  // about once.
  const [sure, setSure] = useState(false);

  useEffect(() => {
    setName(sticker?.name ?? '');
    setTagText(sticker?.tags.join(', ') ?? '');
    setSure(false);
  }, [sticker?.id, sticker?.name, sticker?.tags]);

  if (!sticker) return null;

  return (
    <div className="mt-2 space-y-2 rounded-md border border-ink-200 bg-ink-50 p-2.5">
      <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <TextInput
        value={tagText}
        onChange={(e) => setTagText(e.target.value)}
        placeholder="Tags, separated by commas"
      />
      <div className="flex gap-2 text-[11px]">
        <button
          type="button"
          onClick={() => void onSave({ name, tags: parseTags(tagText) }).then(onClose)}
          className="text-accent-500 underline"
        >
          Save
        </button>
        <button type="button" onClick={onClose} className="text-ink-500 underline">
          Cancel
        </button>
        {sure ? (
          <span className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setSure(false)} className="text-ink-500 underline">
              Keep it
            </button>
            <button
              type="button"
              onClick={() => {
                setSure(false);
                void onDelete();
              }}
              className="text-red-700 underline"
            >
              Yes, delete
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setSure(true)}
            className="ml-auto text-red-700 underline"
            title="Books already using this keep their own copy"
          >
            Delete from library
          </button>
        )}
      </div>
      <p className="text-[11px] leading-snug text-ink-500">
        Deleting it here leaves every book that already uses it alone — each one keeps its own
        copy. It waits in the trash on the front page for {TRASH_DAYS} days.
      </p>
    </div>
  );
}
