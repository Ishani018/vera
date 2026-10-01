'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAssetUrl } from '@/lib/assets';
import { listStickers } from '@/lib/cover/library';
import {
  creditsOf,
  creditsText,
  packCounts,
  packSummaries,
  searchCredits,
} from '@/lib/starter/credits';
import { installPack, summarise } from '@/lib/starter/installClient';
import type { ItemOutcome } from '@/lib/starter/install';
import type { LibrarySticker } from '@/lib/types';
import { Modal } from '../Modal';
import { StudioHeader } from '../StudioHeader';
import { StickerTabs } from './StickerTabs';
import { Collage, Thumb } from './Thumb';
import { DownloadIcon, LibraryIcon, UploadIcon } from './icons';
import { Button, Notice, Spinner, TextInput, cx } from '../ui';

/**
 * The library: what is installed, where each of it came from, and how to get
 * more.
 *
 * This is the page somebody opens asking "what have I got, and am I allowed to
 * sell something with it on". So the packs come first as cards, each carrying
 * its licence and its source — the two facts that answer the second half of
 * that question — and the list underneath answers it item by item.
 *
 * Only CC0 and public-domain work is accepted, so none of it requires
 * attribution. The credits file exists anyway, because a list is what lets you
 * thank somebody, check a claim you took on trust, and find one item again if
 * that claim turns out to have been wrong.
 */
export function PackLibrary() {
  const [stickers, setStickers] = useState<LibrarySticker[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [pack, setPack] = useState<string | null>(null);
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
  const packs = useMemo(() => packSummaries(credits), [credits]);
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
        'flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-[13.5px] font-[560] transition-colors hover:border-ink-400',
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
          // Cleared so the same zip can be chosen twice running.
          e.target.value = '';
          void install(file);
        }}
      />
    </label>
  );

  return (
    <main className="flex h-dvh flex-col">
      <StudioHeader>
        <span className="text-[16px] font-[560]">Library</span>
        <span className="ml-auto shrink-0 text-[13px] text-ink-500">kept on this computer only</span>
      </StudioHeader>

      <StickerTabs />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-[24px] font-semibold tracking-tight">Library</h1>
            <div className="flex flex-wrap gap-2">
              {installer}
              {credits.length > 0 && (
                <Button
                  variant="primary"
                  title="A plain-text list of every installed sticker, its author, its licence and its link"
                  onClick={exportCredits}
                >
                  Export credits
                </Button>
              )}
            </div>
          </div>

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

          {!credits.length ? (
            <div className="mt-10 grid place-items-center">
              <div className="max-w-xl text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-ink-100 text-ink-500">
                  <LibraryIcon size={28} />
                </span>
                <h2 className="mt-4 text-[20px] font-semibold tracking-tight">
                  Nothing installed yet
                </h2>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-500">
                  This is where stickers that came from somewhere else live, with the licence and
                  the link for each one. The ones you drew yourself are under Make a sticker.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {installer}
                  <Button onClick={() => setHelper(true)}>Where to get free graphics</Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 text-[13.5px] text-ink-500">
                {credits.length} {credits.length === 1 ? 'item' : 'items'} from{' '}
                {packs.length} {packs.length === 1 ? 'pack' : 'packs'}. All public domain or CC0, so
                none of it has to be credited.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {packs.map((summary) => (
                  <div
                    key={summary.pack}
                    className="flex flex-col rounded-2xl border border-ink-200 bg-paper-0 p-3"
                  >
                    <button
                      type="button"
                      title={`Show only ${summary.pack}`}
                      onClick={() => setPack(pack === summary.pack ? null : summary.pack)}
                      className="block text-left"
                    >
                      <Collage
                        urls={summary.ids.map((id) => urls[id])}
                        name={summary.pack}
                        className={cx(pack === summary.pack && 'border-accent-500')}
                      />
                      <span className="mt-2 block truncate text-[14.5px] font-[600]">
                        {summary.pack}
                      </span>
                      <span className="block text-[12px] text-ink-500">
                        {summary.count} {summary.count === 1 ? 'sticker' : 'stickers'} · added{' '}
                        {summary.added}
                      </span>
                    </button>
                    <p className="mt-1.5 text-[12px] leading-snug text-ink-700">
                      {summary.licences.join(', ')}
                    </p>
                    <p className="text-[12px] leading-snug text-ink-500" title={summary.authors.join(', ')}>
                      <span className="block truncate">{summary.authors.join(', ')}</span>
                    </p>
                    {summary.sources.length === 1 ? (
                      <a
                        href={summary.sources[0]}
                        target="_blank"
                        rel="noreferrer noopener"
                        title={summary.sources[0]}
                        className="mt-1 block truncate text-[12px] text-accent-500 underline"
                      >
                        {hostOf(summary.sources[0])}
                      </a>
                    ) : (
                      <span className="mt-1 block text-[12px] text-ink-500">
                        {summary.sources.length} sources
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-2">
                <TextInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search the library"
                  placeholder="Search name, author, licence or link"
                  className="max-w-sm"
                />
                <button
                  type="button"
                  aria-pressed={pack === null}
                  onClick={() => setPack(null)}
                  className={cx(
                    'rounded-lg border px-3 py-1.5 text-[13px] transition-colors',
                    pack === null ? 'border-accent-500 bg-accent-50' : 'border-ink-200 hover:border-ink-300',
                  )}
                >
                  All <span className="ml-1 text-ink-500">{credits.length}</span>
                </button>
                {counts.map((entry) => (
                  <button
                    key={entry.pack}
                    type="button"
                    aria-pressed={pack === entry.pack}
                    onClick={() => setPack(entry.pack)}
                    className={cx(
                      'rounded-lg border px-3 py-1.5 text-[13px] transition-colors',
                      pack === entry.pack
                        ? 'border-accent-500 bg-accent-50'
                        : 'border-ink-200 hover:border-ink-300',
                    )}
                  >
                    {entry.pack} <span className="ml-1 text-ink-500">{entry.count}</span>
                  </button>
                ))}
              </div>

              {!shown.length ? (
                <p className="mt-6 text-[14px] text-ink-500">
                  Nothing matches that. Try part of a name, an author, or a licence.
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-6">
                  {shown.map((credit) => (
                    <Thumb
                      key={credit.id}
                      url={urls[credit.id]}
                      name={credit.name}
                      note={`${credit.pack} · ${credit.licence}`}
                      title={
                        `${credit.name}\n${credit.pack} · ${credit.file}\n` +
                        `${credit.author} — ${credit.licence}\n${credit.sourceUrl}\nadded ${credit.downloadedOn}`
                      }
                    />
                  ))}
                </div>
              )}

              <p className="mt-6 text-[12.5px] text-ink-500">
                Credits are not required by any of these licences.{' '}
                <button type="button" onClick={exportCredits} className="text-accent-500 underline">
                  Export credits
                </button>{' '}
                writes the whole list anyway — never the filtered one, because a partial record is a
                wrong one.
              </p>
            </>
          )}

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
              <p className="mt-3 text-[14px] leading-relaxed">
                There is a helper in this repository that fetches from their official APIs, keeps
                only what is CC0 or public domain by the API&rsquo;s own licence field, and writes a
                pack with the source, author, licence and date filled in:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-ink-100 px-3 py-2 text-[12.5px]">
                npm run starter:fetch commons &quot;botanical illustration&quot; 20
              </pre>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
                It runs on your own computer, not in the app, and writes into{' '}
                <code>starter/</code>. Then <code>npm run starter:build</code> checks every item and
                makes the zip you install here. See <code>starter/README.md</code> for which terms
                to read first — a site&rsquo;s label can be wrong, and CC0 waives copyright but not
                trademark or personality rights.
              </p>
              <div className="mt-5 flex justify-end">
                <Button onClick={() => setHelper(false)}>Close</Button>
              </div>
            </Modal>
          )}
        </div>
      </div>
    </main>
  );
}

/** "commons.wikimedia.org", for a link that would otherwise wrap over two lines. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
