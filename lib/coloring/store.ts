'use client';

import { create } from 'zustand';
import { putAsset } from '../assets';
import { ACTIVE_PROJECT_KEY, getDb } from '../db';
import { id } from '../defaults';
import { migrateProject } from '../projects';
import { MATTER_ART_KEYS, matterArtwork } from '../render/coloringLayout';
import { printedSize } from './quality';
import type {
  ColoringBook,
  ColoringPage,
  ColoringSettings,
  LineArtSettings,
  MatterSlot,
  SourceKind,
} from '../types';

/**
 * The coloring book being worked on.
 *
 * Its own store rather than a branch inside the poetry one: the two share no
 * state beyond the record in the database, and making one store understand both
 * would mean every selector guarding on a kind it does not care about.
 */
type State = {
  book: ColoringBook | null;
  status: 'loading' | 'ready' | 'missing';
  selectedId: string | null;
  /** Pages currently being converted, so the grid can say so. */
  busy: Set<string>;

  load: () => Promise<void>;
  update: (recipe: (draft: ColoringBook) => void) => void;
  addFiles: (files: File[]) => Promise<string[]>;
  removePage: (pageId: string) => void;
  reorder: (fromId: string, toId: string) => void;
  select: (pageId: string | null) => void;
  setBusy: (pageId: string, busy: boolean) => void;
  setPageSettings: (pageId: string, settings: LineArtSettings) => void;
  setLineArt: (
    pageId: string,
    assetId: string,
    settings: LineArtSettings,
    meta: { source: SourceKind; guessed: boolean; upscaled: number },
  ) => void;
  setPlacement: (pageId: string, patch: Partial<Pick<ColoringPage, 'fit' | 'rotate'>>) => void;
  setSource: (pageId: string, source: SourceKind) => void;
  setBookSetting: <K extends keyof ColoringSettings>(key: K, value: ColoringSettings[K]) => void;
  applyToAll: (settings: LineArtSettings) => void;
  /** Supply a drawing for one of the generated front-matter pages. */
  setMatterArt: (slot: MatterSlot, file: File) => Promise<void>;
  /** Go back to the built-in design for that page. */
  clearMatterArt: (slot: MatterSlot) => void;
};

/**
 * Everything in the book that the converter has to run over.
 *
 * Front-matter artwork is a drawing like any other, so it goes in the same
 * queue rather than getting a second one that would race the first.
 */
export const convertibles = (book: ColoringBook): ColoringPage[] => [
  ...book.pages,
  ...matterArtwork(book),
];

/** Finds a page or a piece of front-matter artwork by id, in a draft. */
function convertible(draft: ColoringBook, itemId: string): ColoringPage | undefined {
  const page = draft.pages.find((p) => p.id === itemId);
  if (page) return page;
  for (const key of Object.values(MATTER_ART_KEYS)) {
    const art = draft.coloring[key];
    if (art?.id === itemId) return art;
  }
  return undefined;
}

/** True when the picture and the page disagree about which way round they are. */
function turnedForPage(width: number, height: number, book: ColoringBook): boolean {
  if (!width || !height) return false;
  const page = printedSize(book);
  const wide = width > height * 1.15;
  const tall = page.height > page.width * 1.15;
  return wide && tall;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(book: ColoringBook) {
  const db = getDb();
  if (!db) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void db.projects.put(book), 400);
}

export const useColoring = create<State>((set, get) => ({
  book: null,
  status: 'loading',
  selectedId: null,
  busy: new Set<string>(),

  load: async () => {
    const db = getDb();
    const activeId =
      typeof window === 'undefined' ? null : window.localStorage.getItem(ACTIVE_PROJECT_KEY);
    const stored = db && activeId ? await db.projects.get(activeId) : undefined;
    if (!stored) return set({ status: 'missing' });
    const project = migrateProject(stored);
    if (project.kind !== 'coloring') return set({ status: 'missing' });
    set({ book: project, status: 'ready', selectedId: project.pages[0]?.id ?? null });
  },

  update: (recipe) => {
    const current = get().book;
    if (!current) return;
    const draft = structuredClone(current);
    recipe(draft);
    draft.updatedAt = Date.now();
    set({ book: draft });
    scheduleSave(draft);
  },

  addFiles: async (files) => {
    const added: string[] = [];
    for (const file of files) {
      const record = await putAsset(file);
      const pageId = id('page');
      added.push(pageId);
      get().update((draft) => {
        const page: ColoringPage = {
          id: pageId,
          title: file.name.replace(/\.[^.]+$/, ''),
          // Left as a guess: the converter looks at the picture and decides,
          // then says so on the page so it can be corrected.
          source: 'painting',
          sourceGuessed: true,
          sourceAssetId: record.id,
          lineArtAssetId: null,
          renderedWith: null,
          upscaled: 1,
          fit: 'contain',
          // A wide picture on a tall page floats in a sea of paper. Turning it
          // is what anyone would do with the printed sheet, so it starts that
          // way — and it is a choice, sitting right there to be undone.
          rotate: turnedForPage(record.width, record.height, draft) ? 90 : 0,
          naturalWidth: record.width,
          naturalHeight: record.height,
          // New pages start on the book's own settings, so a book stays
          // consistent without anyone having to press "apply to all".
          settings: { ...draft.coloring.lineArt },
        };
        draft.pages.push(page);
      });
    }
    if (added.length && !get().selectedId) set({ selectedId: added[0] });
    return added;
  },

  removePage: (pageId) => {
    get().update((draft) => {
      draft.pages = draft.pages.filter((page) => page.id !== pageId);
    });
    if (get().selectedId === pageId) set({ selectedId: get().book?.pages[0]?.id ?? null });
  },

  reorder: (fromId, toId) =>
    get().update((draft) => {
      const from = draft.pages.findIndex((page) => page.id === fromId);
      const to = draft.pages.findIndex((page) => page.id === toId);
      if (from < 0 || to < 0) return;
      draft.pages.splice(to, 0, draft.pages.splice(from, 1)[0]);
    }),

  select: (selectedId) => set({ selectedId }),

  setBusy: (pageId, busy) =>
    set((state) => {
      const next = new Set(state.busy);
      if (busy) next.add(pageId);
      else next.delete(pageId);
      return { busy: next };
    }),

  setPageSettings: (pageId, settings) =>
    get().update((draft) => {
      const page = convertible(draft, pageId);
      if (page) page.settings = { ...settings };
    }),

  setLineArt: (pageId, assetId, settings, meta) =>
    get().update((draft) => {
      const page = convertible(draft, pageId);
      if (!page) return;
      page.lineArtAssetId = assetId;
      page.renderedWith = { ...settings };
      page.upscaled = meta.upscaled;
      // A guess only stands until the poet says otherwise; once they have, the
      // converter's opinion must not overwrite theirs.
      if (page.sourceGuessed) {
        page.source = meta.source;
        page.sourceGuessed = meta.guessed;
      }
      // Anything that arrived already drawn most likely came from a generator,
      // so the disclosure reminder turns itself on rather than waiting to be
      // remembered at the worst possible moment.
      if (page.source === 'lineart') draft.coloring.containsAiImages = true;
    }),

  setPlacement: (pageId, patch) =>
    get().update((draft) => {
      const page = convertible(draft, pageId);
      // Placement is about the paper, not about the picture: the line art
      // stays exactly as it was, so nothing is re-converted.
      if (page) Object.assign(page, patch);
    }),

  setSource: (pageId, source) =>
    get().update((draft) => {
      const page = convertible(draft, pageId);
      if (!page) return;
      page.source = source;
      page.sourceGuessed = false;
      // The two paths produce different pictures, so the stored art is wrong
      // the moment this changes; clearing it puts the page back in the queue.
      page.renderedWith = null;
    }),

  setBookSetting: (key, value) =>
    get().update((draft) => {
      draft.coloring[key] = value;
    }),

  applyToAll: (settings) =>
    get().update((draft) => {
      draft.coloring.lineArt = { ...settings };
      // The pictures only. A title page is not a page anybody asked to have
      // the same detail setting as a painting of a fish.
      for (const page of draft.pages) page.settings = { ...settings };
    }),

  setMatterArt: async (slot, file) => {
    const record = await putAsset(file);
    get().update((draft) => {
      draft.coloring[MATTER_ART_KEYS[slot]] = {
        id: id('matter'),
        title: MATTER_TITLES[slot],
        // Never traced. These arrive already drawn, and tracing a drawing
        // gives back a hollow, doubled version of it.
        source: 'lineart',
        sourceGuessed: false,
        sourceAssetId: record.id,
        lineArtAssetId: null,
        renderedWith: null,
        upscaled: 1,
        // Always the whole picture, inside the margins. A cropped title page
        // is a mistake, never a choice.
        fit: 'contain',
        rotate: 0,
        naturalWidth: record.width,
        naturalHeight: record.height,
        settings: {
          ...draft.coloring.lineArt,
          // No thickening. Line thickness is there because tracing a painting
          // gives thin, broken strokes that need weight; a page that arrived
          // already drawn has the weight its artist chose. It also costs more
          // here than anywhere else: these pages carry small lettering, and a
          // single pixel of growth is enough to swallow a full stop or weld
          // the dot of an i onto its stem.
          thickness: 0,
        },
      };
      // It arrived already drawn, which is the same signal a picture gives.
      draft.coloring.containsAiImages = true;
    });
  },

  clearMatterArt: (slot) =>
    get().update((draft) => {
      draft.coloring[MATTER_ART_KEYS[slot]] = null;
    }),
}));

const MATTER_TITLES: Record<MatterSlot, string> = {
  title: 'Title page',
  belongs: 'This book belongs to',
  colorTest: 'Pen test page',
};
