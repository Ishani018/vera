'use client';

import { copyAsset, putAsset } from '../assets';
import { getDb } from '../db';
import { alive } from '../deleted';
import { id } from '../defaults';
import type { CoverSpec, CoverSticker, CoverTemplate, LibrarySticker } from '../types';

/**
 * Stickers and cover layouts kept across every book.
 *
 * The rule that shapes all of this: a book that uses a sticker owns its own
 * copy of the image. Tidying the library, renaming things, deleting a sticker
 * that turned out badly — none of it can reach back into a cover that has
 * already been made. The cost is some duplicated bytes, which is the right
 * trade: nobody minds a few megabytes, and everybody minds a book whose cover
 * has a hole in it.
 */

export async function listStickers(): Promise<LibrarySticker[]> {
  const db = getDb();
  if (!db) return [];
  const rows = alive(await db.stickers.toArray());
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/** Saves an uploaded file straight into the library. */
export async function saveFileToLibrary(file: File, tags: string[] = []): Promise<LibrarySticker> {
  const record = await putAsset(file);
  return saveToLibrary({
    name: file.name.replace(/\.[^.]+$/, ''),
    assetId: record.id,
    width: record.width,
    height: record.height,
    tags,
  });
}

/**
 * Saves an image already in the database.
 *
 * The bytes are copied rather than shared, so removing the book this came from
 * — or the sticker it was placed as — leaves the library untouched. The same
 * rule in the other direction.
 */
export async function saveToLibrary({
  name,
  assetId,
  width,
  height,
  tags = [],
}: {
  name: string;
  assetId: string;
  width: number;
  height: number;
  tags?: string[];
}): Promise<LibrarySticker> {
  const db = getDb();
  if (!db) throw new Error('No local database available.');
  const copy = await copyAsset(assetId, name);
  const sticker: LibrarySticker = {
    id: id('lib'),
    name: name.trim() || 'Sticker',
    tags: tidyTags(tags),
    assetId: copy?.id ?? assetId,
    width,
    height,
    createdAt: Date.now(),
  };
  await db.stickers.put(sticker);
  return sticker;
}

export async function updateSticker(
  stickerId: string,
  patch: Partial<Pick<LibrarySticker, 'name' | 'tags'>>,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  const current = await db.stickers.get(stickerId);
  if (!current) return;
  await db.stickers.put({
    ...current,
    ...patch,
    name: (patch.name ?? current.name).trim() || current.name,
    tags: tidyTags(patch.tags ?? current.tags),
  });
}

/**
 * Puts a sticker in the trash. Books that use it are not touched.
 *
 * Its picture stays where it is. It used to be deleted here on the grounds
 * that nothing else could refer to it — true, and no longer the point: the
 * sticker can be restored for the next thirty days, and a restored sticker
 * with no picture is not a restored sticker. The bytes go when the trash lets
 * go of it, in `lib/trash.ts`.
 */
export async function removeSticker(stickerId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const sticker = await db.stickers.get(stickerId);
  if (!sticker) return;
  await db.stickers.put({ ...sticker, deletedAt: Date.now() });
}

/** Every tag in use, most common first, for offering rather than typing. */
export function allTags(stickers: LibrarySticker[]): string[] {
  const counts = new Map<string, number>();
  for (const sticker of stickers) {
    for (const tag of sticker.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

/**
 * The stickers matching a search.
 *
 * Name and tags together, because nobody remembers which of the two they used
 * for a thing, and a search that only looked at one would quietly hide half
 * the library.
 */
export function searchStickers(
  stickers: LibrarySticker[],
  query: string,
  tag: string | null,
): LibrarySticker[] {
  const needle = query.trim().toLowerCase();
  return stickers.filter((sticker) => {
    if (tag && !sticker.tags.includes(tag)) return false;
    if (!needle) return true;
    return (
      sticker.name.toLowerCase().includes(needle) ||
      sticker.tags.some((t) => t.toLowerCase().includes(needle))
    );
  });
}

const tidyTags = (tags: string[]): string[] => [
  ...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean)),
];

/** Splits what someone typed into a tag box. Commas or spaces, either way. */
export const parseTags = (input: string): string[] => tidyTags(input.split(/[,\s]+/));

/* ------------------------------------------------------------- templates */

export async function listTemplates(): Promise<CoverTemplate[]> {
  const db = getDb();
  if (!db) return [];
  const rows = alive(await db.coverTemplates.toArray());
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Saves a cover as a template.
 *
 * Its stickers' images are copied, so later editing the book this was saved
 * from — or deleting it — leaves the template intact.
 */
export async function saveTemplate(name: string, cover: CoverSpec): Promise<CoverTemplate> {
  const db = getDb();
  if (!db) throw new Error('No local database available.');
  const template: CoverTemplate = {
    id: id('tpl'),
    name: name.trim() || 'Cover template',
    createdAt: Date.now(),
    cover: {
      ...structuredClone(cover),
      stickers: await Promise.all(cover.stickers.map(withCopiedAsset)),
      frontImage: cover.frontImage
        ? {
            ...cover.frontImage,
            assetId:
              (await copyAsset(cover.frontImage.assetId))?.id ?? cover.frontImage.assetId,
          }
        : null,
    },
  };
  await db.coverTemplates.put(template);
  return template;
}

/** Puts a cover template in the trash. Its pictures stay until the trash lets go. */
export async function removeTemplate(templateId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const template = await db.coverTemplates.get(templateId);
  if (!template) return;
  await db.coverTemplates.put({ ...template, deletedAt: Date.now() });
}

/**
 * A cover built from a template, ready to be written into a book.
 *
 * Copies again on the way out, so the book and the template are independent in
 * both directions: applying a template twice gives two covers that can be
 * edited apart, and editing either leaves the template as it was.
 */
export async function coverFromTemplate(template: CoverTemplate): Promise<CoverSpec> {
  return {
    ...structuredClone(template.cover),
    stickers: await Promise.all(template.cover.stickers.map(withCopiedAsset)),
    frontImage: template.cover.frontImage
      ? {
          ...template.cover.frontImage,
          assetId:
            (await copyAsset(template.cover.frontImage.assetId))?.id ??
            template.cover.frontImage.assetId,
        }
      : null,
  };
}

async function withCopiedAsset(sticker: CoverSticker): Promise<CoverSticker> {
  const copy = await copyAsset(sticker.assetId, sticker.name);
  return { ...sticker, id: id('cs'), assetId: copy?.id ?? sticker.assetId };
}

/**
 * Every asset the library and the templates depend on, so pruning spares them.
 *
 * Deliberately counts what is in the trash as well, which is why it reads the
 * tables rather than calling the two list functions above. A sticker in the
 * trash still has thirty days in which it can be restored, and restoring one
 * whose picture had been swept up would hand back an empty square.
 */
export async function keptAssetIds(): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const [stickers, templates] = await Promise.all([
    db.stickers.toArray(),
    db.coverTemplates.toArray(),
  ]);
  return [
    ...stickers.map((sticker) => sticker.assetId),
    ...templates.flatMap((template) => [
      ...template.cover.stickers.map((sticker) => sticker.assetId),
      template.cover.frontImage?.assetId,
    ]),
  ].filter((assetId): assetId is string => Boolean(assetId));
}

/**
 * Folds a backup's library into the one already here.
 *
 * Merged rather than replaced, and anything already present wins: restoring
 * one book's backup must not empty a library that has grown since it was
 * taken. The assets themselves arrive separately, with the rest of the
 * backup's images.
 */
export async function mergeLibrary(
  stickers: LibrarySticker[],
  templates: CoverTemplate[],
): Promise<void> {
  const db = getDb();
  if (!db) return;
  for (const sticker of stickers) {
    if (!sticker?.id || (await db.stickers.get(sticker.id))) continue;
    await db.stickers.put({ ...sticker, tags: tidyTags(sticker.tags ?? []) });
  }
  for (const template of templates) {
    if (!template?.id || (await db.coverTemplates.get(template.id))) continue;
    await db.coverTemplates.put(template);
  }
}
