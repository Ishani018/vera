import { migrateContents } from './contents';
import { getDb } from './db';
import { createProject, id } from './defaults';
import { DEFAULT_COLORING_TRIM } from './kdp';
import type { AnyProject, ColoringBook, LineArtSettings, PoetryProject } from './types';

/**
 * The studio holds two kinds of book. This module is the only place that knows
 * about both: what kind a stored record is, how to make each one, and how to
 * list them for the landing page.
 */

export const isPoetry = (project: AnyProject): project is PoetryProject =>
  project.kind === 'poetry';

export const isColoring = (project: AnyProject): project is ColoringBook =>
  project.kind === 'coloring';

export const DEFAULT_LINE_ART: LineArtSettings = {
  mode: 'threshold',
  detail: 50,
  thickness: 45,
  cleanup: 40,
  smoothing: 50,
  invert: false,
};

/**
 * Brings a stored record up to date.
 *
 * Everything saved before there was a second kind of book is poetry: that is
 * the only kind that existed, so the absence of the field is not ambiguous.
 * The contents migration runs here too, so one call is enough to open anything
 * ever written to this database.
 */
export function migrateProject(raw: unknown): AnyProject {
  const record = (raw ?? {}) as Partial<AnyProject> & Record<string, unknown>;

  if (record.kind === 'coloring') {
    const book = record as unknown as ColoringBook;
    return {
      ...book,
      pages: (Array.isArray(book.pages) ? book.pages : []).map((page) => ({
        ...page,
        // Written before the converter recorded what it had used: treat the
        // stored art as matching, rather than re-running every page on open.
        renderedWith: page.renderedWith ?? (page.lineArtAssetId ? page.settings : null),
        source: page.source ?? 'painting',
        sourceGuessed: page.sourceGuessed ?? true,
        upscaled: page.upscaled ?? 1,
        fit: page.fit ?? 'contain',
        rotate: page.rotate ?? 0,
        settings: { ...DEFAULT_LINE_ART, ...page.settings },
      })),
      coloring: {
        lineArt: { ...DEFAULT_LINE_ART, ...(book.coloring?.lineArt ?? {}) },
        singleSided: book.coloring?.singleSided ?? true,
        belongsToPage: book.coloring?.belongsToPage ?? true,
        colorTestPage: book.coloring?.colorTestPage ?? true,
        containsAiImages: book.coloring?.containsAiImages ?? false,
      },
    };
  }

  const poetry = record as unknown as PoetryProject & { poems?: unknown; sections?: unknown };
  const migrated: PoetryProject = { ...poetry, kind: 'poetry', contents: migrateContents(poetry) };
  // The two old arrays are dropped rather than carried along. Left in place
  // they would be re-saved on every autosave, ride around in every undo
  // snapshot, and sit there looking authoritative long after `contents` became
  // the only thing anything reads.
  delete (migrated as { poems?: unknown }).poems;
  delete (migrated as { sections?: unknown }).sections;
  return migrated;
}

/**
 * True when the stored record is in an older shape than the app writes.
 *
 * Migration is idempotent, so re-running it costs nothing — but converting in
 * place once means the database stops accumulating shapes that no code reads.
 */
export function needsRewrite(raw: unknown): boolean {
  const record = (raw ?? {}) as Record<string, unknown>;
  return !record.kind || 'poems' in record || 'sections' in record;
}

export function createColoringBook(name = 'Untitled Coloring Book'): ColoringBook {
  // Built from the poetry defaults so the shared half — cover, matter pages,
  // margins — comes from one place and cannot drift between the two kinds.
  const base = createProject({ name, meta: { title: name } as never });
  const now = Date.now();

  return {
    id: id('proj'),
    kind: 'coloring',
    name,
    createdAt: now,
    updatedAt: now,
    meta: { ...base.meta, title: name },
    // Square is the coloring-book default, and art that runs to the edge is
    // the normal case rather than the exception.
    trim: { trimId: DEFAULT_COLORING_TRIM, bleed: true, paper: 'white' },
    margins: { inside: 0.75, outside: 0.5, top: 0.5, bottom: 0.5 },
    frontMatter: base.frontMatter,
    backMatter: base.backMatter,
    cover: base.cover,
    pages: [],
    coloring: {
      lineArt: { ...DEFAULT_LINE_ART },
      singleSided: true,
      belongsToPage: true,
      colorTestPage: true,
      containsAiImages: false,
    },
  };
}

export type ProjectSummary = {
  id: string;
  kind: AnyProject['kind'];
  name: string;
  updatedAt: number;
  /** Poems, or pictures. */
  items: number;
};

function summarise(project: AnyProject): ProjectSummary {
  return {
    id: project.id,
    kind: project.kind,
    name: project.name || project.meta.title || 'Untitled',
    updatedAt: project.updatedAt,
    items: isColoring(project)
      ? project.pages.length
      : project.contents.filter((item) => item.kind === 'poem').length,
  };
}

/** Everything saved on this computer, most recently worked on first. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.projects.toArray();
  return rows
    .map((row) => summarise(migrateProject(row)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
