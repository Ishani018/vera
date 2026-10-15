'use client';

import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAssetUrl } from '@/lib/assets';
import { listStickers } from '@/lib/cover/library';
import { listDrafts } from '@/lib/stickers/drafts';
import { packsIn, type Pack } from '@/lib/stickers/packs';
import { when } from '@/lib/when';
import type { LibrarySticker, StickerDraft } from '@/lib/types';
import { Button, Notice, cx } from '../ui';
import { Chequerboard, Fan, Thumb } from './Thumb';
import { StudioPage } from '../studio/Shell';
import { PackIcon, TickIcon } from './icons';

export type StartMode = 'convert' | 'cleanup' | 'asis';

const INSPIRATION_STICKERS = [
  { id: 'boots', label: 'Boots', path: '/stickers/skates-and-kicks/Tan Embroidered Cowboy Boots.png' },
  { id: 'sneakers', label: 'Sneakers', path: '/stickers/skates-and-kicks/Red High-Top Sneakers.png' },
  { id: 'roller-skates', label: 'Roller Skates', path: '/stickers/skates-and-kicks/Cute Retro Roller Skates.png' },
  { id: 'camera', label: 'Instant Camera', path: '/stickers/cozy-aesthetic/Retro Instant Camera.png' },
  { id: 'books', label: 'Books', path: '/stickers/cozy-aesthetic/Cosy Book Stack with Floral Mug.png' },
  { id: 'laptop', label: 'Laptop', path: '/stickers/cozy-aesthetic/Cosy Pastel Laptop.png' },
  { id: 'drinks', label: 'Drinks', path: '/stickers/cafe-treats/Pastel Floral Matcha Tea.png' },
  { id: 'retro', label: 'Retro', path: '/stickers/cozy-aesthetic/Pastel Floral Record Player.png' },
  { id: 'bags', label: 'Bags', path: '/stickers/cozy-aesthetic/Cozy Kawaii Backpack.png' },
];

function UploadArrowIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m16 16-4-4-4 4" />
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
  const [isDragging, setIsDragging] = useState(false);
  const [tab, setTab] = useState<'packs' | 'stickers'>('packs');

  const packs = useMemo(() => packsIn(stickers), [stickers]);

  useEffect(() => {
    void Promise.all([listStickers(), listDrafts()]).then(([rows, drafted]) => {
      setStickers([...rows].sort((a, b) => b.createdAt - a.createdAt));
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

  const [discardedIds, setDiscardedIds] = useState<Set<string>>(new Set());

  const handleDiscard = async (draft: StickerDraft) => {
    setDiscardedIds((prev) => new Set(prev).add(draft.id));
    setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
    try {
      await onDiscard(draft);
    } catch (e) {
      console.error('Failed to discard draft:', e);
    }
  };

  const validResumable = resumable && !discardedIds.has(resumable.id) ? resumable : null;
  const validDraft = drafts.find((d) => !discardedIds.has(d.id)) ?? null;
  const latest = validResumable ?? validDraft;

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

  const handleTryInspiration = async (url: string, name: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], `${name}.png`, { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      onFiles(dt.files, 'asis', false);
    } catch {
      router.push('/stickers/library');
    }
  };

  return (
    <StudioPage>
      <div className="mx-auto w-full max-w-[1200px] px-6 sm:px-10 py-7 sm:py-9">
        {/* Hero Section: Clean 2-Column Studio Desk Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-14 items-center">
          {/* Left Column: Heading, Subtitle & 3 Simple Value Props */}
          <div className="flex flex-col justify-center">
            {/* Headline */}
            <div>
              <h1
                className="text-[36px] sm:text-[44px] font-bold text-ink-900 tracking-tight leading-[1.08]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Make your own<br />
                <span className="italic" style={{ color: 'var(--color-accenta-500)', fontFamily: 'var(--font-display)' }}>
                  stickers
                </span>
              </h1>
            </div>

            <p className="mt-2.5 text-[14.5px] sm:text-[15.5px] text-ink-600 leading-relaxed max-w-md">
              Turn your photos, drawings or ideas into cut-out stickers in seconds.
            </p>

            {/* 3 Simplified Feature Highlights */}
            <ul className="mt-6 flex flex-col gap-2.5">
              <li className="flex items-center gap-2.5 text-[14px] text-ink-700">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-paper-200 text-ink-700" aria-hidden="true">
                  <TickIcon size={11} />
                </span>
                <span>
                  <strong className="font-semibold text-ink-900">Remove background</strong>
                  <span className="text-ink-500"> · Clean cut-outs, no hassle</span>
                </span>
              </li>
              <li className="flex items-center gap-2.5 text-[14px] text-ink-700">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-paper-200 text-ink-700" aria-hidden="true">
                  <TickIcon size={11} />
                </span>
                <span>
                  <strong className="font-semibold text-ink-900">Turn anything into a sticker</strong>
                  <span className="text-ink-500"> · Photos, drawings, doodles</span>
                </span>
              </li>
              <li className="flex items-center gap-2.5 text-[14px] text-ink-700">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-paper-200 text-ink-700" aria-hidden="true">
                  <TickIcon size={11} />
                </span>
                <span>
                  <strong className="font-semibold text-ink-900">Download & use anywhere</strong>
                  <span className="text-ink-500"> · For your projects, notes, and more</span>
                </span>
              </li>
            </ul>
          </div>

          {/* Right Column: The Dashed Dropzone Card */}
          <div className="flex flex-col justify-center">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cx(
                'relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 sm:p-11 text-center transition-all duration-200',
                isDragging
                  ? 'border-accenta-500 bg-accenta-100/40 ring-4 ring-accenta-500/20 scale-[1.01]'
                  : 'border-ink-300/80 bg-sheet/80 hover:border-ink-400 shadow-sm',
              )}
            >
              {/* Polaroids illustration */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/sticker-polaroids.png"
                alt=""
                className="h-20 sm:h-22 w-auto object-contain select-none mb-3 [filter:drop-shadow(0_3px_5px_rgba(0,0,0,0.06))]"
              />

              <h2 className="text-[21px] font-bold text-ink-900 tracking-tight">
                Drop a file here
              </h2>
              <p className="mt-0.5 text-[13.5px] text-ink-500 font-medium">
                or choose a file
              </p>

              <div className="mt-5 w-full flex justify-center">
                <label
                  className={cx(
                    'inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3 text-[14.5px] font-semibold text-white shadow-md transition-all duration-150 cursor-pointer hover:opacity-95 hover:shadow-lg active:scale-[0.98]',
                    busy && 'pointer-events-none opacity-50',
                  )}
                  style={{ background: 'var(--color-accenta-500)' }}
                >
                  <UploadArrowIcon className="size-4.5" />
                  <span>Choose file</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => onFiles(e.target.files)}
                  />
                </label>
              </div>

              <span className="mt-3.5 block font-mono text-[11px] uppercase tracking-wider text-ink-400">
                PNG, JPG, WEBP up to 10MB
              </span>
            </div>
          </div>
        </div>

        {problem && (
          <div className="mt-6 max-w-xl">
            <Notice level="error">{problem}</Notice>
          </div>
        )}

        {/* Resume Draft Card (if any in progress) */}
        {latest && (
          <div className="mt-7 flex flex-wrap items-center gap-4 rounded-2xl border border-ink-200/80 bg-paper-50 p-4 sm:px-6 shadow-sm">
            <Chequerboard className="size-13 shrink-0 rounded-xl border border-ink-200 overflow-hidden">
              {urls[latest.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urls[latest.id]}
                  alt=""
                  className="max-h-[88%] max-w-[88%] object-contain [filter:drop-shadow(0_2px_4px_rgba(0,0,0,0.14))]"
                />
              ) : null}
            </Chequerboard>
            <div className="min-w-[12rem] flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-ink-900">
                  {latest.name || 'Unfinished sticker'}
                </span>
                <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-ink-200/70 text-ink-700">
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
                className="!px-4 !py-1.5 text-[13px]"
              >
                Resume
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  if (latest) void handleDiscard(latest);
                }}
                variant="ghost"
                className="!px-3 !py-1.5 text-[13px]"
              >
                Discard
              </Button>
            </div>
          </div>
        )}

        {/* Bottom Section: Need inspiration? */}
        <section className="mt-9 rounded-3xl border border-ink-200/80 bg-paper-50/70 p-6 sm:p-7 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-[20px] font-bold text-ink-900 tracking-tight">
                Need inspiration?
              </h2>
              <p className="text-[13px] text-ink-500 mt-0.5">
                Try a few examples or start with one of these.
              </p>
            </div>
            <Link
              href="/stickers/library"
              className="group inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-700 hover:text-accenta-700 transition-colors"
            >
              <span>View more ideas</span>
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          </div>

          {/* 9 Inspiration Cards */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-9">
            {INSPIRATION_STICKERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTryInspiration(item.path, item.label)}
                title={`Try making a sticker with ${item.label}`}
                className="group flex flex-col items-center justify-between rounded-2xl border border-ink-200/70 bg-paper p-2.5 text-center transition-all duration-200 hover:-translate-y-1 hover:border-accenta-500 hover:shadow-md cursor-pointer"
              >
                <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-xl bg-paper-100/50 p-1.5 transition-colors group-hover:bg-accenta-100/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.path}
                    alt={item.label}
                    className="max-h-[90%] max-w-[90%] object-contain [filter:drop-shadow(0_3px_5px_rgba(0,0,0,0.16))] transition-transform group-hover:scale-105"
                  />
                </div>
                <span className="mt-2 block truncate text-[11.5px] font-medium text-ink-700 group-hover:text-ink-900">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Packs & Stickers Section */}
        {loaded && (stickers.length > 0 || packs.length > 0) && (
          <section className="mt-9 rounded-3xl border border-ink-300/40 bg-paper-50/70 p-6 sm:p-7 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              {/* Toggle switch between Packs & All Stickers */}
              <div className="flex items-center gap-1 rounded-2xl bg-paper-200/80 p-1 border border-ink-300/30 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTab('packs')}
                  className={cx(
                    'flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-[13.5px] font-semibold transition-all cursor-pointer',
                    tab === 'packs'
                      ? 'bg-sheet text-ink-900 shadow-sm'
                      : 'text-ink-700 hover:text-ink-900',
                  )}
                >
                  <PackIcon size={16} />
                  <span>Packs</span>
                  <span
                    className={cx(
                      'rounded-full px-2 py-0.5 text-[11px] font-bold',
                      tab === 'packs' ? 'bg-paper-200 text-ink-900' : 'bg-paper-300/60 text-ink-700',
                    )}
                  >
                    {packs.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('stickers')}
                  className={cx(
                    'flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-[13.5px] font-semibold transition-all cursor-pointer',
                    tab === 'stickers'
                      ? 'bg-sheet text-ink-900 shadow-sm'
                      : 'text-ink-700 hover:text-ink-900',
                  )}
                >
                  <span>All Stickers</span>
                  <span
                    className={cx(
                      'rounded-full px-2 py-0.5 text-[11px] font-bold',
                      tab === 'stickers' ? 'bg-paper-200 text-ink-900' : 'bg-paper-300/60 text-ink-700',
                    )}
                  >
                    {stickers.length}
                  </span>
                </button>
              </div>

              {/* Action buttons on the right */}
              {tab === 'packs' ? (
                <div className="flex items-center gap-3">
                  <Link
                    href="/stickers/packs"
                    className="group inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-700 hover:text-accenta-700 transition-colors"
                  >
                    <span>Manage packs</span>
                    <span className="transition-transform group-hover:translate-x-0.5">→</span>
                  </Link>
                </div>
              ) : (
                picked.length > 0 && (
                  <span className="flex items-center gap-2">
                    <Button variant="primary" onClick={toSheet} className="!py-1.5 !px-3.5 text-[13px]">
                      Put {picked.length} on a sheet
                    </Button>
                    <Button onClick={() => setPicked([])} className="!py-1.5 !px-3 text-[13px]">
                      Clear
                    </Button>
                  </span>
                )
              )}
            </div>

            {/* Content: Packs Grid vs All Stickers Grid */}
            {tab === 'packs' ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {packs.map((pack) => (
                  <div
                    key={pack.tag}
                    className="group flex flex-col justify-between rounded-2xl border border-ink-300/50 bg-sheet p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-ink-500 hover:shadow-md"
                  >
                    <Link
                      href={`/stickers/packs?pack=${encodeURIComponent(pack.name)}`}
                      className="block text-left"
                    >
                      <Fan
                        urls={pack.stickerIds.map((id) => urls[id])}
                        name={pack.name}
                        className="transition-colors group-hover:border-accentb-500"
                      />
                      <span
                        className="mt-3 block truncate tracking-tight text-ink-900 font-semibold text-[15px]"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {pack.name}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-ink-500">
                        {pack.stickerIds.length} {pack.stickerIds.length === 1 ? 'sticker' : 'stickers'}
                      </span>
                    </Link>

                    <div className="mt-3.5 flex items-center gap-2 pt-2 border-t border-paper-200">
                      <Link
                        href={`/stickers/packs?pack=${encodeURIComponent(pack.name)}`}
                        className="inline-flex flex-1 items-center justify-center rounded-lg border border-ink-300/80 px-2.5 py-1 text-[12px] font-medium text-ink-700 hover:bg-paper-100 transition-colors"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          const ids = pack.stickerIds.filter(Boolean);
                          if (ids.length) router.push(`/stickers/sheet?add=${ids.join(',')}`);
                        }}
                        title="Put this pack on a printable sheet"
                        className="inline-flex items-center justify-center rounded-lg bg-paper-200 px-2.5 py-1 text-[12px] font-medium text-ink-700 hover:bg-paper-300 transition-colors cursor-pointer"
                      >
                        Sheet
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add new pack prompt card */}
                <Link
                  href="/stickers/packs"
                  className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-300/60 p-4 text-center transition-colors hover:border-accenta-500 hover:bg-paper-100/50"
                >
                  <span className="grid size-10 place-items-center rounded-full bg-paper-200 text-ink-700">
                    <PackIcon size={20} />
                  </span>
                  <span
                    className="font-semibold text-ink-900 text-[14px]"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    Start or install pack
                  </span>
                  <span className="text-[12px] text-ink-500">
                    Zip import or custom group
                  </span>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-5 md:grid-cols-8">
                {stickers.map((sticker) => (
                  <Thumb
                    key={sticker.id}
                    url={urls[sticker.id]}
                    name={sticker.name}
                    title={`${sticker.name}${sticker.tags.length ? ` · ${sticker.tags.join(', ')}` : ''}`}
                    selected={picked.includes(sticker.id)}
                    onClick={() => pick(sticker.id)}
                    badge={
                      picked.includes(sticker.id) ? (
                        <span className="pointer-events-none absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-accenta-500 text-white shadow">
                          <TickIcon size={12} />
                        </span>
                      ) : null
                    }
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </StudioPage>
  );
}
