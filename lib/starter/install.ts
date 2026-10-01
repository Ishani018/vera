import type { LibrarySticker, StickerSource } from '../types';
import type { StarterItem, StarterManifest } from './manifest';
import { checkManifest } from './manifest';
import { alive } from '../deleted';
import { readZip, fileIn, type ZipFile } from '../stickers/unzip';
import { probeImage } from './image';

/**
 * Putting a pack into the library, without touching anything already in it.
 *
 * The whole of the care here is in one rule: **installing only ever adds.** It
 * never writes over a sticker, never deletes one, never renames one. A sticker
 * you have edited is yours; a second install of the same pack notices what is
 * already there and leaves it alone rather than making a second copy.
 *
 * The planning is pure and the writing is not, which is deliberate: what counts
 * as "already installed" and what a failure does to the rest of the batch are
 * exactly the things worth testing, and neither needs a database.
 */

/** A pack and a file together identify an item; nothing else does. */
export const sameItem = (source: StickerSource | undefined, pack: string, file: string): boolean =>
  Boolean(source && source.pack === pack && source.file === file);

/** Everything in the library that came from this pack and is not in the trash. */
export const fromPack = (stickers: LibrarySticker[], pack: string): LibrarySticker[] =>
  alive(stickers).filter((sticker) => sticker.source?.pack === pack);

export type Plan = {
  install: StarterItem[];
  /** Already there, so left exactly as they are. */
  skip: StarterItem[];
};

/**
 * What a second install should do, which is mostly nothing.
 *
 * Only living stickers count as installed. One that has been removed to the
 * trash is not in the library any more, so offering to install it again is the
 * honest answer — and the alternative, treating a trashed sticker as present,
 * would mean a pack you removed could never be put back without emptying the
 * bin first.
 */
export function planInstall(items: StarterItem[], pack: string, library: LibrarySticker[]): Plan {
  const here = alive(library);
  const install: StarterItem[] = [];
  const skip: StarterItem[] = [];
  for (const item of items) {
    if (here.some((sticker) => sameItem(sticker.source, pack, item.file))) skip.push(item);
    else install.push(item);
  }
  return { install, skip };
}

/** The tags an installed sticker carries: the pack, then whatever it said. */
export const tagsFor = (manifest: StarterManifest, item: StarterItem): string[] => [
  `pack:${manifest.pack}`,
  ...item.tags,
];

export const sourceFor = (manifest: StarterManifest, item: StarterItem): StickerSource => ({
  pack: manifest.pack,
  file: item.file,
  sourceUrl: item.sourceUrl,
  author: item.author,
  licence: item.licence,
  downloadedOn: item.downloadedOn,
  // What the pack put there, kept so that removing the pack later can tell a
  // sticker nobody has touched from one somebody has made their own.
  installedAs: { name: item.name, tags: tagsFor(manifest, item) },
});

/** Where a pack keeps its pictures inside the zip. */
export const imagePath = (file: string) => `images/${file}`;

export type OpenedPack = { manifest: StarterManifest; files: ZipFile[] };

/**
 * Opens a pack and checks it before a single sticker is written.
 *
 * The same check the builder runs, run again here. A zip is a file that has
 * been somewhere: it may have been edited, truncated, or built by an older
 * version of the builder with looser rules. Trusting it because it is a zip
 * would make every rule in the builder advisory.
 */
export function openPack(bytes: Uint8Array): OpenedPack {
  const files = readZip(bytes);
  const found = fileIn(files, 'manifest.json');
  if (!found) throw new Error('This zip has no manifest.json, so it is not a sticker pack.');

  let manifest: StarterManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(found.bytes)) as StarterManifest;
  } catch {
    throw new Error('This pack’s manifest will not parse.');
  }

  const problems = checkManifest(manifest, manifest?.pack ?? '');
  if (problems.length) {
    throw new Error(
      `This pack was refused: ${problems[0].why}` +
        (problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''),
    );
  }
  return { manifest, files };
}

export type ItemOutcome =
  | { file: string; state: 'installed' }
  | { file: string; state: 'skipped' }
  | { file: string; state: 'failed'; why: string };

/**
 * One item's bytes out of the pack, checked.
 *
 * Returns the reason rather than throwing, because one bad picture must not
 * stop the twelve good ones behind it — which is the whole shape of installing
 * a batch of things somebody else made.
 */
export function itemBytes(files: ZipFile[], item: StarterItem): { bytes: Uint8Array } | { why: string } {
  const found = fileIn(files, imagePath(item.file));
  if (!found) return { why: 'missing from the pack' };
  const probe = probeImage(found.bytes);
  if (!probe.ok) return { why: probe.why };
  return { bytes: found.bytes };
}

/** What to tell somebody afterwards, in the order they care about it. */
export const summarise = (outcomes: ItemOutcome[]) => ({
  installed: outcomes.filter((o) => o.state === 'installed').length,
  skipped: outcomes.filter((o) => o.state === 'skipped').length,
  failed: outcomes.filter((o) => o.state === 'failed').length,
});

/* ----------------------------------------------------------- uninstalling */

const sameTags = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

/**
 * Has this sticker been made somebody's own since it was installed?
 *
 * Renamed, retagged, or its picture swapped. Anything that has been is kept
 * when its pack is removed, because "remove the pack" must never mean "remove
 * the work you did to it". A sticker installed before this record existed has
 * nothing to compare against, and is treated as edited — the cautious way
 * round, since keeping something by mistake is recoverable and removing it is
 * the thing we are being careful about.
 */
export function isEdited(sticker: LibrarySticker): boolean {
  const was = sticker.source?.installedAs;
  if (!was) return true;
  return sticker.name !== was.name || !sameTags(sticker.tags, was.tags);
}

/** Packs other than this one that a sticker has been put into by hand. */
export const otherPacks = (sticker: LibrarySticker, pack: string): string[] =>
  sticker.tags
    .filter((tag) => tag.startsWith('pack:') && tag !== `pack:${pack}`)
    .map((tag) => tag.slice('pack:'.length));

export type RemovalPlan = {
  /** To be put in the trash. */
  remove: LibrarySticker[];
  /** Left alone, each with the reason it was left. */
  keep: { sticker: LibrarySticker; because: string }[];
};

/**
 * What removing a pack should actually take away.
 *
 * Only what came from that pack, only what is still as the pack left it, and
 * never something that now belongs to another pack as well. Everything kept is
 * kept for a stated reason, because a count of "3 removed, 2 kept" with no
 * explanation is a count nobody can act on.
 */
export function planRemoval(library: LibrarySticker[], pack: string): RemovalPlan {
  const remove: LibrarySticker[] = [];
  const keep: RemovalPlan['keep'] = [];
  for (const sticker of fromPack(library, pack)) {
    const others = otherPacks(sticker, pack);
    if (others.length) {
      keep.push({ sticker, because: `it is also in ${others.join(' and ')}` });
    } else if (isEdited(sticker)) {
      keep.push({ sticker, because: 'you have changed it' });
    } else {
      remove.push(sticker);
    }
  }
  return { remove, keep };
}
