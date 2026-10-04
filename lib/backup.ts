import { BRAND } from './brand';
import { looksLikeProject, migrateContents } from './contents';
import { alive, isDeleted } from './deleted';
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
  project: AnyProject;
  assets: Record<string, string>;
  library: { stickers: LibrarySticker[]; templates: CoverTemplate[] };
  /** Designs belonging to no book. Absent from every backup made before they existed. */
  designs?: StandaloneDesign[];
};

/** The payload, assembled. */
export function buildBackup(parts: {
  project: AnyProject;
  assets: Record<string, string>;
  stickers: LibrarySticker[];
  templates: CoverTemplate[];
  designs: StandaloneDesign[];
}): Backup {
  // Filtered here rather than trusted from the caller. Every list this is
  // handed already skips the trash, so this is the second lock on the same
  // door — and it is the one that holds if a future caller forgets, because a
  // backup quietly containing a deleted book is the failure nobody notices
  // until they restore it. See `lib/deleted.ts`.
  return {
    versecraft: 2,
    project: {
      ...parts.project,
      designs: alive(parts.project.designs ?? []),
    },
    assets: parts.assets,
    library: {
      stickers: alive(parts.stickers),
      templates: alive(parts.templates),
    },
    designs: alive(parts.designs),
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
  project: Project;
  assets: Record<string, string>;
  library: { stickers: LibrarySticker[]; templates: CoverTemplate[] };
  designs: StandaloneDesign[];
} {
  const parsed = JSON.parse(text) as Partial<Backup> & Partial<Project>;
  // A backup made before assets were split out is the project itself.
  const project = (parsed.project ?? parsed) as Project;

  if (!project || typeof project !== 'object' || !looksLikeProject(project)) {
    throw new Error(`That file is not a ${BRAND.product} project.`);
  }

  if (isDeleted(project)) {
    throw new Error('That backup holds a book that had been deleted.');
  }

  return {
    // A file saved before poems and parts became one list still opens.
    project: { ...project, contents: migrateContents(project) } as Project,
    assets: parsed.assets ?? {},
    library: {
      stickers: parsed.library?.stickers ?? [],
      templates: parsed.library?.templates ?? [],
    },
    designs: alive((parsed.designs ?? []).map(migrateDesign)),
  };
}

/** Every picture a design refers to, so a backup can carry the bytes. */
export function designAssetIds(design: Design): string[] {
  return [
    design.cover.frontImage?.assetId,
    ...(design.cover.stickers ?? []).map((sticker) => sticker.assetId),
  ].filter((id): id is string => Boolean(id));
}
