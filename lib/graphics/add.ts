'use client';

import { putAssetBlob } from '../assets';
import { listStickers, saveToLibrary } from '../cover/library';
import { fileNameFor } from '../starter/fetch';
import { packFor } from './policy';
import type { LibrarySticker, StickerSource } from '../types';

/**
 * Putting a browsed picture into My stickers.
 *
 * Exactly what installing a pack does, so a browsed sticker is indistinguishable
 * from an installed one afterwards: the same `pack:` tag, the same `source`
 * record with its licence and link, so it shows up in the Library and in the
 * credits file without anything special being taught about it.
 *
 * One at a time: a dozen downloads at once is a dozen bitmaps in memory, and
 * the server is asked to fetch each of them — doing that in a burst is exactly
 * what the pace on the search is there to avoid.
 */

export type Pick = {
  id: string;
  title: string;
  author: string;
  licence: string;
  sourceUrl: string;
  fileUrl: string;
  thumbUrl: string;
};

export type AddOutcome = { title: string; state: 'added' | 'skipped' | 'failed'; why?: string };

/** Whether this exact thing, from this exact search, is already here. */
export const alreadyHere = (library: LibrarySticker[], pack: string, file: string): boolean =>
  library.some((one) => one.source?.pack === pack && one.source?.file === file && !one.deletedAt);

/** The file name a picked item is stored under, from its title and its type. */
export function fileFor(pick: Pick, taken: Set<string>): string {
  const extension = (pick.fileUrl.split('?')[0].match(/\.(png|jpe?g|webp)$/i) ?? ['.png'])[0]
    .toLowerCase()
    .replace('.jpeg', '.jpg');
  return fileNameFor({ title: pick.title }, extension, taken);
}

export function sourceFor(pick: Pick, pack: string, file: string, on = new Date()): StickerSource {
  return {
    pack,
    file,
    sourceUrl: pick.sourceUrl,
    author: pick.author,
    licence: pick.licence,
    downloadedOn: on.toISOString().slice(0, 10),
    installedAs: { name: pick.title.slice(0, 80), tags: [`pack:${pack}`] },
  };
}

export async function addPicks(
  picks: Pick[],
  query: string,
  onProgress?: (done: number, total: number, title: string) => void,
): Promise<AddOutcome[]> {
  const pack = packFor(query);
  const library = await listStickers();
  const taken = new Set<string>();
  const outcomes: AddOutcome[] = [];

  for (const [n, pick] of picks.entries()) {
    onProgress?.(n, picks.length, pick.title);
    const file = fileFor(pick, taken);
    if (alreadyHere(library, pack, file)) {
      outcomes.push({ title: pick.title, state: 'skipped' });
      continue;
    }
    try {
      // Through our own server, which is the only thing allowed to decide
      // which hosts may be opened and how big a picture may be.
      const response = await fetch(`/api/graphics/fetch?url=${encodeURIComponent(pick.fileUrl)}`);
      if (!response.ok) {
        const said = await response.json().catch(() => ({}));
        throw new Error((said as { error?: string }).error ?? `the server answered ${response.status}`);
      }
      const blob = await response.blob();
      const probe = await createImageBitmap(blob);
      const asset = await putAssetBlob(blob, file, probe.width, probe.height);
      probe.close();
      await saveToLibrary({
        name: pick.title.slice(0, 80),
        assetId: asset.id,
        width: asset.width,
        height: asset.height,
        tags: [`pack:${pack}`],
        source: sourceFor(pick, pack, file),
      });
      outcomes.push({ title: pick.title, state: 'added' });
    } catch (error) {
      // One picture's problem, not the batch's.
      outcomes.push({
        title: pick.title,
        state: 'failed',
        why: error instanceof Error ? error.message : 'could not be added',
      });
    }
    onProgress?.(n + 1, picks.length, pick.title);
  }
  return outcomes;
}

export const countOutcomes = (outcomes: AddOutcome[]) => ({
  added: outcomes.filter((one) => one.state === 'added').length,
  skipped: outcomes.filter((one) => one.state === 'skipped').length,
  failed: outcomes.filter((one) => one.state === 'failed').length,
});
