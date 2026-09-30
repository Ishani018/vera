import { getDb } from './db';
import { alive, isDeleted } from './deleted';
import { createDesign } from './defaults';
import { presetById } from './presets';
import { SCHEMA } from './schema';
import type { CoverSpec, StandaloneDesign } from './types';

/**
 * Designs that belong to no book.
 *
 * The one place that knows how a design is stored on its own: how a new one is
 * born, how a stored one is brought up to date, and how the list of them is
 * read. Designs inside books are `lib/projects.ts`'s business and are not
 * touched from here.
 */

/** Brings a stored design up to date. A no-op today, and the place for later. */
export function migrateDesign(raw: unknown): StandaloneDesign {
  const record = (raw ?? {}) as StandaloneDesign;
  const cover = (record.cover ?? {}) as CoverSpec;
  cover.stickers ??= [];
  cover.textBoxes ??= [];
  for (const box of cover.textBoxes) box.curve ??= 0;
  for (const sticker of cover.stickers) sticker.arc ??= 0;
  return {
    ...record,
    cover,
    // Born in points, and said so. Absent would mean inches, which no design
    // has ever been stored in — but saying it is what lets a later migration
    // tell the difference without guessing.
    schema: record.schema ?? SCHEMA,
    updatedAt: record.updatedAt ?? record.createdAt ?? 0,
  };
}

/** A blank board of the given size, saved, ready to open. */
export async function startDesign(presetId: string): Promise<StandaloneDesign | null> {
  const db = getDb();
  const preset = presetById(presetId);
  if (!db || !preset) return null;
  const now = Date.now();
  const design: StandaloneDesign = {
    ...createDesign(presetId, preset.name),
    schema: SCHEMA,
    createdAt: now,
    updatedAt: now,
  };
  await db.designs.put(design);
  return design;
}

/**
 * One design, if it is not in the trash.
 *
 * A trashed design reads as missing rather than opening: the screen that would
 * open it has a "that design isn't here" state already, and editing something
 * that is in the bin is a way to lose the edit when the bin is emptied.
 */
export async function getDesign(id: string): Promise<StandaloneDesign | null> {
  const db = getDb();
  if (!db) return null;
  const row = await db.designs.get(id);
  if (!row || isDeleted(row)) return null;
  return migrateDesign(row);
}

/** Writes one back, stamping the time it was last touched. */
export async function saveDesign(design: StandaloneDesign): Promise<void> {
  await getDb()?.designs.put({ ...design, updatedAt: Date.now() });
}

export async function listStandaloneDesigns(): Promise<StandaloneDesign[]> {
  const db = getDb();
  if (!db) return [];
  return alive(await db.designs.toArray()).map(migrateDesign);
}

export async function renameStandaloneDesign(id: string, name: string): Promise<void> {
  const design = await getDesign(id);
  if (design) await saveDesign({ ...design, name });
}

/** Puts a design in the trash. Marked rather than removed; see `lib/deleted.ts`. */
export async function deleteStandaloneDesign(id: string): Promise<void> {
  const db = getDb();
  const row = await db?.designs.get(id);
  if (!db || !row) return;
  await db.designs.put({ ...row, deletedAt: Date.now() });
}
