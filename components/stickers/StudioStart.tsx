'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAssetUrl } from '@/lib/assets';
import { listStickers } from '@/lib/cover/library';
import { listDrafts } from '@/lib/stickers/drafts';
import { when } from '@/lib/when';
import type { LibrarySticker, StickerDraft } from '@/lib/types';
import { Button, Notice } from '../ui';
import { DropZone } from './StudioShell';
import { Chequerboard, Thumb } from './Thumb';
import { StickerTabs } from './StickerTabs';
import { TickIcon } from './icons';

/** The three modes the studio opens in. Named here so a card can ask for one. */
export type StartMode = 'convert' | 'cleanup' | 'asis';

/**
 * The way in to the sticker side of the app.
 *
 * One route to each place and no repeats: the tab bar above says where the
 * three pages are, so this page is the first of them rather than a menu of all
 * three. It is the studio — somewhere to drop a picture, three ways to start,
 * and everything you have already made, as pictures.
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
  /** The second argument asks the studio to open in a particular mode. */
  onFiles: (files: FileList | null, mode?: StartMode) => void;
  resumable: StickerDraft | null;
  onResume: (draft: StickerDraft) => void;
  onDiscard: (draft: StickerDraft) => void;
}) {
  const router = useRouter();
  const [stickers, setStickers] = useState<LibrarySticker[]>([]);
  const [drafts, setDrafts] = useState<StickerDraft[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  /** Null while the library is still being read, so empty is not claimed early. */
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void Promise.all([listStickers(), listDrafts()]).then(([rows, drafted]) => {
      setStickers([...rows].sort((a, b) => b.createdAt - a.createdAt).slice(0, 24));
      setDrafts([...drafted].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6));
      setLoaded(true);
    });
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

  /** The newest half-finished one, which is the only one worth offering. */
  const latest = resumable ?? drafts[0] ?? null;

  return (
    <>
      <StickerTabs />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
          <h1 className="display text-[26px] tracking-tight">Make a sticker</h1>
          <p className="mt-1 text-[13.5px] text-ink-500">
            Start from a picture, a drawing or a pack.
          </p>

          <div className="mt-4 max-w-2xl">
            <DropZone compact busy={busy} onFiles={onFiles} />
          </div>

          {problem && (
            <div className="mt-4 max-w-xl">
              <Notice level="error">{problem}</Notice>
            </div>
          )}

          {/*
            Three ways in, equally weighted, because the right one depends on
            what you are holding and the studio cannot guess. Two of them open
            the same file chooser and set the mode the picture needs; the third
            is a different tool and says so by going somewhere.
          */}
          <h2 className="mono-label mt-7 text-ink-500" style={{ fontSize: 10 }}>
            Start from
          </h2>
          <div className="mt-2.5 grid gap-3 sm:grid-cols-3">
            <StartCard
              title="Photo"
              caption="Cut out and outline"
              busy={busy}
              onFiles={(files) => onFiles(files, 'asis')}
              icon={
                <>
                  <rect x="3.5" y="5" width="25" height="22" rx="3" />
                  <circle cx="11" cy="12.5" r="2.25" />
                  <path d="M4.5 23l6.5-6.5 5.5 5.5 4-3.5 7 6" />
                </>
              }
            />
            <StartCard
              title="Drawing"
              caption="Clean up line art"
              busy={busy}
              onFiles={(files) => onFiles(files, 'cleanup')}
              icon={
                <>
                  <path d="M6 26l1.5-5.5L21 7a2.5 2.5 0 013.5 3.5L11 24z" />
                  <path d="M19 9l4 4" />
                  <path d="M6 26l5.5-1.5" />
                </>
              }
            />
            <StartCard
              title="Line art"
              caption="Turn a picture into ink lines"
              href="/lab"
              badge="New"
              icon={
                <>
                  <rect x="3.5" y="5" width="25" height="22" rx="3" />
                  <path d="M16 5v22" />
                  <circle cx="9.75" cy="16" r="4.5" />
                  <circle cx="22.25" cy="16" r="4.5" />
                </>
              }
            />
          </div>

          {/*
            Where you left off. The newest half-finished sticker only: a row of
            six abandoned drafts is a list of things you did not finish, which
            is not an invitation.
          */}
          {latest && (
            <section className="mt-7">
              <div className="plate flex flex-wrap items-center gap-3 rounded-[8px] bg-paper-100 p-3">
                <Chequerboard className="size-[56px] shrink-0 rounded-[3px] border border-ink-200">
                  {urls[latest.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={urls[latest.id]}
                      alt=""
                      className="max-h-[86%] max-w-[86%] object-contain"
                    />
                  ) : null}
                </Chequerboard>
                {/*
                  A floor under the words, so that on a phone the buttons wrap
                  to their own line instead of squeezing the heading into a
                  column three words wide.
                */}
                <div className="min-w-[11rem] flex-1">
                  <span className="block text-[14px] font-[560]">Pick up where you left off</span>
                  <span className="block truncate text-[13px] text-ink-700">
                    {latest.name || 'A sticker'}
                  </span>
                  <span className="mono-label block text-ink-500" style={{ fontSize: 10 }}>
                    Draft · {when(latest.updatedAt)}
                  </span>
                </div>
                <span className="flex shrink-0 gap-2 max-sm:w-full">
                  <Button variant="accent" disabled={busy} onClick={() => onResume(latest)}>
                    Open
                  </Button>
                  <Button
                    disabled={busy}
                    title="Into the trash for thirty days, like everything else"
                    onClick={() => onDiscard(latest)}
                  >
                    Throw away
                  </Button>
                </span>
              </div>
            </section>
          )}

          <section className="mt-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] font-[600]">
                Your stickers
                {stickers.length > 0 && (
                  <span className="ml-2 text-[12.5px] font-normal text-ink-500">
                    {picked.length ? `${picked.length} picked` : 'press one to pick it'}
                  </span>
                )}
              </h2>
              {/* The one way to a sheet from here, and only when there is
                  something to put on it. */}
              {picked.length > 0 && (
                <span className="flex gap-2">
                  <Button variant="accent" onClick={toSheet}>
                    Put {picked.length} on a sheet
                  </Button>
                  <Button onClick={() => setPicked([])}>Clear</Button>
                </span>
              )}
            </div>
            {!loaded ? (
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                {Array.from({ length: 6 }, (_, n) => (
                  <span key={n} className="block">
                    <span className="skeleton block aspect-square w-full rounded-lg" />
                  </span>
                ))}
              </div>
            ) : stickers.length ? (
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
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
                Nothing saved yet. The ones you keep appear here.
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/**
 * One way in: a mark, a word, and a line saying what it is for.
 *
 * Two of the three open a file chooser, so they are labels wrapping a hidden
 * input rather than buttons — a button cannot open one without a click it did
 * not get. The third goes to another page, so it is a link. They look the same
 * because to the person choosing they are the same kind of choice.
 */
function StartCard({
  title,
  caption,
  icon,
  busy = false,
  onFiles,
  href,
  badge,
}: {
  title: string;
  caption: string;
  icon: React.ReactNode;
  busy?: boolean;
  onFiles?: (files: FileList | null) => void;
  href?: string;
  badge?: string;
}) {
  const inside = (
    <>
      {badge && (
        <span
          className="tag absolute right-2 top-2"
          style={{ background: 'var(--color-accentc-100)', color: 'var(--color-ink-900)' }}
        >
          {badge}
        </span>
      )}
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {icon}
      </svg>
      <span className="mt-2 block text-[15px] font-[600]">{title}</span>
      <span className="mt-0.5 block text-[12.5px] text-ink-500">{caption}</span>
    </>
  );

  const shell =
    'proof plate relative flex flex-col items-center justify-center rounded-[8px] border border-ink-200 ' +
    'bg-paper-100 px-3 py-5 text-center transition-colors hover:border-accentb-500';

  if (href) {
    return (
      <Link href={href} title={caption} className={shell}>
        {inside}
      </Link>
    );
  }
  return (
    <label title={caption} className={`${shell} cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
      {inside}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => onFiles?.(event.target.files)}
      />
    </label>
  );
}
