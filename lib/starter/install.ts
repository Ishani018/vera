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
