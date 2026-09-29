'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ACTIVE_PROJECT_KEY, getDb } from '@/lib/db';
import { createProject } from '@/lib/defaults';
import {
  addDesign,
  createColoringBook,
  deleteDesign,
  deleteProject,
  listLibrary,
  renameDesign,
  renameProject,
  type LibraryEntry,
  type Thumb,
} from '@/lib/projects';
import {
  CATEGORIES,
  INTERIORS,
  TILES,
  tileSize,
  type Tile,
  type TileArt,
  type TileCategory,
  type TileDestination,
} from '@/lib/tiles';
import type { AnyProject } from '@/lib/types';
import { Modal } from './Modal';
import { StudioHeader } from './StudioHeader';
import { Button, TextInput, cx } from './ui';

/**
 * The way in.
 *
 * Not a menu of the two editors that happen to exist, but a list of things
 * someone might want to make — which is the difference between an app that
 * typesets poetry and a tool for publishing a book. A tile is either real or
 * muted; there is nothing here that opens a screen saying it will be along
 * later.
 */
export function Landing() {
  const router = useRouter();
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [category, setCategory] = useState<TileCategory | 'all'>('all');
  /** The tile waiting for a book to belong to. */
  const [pending, setPending] = useState<Tile | null>(null);
  const [interiors, setInteriors] = useState(false);
  const [renaming, setRenaming] = useState<LibraryEntry | null>(null);
  const [deleting, setDeleting] = useState<LibraryEntry | null>(null);

  const refresh = useCallback(() => {
    void listLibrary().then(setEntries);
  }, []);
  useEffect(refresh, [refresh]);

  const books = (entries ?? []).filter((entry) => entry.kind !== 'design');

  /**
   * Open a book, at whichever part of it the tile asked for.
   *
   * A new launch-kit design is written into the book here, before anything
   * navigates, and the editor is told which one to open. Asking the editor to
   * make it on arrival puts a design in a race with the book it belongs to.
   */
  const go = async (
    projectId: string,
    kind: AnyProject['kind'],
    destination: TileDestination,
    designId?: string,
  ) => {
    let open = designId;
    if (!open && destination.kind === 'design') {
      open = (await addDesign(projectId, destination.presetId)) ?? undefined;
    }
    window.localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
    const path = kind === 'coloring' ? '/coloring' : '/poetry';
    const query =
      open !== undefined
        ? `?open=kit&design=${encodeURIComponent(open)}`
        : destination.kind === 'cover'
          ? '?open=cover'
          : '';
    router.push(path + query);
  };

  /** Make a book of the given kind, then carry on to where the tile pointed. */
  const start = async (kind: AnyProject['kind'], destination: TileDestination) => {
    const db = getDb();
    const book = kind === 'coloring' ? createColoringBook() : createProject();
    if (db) await db.projects.put(book);
    await go(book.id, kind, destination);
  };

  const onTile = (tile: Tile) => {
    if (tile.status !== 'ready') return;
    if (tile.destination.kind === 'interior') return setInteriors(true);
    setPending(tile);
  };

  const shown = TILES.filter((tile) => category === 'all' || tile.category === category);

  return (
    <main className="flex h-dvh flex-col">
      <StudioHeader>
        <span className="hidden text-ink-500 sm:inline">
          The design tool for people who self-publish books
        </span>
      </StudioHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <h1 className="text-[28px] font-semibold tracking-tight sm:text-[34px]">
            What will you make today?
          </h1>

          <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {CATEGORIES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setCategory(entry.id)}
                aria-pressed={category === entry.id}
                className={cx(
                  'shrink-0 rounded-full border px-4 py-1.5 text-[14px] font-[550] transition-colors',
                  category === entry.id
                    ? 'border-ink-900 bg-ink-900'
                    : 'border-ink-200 bg-paper hover:border-ink-300',
                )}
              >
                {/*
                  The colour goes on a span inside, not on the button: the
                  reset in globals.css sets `color: inherit` on buttons outside
                  any layer, and unlayered CSS beats every Tailwind utility, so
                  a text colour written on a button here does nothing at all.
                */}
                <span className={category === entry.id ? 'text-paper' : 'text-ink-700'}>
                  {entry.label}
                </span>
              </button>
            ))}
          </div>

          <ul
            aria-label="Things you can make"
            className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          >
            {shown.map((tile) => (
              <li key={tile.id}>
                <button
                  type="button"
                  disabled={tile.status !== 'ready'}
                  onClick={() => onTile(tile)}
                  title={tile.status === 'ready' ? undefined : 'Not built yet'}
                  className={cx(
                    'w-full rounded-2xl border bg-paper p-3 text-left transition-colors',
                    tile.status === 'ready'
                      ? 'border-ink-200 hover:border-accent-500 hover:bg-accent-50/40'
                      : 'cursor-not-allowed border-dashed border-ink-200 opacity-45',
                  )}
                >
                  <span className="grid h-24 place-items-center rounded-xl bg-ink-100">
                    <TileDrawing art={tile.art} />
                  </span>
                  <span className="mt-3 flex items-baseline gap-1.5">
                    <span className="truncate text-[15px] font-[570]">{tile.label}</span>
                    {tile.status !== 'ready' && (
                      <span className="shrink-0 text-[11px] uppercase tracking-wide text-ink-500">
                        soon
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-ink-500">
                    {tileSize(tile)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <section className="mt-12">
            <h2 className="text-[20px] font-semibold tracking-tight">Your designs</h2>
            {entries === null ? (
              <p className="mt-3 text-[15px] text-ink-500">Looking…</p>
            ) : entries.length === 0 ? (
              <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-ink-500">
                Nothing yet — pick something above and it will appear here. Everything you make is
                kept on this computer, in this browser, and never leaves it.
              </p>
            ) : (
              <ul
                aria-label="Your designs"
                className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              >
                {entries.map((entry) => (
                  <li key={entry.key} className="group relative">
                    <button
                      type="button"
                      onClick={() =>
                        void go(entry.projectId, entry.bookKind, { kind: 'none' }, entry.designId)
                      }
                      className="w-full rounded-2xl border border-ink-200 bg-paper p-3 text-left transition-colors hover:border-accent-500"
                    >
                      <span className="grid h-24 place-items-center overflow-hidden rounded-xl bg-ink-100 p-2">
                        <ThumbArt thumb={entry.thumb} />
                      </span>
                      <span className="mt-3 block truncate text-[15px] font-[570]">
                        {entry.name || 'Untitled'}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-ink-500">
                        {entry.type}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] text-ink-400">
                        {when(entry.at)}
                      </span>
                    </button>

                    <span
                      className={cx(
                        'absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity',
                        'group-focus-within:opacity-100 group-hover:opacity-100',
                      )}
                    >
                      <IconButton label="Rename" onClick={() => setRenaming(entry)}>
                        ✎
                      </IconButton>
                      <IconButton label="Delete" onClick={() => setDeleting(entry)}>
                        ✕
                      </IconButton>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {interiors && (
        <Modal title="What kind of book?" onClose={() => setInteriors(false)} width="max-w-xl">
          <div className="flex flex-col gap-2.5 p-5">
            {INTERIORS.map((kind) => (
              <button
                key={kind.id}
                type="button"
                disabled={kind.status !== 'ready'}
                onClick={() => {
                  if (kind.id === 'activity') return;
                  setInteriors(false);
                  void start(kind.id === 'coloring' ? 'coloring' : 'poetry', { kind: 'none' });
                }}
                className={cx(
                  'rounded-xl border p-4 text-left transition-colors',
                  kind.status === 'ready'
                    ? 'border-ink-200 hover:border-accent-500 hover:bg-accent-50/40'
                    : 'cursor-not-allowed border-dashed border-ink-200 opacity-50',
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span className="text-[17px] font-[570]">{kind.label}</span>
                  {kind.status !== 'ready' && (
                    <span className="text-[11px] uppercase tracking-wide text-ink-500">soon</span>
                  )}
                </span>
                <span className="mt-1 block text-[14px] leading-relaxed text-ink-500">
                  {kind.blurb}
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {pending && (
        <Modal
          title={`${pending.label} — which book?`}
          onClose={() => setPending(null)}
          width="max-w-xl"
        >
          <div className="flex flex-col gap-2.5 p-5">
            <p className="text-[14px] leading-relaxed text-ink-500">
              {pending.destination.kind === 'cover'
                ? 'A cover belongs to a book: it takes its trim size and its spine from one.'
                : 'Launch-kit pieces are kept with the book they announce, and every picture in that book is in the tray while you work.'}
            </p>
            {books.map((book) => (
              <button
                key={book.key}
                type="button"
                onClick={() => {
                  setPending(null);
                  void go(book.projectId, book.bookKind, pending.destination);
                }}
                className="rounded-xl border border-ink-200 p-3.5 text-left transition-colors hover:border-accent-500"
              >
                <span className="block truncate text-[16px] font-[560]">
                  {book.name || 'Untitled'}
                </span>
                <span className="mt-0.5 block text-[13px] text-ink-500">{book.type}</span>
              </button>
            ))}
            <div className="mt-1 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  const destination = pending.destination;
                  setPending(null);
                  void start('poetry', destination);
                }}
              >
                Start a poetry book
              </Button>
              <Button
                onClick={() => {
                  const destination = pending.destination;
                  setPending(null);
                  void start('coloring', destination);
                }}
              >
                Start a colouring book
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {renaming && (
        <RenameDialog
          entry={renaming}
          onClose={() => setRenaming(null)}
          onDone={() => {
            setRenaming(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <Modal title="Delete this?" onClose={() => setDeleting(null)} width="max-w-md">
          <div className="p-5">
            <p className="text-[15px] leading-relaxed">
              <strong className="font-[570]">{deleting.name || 'Untitled'}</strong> will be removed
              from this browser.{' '}
              {deleting.kind === 'design'
                ? 'The book it belongs to is not touched.'
                : 'Everything in it goes with it, including its launch kit.'}{' '}
              There is no undo for this.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setDeleting(null)}>Keep it</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const entry = deleting;
                  setDeleting(null);
                  void (entry.designId
                    ? deleteDesign(entry.projectId, entry.designId)
                    : deleteProject(entry.projectId)
                  ).then(refresh);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}

function RenameDialog({
  entry,
  onClose,
  onDone,
}: {
  entry: LibraryEntry;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(entry.name);
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return onClose();
    void (entry.designId
      ? renameDesign(entry.projectId, entry.designId, trimmed)
      : renameProject(entry.projectId, trimmed)
    ).then(onDone);
  };
  return (
    <Modal title="Rename" onClose={onClose} width="max-w-md">
      <div className="p-5">
        <TextInput
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
        {entry.kind !== 'design' && (
          <p className="mt-2 text-[13px] leading-snug text-ink-500">
            This is what the book is called here. The title printed inside it, and on its cover, is
            set in the book itself.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Rename
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-lg border border-ink-200 bg-paper/95 text-[13px] text-ink-700 shadow-sm transition-colors hover:border-ink-400 hover:text-ink-900"
    >
      {children}
    </button>
  );
}

/**
 * What is saved, at the size of a thumbnail: the real shape, the real
 * background, and every picture and line of type where it actually sits.
 */
function ThumbArt({ thumb }: { thumb: Thumb }) {
  return (
    <svg
      viewBox={`0 0 ${thumb.width} ${thumb.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-hidden
    >
      <rect
        width={thumb.width}
        height={thumb.height}
        fill={thumb.background}
        stroke="#d2ccc2"
        strokeWidth={Math.max(thumb.width, thumb.height) / 300}
      />
      {thumb.marks.map((mark, index) => (
        <rect
          key={index}
          x={mark.x}
          y={mark.y}
          width={Math.max(mark.w, 1)}
          height={Math.max(mark.h, 1)}
          fill={mark.kind === 'text' ? '#8a7d66' : '#b5ada1'}
          opacity={mark.kind === 'text' ? 0.85 : 0.6}
        />
      ))}
    </svg>
  );
}

/** One drawing per tile, at the tile's own proportions. */
function TileDrawing({ art }: { art: TileArt }) {
  const stroke = '#b5ada1';
  const paper = '#fff';
  switch (art) {
    case 'interior':
      return (
        <svg viewBox="0 0 120 80" className="h-20" role="img" aria-label="An open book">
          <rect x="8" y="8" width="51" height="64" fill={paper} stroke={stroke} />
          <rect x="61" y="8" width="51" height="64" fill={paper} stroke={stroke} />
          {[22, 30, 38, 46].map((y, i) => (
            <rect key={y} x="16" y={y} width={[30, 22, 34, 18][i]} height="2.4" fill={stroke} />
          ))}
          {[22, 30, 38].map((y, i) => (
            <rect key={y} x="69" y={y} width={[26, 34, 20][i]} height="2.4" fill={stroke} />
          ))}
        </svg>
      );
    case 'wrap':
      return (
        <svg viewBox="0 0 120 80" className="h-20" role="img" aria-label="A wrap cover">
          <rect x="6" y="12" width="48" height="56" fill={paper} stroke={stroke} />
          <rect x="54" y="12" width="12" height="56" fill="#e7e1d6" stroke={stroke} />
          <rect x="66" y="12" width="48" height="56" fill={paper} stroke={stroke} />
          <rect x="76" y="26" width="28" height="4" fill="#8a7d66" />
          <rect x="76" y="34" width="18" height="3" fill={stroke} />
        </svg>
      );
    case 'square':
      return (
        <svg viewBox="0 0 120 80" className="h-20" role="img" aria-label="A square post">
          <rect x="32" y="4" width="56" height="56" fill={paper} stroke={stroke} />
          <circle cx="60" cy="26" r="11" fill="#e7e1d6" />
          <rect x="42" y="44" width="36" height="4" fill="#8a7d66" />
          <rect x="48" y="52" width="24" height="3" fill={stroke} />
        </svg>
      );
    case 'pin':
      return (
        <svg viewBox="0 0 120 80" className="h-20" role="img" aria-label="A tall pin">
          <rect x="42" y="2" width="36" height="72" fill={paper} stroke={stroke} />
          <rect x="48" y="10" width="24" height="26" fill="#e7e1d6" />
          <rect x="48" y="44" width="24" height="4" fill="#8a7d66" />
          <rect x="48" y="52" width="16" height="3" fill={stroke} />
        </svg>
      );
    case 'postcard':
      return (
        <svg viewBox="0 0 120 80" className="h-20" role="img" aria-label="A postcard">
          <rect x="34" y="6" width="52" height="68" fill={paper} stroke={stroke} />
          <rect x="40" y="12" width="40" height="30" fill="#e7e1d6" />
          <rect x="40" y="50" width="32" height="3.5" fill="#8a7d66" />
          <rect x="40" y="58" width="22" height="3" fill={stroke} />
        </svg>
      );
    case 'bookmark':
      return (
        <svg viewBox="0 0 120 80" className="h-20" role="img" aria-label="A bookmark">
          <rect x="52" y="2" width="16" height="72" fill={paper} stroke={stroke} />
          <rect x="56" y="10" width="8" height="8" fill="#e7e1d6" />
          <rect x="56" y="24" width="8" height="26" fill={stroke} opacity="0.5" />
          <path d="M52 74 L60 66 L68 74 Z" fill="#e7e1d6" stroke={stroke} />
        </svg>
      );
  }
}

function when(at: number): string {
  const days = Math.floor((Date.now() - at) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}
