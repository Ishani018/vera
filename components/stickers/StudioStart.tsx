'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAssetUrl } from '@/lib/assets';
import { listStickers } from '@/lib/cover/library';
import { listDrafts } from '@/lib/stickers/drafts';
import { when } from '@/lib/when';
import type { LibrarySticker, StickerDraft } from '@/lib/types';
import { Button, Notice } from '../ui';
import { DropZone } from './StudioShell';
import { StickerTabs } from './StickerTabs';
import { Thumb } from './Thumb';
import { TickIcon } from './icons';

/**
 * The way in to the sticker side of the app.
 *
 * One route to each place and no repeats: the tab bar above says where the
 * four pages are, so this page is the first of them rather than a menu of all
 * four. It is the studio — somewhere to drop a picture, and everything you have
 * already made, as pictures.
 *
 * Pressing a sticker picks it out. That is the only thing a press does here,
 * and the only action that needs a selection appears when there is one.
 *
 * Everything on it is yours and local. Nothing here loads anything from
 * anywhere.
 */
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
  const router = useRouter();
  const [stickers, setStickers] = useState<LibrarySticker[]>([]);
  const [drafts, setDrafts] = useState<StickerDraft[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    void listStickers().then((rows) =>
      setStickers([...rows].sort((a, b) => b.createdAt - a.createdAt).slice(0, 24)),
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

  /**
   * Which stickers are picked out, for the one action that needs a selection.
   *
   * Selection is the only thing a click on a sticker does here. There is no
   * second meaning to learn, and no second route to the sheet: the action
   * appears when there is something to act on and is gone the rest of the time.
   */
  const [picked, setPicked] = useState<string[]>([]);
  const pick = (id: string) =>
    setPicked((was) => (was.includes(id) ? was.filter((one) => one !== id) : [...was, id]));

  const toSheet = () => {
    // Carried in the address rather than in storage: it is a one-trip message
    // between two pages, and a stored selection would outlive the trip and
    // surprise somebody a week later.
    router.push(`/stickers/sheet?add=${picked.join(',')}`);
  };

  return (
    <>
      <StickerTabs />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
          <h1 className="display text-[24px] tracking-tight">Stickers</h1>
          <p className="mt-1 text-[13.5px] text-ink-500">
            A drawing, a painting or a photograph, cut out and ready to print. Kept on this
            computer.
          </p>

          <div className="mt-4">
            <DropZone busy={busy} onFiles={onFiles} />
          </div>

          {problem && (
            <div className="mt-4 max-w-xl">
              <Notice level="error">{problem}</Notice>
            </div>
          )}

          {resumable && (
            <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl border border-ink-200 bg-paper p-4">
              <Thumb
                url={urls[resumable.id]}
                name={resumable.name || 'A sticker'}
                title={`${resumable.name || 'A sticker'} — last changed ${when(resumable.updatedAt)}`}
                className="w-20 shrink-0"
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

          <section className="mt-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] font-[600]">
                My stickers
                {stickers.length > 0 && (
                  <span className="ml-2 font-normal text-[12.5px] text-ink-500">
                    {picked.length ? `${picked.length} picked` : 'press one to pick it'}
                  </span>
                )}
              </h2>
              {/* The one way to a sheet from here, and only when there is
                  something to put on it. */}
              {picked.length > 0 && (
                <span className="flex gap-2">
                  <Button variant="primary" onClick={toSheet}>
                    Put {picked.length} on a sheet
                  </Button>
                  <Button onClick={() => setPicked([])}>Clear</Button>
                </span>
              )}
            </div>
            {stickers.length ? (
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                {stickers.map((sticker) => (
                  <Thumb
                    key={sticker.id}
                    url={urls[sticker.id]}
                    name={sticker.name}
                    note={`${sticker.width} × ${sticker.height}`}
                    title={`${sticker.name}${sticker.tags.length ? ` · ${sticker.tags.join(', ')}` : ''}`}
                    selected={picked.includes(sticker.id)}
                    onClick={() => pick(sticker.id)}
                    badge={
                      picked.includes(sticker.id) ? (
                        <span className="pointer-events-none absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-accent-500 text-paper shadow">
                          <TickIcon size={12} />
                        </span>
                      ) : null
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[13.5px] text-ink-500">
                Nothing saved yet. The ones you keep appear here, and in every book and design.
              </p>
            )}
          </section>

          {drafts.length > 1 && (
            <section className="mt-7">
              <h2 className="text-[15px] font-[600]">
                Half-finished
                <span className="ml-2 font-normal text-[12.5px] text-ink-500">
                  press one to pick up where it was left
                </span>
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
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
        </div>
      </div>
    </>
  );
}
