import Dexie, { type Table } from 'dexie';
import type { AssetRecord } from './assets';
import type { AnyProject, CoverTemplate, LibrarySticker } from './types';

/**
 * Everything lives in the browser. There is no server-side store: the export
 * routes are stateless and receive the project in the request body.
 *
 * One table holds both kinds of book. They share most of their fields and all
 * of their lifecycle — opened, listed, autosaved — so splitting them would mean
 * two of everything for the sake of one discriminant.
 */
export class VersecraftDatabase extends Dexie {
  projects!: Table<AnyProject, string>;
  /**
   * Image bytes, keyed by id. Kept out of the project document so the project
   * stays small enough to clone on every edit and to snapshot for undo.
   */
  assets!: Table<AssetRecord, string>;
  /**
   * Stickers kept across every book, not inside one.
   *
   * Their own table rather than a field on a project, because that is exactly
   * what "shared by every project" means — and because a book that uses one
   * keeps its own copy of the image, so deleting from here can never reach
   * back into a cover that has already been made.
   */
  stickers!: Table<LibrarySticker, string>;
  /** Saved cover layouts, so a series can start from one design. */
  coverTemplates!: Table<CoverTemplate, string>;

  constructor() {
    super('versecraft');
    this.version(1).stores({ projects: 'id, updatedAt, name' });
    this.version(2).stores({
      projects: 'id, updatedAt, name',
      assets: 'id, createdAt',
    });
    this.version(3).stores({
      projects: 'id, updatedAt, name',
      assets: 'id, createdAt',
      stickers: 'id, name, createdAt, *tags',
      coverTemplates: 'id, name, createdAt',
    });
  }
}

let instance: VersecraftDatabase | null = null;

/** Returns null during SSR — IndexedDB does not exist on the server. */
export function getDb(): VersecraftDatabase | null {
  if (typeof window === 'undefined') return null;
  if (!instance) instance = new VersecraftDatabase();
  return instance;
}

export const ACTIVE_PROJECT_KEY = 'versecraft:activeProjectId';
