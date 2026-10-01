'use client';

import { putAssetBlob } from '../assets';
import { listStickers, saveToLibrary } from '../cover/library';
import {
  itemBytes,
  openPack,
  planInstall,
  sourceFor,
  summarise,
  tagsFor,
  type ItemOutcome,
} from './install';

/**
 * Installing a pack, one sticker at a time.
 *
 * One at a time for the same reason the batch converter is: a dozen images
 * decoded at once is a dozen bitmaps in memory, and the browser's answer to
 * that is to kill the tab. It also means progress can be reported honestly
 * rather than as a bar that jumps from nothing to everything.
 *
 * Nothing already in the library is read for anything but its identity, and
 * nothing is written over. The worst this can do is add fewer stickers than
 * expected and say which ones it could not add.
 */

export type Progress = { done: number; total: number; name: string };

export async function installPack(
  bytes: Uint8Array,
  onProgress?: (progress: Progress) => void,
): Promise<{ pack: string; name: string; outcomes: ItemOutcome[] }> {
  const { manifest, files } = openPack(bytes);
  const plan = planInstall(manifest.items, manifest.pack, await listStickers());

  const outcomes: ItemOutcome[] = plan.skip.map((item) => ({ file: item.file, state: 'skipped' }));
  let done = plan.skip.length;

  for (const item of plan.install) {
    onProgress?.({ done, total: manifest.items.length, name: item.name });
    const got = itemBytes(files, item);
    if ('why' in got) {
      // This picture's problem, not the pack's.
      outcomes.push({ file: item.file, state: 'failed', why: got.why });
      done++;
      continue;
    }
    try {
      // A copy of the bytes, because a subarray of the zip keeps the whole zip
      // alive in memory for as long as the sticker exists.
      const copy = new Uint8Array(got.bytes.length);
      copy.set(got.bytes);
      const blob = new Blob([copy.buffer], { type: 'image/png' });

      // At its own size: a starter picture is the artwork, and resizing it on
      // the way in would be a decision nobody asked for.
      const probe = await createImageBitmap(blob);
      const asset = await putAssetBlob(blob, item.file, probe.width, probe.height);
      probe.close();

      await saveToLibrary({
        name: item.name,
        assetId: asset.id,
        width: asset.width,
        height: asset.height,
        tags: tagsFor(manifest, item),
        source: sourceFor(manifest, item),
      });
      outcomes.push({ file: item.file, state: 'installed' });
    } catch (error) {
      outcomes.push({
        file: item.file,
        state: 'failed',
        why: error instanceof Error ? error.message : 'could not be added',
      });
    }
    done++;
    onProgress?.({ done, total: manifest.items.length, name: item.name });
  }

  return { pack: manifest.pack, name: manifest.name, outcomes };
}

export { summarise };
