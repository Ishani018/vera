import Dexie, { type Table } from 'dexie';
import type { AssetRecord } from './assets';
import type {
  AnyProject,
  CoverTemplate,
  LibrarySticker,
  StandaloneDesign,
  StickerDraft,
} from './types';

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
  /**
   * Designs that belong to no book.
   *
   * Their own table rather than a field on a project, because a post made
   * before there is a book to announce is not a fact about any book. Designs
   * already saved inside books stay where they are and keep working; nothing
   * here moves them.
   */
  designs!: Table<StandaloneDesign, string>;
  /**
   * Stickers still being made.
   *
   * A draft is not a sticker. It is the settings and the colouring that will
   * become one, kept only so that closing the tab halfway through does not
   * throw the work away — and it is deliberately invisible to everything else:
   * no list shows it, no backup carries it, and it becomes a real sticker only
   * when someone presses the button that says so.
   *
   * Its own table for that reason. Putting half-finished work in `stickers`
   * would mean every reader of the library had to learn to ignore some of it,
   * and the one that forgot would put a half-traced drawing on somebody's
   * cover.
   */
  stickerDrafts!: Table<StickerDraft, string>;

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
    // Additive: a new table, and not a line of existing data read or rewritten.
    this.version(4).stores({
      projects: 'id, updatedAt, name',
      assets: 'id, createdAt',
      stickers: 'id, name, createdAt, *tags',
      coverTemplates: 'id, name, createdAt',
      designs: 'id, updatedAt, name',
    });
    // Additive again, and in exactly the same way version 4 was: every store
    // above is repeated unchanged, one new store is named, and there is no
    // `upgrade()` callback — so IndexedDB creates one empty object store and
    // does not open, read or rewrite a single row of anything that already
    // exists.
    this.version(5).stores({
      projects: 'id, updatedAt, name',
      assets: 'id, createdAt',
      stickers: 'id, name, createdAt, *tags',
      coverTemplates: 'id, name, createdAt',
      designs: 'id, updatedAt, name',
      stickerDrafts: 'id, updatedAt',
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
