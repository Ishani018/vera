'use client';

import { create } from 'zustand';
import { putAssetFromDataUrl } from './assets';
import { ACTIVE_PROJECT_KEY, getDb } from './db';
import { createProject } from './defaults';
import { buildSamplePoems, withoutSamplePoems } from './samples';
import type { Project } from './types';

/** One entry per rendered page, reported back by Paged.js after pagination. */
export type PageInfo = {
  pageNumber: number;
  /** Roman for front matter, arabic for the body. */
  label: string;
  side: 'left' | 'right';
  blank: boolean;
  /** What sort of page this is, for the viewer's own labelling. */
  kind: 'matter' | 'toc' | 'section' | 'poem' | 'index' | 'blank' | 'other';
  /** What to call it: "Half title", "Contents", the poem's name. */
  caption: string;
};

export type PreviewMode = 'spread' | 'scroll' | 'grid';

export type Guides = {
  margins: boolean;
  bleed: boolean;
  safe: boolean;
  gutter: boolean;
};

type State = {
  project: Project | null;
  status: 'loading' | 'ready';
  /** Live page count from the last Paged.js pass. 0 until the first render. */
  pageCount: number;
  pages: PageInfo[];
  paginating: boolean;
  selectedPoemId: string | null;
  selectedMatterId: string | null;
  previewMode: PreviewMode;
  currentSpread: number;
  guides: Guides;
  panel: string | null;
  /**
   * A CSS selector for whatever the last-touched setting affects. The preview
   * flashes it after re-paginating, so a change to a control on the right is
   * visible in the book in the middle.
   */
  highlight: { selector: string; at: number } | null;
  /**
   * Whether the preview has been moved to the body once. A book opens on its
   * half title, which is nearly blank and reads as a broken preview, so the
   * first pagination jumps to the first poem — but only the first, or it would
   * fight every navigation afterwards.
   */
  positioned: boolean;
  poemFilter: string;
  /** Held here so the walkthrough can open the importer, not just the list. */
  importOpen: boolean;
};

type Actions = {
  init: () => Promise<void>;
  update: (recipe: (draft: Project) => void) => void;
  replaceProject: (project: Project) => Promise<void>;
  clearSamplePoems: () => void;
  seedSamplePoems: () => void;
  setPagination: (pageCount: number, pages: PageInfo[]) => void;
  setHighlight: (selector: string) => void;
  setPositioned: (v: boolean) => void;
  setPoemFilter: (value: string) => void;
  setImportOpen: (open: boolean) => void;
  setPaginating: (v: boolean) => void;
  select: (poemId: string | null) => void;
  selectMatter: (matterId: string | null) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  setSpread: (n: number) => void;
  toggleGuide: (key: keyof Guides) => void;
  setPanel: (panel: string | null) => void;
};

/**
 * Projects saved before assets moved out of the document carry the cover image
 * as a base64 data URL. Move it into the assets table on load and leave a
 * reference behind, so nobody loses a cover they already chose.
 */
async function migrateInlineImages(
  project: Project,
  db: NonNullable<ReturnType<typeof getDb>>,
): Promise<Project> {
  const image = project.cover?.frontImage as unknown as { dataUrl?: string } | null;
  if (!image?.dataUrl) return project;
  try {
    const record = await putAssetFromDataUrl(image.dataUrl, `${project.name} cover`);
    const migrated: Project = {
      ...project,
      cover: {
        ...project.cover,
        frontImage: {
          assetId: record.id,
          naturalWidth: record.width,
          naturalHeight: record.height,
          fit: project.cover.frontImage?.fit ?? 'cover',
        },
      },
    };
    await db.projects.put(migrated);
    return migrated;
  } catch {
    // A cover that cannot be migrated is dropped rather than left as a broken
    // reference; everything else about the project is untouched.
    return { ...project, cover: { ...project.cover, frontImage: null } };
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(project: Project) {
  const db = getDb();
  if (!db) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void db.projects.put(project);
  }, 400);
}

export const useStore = create<State & Actions>((set, get) => ({
  project: null,
  status: 'loading',
  pageCount: 0,
  pages: [],
  paginating: false,
  selectedPoemId: null,
  selectedMatterId: null,
  previewMode: 'spread',
  currentSpread: 0,
  guides: { margins: true, bleed: false, safe: false, gutter: false },
  panel: 'trim',
  highlight: null,
  positioned: false,
  poemFilter: '',
  importOpen: false,

  init: async () => {
    const db = getDb();
    if (!db) return;
    const activeId = window.localStorage.getItem(ACTIVE_PROJECT_KEY);
    let project = activeId ? await db.projects.get(activeId) : undefined;
    if (!project) {
      project = await db.projects.orderBy('updatedAt').last();
    }
    if (!project) {
      // First run: seed the placeholder verses so the preview has something in
      // it. They are removable from the poem list at any time.
      project = createProject({
        name: 'My Collection',
        meta: {
          title: 'My Collection',
          subtitle: '',
          author: 'Your Name',
          publisher: '',
          isbn: '',
          year: String(new Date().getFullYear()),
          copyrightExtra: '',
        },
      });
      project.poems = buildSamplePoems();
      await db.projects.put(project);
    }
    project = await migrateInlineImages(project, db);
    window.localStorage.setItem(ACTIVE_PROJECT_KEY, project.id);
    set({ project, status: 'ready' });
  },

  update: (recipe) => {
    const current = get().project;
    if (!current) return;
    const draft = structuredClone(current);
    recipe(draft);
    draft.updatedAt = Date.now();
    set({ project: draft });
    scheduleSave(draft);
  },

  replaceProject: async (project) => {
    const db = getDb();
    set({ project, status: 'ready', positioned: false, currentSpread: 0 });
    if (db) {
      await db.projects.put(project);
      window.localStorage.setItem(ACTIVE_PROJECT_KEY, project.id);
    }
  },

  clearSamplePoems: () => {
    const current = get().project;
    if (!current) return;
    const next = withoutSamplePoems(current);
    next.updatedAt = Date.now();
    set({ project: next, selectedPoemId: null });
    scheduleSave(next);
  },

  seedSamplePoems: () => {
    get().update((draft) => {
      draft.poems = [...draft.poems, ...buildSamplePoems(draft.poems.length)];
    });
  },

  setPagination: (pageCount, pages) => set({ pageCount, pages, paginating: false }),
  setHighlight: (selector) => set({ highlight: { selector, at: Date.now() } }),
  setPositioned: (positioned) => set({ positioned }),
  setPoemFilter: (poemFilter) => set({ poemFilter }),
  setImportOpen: (importOpen) => set({ importOpen }),
  setPaginating: (v) => set({ paginating: v }),
  select: (poemId) => set({ selectedPoemId: poemId, selectedMatterId: null }),
  selectMatter: (matterId) => set({ selectedMatterId: matterId, selectedPoemId: null }),
  setPreviewMode: (previewMode) => set({ previewMode }),
  setSpread: (currentSpread) => set({ currentSpread: Math.max(0, currentSpread) }),
  toggleGuide: (key) => set((s) => ({ guides: { ...s.guides, [key]: !s.guides[key] } })),
  setPanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
}));
