import { getDb } from '../db';
import { alive, isDeleted } from '../deleted';
import { id } from '../defaults';
import { DEFAULT_LINE_ART } from '../projects';
import type { StickerDraft } from '../types';

/**
 * Stickers still being made.
 *
 * A draft exists for one reason: closing the tab halfway through a sticker
 * should not throw the work away. It is not a sticker, and the rule that keeps
 * that true is that **nothing outside this file ever lists one**. The library,
 * the front page and both backup builders read `stickers`, `projects` and
 * `designs`; none of them reads this table, and none of them should learn to.
 *
 * A draft becomes a sticker by being finished, which writes a row into the
 * library the ordinary way and leaves the draft behind to be reopened or
 * thrown away. That is deliberate: someone who saves a sticker and then wants
 * a second version of it in a different colour should not have to start again.
 *
 * Deleting follows the same rules as everything else — marked, not removed,
 * for thirty days. See `lib/deleted.ts`.
 */

export function newDraft(sourceAssetId: string, name: string): StickerDraft {
  const now = Date.now();
  return {
    id: id('skd'),
    name,
    tags: '',
    sourceAssetId,
    mode: 'convert',
    settings: { ...DEFAULT_LINE_ART },
    removeBackground: true,
    tolerance: 14,
    smoothing: 1,
    inkColour: '#1B1815',
    dieCut: null,
    size: 1000,
    colourAssetId: null,
    colourAt: null,
    gapClosing: 2,
    createdAt: now,
    updatedAt: now,
  };
}

/** Brings a stored draft up to date. A no-op today, and the place for later. */
export function migrateDraft(raw: unknown): StickerDraft {
  const record = (raw ?? {}) as StickerDraft;
  return {
    ...record,
    settings: { ...DEFAULT_LINE_ART, ...(record.settings ?? {}) },
    gapClosing: record.gapClosing ?? 2,
    colourAssetId: record.colourAssetId ?? null,
    colourAt: record.colourAt ?? null,
  };
}

export async function saveDraft(draft: StickerDraft): Promise<void> {
  await getDb()?.stickerDrafts.put({ ...draft, updatedAt: Date.now() });
}

/** One draft, if it is not in the trash. */
export async function getDraft(draftId: string): Promise<StickerDraft | null> {
  const db = getDb();
  if (!db) return null;
  const row = await db.stickerDrafts.get(draftId);
  if (!row || isDeleted(row)) return null;
  return migrateDraft(row);
}

/**
 * The listable drafts among some rows: newest first, never anything in the
 * trash.
 *
 * Separated from the read so it can be tested without a database, which is
 * how every other rule in this app is tested.
 */
export function draftList(rows: unknown[]): StickerDraft[] {
  return alive(rows as StickerDraft[])
    .map(migrateDraft)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Newest first, and never anything in the trash. */
export async function listDrafts(): Promise<StickerDraft[]> {
  const db = getDb();
  if (!db) return [];
  return draftList(await db.stickerDrafts.toArray());
}

/** The one to offer on the way in: whatever was last being worked on. */
export async function latestDraft(): Promise<StickerDraft | null> {
  return (await listDrafts())[0] ?? null;
}

/** Puts a draft in the trash. Marked rather than removed. */
export async function deleteDraft(draftId: string): Promise<void> {
  const db = getDb();
  const row = await db?.stickerDrafts.get(draftId);
  if (!db || !row) return;
  await db.stickerDrafts.put({ ...row, deletedAt: Date.now() });
}
