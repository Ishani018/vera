'use client';

import { useEffect, useState } from 'react';
import { ADD_ALL_LIMIT, CATEGORIES, packFor } from '@/lib/graphics/policy';
import { addPicks, countOutcomes, type AddOutcome, type Pick } from '@/lib/graphics/add';
import { Button, Notice, Spinner, TextInput, cx } from '../ui';
import { Chequerboard } from './Thumb';
import { PlusIcon } from './icons';

/**
 * Looking through two public collections without leaving the app.
 *
 * Only work that is CC0 or public domain **by the API's own licence field** is
 * shown — never because the search asked for it, never because it looks old —
 * and anything whose words suggest somebody owns it is left out. Both checks
 * are the ones the command-line helper already used; this screen asks the
 * server, and the server asks them.
 *
 * What leaves this computer is the words typed in the box. The line under it
 * says so, because a search box that quietly talks to another organisation is
 * the sort of thing somebody should be told about once rather than find out
 * later.
 */

type Sources = { commons: boolean; smithsonian: boolean };

export function BrowseGraphics({ onAdded }: { onAdded: () => void }) {
  const [sources, setSources] = useState<Sources>({ commons: true, smithsonian: false });
  const [source, setSource] = useState<'commons' | 'smithsonian'>('commons');
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<Pick[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [more, setMore] = useState(false);
  const [looking, setLooking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ done: number; total: number; title: string } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [failures, setFailures] = useState<AddOutcome[]>([]);

  useEffect(() => {
    void fetch('/api/graphics/sources')
      .then((response) => (response.ok ? response.json() : null))
      .then((found: Sources | null) => found && setSources(found))
      .catch(() => undefined);
  }, []);

  const look = async (text: string, which: 'commons' | 'smithsonian', at: number) => {
    const wanted = text.trim();
    if (!wanted) return;
    setLooking(true);
    setProblem(null);
    if (at === 0) {
      setItems([]);
      setSaid(null);
      setFailures([]);
    }
    try {
      const response = await fetch(
        `/api/graphics/search?source=${which}&q=${encodeURIComponent(wanted)}&page=${at}`,
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? `The search answered ${response.status}.`);
      setItems((was) => (at === 0 ? body.items : [...was, ...body.items]));
      setSkipped((was) => (at === 0 ? body.skipped.length : was + body.skipped.length));
      setMore(Boolean(body.more) && body.items.length > 0);
      setAsked(wanted);
      setPage(at);
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : 'That search could not be made. Check that this computer is online.',
      );
      setMore(false);
    } finally {
      setLooking(false);
    }
  };

  const add = async (picks: Pick[]) => {
    setSaid(null);
    setFailures([]);
    setAdding({ done: 0, total: picks.length, title: picks[0]?.title ?? '' });
    try {
      const outcomes = await addPicks(picks, asked, (done, total, title) =>
        setAdding({ done, total, title }),
      );
      const count = countOutcomes(outcomes);
      setFailures(outcomes.filter((one) => one.state === 'failed'));
      setSaid(
        `${count.added} added to My stickers as pack:${packFor(asked)}` +
          (count.skipped ? `, ${count.skipped} already here` : '') +
          (count.failed ? `, ${count.failed} could not be fetched` : '') +
          '.',
      );
      onAdded();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Those could not be added.');
    } finally {
      setAdding(null);
    }
  };

  const busy = looking || Boolean(adding);

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[17px] font-semibold tracking-tight">Browse free graphics</h2>
        {sources.smithsonian && (
          <span className="flex gap-1">
            {(['commons', 'smithsonian'] as const).map((one) => (
              <button
                key={one}
                type="button"
                aria-pressed={source === one}
                onClick={() => {
                  setSource(one);
                  if (asked) void look(asked, one, 0);
                }}
                className={cx(
                  'rounded-lg border px-2.5 py-1 text-[12.5px] transition-colors',
                  source === one
                    ? 'border-accent-500 bg-accent-50'
                    : 'border-ink-200 hover:border-ink-300',
                )}
              >
                {one === 'commons' ? 'Wikimedia' : 'Smithsonian'}
              </button>
            ))}
          </span>
        )}
      </div>

      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void look(query, source, 0);
        }}
      >
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search free graphics"
          placeholder="ferns, moths, ornaments…"
          className="max-w-sm"
        />
        <Button variant="primary" disabled={busy || !query.trim()} onClick={() => void look(query, source, 0)}>
          Search
        </Button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {CATEGORIES.map((category) => (
          <button
            key={category.label}
            type="button"
            disabled={busy}
            onClick={() => {
              setQuery(category.query);
              void look(category.query, source, 0);
            }}
            className="inline-flex min-h-8 items-center rounded-full border border-ink-200 px-3 text-[12.5px] text-ink-700 transition-colors hover:border-accent-500 hover:text-accent-500"
          >
            {category.label}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[12px] text-ink-500">
        Searching sends your search words to{' '}
        {source === 'commons' ? 'Wikimedia' : 'the Smithsonian'} — nothing else about you, and
        nothing you have made. Only public-domain and CC0 items are shown, by each service&rsquo;s
        own licence field.
      </p>
      {!sources.smithsonian && (
        <p className="mt-1 text-[12px] text-ink-500">
          The Smithsonian collection needs a free key: set{' '}
          <code className="rounded bg-ink-100 px-1">SMITHSONIAN_API_KEY</code> on the server (from
          api.data.gov) and it appears here.
        </p>
      )}

      {problem && (
        <div className="mt-3 max-w-xl">
          <Notice level="error">{problem}</Notice>
        </div>
      )}
      {adding && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-700">
          <Spinner size={12} />
          Adding {adding.done} of {adding.total} — {adding.title}
        </p>
      )}
      {said && (
        <div className="mt-3 max-w-xl">
          <Notice level="ok">{said}</Notice>
        </div>
      )}
      {failures.length > 0 && (
        <div className="mt-2 max-w-xl">
          <Notice level="warning">
            {failures.map((one) => `${one.title}: ${one.why ?? 'could not be added'}`).join(' · ')}
          </Notice>
        </div>
      )}

      {looking && !items.length && (
        <>
          <p className="mt-4 text-[13.5px] text-ink-500">Looking…</p>
          {/*
            Blocks the shape of the pictures that are coming, rather than a
            spinner. A spinner says "wait" and nothing about what for; twelve
            squares say "about this many pictures, nearly here", and when they
            land nothing on the page moves to make room for them.
          */}
          <div
            aria-hidden="true"
            className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6"
          >
            {Array.from({ length: 12 }, (_, n) => (
              <div key={n} className="min-w-0">
                <div
                  className="skeleton aspect-square w-full rounded-lg border border-ink-200"
                  style={{ '--n': n % 6 } as React.CSSProperties}
                />
                <div className="skeleton mt-1.5 h-2.5 w-4/5 rounded" />
                <div className="skeleton mt-1 h-2.5 w-3/5 rounded" />
              </div>
            ))}
          </div>
        </>
      )}

      {items.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-[13px] text-ink-500">
              {items.length} free to use{skipped ? ` · ${skipped} left out` : ''}
            </span>
            <Button
              disabled={busy}
              title={`Adds the first ${ADD_ALL_LIMIT}, one at a time`}
              onClick={() => void add(items.slice(0, ADD_ALL_LIMIT))}
            >
              Add all ({Math.min(items.length, ADD_ALL_LIMIT)})
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
            {items.map((item) => (
              <div
                key={`${item.id}-${item.fileUrl}`}
                className="group relative min-w-0"
              >
                <Chequerboard className="aspect-square w-full rounded-lg border border-ink-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.thumbUrl}
                    alt={item.title}
                    loading="lazy"
                    className="max-h-[88%] max-w-[88%] object-contain"
                  />
                </Chequerboard>
                <span className="mt-1 block truncate text-[12px] leading-tight" title={item.title}>
                  {item.title}
                </span>
                <span
                  className="block truncate text-[11px] leading-tight text-ink-500"
                  title={`${item.author} — ${item.licence}`}
                >
                  {item.author} · {item.licence}
                </span>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block truncate text-[11px] leading-tight text-accent-500 underline"
                >
                  source
                </a>
                <button
                  type="button"
                  disabled={busy}
                  title={`Add ${item.title} to My stickers`}
                  aria-label={`Add ${item.title}`}
                  onClick={() => void add([item])}
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-full border border-ink-200 bg-paper/95 text-ink-700 opacity-0 shadow transition-opacity hover:border-accent-500 group-focus-within:opacity-100 group-hover:opacity-100"
                >
                  <PlusIcon size={14} />
                </button>
              </div>
            ))}
          </div>

          {more && (
            <div className="mt-4">
              <Button disabled={busy} onClick={() => void look(asked, source, page + 1)}>
                {looking ? 'Looking…' : 'Browse more'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
