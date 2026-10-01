import type { LibrarySticker } from '../types';

/**
 * Packs, as a tag convention rather than a table.
 *
 * `pack:autumn` on a sticker means it is in the Autumn pack. Nothing new is
 * stored, nothing is migrated, and no version is bumped — which was the
 * condition for building this at all. The cost is that a pack has no existence
 * of its own: an empty pack is not a thing, and renaming one is retagging every
 * sticker in it. Both are honest limits of the convention and both are said on
 * the screen.
 *
 * The gain is worth it. A sticker in two packs is just a sticker with two tags,
 * the existing search already finds packs because it already searches tags, and
 * deleting a sticker cannot leave a pack pointing at nothing.
 *
 * Everything here is private and local. There is no sharing, no browsing of
 * anyone else's, and no pack leaves this browser except as a zip somebody
 * downloads.
 */

export const PACK_PREFIX = 'pack:';

/** A pack name, tidied to what a tag can hold. */
export function packTag(name: string): string {
  const tidy = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return tidy ? `${PACK_PREFIX}${tidy}` : '';
}

/** The pack a tag names, or null where it names something else. */
export const packOf = (tag: string): string | null =>
  tag.startsWith(PACK_PREFIX) ? tag.slice(PACK_PREFIX.length) : null;

export const isPackTag = (tag: string): boolean => Boolean(packOf(tag));

/** Tags that are not pack tags: what a person typed, left alone. */
export const plainTags = (tags: string[]): string[] => tags.filter((t) => !isPackTag(t));

export type Pack = { name: string; tag: string; stickerIds: string[] };

/**
 * Every pack among some stickers, with what is in each.
 *
 * Sorted by name so the list does not reshuffle itself when a sticker is added,
 * which is the sort of thing that makes a screen feel untrustworthy.
 */
export function packsIn(stickers: LibrarySticker[]): Pack[] {
  const found = new Map<string, string[]>();
  for (const sticker of stickers) {
    for (const tag of sticker.tags ?? []) {
      const name = packOf(tag);
      if (!name) continue;
      const list = found.get(name);
      if (list) list.push(sticker.id);
      else found.set(name, [sticker.id]);
    }
  }
  return [...found.entries()]
    .map(([name, stickerIds]) => ({ name, tag: `${PACK_PREFIX}${name}`, stickerIds }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const inPack = (sticker: LibrarySticker, name: string): boolean =>
  (sticker.tags ?? []).includes(`${PACK_PREFIX}${name}`);

/** The sticker's tags with this pack added. Already there is left alone. */
export function withPack(tags: string[], name: string): string[] {
  const tag = packTag(name);
  if (!tag || tags.includes(tag)) return tags;
  return [...tags, tag];
}

export const withoutPack = (tags: string[], name: string): string[] =>
  tags.filter((t) => t !== `${PACK_PREFIX}${name}`);

/**
 * File names for a pack's zip: safe, ordered and never the same twice.
 *
 * Numbered, because two stickers in a pack may well be called the same thing
 * and a zip with two identical names is a zip that loses one of them.
 */
export function fileNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name, i) => {
    const tidy =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'sticker';
    let out = `${String(i + 1).padStart(2, '0')}-${tidy}.png`;
    let n = 2;
    while (used.has(out)) out = `${String(i + 1).padStart(2, '0')}-${tidy}-${n++}.png`;
    used.add(out);
    return out;
  });
}
