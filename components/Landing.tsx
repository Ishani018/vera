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
  CATEGORY_INK,
  CATEGORY_TINT,
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
  categoryOf,
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
import { PalettePicker } from './PalettePicker';
import { SILHOUETTES } from './home/Silhouette';
import { nameFor } from '@/lib/home/naming';

/**
 * The way in.
 *
 * Not a menu of the two editors that happen to exist, but a list of things
 * someone might want to make — which is the difference between an app that
 * typesets poetry and a tool for publishing a book. A tile is either real or
 * muted; there is nothing here that opens a screen saying it will be along
 * later.
 */
/**
 * A numbered section label with a rule running to the end of the row.
 *
 * The numbers are the point: a proof sheet is marked up in order, and "01" and
 * "02" say that the two sections are steps rather than two unrelated piles.
 */
function SectionLabel({ number, title }: { number: string; title: string }) {
  return (
    <h2 className="flex items-center gap-3">
      <span className="mono-label shrink-0 text-ink-900" style={{ fontSize: 12, fontWeight: 500 }}>
        {number} {title}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-ink-300" />
    </h2>
  );
}

/**
 * The chip on a format tile: four pixels of the family it belongs to.
 *
 * Three accents and no more, so two of the five categories share one. That is
 * the point of having three — a fourth and fifth accent would be two more
 * colours nobody can name.
 */
const CHIP: Record<string, string> = {
  book: 'var(--color-accentc-400)',
  social: 'var(--color-accentb-500)',
  print: 'var(--color-accenta-500)',
  sticker: 'var(--color-accentc-400)',
  other: 'var(--color-ink-300)',
};

/** A card's type tag, coloured by what it is, per the design language. */
const TAG_FILL: Record<string, string> = {
  book: 'var(--color-accentc-400)',
  social: 'var(--color-accentb-500)',
  print: 'var(--color-accenta-500)',
  sticker: 'var(--color-accentc-400)',
  other: 'var(--color-paper-200)',
};

/**
 * And what to letter it in.
 *
 * Yellow carries dark text and the two fills carry white — except that in a
 * palette where white fails on the primary it has to be the ink, which is why
 * this reads the same variable the buttons do rather than hard-coding white.
 */
const TAG_INK: Record<string, string> = {
  book: 'var(--color-outline)',
  social: 'var(--color-sheet)',
  print: 'var(--text-on-accenta)',
  sticker: 'var(--color-outline)',
  other: 'var(--color-ink-700)',
};

/**
 * What the list says when there is nothing in it.
 *
 * Two different nothings, which used to be one sentence doing both jobs badly:
 * a filter that matches nothing needs a way back, and a library with nothing in
 * it needs a way in. The cat is from the starter pack — real art, not an
 * invented character.
 */
function Nothing({
  filtered,
  onCreate,
  onClear,
}: {
  filtered: boolean;
  onCreate: () => void;
  onClear: () => void;
}) {
  return (
    <div className="mt-5 flex items-center gap-7 rounded-[6px] border border-ink-300 bg-paper-100 px-8 py-9">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/starter/cat.png"
        alt=""
        className="size-[104px] shrink-0"
        style={{ opacity: 0.85 }}
      />
      <div className="min-w-0">
        <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 24 }}>
          {filtered ? 'Nothing under that one' : 'Nothing printed yet'}
        </p>
        <p className="mt-1.5 max-w-[46ch] text-[14px] text-ink-500">
          {filtered
            ? 'No design matches this filter. Everything you have made is still here.'
            : 'Pick a size above, or press Create. Everything you make is kept on this computer and never leaves it.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {filtered ? (
            <button type="button" onClick={onClear} className="btn btn-default px-4 py-2.5">
              Show everything
            </button>
          ) : (
            <button type="button" onClick={onCreate} className="btn btn-create px-5 py-2.5">
              <PlusIcon size={16} />
              Create
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

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

  /* ------------------------------------------------------ the sliding pill */

  /**
   * Where the highlight sits: on whatever the pointer is over, or on the
   * current page when it is over nothing.
   *
   * Measured from the buttons themselves rather than computed from a row
   * height, so it stays right when the labels disappear at a narrow window.
   */
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  /** The search field, so the keyboard shortcut can actually put the caret in it. */
  const searchBox = useRef<HTMLInputElement>(null);

  /**
   * Today, written the way a person would say it, and how many drafts are open.
   *
   * Both real. A date line that is decorative is worse than no date line, and a
   * count that is always "2" is a lie somebody will eventually notice.
   *
   * Worked out after mount rather than during render: the server and the
   * browser can be on different days, and a date rendered on one and hydrated
   * on the other is a mismatch React will complain about.
   */
  const [today, setToday] = useState('');
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    );
  }, []);

  /** Mac says ⌘K and everything else says Ctrl K. */
  const [shortcutLabel, setShortcutLabel] = useState('Ctrl K');
  useEffect(() => {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    setShortcutLabel(mac ? '⌘ K' : 'Ctrl K');
  }, []);

  /* The shortcut itself, which really focuses the field. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      searchBox.current?.focus();
      searchBox.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [hovered, setHovered] = useState<number | null>(null);
  const [pill, setPill] = useState<React.CSSProperties>({ opacity: 0 });

  useEffect(() => {
    const at = hovered ?? 0;
    const node = items.current[at];
    const rail = node?.parentElement;
    if (!node || !rail) return;
    const a = node.getBoundingClientRect();
    const b = rail.getBoundingClientRect();
    setPill({
      opacity: 1,
      width: a.width,
      height: a.height,
      transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)`,
    });
  }, [hovered, entries]);

  /**
   * Whether the cards may do their arrival.
   *
   * Only the first list somebody sees: a grid that re-animated every time a
   * filter changed would flicker every time they looked for something.
   */
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    if (!entries?.length) return;
    const timer = setTimeout(() => setFresh(false), 1200);
    return () => clearTimeout(timer);
  }, [entries]);

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

  /**
   * How many drafts are open: designs that have been started and not named.
   *
   * The same set the date line counts and the clean-up offers to tidy, so the
   * two numbers on the screen agree with each other.
   */
  const draftsOpen = (entries ?? []).filter((one) => !one.name?.trim()).length;

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
    { id: 'book-interior', label: 'Book interior', Icon: InteriorIcon },
    { id: 'book-cover', label: 'Book cover', Icon: CoverIcon },
    { id: 'instagram-post', label: 'Instagram post', Icon: InstagramIcon },
    { id: 'pinterest-pin', label: 'Pinterest pin', Icon: PinIcon },
    { id: 'postcard', label: 'Postcard', Icon: PostcardIcon },
    { id: 'bookmark', label: 'Bookmark', Icon: BookmarkIcon },
    { id: 'sticker-studio', label: 'Stickers', Icon: PackIcon },
  ];


  return (
    <main data-home className="flex h-dvh">
      {/*
        The sidebar: 248 wide, and the one dark thing on the screen in the
        palettes that ask for it. `--sidebar-*` are worked out per palette,
        because which role is the *lightest* ink flips between a light palette
        and the dark one — see `lib/theme.ts`.
      */}
      <nav
        aria-label="Places"
        className="flex w-[248px] shrink-0 flex-col px-5 pb-6 pt-7 max-lg:w-[72px] max-lg:px-2"
        style={{ background: 'var(--sidebar-fill)' }}
      >
        <a
          href="/"
          title="Everything you have made"
          className="block shrink-0 max-lg:text-center"
          style={{
            fontFamily: 'var(--font-script)',
            fontSize: 46,
            /* Great Vibes swashes reach 1.24em; less than this and they hang
               out of the anchor and crowd the tagline underneath. */
            lineHeight: 1.26,
            color: 'var(--sidebar-text)',
          }}
        >
          <span className="max-lg:hidden">Isnaevy</span>
          <span className="hidden max-lg:inline">I</span>
        </a>
        <p
          className="mono-label mt-1.5 shrink-0 max-lg:hidden"
          style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--sidebar-muted)' }}
        >
          Made for people who print
        </p>

        <ul className="mt-8 flex shrink-0 flex-col gap-1">
          {PLACES.map((place) => {
            const here = place.id === 'home';
            return (
              <li key={place.id}>
                <button
                  type="button"
                  title={place.title}
                  aria-current={here ? 'page' : undefined}
                  disabled={place.soon}
                  onClick={() => place.go?.()}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left',
                    'transition-colors duration-[var(--motion-base)]',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                    'max-lg:justify-center max-lg:px-0',
                    place.soon && 'cursor-not-allowed',
                  )}
                  style={{
                    background: here ? 'var(--sidebar-active-fill)' : 'transparent',
                    color: here
                      ? 'var(--sidebar-active-text)'
                      : place.soon
                        ? 'var(--sidebar-muted)'
                        : 'var(--sidebar-text)',
                    outlineColor: 'var(--sidebar-text)',
                  }}
                >
                  <span className="shrink-0">
                    <place.Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-[500] max-lg:hidden">
                    {place.label}
                  </span>
                  {place.soon && (
                    <span
                      className="shrink-0 rounded-[3px] border px-[7px] py-[2px] max-lg:hidden"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        borderColor: 'var(--color-ink-500)',
                        color: 'var(--sidebar-muted)',
                      }}
                    >
                      Soon
                    </span>
                  )}
                  {place.id === 'trash' && trashCount > 0 && (
                    <span
                      className="shrink-0 rounded-[3px] px-1.5 py-[2px] tabular-nums max-lg:hidden"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        fontWeight: 500,
                        background: 'var(--color-accenta-500)',
                        color: 'var(--text-on-accenta)',
                      }}
                    >
                      {trashCount}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex-1" />

        {/* The two cover colours, alternating. Here and nowhere else. */}
        <span aria-hidden="true" className="checker mb-4 block shrink-0 max-lg:hidden" />
        <p
          className="mono-label flex shrink-0 items-center gap-2 max-lg:hidden"
          style={{ fontSize: 10, color: 'var(--sidebar-muted)' }}
        >
          <span
            aria-hidden="true"
            className="block size-[7px] shrink-0 rounded-full"
            style={{ background: 'var(--color-accentb-100)' }}
          />
          Saved on this computer
        </p>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">
        {/*
          The top bar. A search field of a fixed 480, the palette, and Create —
          the three things in this bar that are about the whole app rather than
          about one design.
        */}
        <div className="flex shrink-0 items-center gap-4 px-12 pt-8 max-lg:px-5 max-lg:pt-5">
          <div className="relative min-w-0 max-w-[480px] flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500">
              <SearchIcon size={18} />
            </span>
            <input
              ref={searchBox}
              type="search"
              value={query}
              aria-label="Search designs and stickers"
              placeholder="Search designs and stickers"
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearching(true)}
              onBlur={() => window.setTimeout(() => setSearching(false), 150)}
              className={cx(
                'field h-11 w-full rounded-[6px] pl-11 pr-20 outline-none',
                'placeholder:text-ink-500',
              )}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
            />
            {/*
              A real shortcut, not a picture of one. It focuses the field, and
              it says so to a screen reader rather than being four silent
              characters floating in an input.
            */}
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-[3px] px-1.5 py-1"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                background: 'var(--color-paper-100)',
                color: 'var(--color-ink-500)',
              }}
            >
              {shortcutLabel}
            </kbd>
            {searching && query.trim() && (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-[60vh] overflow-y-auto rounded-[6px] border border-ink-300 bg-sheet p-1.5 shadow-[var(--shadow-float)]">
                {!foundDesigns.length && !foundStickers.length && (
                  <p className="px-2 py-2 text-[13px] text-ink-500">Nothing matches that.</p>
                )}
                {foundDesigns.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void open(entry)}
                    className="flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left transition-colors hover:bg-paper-100"
                  >
                    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-[3px] border border-ink-300 bg-sheet">
                      <ThumbArt thumb={entry.thumb} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-[500]">{nameFor(entry)}</span>
                      <span className="mono-label block truncate text-ink-500" style={{ fontSize: 10 }}>
                        {entry.type}
                      </span>
                    </span>
                  </button>
                ))}
                {foundStickers.length > 0 && (
                  <p className="mono-label px-2 pb-1 pt-2 text-ink-500" style={{ fontSize: 10 }}>
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
                    className="flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left transition-colors hover:bg-paper-100"
                  >
                    <Chequerboard className="size-10 shrink-0 rounded-[3px] border border-ink-300">
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
                      <span className="block truncate text-[13px] font-[500]">{sticker.name}</span>
                      <span className="mono-label block truncate text-ink-500" style={{ fontSize: 10 }}>
                        {sticker.width} × {sticker.height}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="ml-auto shrink-0">
            <PalettePicker />
          </span>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn btn-create shrink-0 rounded-[6px] px-6 py-3"
            style={{ fontSize: 15, fontWeight: 600 }}
          >
            <PlusIcon size={17} />
            Create
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="w-full px-12 pb-12 pt-8 max-lg:px-5 max-lg:pb-8">
            {/*
              The date and what is open, then the one question this screen asks.
              Both are real: the date is today's and the count is the number of
              drafts actually open, so the line is information rather than
              decoration.
            */}
            <p className="mono-label text-ink-500" style={{ fontSize: 12 }}>
              {today}
              {draftsOpen > 0 && `, ${draftsOpen} ${draftsOpen === 1 ? 'draft' : 'drafts'} open`}
            </p>
            <h1
              className="mt-2 text-ink-900"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 60,
                /* Fraunces' italic metric box is 1.234em, which a tighter
                   figure cannot hold: the accented word hangs out of the
                   heading and sits on the line under it. */
                lineHeight: 1.24,
                letterSpacing: '-0.02em',
              }}
            >
              What are we{' '}
              <em style={{ fontStyle: 'italic', color: 'var(--color-accenta-500)' }}>printing</em>{' '}
              today?
            </h1>
            <p className="mt-3 text-[16px] text-ink-500">
              Pick a size and we set up the trim, bleed and margins for you.
            </p>

            <section className="mt-9">
              <SectionLabel number="01" title="Start from a size" />
              {/*
                Seven paper sizes, drawn at their real proportions. The point of
                the row is that a bookmark is not a postcard, which a row of
                identical rounded squares cannot say.
              */}
              <ul
                aria-label="Start from a size"
                className="mt-5 flex flex-wrap justify-between gap-y-7"
              >
                {SHORTCUTS.map((shortcut) => {
                  const tile = TILES.find((one) => one.id === shortcut.id);
                  if (!tile) return null;
                  const Art = SILHOUETTES[shortcut.id];
                  return (
                    <li key={shortcut.id}>
                      <button
                        type="button"
                        title={tileSize(tile)}
                        onClick={() => void onTile(tile)}
                        className="proof block w-[144px] text-left"
                      >
                        <span
                          className={cx(
                            'plate relative block h-[150px] w-[144px] overflow-hidden rounded-[6px]',
                            'bg-paper-100',
                          )}
                        >
                          {/* The 16×4 chip that says which family this belongs to. */}
                          <span
                            aria-hidden="true"
                            className="absolute left-2 top-2 block h-1 w-4 rounded-[1px]"
                            style={{ background: CHIP[tile.category] ?? 'var(--color-ink-300)' }}
                          />
                          {Art ? <Art /> : null}
                        </span>
                        <span
                          className="mt-2.5 block truncate"
                          style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17 }}
                        >
                          {shortcut.label}
                        </span>
                        <span className="mono-label mt-0.5 block truncate text-ink-500" style={{ fontSize: 11 }}>
                          {tileSize(tile)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="mt-9">
              <SectionLabel number="02" title="Recent work" />

              <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {HOME_FILTERS.map((one) => (
                    <button
                      key={one.id}
                      type="button"
                      aria-pressed={filter === one.id}
                      onClick={() => setFilter(one.id)}
                      className="chip inline-flex min-h-8 items-center px-3.5"
                      style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                    >
                      {one.label}
                    </button>
                  ))}
                </div>
                {empties.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCleaning(true)}
                    title="Designs with nothing on them, moved to the trash after you look at the list"
                    className="mono-label underline underline-offset-2 text-ink-500 transition-colors hover:text-ink-900"
                    style={{ fontSize: 11 }}
                  >
                    Clean up {empties.length} empty {empties.length === 1 ? 'draft' : 'drafts'}
                  </button>
                )}
              </div>

              {entries === null ? (
                <div aria-hidden="true" className="mt-5 flex flex-wrap gap-5">
                  {Array.from({ length: 4 }, (_, n) => (
                    <div key={n} className="w-[259px]">
                      <div className="skeleton h-[196px] w-full rounded-[6px]" style={{ '--n': n } as React.CSSProperties} />
                      <div className="skeleton mt-3 h-3.5 w-3/4 rounded-[3px]" />
                      <div className="skeleton mt-2 h-2.5 w-1/2 rounded-[3px]" />
                    </div>
                  ))}
                </div>
              ) : !shown.length ? (
                <Nothing
                  filtered={entries.length > 0}
                  onCreate={() => setCreating(true)}
                  onClear={() => setFilter('all')}
                />
              ) : (
                <ul aria-label="Recent designs" className="mt-5 flex flex-wrap gap-5">
                  {shown.map((entry) => (
                    <li key={entry.key} className="proof proof-lift relative w-[259px]">
                      <div className="plate relative rounded-[6px] bg-paper-100 p-4">
                        {/*
                          The thumbnail is the design's own contents, and it sits
                          inside crop marks because it is a proof of something
                          that will be printed. An empty design shows its paper
                          silhouette rather than a blank slab.
                        */}
                        <span className="relative flex h-[164px] items-center justify-center">
                          <span
                            className="crop-marks relative block bg-sheet"
                            style={previewBox(entry.thumb)}
                          >
                            <span className="block h-full w-full overflow-hidden">
                              <ThumbArt thumb={entry.thumb} />
                            </span>
                          </span>
                        </span>
                        <span
                          className="tag pointer-events-none absolute left-2.5 top-2.5"
                          style={{
                            background: TAG_FILL[categoryOf(entry)],
                            color: TAG_INK[categoryOf(entry)],
                          }}
                        >
                          {badgeFor(entry)}
                        </span>
                        {renaming !== entry.key && (
                          <button
                            type="button"
                            onClick={() => void open(entry)}
                            aria-label={`Open ${nameFor(entry)}`}
                            className="absolute inset-0 rounded-[6px]"
                          />
                        )}
                      </div>

                      {renaming === entry.key ? (
                        <div className="mt-3">
                          <CardName
                            entry={entry}
                            onDone={() => {
                              setRenaming(null);
                              refresh();
                            }}
                          />
                        </div>
                      ) : (
                        <span
                          className="mt-3 block truncate"
                          style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20 }}
                        >
                          {nameFor(entry)}
                        </span>
                      )}
                      <span className="mono-label mt-1 block truncate text-ink-500" style={{ fontSize: 11 }}>
                        {entry.type}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-ink-500">
                        Edited {when(entry.at)}
                      </span>

                      <span
                        className="proof-tools absolute right-2 top-2 z-10 flex gap-1"
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
                <div
                  key={group.id}
                  className="arrive-quick mb-6 last:mb-0"
                  style={{ '--n': CATEGORIES.findIndex((one) => one.id === group.id) } as React.CSSProperties}
                >
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
                          'bob-hover flex items-center gap-3 rounded-xl border p-3 text-left',
                          'transition-[transform,background-color,border-color,box-shadow] duration-[var(--motion-base)] ease-[var(--ease-out)]',
                          tile.status === 'ready'
                            ? 'border-ink-200 hover:-translate-y-0.5 hover:border-accent-500 hover:bg-accent-50/40 hover:shadow-[var(--shadow-raised)] active:scale-[0.99]'
                            : 'cursor-not-allowed border-dashed border-ink-200 opacity-50',
                        )}
                      >
                        <TilePreview art={tile.art} category={tile.category} className="bob" />
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
      className="grid size-8 place-items-center rounded-lg border border-ink-200 bg-paper/95 text-[13px] text-ink-700 shadow-sm transition-colors hover:border-ink-400 hover:text-ink-900"
    >
      {children}
    </button>
  );
}

/**
 * A preview drawn at the design's own proportions.
 *
 * A bookmark is not a postcard, and a row of identical landscape boxes with
 * the real thing letterboxed inside says the opposite. Fitting the box to the
 * design instead means the art fills it, and the crop marks sit on the corners
 * of the sheet rather than on the corners of a container.
 *
 * The bounds leave room for the marks, which are drawn 5px outside each corner
 * and reach 14px out in all; the card's own 16px padding covers that.
 */
function previewBox(thumb: { width: number; height: number }): React.CSSProperties {
  const MOST_WIDE = 199;
  const MOST_TALL = 136;
  const ratio = thumb.width > 0 && thumb.height > 0 ? thumb.width / thumb.height : 1;
  let width = MOST_WIDE;
  let height = MOST_WIDE / ratio;
  if (height > MOST_TALL) {
    height = MOST_TALL;
    width = MOST_TALL * ratio;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

function when(at: number): string {
  const days = Math.floor((Date.now() - at) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}
