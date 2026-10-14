'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAssetUrl } from '@/lib/assets';
import { listStickers } from '@/lib/cover/library';
import {
  creditsOf,
  creditsText,
  packCounts,
  searchCredits,
  type Credit,
} from '@/lib/starter/credits';
import { installPack, summarise } from '@/lib/starter/installClient';
import type { ItemOutcome } from '@/lib/starter/install';
import type { LibrarySticker } from '@/lib/types';
import { Modal } from '../Modal';
import { StudioHeader, StudioTitle } from '../StudioHeader';
import { PalettePicker } from '../PalettePicker';
import { StickerTabs } from './StickerTabs';
import { BrowseGraphics } from './BrowseGraphics';
import { Chequerboard, Thumb } from './Thumb';
import { LibraryIcon, UploadIcon, TickIcon, SheetIcon } from './icons';
import { Button, Notice, Spinner, TextInput, cx } from '../ui';
import { COLUMN, PageHead, StudioPage } from '../studio/Shell';

export function PackLibrary() {
  const router = useRouter();
  const [stickers, setStickers] = useState<LibrarySticker[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'installed' | 'browse'>('installed');
  const [query, setQuery] = useState('');
  const [pack, setPack] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [inspecting, setInspecting] = useState<Credit | null>(null);

  const [said, setSaid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState<{ done: number; total: number; name: string } | null>(null);
  const [failures, setFailures] = useState<ItemOutcome[]>([]);
  const [helper, setHelper] = useState(false);

  const reload = async () => setStickers(await listStickers());
  useEffect(() => {
    void reload();
  }, []);

  const credits = useMemo(() => creditsOf(stickers), [stickers]);
  const counts = useMemo(() => packCounts(credits), [credits]);
  const shown = useMemo(() => searchCredits(credits, query, pack), [credits, query, pack]);

  useEffect(() => {
    let live = true;
    void Promise.all(
      credits.map(async (credit) => {
        const row = stickers.find((one) => one.id === credit.id);
        return [credit.id, row ? await getAssetUrl(row.assetId) : null] as const;
      }),
    ).then((pairs) => {
      if (!live) return;
      const next: Record<string, string> = {};
      for (const [id, url] of pairs) if (url) next[id] = url;
      setUrls(next);
    });
    return () => {
      live = false;
    };
  }, [credits, stickers]);

  const togglePick = (id: string) => {
    setPicked((was) => (was.includes(id) ? was.filter((x) => x !== id) : [...was, id]));
  };

  const toSheet = (ids: string[]) => {
    if (!ids.length) return;
    router.push(`/stickers/sheet?add=${ids.join(',')}`);
  };

  /** The same install as the Packs page: it only ever adds. */
  const install = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setSaid(null);
    setProblem(null);
    setFailures([]);
    setInstalling({ done: 0, total: 0, name: file.name });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await installPack(bytes, setInstalling);
      const count = summarise(result.outcomes);
      await reload();
      setFailures(result.outcomes.filter((o) => o.state === 'failed'));
      setSaid(
        `${result.name}: ${count.installed} installed` +
          (count.skipped ? `, ${count.skipped} already here` : '') +
          (count.failed ? `, ${count.failed} could not be read` : '') +
          '.',
      );
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That pack could not be installed.');
    } finally {
      setInstalling(null);
      setBusy(false);
    }
  };

  /** The whole list, never the filtered one. A partial record is a wrong one. */
  const exportCredits = () => {
    const text = creditsText(credits);
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'CREDITS.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setSaid(`Saved CREDITS.txt — all ${credits.length} ${credits.length === 1 ? 'item' : 'items'}.`);
  };

  const installer = (
    <label
      className={cx(
        'btn btn-default flex cursor-pointer items-center gap-2 rounded-[6px] px-3.5 py-2 text-[13.5px]',
        busy && 'pointer-events-none opacity-50',
      )}
    >
      <UploadIcon size={16} />
      Install a pack
      <input
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void install(file);
        }}
      />
    </label>
  );

  return (
    <main className="flex h-dvh flex-col">
      <StudioHeader>
        <StudioTitle>Sticker Studio</StudioTitle>
        <span className="ml-auto flex shrink-0 items-center gap-3 self-stretch">
          <span className="flex items-stretch self-stretch">
            <StickerTabs />
          </span>
          <PalettePicker compact />
        </span>
      </StudioHeader>

      <StudioPage>
        <div className={`${COLUMN} py-7`}>
          <PageHead
            title="Library"
            line="Your installed sticker collection, clean and ready to print or layout."
          >
            <div className="flex flex-wrap items-center gap-2">
              {installer}
              {credits.length > 0 && (
                <Button
                  title="A plain-text list of every installed sticker, its author, its licence and its link"
                  onClick={exportCredits}
                >
                  Export credits
                </Button>
              )}
            </div>
          </PageHead>

          {installing && (
            <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-500">
              <Spinner size={12} />
              {installing.total
                ? `Installing ${installing.done} of ${installing.total} — ${installing.name}…`
                : `Reading ${installing.name}…`}
            </p>
          )}
          {problem && (
            <div className="mt-3 max-w-xl">
              <Notice level="error">{problem}</Notice>
            </div>
          )}
          {failures.length > 0 && (
            <div className="mt-3 max-w-xl">
              <Notice level="warning">
                {failures.map((f) => `${f.file}: ${'why' in f ? f.why : 'could not be read'}`).join(' · ')}
              </Notice>
            </div>
          )}
          {said && (
            <div className="mt-3 max-w-xl">
              <Notice level="ok">{said}</Notice>
            </div>
          )}

          {/* Clean Segmented Tab Switch */}
          <div className="mt-6 flex border-b border-ink-200">
            <button
              type="button"
              onClick={() => setActiveTab('installed')}
              className={cx(
                'flex items-center gap-2 border-b-2 px-5 py-2.5 text-[14px] font-[550] transition-colors',
                activeTab === 'installed'
                  ? 'border-accent-500 text-ink-900'
                  : 'border-transparent text-ink-500 hover:text-ink-700',
              )}
            >
              <LibraryIcon size={16} />
              Installed Stickers
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                {credits.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('browse')}
              className={cx(
                'flex items-center gap-2 border-b-2 px-5 py-2.5 text-[14px] font-[550] transition-colors',
                activeTab === 'browse'
                  ? 'border-accent-500 text-ink-900'
                  : 'border-transparent text-ink-500 hover:text-ink-700',
              )}
            >
              Discover Free Graphics
              <span className="rounded-full bg-accentb-100 px-2 py-0.5 text-[11px] font-medium text-accentb-700">
                Wikimedia & Smithsonian
              </span>
            </button>
          </div>

          {activeTab === 'installed' ? (
            <>
              {/* Filter & Search Bar */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <TextInput
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search stickers in your library"
                    placeholder="Search by name, pack, or tag…"
                    className="!w-64"
                  />
                  <button
                    type="button"
                    aria-pressed={pack === null}
                    onClick={() => setPack(null)}
                    className={cx(CHIP, pack === null && CHIP_ON)}
                  >
                    All <span className="ml-1 text-ink-500">{credits.length}</span>
                  </button>
                  {counts.map((entry) => (
                    <button
                      key={entry.pack}
                      type="button"
                      aria-pressed={pack === entry.pack}
                      onClick={() => setPack(pack === entry.pack ? null : entry.pack)}
                      className={cx(CHIP, pack === entry.pack && CHIP_ON)}
                    >
                      {entry.pack} <span className="ml-1 text-ink-500">{entry.count}</span>
                    </button>
                  ))}
                </div>

                {/* Selection Action Bar */}
                {picked.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-[550] text-ink-700">
                      {picked.length} selected
                    </span>
                    <Button
                      variant="primary"
                      onClick={() => toSheet(picked)}
                      title="Put selected stickers on a printable sheet"
                    >
                      Put on sticker sheet
                    </Button>
                    <Button onClick={() => setPicked([])}>Clear</Button>
                  </div>
                ) : (
                  <span className="text-[12.5px] text-ink-500">
                    Click any sticker to select or view details
                  </span>
                )}
              </div>

              {/* Sticker Grid */}
              {!shown.length ? (
                <div
                  className="mt-8 grid place-items-center rounded-[10px] border border-dashed py-12 text-center"
                  style={{ borderColor: 'var(--studio-line)' }}
                >
                  <p className="text-[14px] text-ink-500">
                    {query || pack
                      ? 'No stickers match this search or filter.'
                      : 'No stickers installed yet.'}
                  </p>
                  {(query || pack) && (
                    <Button
                      className="mt-3"
                      onClick={() => {
                        setQuery('');
                        setPack(null);
                      }}
                    >
                      Clear search
                    </Button>
                  )}
                </div>
              ) : (
                <div className="mt-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                  {shown.map((credit) => {
                    const isPicked = picked.includes(credit.id);
                    return (
                      <div key={credit.id} className="group relative flex flex-col">
                        <Thumb
                          url={urls[credit.id]}
                          name={credit.name}
                          note={credit.pack}
                          title={`${credit.name} · ${credit.pack}`}
                          selected={isPicked}
                          onClick={() => togglePick(credit.id)}
                          badge={
                            isPicked ? (
                              <span className="pointer-events-none absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-accent-500 text-paper shadow">
                                <TickIcon size={12} />
                              </span>
                            ) : null
                          }
                          corner={
                            <button
                              type="button"
                              title="View details and licence"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInspecting(credit);
                              }}
                              className="absolute left-1.5 top-1.5 hidden size-6 place-items-center rounded bg-sheet/85 text-[11px] font-bold text-ink-600 shadow-sm backdrop-blur transition hover:bg-sheet group-hover:grid"
                            >
                              ℹ
                            </button>
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Minimal Clean Footer */}
              <div
                className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-[12.5px] text-ink-500"
                style={{ borderColor: 'var(--studio-line)' }}
              >
                <span>
                  All installed stickers are CC0 or Public Domain. No attribution required.
                </span>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={exportCredits}
                    className="text-accent-500 underline hover:text-accent-600"
                  >
                    Export CREDITS.txt
                  </button>
                  <button
                    type="button"
                    onClick={() => setHelper(true)}
                    className="text-accent-500 underline hover:text-accent-600"
                  >
                    Licence & source policy
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Browse Free Graphics Sub-tab */
            <div className="mt-6">
              <BrowseGraphics onAdded={() => void reload()} />
            </div>
          )}

          {/* Inspect Sticker Modal */}
          {inspecting && (
            <Modal title={inspecting.name} onClose={() => setInspecting(null)} width="max-w-md">
              <div className="flex flex-col items-center">
                <Chequerboard className="size-48 rounded-lg border border-ink-200">
                  {urls[inspecting.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={urls[inspecting.id]}
                      alt={inspecting.name}
                      className="max-h-[85%] max-w-[85%] object-contain"
                    />
                  ) : null}
                </Chequerboard>
                <div className="mt-4 w-full space-y-2 text-[13px]">
                  <div className="flex justify-between border-b pb-1.5" style={{ borderColor: 'var(--studio-line)' }}>
                    <span className="text-ink-500">Pack</span>
                    <span className="font-[550]">{inspecting.pack}</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5" style={{ borderColor: 'var(--studio-line)' }}>
                    <span className="text-ink-500">Licence</span>
                    <span className="font-[550] text-emerald-600">{inspecting.licence}</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5" style={{ borderColor: 'var(--studio-line)' }}>
                    <span className="text-ink-500">Author</span>
                    <span>{inspecting.author || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5" style={{ borderColor: 'var(--studio-line)' }}>
                    <span className="text-ink-500">File</span>
                    <span className="truncate max-w-[200px]" title={inspecting.file}>{inspecting.file}</span>
                  </div>
                  {inspecting.sourceUrl && (
                    <div className="flex justify-between pt-1">
                      <span className="text-ink-500">Source</span>
                      <a
                        href={inspecting.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="truncate max-w-[200px] text-accent-500 underline"
                      >
                        {hostOf(inspecting.sourceUrl)}
                      </a>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex w-full gap-2">
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => {
                      toSheet([inspecting.id]);
                      setInspecting(null);
                    }}
                  >
                    Put on sticker sheet
                  </Button>
                  <Button onClick={() => setInspecting(null)}>Close</Button>
                </div>
              </div>
            </Modal>
          )}

          {/* Free Graphics Info Modal */}
          {helper && (
            <Modal title="Where to get free graphics" onClose={() => setHelper(false)} width="max-w-lg">
              <p className="text-[14px] leading-relaxed">
                Two places give away work with no strings: the{' '}
                <a
                  href="https://www.si.edu/openaccess"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent-500 underline"
                >
                  Smithsonian Open Access
                </a>{' '}
                collection and the public-domain part of{' '}
                <a
                  href="https://commons.wikimedia.org/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent-500 underline"
                >
                  Wikimedia Commons
                </a>
                .
              </p>
              <p className="mt-3 text-[14px] leading-relaxed text-ink-500">
                You can browse and import both directly in the “Discover Free Graphics” tab above.
              </p>
              <div className="mt-5 flex justify-end">
                <Button onClick={() => setHelper(false)}>Done</Button>
              </div>
            </Modal>
          )}
        </div>
      </StudioPage>
    </main>
  );
}

const CHIP =
  'inline-flex min-h-8 items-center rounded-[6px] border px-2.5 text-[11.5px] uppercase tracking-[0.05em] ' +
  'transition-colors hover:border-ink-900 [border-color:var(--studio-line)] [background:var(--studio-card)] ' +
  '[font-family:var(--font-mono)]';
const CHIP_ON = '!border-ink-900 !bg-ink-900 !text-paper-50';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
