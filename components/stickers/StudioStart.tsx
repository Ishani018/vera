'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAssetUrl } from '@/lib/assets';
import { listStickers } from '@/lib/cover/library';
import { listDrafts } from '@/lib/stickers/drafts';
import { when } from '@/lib/when';
import type { LibrarySticker, StickerDraft } from '@/lib/types';
import { Button, Notice } from '../ui';
import { DropZone } from './StudioShell';
import { StickerTabs } from './StickerTabs';
import { Thumb } from './Thumb';
import { LibraryIcon, PackIcon, SheetIcon, UploadIcon } from './icons';

/**
 * The way in to the sticker side of the app.
 *
 * It used to be a headline, a paragraph and a drop zone, with the other three
 * pages as small underlined words in the far corner. So the first screen said
 * "upload something" and nothing else — not what else is here, and not what you
 * already have. This says both: four places to go, then your own work, as
 * pictures.
 *
 * Everything on it is yours and local. Nothing here loads anything from
 * anywhere.
 */

const TILES = [
  {
    href: '/stickers/sheet',
    label: 'Sticker sheet',
    line: 'Lay them out on a page to print and cut.',
    Icon: SheetIcon,
  },
  {
    href: '/stickers/packs',
    label: 'Packs',
    line: 'Group them, or install a pack you were given.',
    Icon: PackIcon,
  },
  {
    href: '/stickers/sources',
    label: 'Library',
    line: 'Everything installed, and where it came from.',
    Icon: LibraryIcon,
  },
];

export function StudioStart({
  busy,
  problem,
  onFiles,
  resumable,
  onResume,
  onDiscard,
}: {
  busy: boolean;
  problem: string | null;
  onFiles: (files: FileList | null) => void;
  resumable: StickerDraft | null;
  onResume: (draft: StickerDraft) => void;
  onDiscard: (draft: StickerDraft) => void;
}) {
  const [stickers, setStickers] = useState<LibrarySticker[]>([]);
  const [drafts, setDrafts] = useState<StickerDraft[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    void listStickers().then((rows) =>
      setStickers([...rows].sort((a, b) => b.createdAt - a.createdAt).slice(0, 12)),
    );
    void listDrafts().then((rows) =>
      setDrafts([...rows].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)),
    );
  }, []);

  // A draft has no picture of its own — it is settings over an upload — so the
  // card shows the picture it started from. That is what it looks like in the
  // memory of whoever left it half-finished.
  useEffect(() => {
    let live = true;
    const wanted = [
      ...stickers.map((s) => [s.id, s.assetId] as const),
      ...drafts.map((d) => [d.id, d.sourceAssetId] as const),
    ];
    void Promise.all(
      wanted.map(async ([key, assetId]) => [key, await getAssetUrl(assetId)] as const),
    ).then((pairs) => {
      if (!live) return;
      const next: Record<string, string> = {};
      for (const [key, url] of pairs) if (url) next[key] = url;
      setUrls(next);
    });
    return () => {
      live = false;
    };
  }, [stickers, drafts]);

  return (
    <>
      <StickerTabs />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6">
          <h1 className="text-[27px] font-semibold tracking-tight">Stickers</h1>
          <p className="mt-1.5 text-[14.5px] text-ink-500">
            A drawing, a painting or a photograph, cut out and ready to print. Kept on this
            computer.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* The first tile is the action itself, not a link to it: starting
                is the thing this page is for, so it opens the picker. */}
            <label
              title="A drawing, a painting or a photograph — PNG, JPEG or WebP"
              className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-accent-500 bg-accent-50 p-4 transition-colors hover:bg-accent-100"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent-500 text-paper">
                <UploadIcon size={21} />
              </span>
              <span className="mt-6 block text-[15.5px] font-[600]">Make a sticker</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-700">
                Start from a picture on this computer.
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const files = e.target.files;
                  // Cleared so the same file can be chosen twice running.
                  onFiles(files);
                  e.target.value = '';
                }}
              />
            </label>

            {TILES.map(({ href, label, line, Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col justify-between rounded-2xl border border-ink-200 bg-paper-0 p-4 transition-colors hover:border-accent-500"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-ink-100 text-ink-700 transition-colors group-hover:bg-accent-50 group-hover:text-accent-500">
                  <Icon size={21} />
                </span>
                <span className="mt-6 block text-[15.5px] font-[600]">{label}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-500">{line}</span>
              </Link>
            ))}
          </div>

          {resumable && (
            <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-ink-200 bg-paper-0 p-4">
              <Thumb
                url={urls[resumable.id]}
                name={resumable.name || 'A sticker'}
                title={`${resumable.name || 'A sticker'} — last changed ${when(resumable.updatedAt)}`}
                className="w-24 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] leading-snug">
                  You were in the middle of{' '}
                  <span className="font-[570]">{resumable.name || 'a sticker'}</span>.
                </p>
                <p className="mt-0.5 text-[12.5px] text-ink-500">
                  Last changed {when(resumable.updatedAt)}. Nothing has been added to My stickers.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="primary" disabled={busy} onClick={() => onResume(resumable)}>
                    Carry on with it
                  </Button>
                  <Button
                    disabled={busy}
                    title="Into the trash for thirty days, like everything else"
                    onClick={() => onDiscard(resumable)}
                  >
                    Throw it away
                  </Button>
                </div>
              </div>
            </div>
          )}

          {problem && (
            <div className="mt-4 max-w-xl">
              <Notice level="error">{problem}</Notice>
            </div>
          )}

          {drafts.length > 1 && (
            <section className="mt-8">
              <h2 className="text-[15px] font-[600]">Half-finished</h2>
              <p className="mt-0.5 text-[12.5px] text-ink-500">
                Kept on this computer. Opening one picks up where it was left.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {drafts.map((draft) => (
                  <Thumb
                    key={draft.id}
                    url={urls[draft.id]}
                    name={draft.name || 'A sticker'}
                    note={when(draft.updatedAt)}
                    title={`${draft.name || 'A sticker'} — last changed ${when(draft.updatedAt)}`}
                    disabled={busy}
                    onClick={() => onResume(draft)}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="mt-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-[600]">My stickers</h2>
              {stickers.length > 0 && (
                <Link href="/stickers/sheet" className="text-[12.5px] text-accent-500 underline">
                  Put them on a sheet →
                </Link>
              )}
            </div>
            {stickers.length ? (
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {stickers.map((sticker) => (
                  <Thumb
                    key={sticker.id}
                    url={urls[sticker.id]}
                    name={sticker.name}
                    note={`${sticker.width} × ${sticker.height}`}
                    title={`${sticker.name}${sticker.tags.length ? ` · ${sticker.tags.join(', ')}` : ''}`}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[13.5px] text-ink-500">
                Nothing saved yet. The ones you keep appear here, and in every book and design.
              </p>
            )}
          </section>

          <div className="mt-8">
            <DropZone busy={busy} onFiles={onFiles} />
          </div>
        </div>
      </div>
    </>
  );
}
