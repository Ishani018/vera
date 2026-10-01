'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAssetUrl } from '@/lib/assets';
import { listStickers } from '@/lib/cover/library';
import { creditsOf, creditsText, packCounts, searchCredits } from '@/lib/starter/credits';
import type { LibrarySticker } from '@/lib/types';
import { StudioHeader } from '../StudioHeader';
import { StickerTabs } from './StickerTabs';
import { Button, TextInput, cx } from '../ui';

/**
 * Where every installed sticker came from.
 *
 * Only CC0 and public-domain work is accepted, so none of this is required by
 * any licence. It is here for the three things a credit list is actually good
 * for: thanking somebody, checking a claim you took on trust, and finding one
 * item again if that claim turns out to have been wrong.
 *
 * Stickers you drew yourself are not listed, because there is nothing to say
 * about their source that you do not already know.
 */
export function StickerSources() {
  const [stickers, setStickers] = useState<LibrarySticker[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [pack, setPack] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    void listStickers().then(setStickers);
  }, []);

  const credits = useMemo(() => creditsOf(stickers), [stickers]);
  const packs = useMemo(() => packCounts(credits), [credits]);
  const shown = useMemo(() => searchCredits(credits, query, pack), [credits, query, pack]);

  useEffect(() => {
    let live = true;
    void Promise.all(
      credits.map(async (credit) => {
        const sticker = stickers.find((s) => s.id === credit.id);
        return [credit.id, sticker ? await getAssetUrl(sticker.assetId) : null] as const;
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

  /**
   * The whole list, not the filtered one.
   *
   * A credits file with a search still applied would be a quietly incomplete
   * record, and the one thing this file has to be is complete.
   */
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

  return (
    <main className="flex h-dvh flex-col">
      <StudioHeader>
        <span className="text-[16px] font-[560]">Sources and licences</span>
        <span className="ml-auto shrink-0 text-[13px] text-ink-500">kept on this computer only</span>
      </StudioHeader>

      <StickerTabs />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
          {!credits.length ? (
            <div className="mt-6">
              <h1 className="text-[26px] font-semibold tracking-tight">Nothing installed yet</h1>
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-500">
                This lists stickers that came from a pack you installed, with where each one came
                from. Stickers you drew yourself are not here. Install a pack from the Packs page
                and they will appear.
              </p>
            </div>
          ) : (
            <>
              <h1 className="mt-6 text-[26px] font-semibold tracking-tight">Sources and licences</h1>
              <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-500">
                Only CC0 and public-domain work is accepted, so nothing here has to be credited.
                The list is for thanking someone, checking a licence you took on trust, and finding
                one item again if that claim was wrong.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <TextInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search sources"
                  placeholder="Search name, author, licence or link"
                  className="max-w-sm"
                />
                <Button variant="primary" onClick={exportCredits}>
                  Export credits
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={pack === null}
                  onClick={() => setPack(null)}
                  className={cx(
                    'rounded-lg border px-3 py-1.5 text-[13.5px] transition-colors',
                    pack === null ? 'border-accent-500 bg-accent-50' : 'border-ink-200 hover:border-ink-300',
                  )}
                >
                  <span className="font-[560]">All packs</span>
                  <span className="ml-2 text-ink-500">{credits.length}</span>
                </button>
                {packs.map((entry) => (
                  <button
                    key={entry.pack}
                    type="button"
                    aria-pressed={pack === entry.pack}
                    onClick={() => setPack(entry.pack)}
                    className={cx(
                      'rounded-lg border px-3 py-1.5 text-[13.5px] transition-colors',
                      pack === entry.pack
                        ? 'border-accent-500 bg-accent-50'
                        : 'border-ink-200 hover:border-ink-300',
                    )}
                  >
                    <span className="font-[560]">{entry.pack}</span>
                    <span className="ml-2 text-ink-500">{entry.count}</span>
                  </button>
                ))}
              </div>

              {said && <p className="mt-3 text-[13px] text-ink-500">{said}</p>}

              <p className="mt-4 text-[13px] text-ink-500">
                {shown.length === credits.length
                  ? `${credits.length} ${credits.length === 1 ? 'item' : 'items'}.`
                  : `${shown.length} of ${credits.length} shown.`}
              </p>

              {!shown.length ? (
                <p className="mt-6 text-[14.5px] text-ink-500">
                  Nothing matches that. Try part of a name, an author, or a licence.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-ink-100 border-y border-ink-100">
                  {shown.map((credit) => (
                    <li key={credit.id} className="flex items-start gap-4 py-4">
                      <span className="grid size-16 shrink-0 place-items-center rounded-lg border border-ink-100 bg-[conic-gradient(#f3f3f3_0_25%,#fff_0_50%,#f3f3f3_0_75%,#fff_0)] bg-[length:12px_12px]">
                        {urls[credit.id] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={urls[credit.id]}
                            alt={credit.name}
                            className="max-h-14 max-w-14 object-contain"
                          />
                        ) : (
                          <span className="text-[11px] text-ink-500">no picture</span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-[560]">{credit.name}</p>
                        <p className="mt-0.5 text-[13px] text-ink-500">
                          {credit.pack} · {credit.file} · added {credit.downloadedOn}
                        </p>
                        <p className="mt-1 text-[13.5px]">
                          {credit.author} — {credit.licence}
                        </p>
                        <p className="mt-0.5 truncate text-[13px]">
                          <a
                            href={credit.sourceUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-accent-500 underline"
                          >
                            {credit.sourceUrl}
                          </a>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
