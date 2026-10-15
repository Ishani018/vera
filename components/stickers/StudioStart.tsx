'use client';

import { useEffect, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getAssetUrl } from '@/lib/assets';
import { listStickers } from '@/lib/cover/library';
import { listDrafts } from '@/lib/stickers/drafts';
import { when } from '@/lib/when';
import type { LibrarySticker, StickerDraft } from '@/lib/types';
import { Button, Notice, cx } from '../ui';
import { Chequerboard, Thumb } from './Thumb';
import { COLUMN, StudioPage } from '../studio/Shell';
import { TickIcon } from './icons';
import { SearchIcon } from '../icons';

export type StartMode = 'convert' | 'cleanup' | 'asis';

function UploadHeroIcon({ className = 'size-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m16 16-4-4-4 4" />
    </svg>
  );
}

function PhotoCutoutIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function InkDrawingIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m18 2 4 4-12 12H6v-4L18 2Z" />
      <path d="m15 5 4 4" />
      <path d="m3 21 3-1" />
    </svg>
  );
}

function GraphicStarIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />
    </svg>
  );
}

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
  onFiles: (files: FileList | null, mode?: StartMode, removeBackground?: boolean) => void;
  resumable: StickerDraft | null;
  onResume: (draft: StickerDraft) => void;
  onDiscard: (draft: StickerDraft) => void;
}) {
  const router = useRouter();
  const [stickers, setStickers] = useState<LibrarySticker[]>([]);
  const [drafts, setDrafts] = useState<StickerDraft[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    void Promise.all([listStickers(), listDrafts()]).then(([rows, drafted]) => {
      setStickers([...rows].sort((a, b) => b.createdAt - a.createdAt).slice(0, 36));
      setDrafts([...drafted].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6));
      setLoaded(true);
    });
  }, []);

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

  const [picked, setPicked] = useState<string[]>([]);
  const pick = (id: string) =>
    setPicked((was) => (was.includes(id) ? was.filter((one) => one !== id) : [...was, id]));

  const toSheet = () => {
    router.push(`/stickers/sheet?add=${picked.join(',')}`);
  };

  const latest = resumable ?? drafts[0] ?? null;

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFiles(e.dataTransfer.files);
    }
  };

  const filteredStickers = stickers.filter((sticker) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      sticker.name.toLowerCase().includes(q) ||
      sticker.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <StudioPage>
      <div className={`${COLUMN} py-8`}>
        {/* Title Header */}
        <div>
          <h1
            className="tracking-tight text-[30px] sm:text-[36px] font-bold text-ink-900"
            style={{ fontFamily: 'var(--font-display)', lineHeight: 1.1 }}
          >
            Make a{' '}
            <em style={{ color: 'var(--color-accenta-500)', fontStyle: 'italic' }}>sticker</em>
          </h1>
          <p className="mt-1.5 text-[14.5px] text-ink-500">
            Create die-cut vinyl stickers from photos, ink drawings, and digital graphics.
          </p>
        </div>

        {/* Canva/Figma-style Top Creator Banner */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cx(
            'mt-6 overflow-hidden rounded-2xl border transition-all duration-200',
            isDragging
              ? 'border-accent-500 bg-accent-50/40 ring-2 ring-accent-500/30'
              : 'border-ink-200 bg-sheet shadow-sm',
          )}
        >
          {/* Main Drag-and-Drop / Upload Hero */}
          <div className="relative flex flex-col items-center justify-center px-6 py-9 sm:py-11 text-center border-b border-ink-100 bg-gradient-to-b from-paper/60 to-paper-50/80">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 shadow-sm border border-accent-200/50 mb-3.5">
              <UploadHeroIcon className="size-7 text-accent-600" />
            </div>
            <h2 className="text-[17px] font-semibold text-ink-900">
              {isDragging ? 'Drop your image here' : 'Drop an image or click to upload'}
            </h2>
            <p className="mt-1 text-[13px] text-ink-500 max-w-sm">
              PNG, JPG, or WebP. We will automatically generate your cut lines and tools.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <label
                className={cx(
                  'btn btn-primary cursor-pointer !px-5 !py-2.5 text-[13.5px] font-medium shadow-sm transition-all hover:shadow',
                  busy && 'pointer-events-none opacity-50',
                )}
              >
                <span>Upload an image</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => onFiles(e.target.files)}
                />
              </label>
            </div>
          </div>

          {/* Preset Creation Cards Toolbar */}
          <div className="p-4 sm:p-5 bg-paper/40">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[11.5px] uppercase tracking-wider font-semibold text-ink-400">
                Instant Creation Modes
              </span>
              <span className="text-[11.5px] text-ink-400">
                Click a mode to upload directly
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {/* Photo Cutout Card */}
              <label
                className={cx(
                  'group relative flex flex-col p-4 rounded-xl border border-ink-200 bg-sheet hover:border-accent-500 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer',
                  busy && 'pointer-events-none opacity-50',
                )}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex size-8.5 items-center justify-center rounded-lg bg-rose-50 text-rose-600 border border-rose-200/60">
                    <PhotoCutoutIcon className="size-4.5" />
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100/70 text-rose-700">
                    Cutout BG
                  </span>
                </div>
                <span className="font-semibold text-[13.5px] text-ink-900 group-hover:text-accent-600 transition-colors">
                  Photo Cutout
                </span>
                <span className="text-[12px] text-ink-500 mt-0.5 leading-snug">
                  Cuts out subject and adds a white die-cut outline
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => onFiles(e.target.files, 'asis', true)}
                />
              </label>

              {/* Line Art / Drawing Card */}
              <label
                className={cx(
                  'group relative flex flex-col p-4 rounded-xl border border-ink-200 bg-sheet hover:border-accent-500 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer',
                  busy && 'pointer-events-none opacity-50',
                )}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex size-8.5 items-center justify-center rounded-lg bg-teal-50 text-teal-600 border border-teal-200/60">
                    <InkDrawingIcon className="size-4.5" />
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-100/70 text-teal-800">
                    Clean Lines
                  </span>
                </div>
                <span className="font-semibold text-[13.5px] text-ink-900 group-hover:text-accent-600 transition-colors">
                  Drawing & Ink
                </span>
                <span className="text-[12px] text-ink-500 mt-0.5 leading-snug">
                  Cleans up line art, sketches, and pencil ink
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => onFiles(e.target.files, 'cleanup')}
                />
              </label>

              {/* Original Graphic Card */}
              <label
                className={cx(
                  'group relative flex flex-col p-4 rounded-xl border border-ink-200 bg-sheet hover:border-accent-500 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer',
                  busy && 'pointer-events-none opacity-50',
                )}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex size-8.5 items-center justify-center rounded-lg bg-amber-50 text-amber-700 border border-amber-200/60">
                    <GraphicStarIcon className="size-4.5" />
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100/70 text-amber-800">
                    Keep Original
                  </span>
                </div>
                <span className="font-semibold text-[13.5px] text-ink-900 group-hover:text-accent-600 transition-colors">
                  Digital Graphic
                </span>
                <span className="text-[12px] text-ink-500 mt-0.5 leading-snug">
                  Keeps transparency and colors exactly as uploaded
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => onFiles(e.target.files, 'asis', false)}
                />
              </label>
            </div>
          </div>
        </div>

        {problem && (
          <div className="mt-4 max-w-xl">
            <Notice level="error">{problem}</Notice>
          </div>
        )}

        {/* Resume Draft Card */}
        {latest && (
          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-ink-200 bg-sheet p-3.5 sm:px-5 shadow-sm">
            <Chequerboard className="size-12 shrink-0 rounded-lg border border-ink-200 overflow-hidden">
              {urls[latest.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urls[latest.id]}
                  alt=""
                  className="max-h-[88%] max-w-[88%] object-contain [filter:drop-shadow(0_2px_4px_rgba(0,0,0,0.15))]"
                />
              ) : null}
            </Chequerboard>
            <div className="min-w-[12rem] flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-semibold text-ink-900">
                  {latest.name || 'Unfinished sticker'}
                </span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-ink-100 text-ink-600">
                  Draft
                </span>
              </div>
              <span className="text-[12px] text-ink-500">
                Edited {when(latest.updatedAt)}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="accent"
                disabled={busy}
                onClick={() => onResume(latest)}
                className="!px-3.5 !py-1.5 text-[13px]"
              >
                Resume
              </Button>
              <Button
                disabled={busy}
                onClick={() => onDiscard(latest)}
                variant="ghost"
                className="!px-3 !py-1.5 text-[13px]"
              >
                Discard
              </Button>
            </div>
          </div>
        )}

        {/* Sticker Showcase Gallery */}
        <section className="mt-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-ink-200">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[18px] font-bold text-ink-900 tracking-tight">
                Your Stickers
              </h2>
              <span className="inline-flex items-center justify-center rounded-full bg-ink-100 px-2.5 py-0.5 text-[12px] font-semibold text-ink-700">
                {stickers.length}
              </span>
            </div>

            {stickers.length > 0 && (
              <div className="relative w-full sm:w-64">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
                  <SearchIcon size={15} />
                </span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter stickers..."
                  className="h-8.5 w-full rounded-lg border border-ink-200 bg-sheet pl-9 pr-7 text-[12.5px] text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 text-[12px]"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>

          {!loaded ? (
            <div className="mt-5 grid grid-cols-3 gap-3.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {Array.from({ length: 8 }, (_, n) => (
                <span key={n} className="block">
                  <span className="skeleton block aspect-square w-full rounded-xl" />
                </span>
              ))}
            </div>
          ) : filteredStickers.length ? (
            <div className="mt-5 grid grid-cols-3 gap-3.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {filteredStickers.map((sticker) => (
                <Thumb
                  key={sticker.id}
                  url={urls[sticker.id]}
                  name={sticker.name}
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
            <div className="mt-8 text-center py-10 rounded-xl border border-dashed border-ink-200 bg-paper/40">
              {searchQuery ? (
                <>
                  <p className="text-[14px] font-medium text-ink-700">
                    No stickers found matching &ldquo;{searchQuery}&rdquo;
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="mt-2 text-[13px] text-accent-600 hover:underline cursor-pointer"
                  >
                    Clear search filter
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[14.5px] font-medium text-ink-700">
                    No stickers created yet
                  </p>
                  <p className="mt-1 text-[13px] text-ink-500">
                    Upload an image or photo above to start your sticker collection.
                  </p>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Floating Bottom Selection Dock */}
      {picked.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border border-ink-300 bg-sheet/95 px-5 py-2.5 shadow-2xl backdrop-blur-md">
          <span className="text-[13.5px] font-medium text-ink-900">
            {picked.length} {picked.length === 1 ? 'sticker' : 'stickers'} selected
          </span>
          <div className="h-4 w-px bg-ink-200" />
          <Button
            variant="primary"
            onClick={toSheet}
            className="!py-1.5 !px-4 text-[13px] font-medium shadow-sm"
          >
            Put on a Sheet
          </Button>
          <Button
            onClick={() => setPicked([])}
            className="!py-1.5 !px-3 text-[13px]"
          >
            Clear
          </Button>
        </div>
      )}
    </StudioPage>
  );
}
