import { looksLikeProject, migrateContents } from './contents';
import { migrateDesign } from './designs';
import type {
  AnyProject,
  CoverTemplate,
  Design,
  LibrarySticker,
  Project,
  StandaloneDesign,
} from './types';

/**
 * What a backup file is.
 *
 * Kept apart from the code that reads and writes the database, so that the
 * round trip — build a payload, write it out, read it back — can be tested
 * without a browser. A recovery path nobody tests is a recovery path nobody
 * has.
 */

export type Backup = {
  /**
   * The format marker, deliberately still spelled the old way: it is written
   * inside files people already have, and a reader that stopped recognising it
   * would stop opening them.
   */
  versecraft: number;
  /**
   * The first book, and for a one-book backup the only one.
   *
   * Still written even when `projects` carries the whole shelf, because a
   * copy of the app from before that field existed reads this and nothing
   * else — and a backup that opens as one book is better than one that opens
   * as an error.
   */
  project: AnyProject;
  /**
   * Every book, for a backup taken from the front page rather than from
   * inside one book. Absent from every backup made before this existed, which
   * is why the reader falls back to `[project]` rather than to nothing.
   */
  projects?: AnyProject[];
  assets: Record<string, string>;
  library: { stickers: LibrarySticker[]; templates: CoverTemplate[] };
  /** Designs belonging to no book. Absent from every backup made before they existed. */
  designs?: StandaloneDesign[];
};

/** The payload, assembled. */
export function buildBackup(parts: {
  /** One book, or the whole shelf. Either way the first is written twice. */
  project?: AnyProject;
  projects?: AnyProject[];
  assets: Record<string, string>;
  stickers: LibrarySticker[];
  templates: CoverTemplate[];
  designs: StandaloneDesign[];
}): Backup {
  const books = parts.projects ?? (parts.project ? [parts.project] : []);
  const first = parts.project ?? books[0];
  if (!first) throw new Error('A backup needs at least one book.');
  return {
    versecraft: 3,
    project: first,
    ...(books.length > 1 ? { projects: books } : {}),
    assets: parts.assets,
    library: { stickers: parts.stickers, templates: parts.templates },
    designs: parts.designs,
  };
}

/**
 * What a backup file contains, whatever age it is.
 *
 * Three shapes have existed: the bare project, the project with its assets
 * beside it, and that plus the designs belonging to no book. Each older one
 * reads as the newer one with parts missing, which is the property that
 * matters — a backup is worth nothing if a later version cannot open it.
 */
export function readBackup(text: string): {
  /** The first book, for the callers that restore one. */
  project: Project;
  /** Every book in the file, which for an older file is just the one. */
  projects: Project[];
  assets: Record<string, string>;
  library: { stickers: LibrarySticker[]; templates: CoverTemplate[] };
  designs: StandaloneDesign[];
} {
  const parsed = JSON.parse(text) as Partial<Backup> & Partial<Project>;
  // A backup made before assets were split out is the project itself.
  const project = (parsed.project ?? parsed) as Project;

  if (!project || typeof project !== 'object' || !looksLikeProject(project)) {
    throw new Error('That file is not an Isnaevy project.');
  }

  // A file saved before poems and parts became one list still opens.
  const bring = (book: Project) => ({ ...book, contents: migrateContents(book) }) as Project;
  const all = (parsed.projects ?? [project]) as Project[];

  return {
    project: bring(project),
    projects: all.filter((book) => book && looksLikeProject(book)).map(bring),
    assets: parsed.assets ?? {},
    library: {
      stickers: parsed.library?.stickers ?? [],
      templates: parsed.library?.templates ?? [],
    },
    designs: (parsed.designs ?? []).map(migrateDesign),
  };
}

/** Every picture a design refers to, so a backup can carry the bytes. */
export function designAssetIds(design: Design): string[] {
  return [
    design.cover.frontImage?.assetId,
    ...(design.cover.stickers ?? []).map((sticker) => sticker.assetId),
  ].filter((id): id is string => Boolean(id));
}
