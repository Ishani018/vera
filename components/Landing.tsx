'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAssetUrl } from '@/lib/assets';
import { ACTIVE_PROJECT_KEY, getDb } from '@/lib/db';
import {
  deleteStandaloneDesign,
  renameStandaloneDesign,
  startDesign,
} from '@/lib/designs';
import { createProject } from '@/lib/defaults';
import { TRASH_DAYS } from '@/lib/deleted';
import { listTrash, purgeExpired } from '@/lib/trash';
import {
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
  type TileDestination,
} from '@/lib/tiles';
import type { AnyProject } from '@/lib/types';
import { PREVIEW_ROUND } from '@/lib/preview';
import {
  HOME_FILTERS,
  badgeFor,
  cleanUpLine,
  emptyDesigns,
  filterEntries,
  searchEntries,
  type HomeFilter,
} from '@/lib/home';
import { duplicateStandaloneDesign } from '@/lib/designs';
import { duplicateDesign } from '@/lib/projects';
import { listStickers } from '@/lib/cover/library';
import { searchStickers } from '@/lib/cover/library';
import type { LibrarySticker } from '@/lib/types';
import { Chequerboard } from './stickers/Thumb';
import {
  BroomIcon,
  BookmarkIcon,
  CopyIcon,
  CoverIcon,
  CrossIcon,
  DesignsIcon,
  HomeIcon,
  InstagramIcon,
  InteriorIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  PostcardIcon,
  SearchIcon,
  TemplatesIcon,
  TrashIcon,
} from './icons';
import { PackIcon } from './stickers/icons';
import { TilePreview, PreviewBox } from './TilePreview';
import { Modal } from './Modal';
import { Trash } from './Trash';
import { StudioHeader } from './StudioHeader';
import { ThumbArt } from './ThumbArt';
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
  /** The tile waiting for a book to belong to. */
  const [pending, setPending] = useState<Tile | null>(null);
  const [interiors, setInteriors] = useState(false);
  /** The card whose name is being typed into, by key. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LibraryEntry | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashCount, setTrashCount] = useState(0);

  /* ------------------------------------------------- searching and filtering */

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState<HomeFilter>('all');
  const [creating, setCreating] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [stickers, setStickers] = useState<LibrarySticker[]>([]);
  const [stickerUrls, setStickerUrls] = useState<Record<string, string>>({});

  const refresh = useCallback(() => {
    void listLibrary().then(setEntries);
    void listTrash().then((rows) => setTrashCount(rows.length));
    void listStickers().then(setStickers);
  }, []);
  useEffect(refresh, [refresh]);

  // Thirty days up, and gone. Here because the front page opening is the one
  // moment this app reliably gets, and nothing depends on it being punctual:
  // something that outstays its welcome by a week costs disk, not correctness.
  useEffect(() => {
    void purgeExpired().then((gone) => {
      if (gone) refresh();
    });
  }, [refresh]);

  const books = (entries ?? []).filter((entry) => entry.kind !== 'design');

  /** Open a book, at whichever part of it was asked for. */
  const go = async (
    projectId: string,
    kind: AnyProject['kind'],
    destination: TileDestination,
    designId?: string,
  ) => {
    window.localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
    const path = kind === 'coloring' ? '/coloring' : '/poetry';
    const query =
      designId !== undefined
        ? `?open=kit&design=${encodeURIComponent(designId)}`
        : destination.kind === 'cover'
          ? '?open=cover'
          : '';
    router.push(path + query);
  };

  /** Opens whatever a card stands for, wherever it is kept. */
  const open = async (entry: LibraryEntry) => {
    if (!entry.projectId || !entry.bookKind) {
      router.push(`/design?id=${encodeURIComponent(entry.designId!)}`);
      return;
    }
    await go(entry.projectId, entry.bookKind, { kind: 'none' }, entry.designId);
  };

  /** Make a book of the given kind, then carry on to where the tile pointed. */
  const start = async (kind: AnyProject['kind'], destination: TileDestination) => {
    const db = getDb();
    const book = kind === 'coloring' ? createColoringBook() : createProject();
    if (db) await db.projects.put(book);
    await go(book.id, kind, destination);
  };

  /**
   * A tile, acted on.
   *
   * A board of a stated size needs nothing from anybody: it is made, saved and
   * opened. Only a wrap cover asks which book, and it asks because it genuinely
   * needs one — its width is the trim size and its spine is the page count.
   */
  const onTile = async (tile: Tile) => {
    if (tile.status !== 'ready') return;
    if (tile.destination.kind === 'interior') return setInteriors(true);
    // A screen of its own: nothing to make first, so nothing to ask about.
    if (tile.destination.kind === 'route') return void router.push(tile.destination.href);
    if (tile.destination.kind === 'design') {
      const design = await startDesign(tile.destination.presetId);
      if (design) router.push(`/design?id=${encodeURIComponent(design.id)}`);
      return;
    }
    setPending(tile);
  };

  /* A picture for each sticker a search might turn up. Asked for once. */
  useEffect(() => {
    let live = true;
    void Promise.all(
      stickers.slice(0, 60).map(async (one) => [one.id, await getAssetUrl(one.assetId)] as const),
    ).then((pairs) => {
      if (!live) return;
      const next: Record<string, string> = {};
      for (const [id, url] of pairs) if (url) next[id] = url;
      setStickerUrls(next);
    });
    return () => {
      live = false;
    };
  }, [stickers]);

  const shown = filterEntries(entries ?? [], filter);
  const empties = emptyDesigns(entries ?? []);
  // Six of each: a list that fills the window is a list nobody reads to the end
  // of, and a search that finds forty things wants narrowing, not scrolling.
  const foundDesigns = searchEntries(entries ?? [], query).slice(0, 6);
  const foundStickers = searchStickers(stickers, query, null).slice(0, 6);

  /** A copy of a design, beside the original. Books are not copied. */
  const duplicate = async (entry: LibraryEntry) => {
    if (entry.kind !== 'design' || !entry.designId) return;
    await (entry.projectId
      ? duplicateDesign(entry.projectId, entry.designId)
      : duplicateStandaloneDesign(entry.designId));
    refresh();
  };

  /** Every design with nothing on it, to the trash — after the list is read. */
  const cleanUp = async () => {
    for (const entry of empties) {
      if (!entry.designId) continue;
      await (entry.projectId
        ? deleteDesign(entry.projectId, entry.designId)
        : deleteStandaloneDesign(entry.designId));
    }
    setCleaning(false);
    refresh();
  };

  /** The sidebar, which is the same five places wherever the window is. */
  const PLACES = [
    { id: 'home', label: 'Home', title: 'Everything you have made', Icon: HomeIcon, go: () => {} },
    {
      id: 'designs',
      label: 'Designs',
      title: 'Your designs, below',
      Icon: DesignsIcon,
      go: () => {
        setFilter('all');
        document.querySelector('[aria-label="Recent designs"], h2')?.scrollIntoView({ behavior: 'smooth' });
      },
    },
    { id: 'stickers', label: 'Stickers', title: 'Make, print and pack stickers', Icon: PackIcon, go: () => router.push('/stickers') },
    { id: 'templates', label: 'Templates', title: 'Not built yet', Icon: TemplatesIcon, soon: true },
    { id: 'trash', label: 'Trash', title: `Thirty days, then gone`, Icon: TrashIcon, go: () => setTrashOpen(true) },
  ] as { id: string; label: string; title: string; Icon: (p: { size?: number }) => React.ReactElement; soon?: boolean; go?: () => void }[];

  /** The seven things made most often, as one press each. */
  const SHORTCUTS = [
    { id: 'book-interior', label: 'Interior', Icon: InteriorIcon },
    { id: 'book-cover', label: 'Cover', Icon: CoverIcon },
    { id: 'instagram-post', label: 'IG post', Icon: InstagramIcon },
    { id: 'pinterest-pin', label: 'Pin', Icon: PinIcon },
    { id: 'postcard', label: 'Postcard', Icon: PostcardIcon },
    { id: 'bookmark', label: 'Bookmark', Icon: BookmarkIcon },
    { id: 'sticker-studio', label: 'Stickers', Icon: PackIcon },
  ];


  return (
    <main data-home className="flex h-dvh flex-col">
      <StudioHeader>
        {/* The search and the one button that makes things: the two reasons to
            look at the top of this page at all. */}
        <div className="relative ml-2 min-w-0 flex-1 max-w-md">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">
            <SearchIcon size={16} />
          </span>
          <input
            type="search"
            value={query}
            aria-label="Search your designs and stickers"
            placeholder="Search your designs and stickers"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearching(true)}
            onBlur={() => window.setTimeout(() => setSearching(false), 150)}
            className="w-full rounded-full border border-ink-200 bg-paper-0 py-2 pl-9 pr-3 text-[13.5px] outline-none transition-colors focus:border-accent-500"
          />
          {searching && query.trim() && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-[60vh] overflow-y-auto rounded-xl border border-ink-200 bg-paper p-1.5 shadow-xl">
              {!foundDesigns.length && !foundStickers.length && (
                <p className="px-2 py-2 text-[13px] text-ink-500">Nothing matches that.</p>
              )}
              {foundDesigns.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void open(entry)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-ink-100"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded bg-ink-100">
                    <ThumbArt thumb={entry.thumb} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-[560]">
                      {entry.name || 'Untitled'}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-500">{entry.type}</span>
                  </span>
                </button>
              ))}
              {foundStickers.length > 0 && (
                <p className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-wide text-ink-500">
                  Stickers
                </p>
              )}
              {foundStickers.map((sticker) => (
                <button
                  key={sticker.id}
                  type="button"
                  title="Open the Stickers page"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => router.push('/stickers')}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-ink-100"
                >
                  <Chequerboard className="h-8 w-8 shrink-0 rounded">
                    {stickerUrls[sticker.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={stickerUrls[sticker.id]}
                        alt=""
                        className="max-h-[88%] max-w-[88%] object-contain"
                      />
                    ) : null}
                  </Chequerboard>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-[560]">{sticker.name}</span>
                    <span className="block truncate text-[11.5px] text-ink-500">
                      {sticker.width} × {sticker.height}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCreating(true)}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-accent-500 px-4 py-2 text-[14px] font-[600] text-paper shadow-sm transition-colors hover:bg-accent-700"
        >
          <PlusIcon size={17} />
          Create
        </button>
      </StudioHeader>

      <div className="flex min-h-0 flex-1">
        {/*
          The sidebar. Icons only until there is room for words — on a narrow
          window the labels are the first thing worth losing, because the icon
          and its tooltip still say where each one goes.
        */}
        <nav
          aria-label="Places"
          className="flex w-14 shrink-0 flex-col gap-1 border-r border-ink-200 bg-paper-0 p-2 lg:w-48"
        >
          {PLACES.map((place) => (
            <button
              key={place.id}
              type="button"
              title={place.title}
              aria-current={place.id === 'home' ? 'page' : undefined}
              disabled={place.soon}
              onClick={() => place.go?.()}
              className={cx(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] transition-colors',
                place.soon
                  ? 'cursor-not-allowed text-ink-400'
                  : place.id === 'home'
                    ? 'bg-accent-50 font-[600] text-accent-500'
                    : 'text-ink-700 hover:bg-ink-100',
              )}
            >
              <span className="shrink-0">
                <place.Icon size={19} />
              </span>
              <span className="hidden min-w-0 flex-1 truncate text-left lg:block">
                {place.label}
              </span>
              {place.soon && (
                <span className="hidden shrink-0 text-[10.5px] uppercase tracking-wide lg:block">
                  soon
                </span>
              )}
              {place.id === 'trash' && trashCount > 0 && (
                <span className="hidden shrink-0 rounded-full bg-ink-200 px-1.5 text-[11px] tabular-nums text-ink-700 lg:block">
                  {trashCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-5 py-6">
            <h1 className="text-[22px] font-semibold tracking-tight">What will you make today?</h1>

            {/* The seven things made most often, as one press each. */}
            <ul aria-label="Start something" className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
              {SHORTCUTS.map((shortcut) => {
                const tile = TILES.find((one) => one.id === shortcut.id);
                if (!tile) return null;
                return (
                  <li key={shortcut.id}>
                    <button
                      type="button"
                      title={tileSize(tile)}
                      onClick={() => void onTile(tile)}
                      className="group flex w-16 flex-col items-center gap-1.5"
                    >
                      <PreviewBox
                        category={tile.category}
                        size={PREVIEW_ROUND}
                        round
                        className="text-ink-700 transition-colors group-hover:text-accent-500"
                      >
                        <shortcut.Icon size={22} />
                      </PreviewBox>
                      <span className="w-full truncate text-center text-[11.5px] leading-tight text-ink-700">
                        {shortcut.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <section className="mt-7">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <h2 className="text-[17px] font-semibold tracking-tight">Recent designs</h2>
                {empties.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCleaning(true)}
                    title="Designs with nothing on them, moved to the trash after you look at the list"
                    className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1 text-[12.5px] text-ink-700 transition-colors hover:border-ink-400 hover:text-ink-900"
                  >
                    <BroomIcon size={14} />
                    Clean up empty designs ({empties.length})
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {HOME_FILTERS.map((one) => (
                  <button
                    key={one.id}
                    type="button"
                    aria-pressed={filter === one.id}
                    onClick={() => setFilter(one.id)}
                    className={cx(
                      'rounded-full border px-3 py-1 text-[12.5px] font-[550] transition-colors',
                      filter === one.id
                        ? 'border-ink-900 bg-ink-900 text-paper'
                        : 'border-ink-200 bg-paper text-ink-700 hover:border-ink-300',
                    )}
                  >
                    {one.label}
                  </button>
                ))}
              </div>

              {entries === null ? (
                <p className="mt-4 text-[14px] text-ink-500">Looking…</p>
              ) : !shown.length ? (
                <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-ink-500">
                  {entries.length
                    ? 'Nothing under that one yet.'
                    : 'Nothing yet — press Create, or one of the circles above. Everything you make is kept on this computer, in this browser, and never leaves it.'}
                </p>
              ) : (
                <ul
                  aria-label="Recent designs"
                  className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
                >
                  {shown.map((entry) => (
                    <li key={entry.key} className="group relative">
                      <div className="relative rounded-2xl border border-ink-200 bg-paper p-2.5 transition-colors group-hover:border-accent-500">
                        <span className="grid h-32 place-items-center overflow-hidden rounded-xl bg-ink-100 p-2">
                          <ThumbArt thumb={entry.thumb} />
                        </span>
                        <span className="pointer-events-none absolute left-4 top-4 rounded-md bg-paper/90 px-1.5 py-0.5 text-[10.5px] font-[560] text-ink-700 shadow-sm">
                          {badgeFor(entry)}
                        </span>
                        {renaming === entry.key ? (
                          <CardName
                            entry={entry}
                            onDone={() => {
                              setRenaming(null);
                              refresh();
                            }}
                          />
                        ) : (
                          <span className="mt-2.5 block truncate text-[14px] font-[570]">
                            {entry.name || 'Untitled'}
                          </span>
                        )}
                        <span className="mt-0.5 block truncate text-[12px] text-ink-500">
                          {entry.type}
                        </span>
                        <span className="mt-0.5 block text-[11.5px] text-ink-400">
                          {when(entry.at)}
                        </span>
                        {/*
                          The whole card, over the words rather than around
                          them: a name being edited is an input, and an input
                          inside a button is neither valid nor reachable.
                        */}
                        {renaming !== entry.key && (
                          <button
                            type="button"
                            onClick={() => void open(entry)}
                            aria-label={`Open ${entry.name || 'Untitled'}`}
                            className="absolute inset-0 rounded-2xl"
                          />
                        )}
                      </div>

                      <span
                        className={cx(
                          'absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity',
                          'group-focus-within:opacity-100 group-hover:opacity-100',
                        )}
                      >
                        <IconButton
                          label="Rename"
                          onClick={() => setRenaming(renaming === entry.key ? null : entry.key)}
                        >
                          <PencilIcon size={14} />
                        </IconButton>
                        <IconButton label="Duplicate" onClick={() => void duplicate(entry)}>
                          <CopyIcon size={14} />
                        </IconButton>
                        <IconButton label="Delete" onClick={() => setDeleting(entry)}>
                          <CrossIcon size={14} />
                        </IconButton>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>

      {creating && (
        <Modal title="What would you like to make?" onClose={() => setCreating(false)} width="max-w-2xl">
          <div className="max-h-[70vh] overflow-y-auto p-5">
            {CATEGORIES.filter((one) => one.id !== 'all').map((group) => {
              const inGroup = TILES.filter((tile) => tile.category === group.id);
              if (!inGroup.length) return null;
              return (
                <div key={group.id} className="mb-6 last:mb-0">
                  <h3 className="text-[12px] uppercase tracking-wide text-ink-500">{group.label}</h3>
                  <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {inGroup.map((tile) => (
                      <button
                        key={tile.id}
                        type="button"
                        disabled={tile.status !== 'ready'}
                        onClick={() => {
                          setCreating(false);
                          void onTile(tile);
                        }}
                        className={cx(
                          'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                          tile.status === 'ready'
                            ? 'border-ink-200 hover:border-accent-500 hover:bg-accent-50/40'
                            : 'cursor-not-allowed border-dashed border-ink-200 opacity-50',
                        )}
                      >
                        <TilePreview art={tile.art} category={tile.category} />
                        {/* Beside the box and vertically centred by the row, so
                            a two-line size never slides under the drawing. */}
                        <span className="min-w-0">
                          <span className="flex items-baseline gap-1.5">
                            <span className="truncate text-[14.5px] font-[570]">{tile.label}</span>
                            {tile.status !== 'ready' && (
                              <span className="shrink-0 text-[10.5px] uppercase tracking-wide text-ink-500">
                                soon
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[12px] leading-snug text-ink-500">
                            {tileSize(tile)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {cleaning && (
        <Modal title="Clean up empty designs" onClose={() => setCleaning(false)} width="max-w-md">
          <div className="p-5">
            <p className="text-[14.5px] leading-relaxed">{cleanUpLine(empties)}</p>
            <ul className="mt-3 max-h-56 overflow-y-auto text-[13.5px] text-ink-700">
              {empties.map((entry) => (
                <li key={entry.key} className="flex items-baseline gap-2 py-0.5">
                  <span className="truncate font-[560]">{entry.name || 'Untitled'}</span>
                  <span className="shrink-0 text-[12px] text-ink-500">{entry.type}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] text-ink-500">
              Nothing is deleted: they go to the trash like everything else, and come back from it
              for {TRASH_DAYS} days.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setCleaning(false)}>Keep them</Button>
              <Button variant="primary" onClick={() => void cleanUp()}>
                Move {empties.length} to the trash
              </Button>
            </div>
          </div>
        </Modal>
      )}

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
              A wrap cover is the one thing here that cannot be made on its own: it is as wide as
              the book&rsquo;s trim size twice over, and its spine is as thick as the book has
              pages.
            </p>
            {books.map((book) => (
              <button
                key={book.key}
                type="button"
                onClick={() => {
                  setPending(null);
                  void go(book.projectId!, book.bookKind!, pending.destination);
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

      {trashOpen && (
        <Trash
          onClose={() => {
            setTrashOpen(false);
            refresh();
          }}
          onChanged={refresh}
        />
      )}

      {deleting && (
        <Modal title="Delete this?" onClose={() => setDeleting(null)} width="max-w-md">
          <div className="p-5">
            <p className="text-[15px] leading-relaxed">
              <strong className="font-[570]">{deleting.name || 'Untitled'}</strong> goes to the
              trash.{' '}
              {deleting.kind !== 'design'
                ? 'Everything in it goes with it, including its launch kit.'
                : deleting.projectId
                  ? 'The book it belongs to is not touched.'
                  : 'It belongs to no book, so nothing else changes.'}{' '}
              You can put it back for {TRASH_DAYS} days, after which it goes for good.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setDeleting(null)}>Keep it</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const entry = deleting;
                  setDeleting(null);
                  void (!entry.projectId
                    ? deleteStandaloneDesign(entry.designId!)
                    : entry.designId
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

/**
 * The name, being typed into, on the card itself.
 *
 * Renaming used to open a dialog over the whole page to change one word. Here
 * the name becomes a box where the name already is: Enter or clicking away
 * keeps it, Escape puts back what was there. An empty name is not a rename —
 * it is a slip — so it is treated as a cancel rather than saved.
 *
 * A book's card is renamed the same way, and renaming it changes only what it
 * is called here. The title printed inside the book, and on its cover, is set
 * in the book itself; the card says so underneath while it is being typed in.
 */
function CardName({ entry, onDone }: { entry: LibraryEntry; onDone: () => void }) {
  const [name, setName] = useState(entry.name);
  // One save per edit, whatever ends it: Enter blurs, and blur is what saves.
  const done = useRef(false);

  const save = () => {
    if (done.current) return;
    done.current = true;
    const trimmed = name.trim();
    if (!trimmed || trimmed === entry.name) return onDone();
    void (!entry.projectId
      ? renameStandaloneDesign(entry.designId!, trimmed)
      : entry.designId
        ? renameDesign(entry.projectId, entry.designId, trimmed)
        : renameProject(entry.projectId, trimmed)
    ).then(onDone);
  };

  return (
    <span className="relative z-10 mt-3 block">
      <TextInput
        autoFocus
        aria-label={`Rename ${entry.name || 'Untitled'}`}
        value={name}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            done.current = true;
            onDone();
          }
        }}
        className="w-full text-[15px] font-[570]"
      />
      {entry.kind !== 'design' && (
        <span className="mt-1 block text-[12px] leading-snug text-ink-500">
          What it is called here. The printed title is set inside the book.
        </span>
      )}
    </span>
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

function when(at: number): string {
  const days = Math.floor((Date.now() - at) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}
