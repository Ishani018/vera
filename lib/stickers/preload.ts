'use client';

import { putAssetBlob } from '../assets';
import { getDb } from '../db';
import { alive } from '../deleted';
import { saveToLibrary } from '../cover/library';
import type { LibrarySticker } from '../types';

export type PreloadItem = {
  file: string;
  name: string;
  pack: string;
  path: string;
  tags: string[];
};

export type PreloadPack = {
  id: string;
  name: string;
  tag: string;
  items: PreloadItem[];
};

export type PreloadManifest = {
  version: number;
  packs: PreloadPack[];
};

const PRELOAD_KEY = 'stickers_preloaded_v1';

/**
 * Preloads the curated sticker directory into the local library if not yet populated.
 *
 * It only adds stickers and never overwrites anything existing.
 */
export async function ensurePreloadedStickers(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const db = getDb();
  if (!db) return false;

  const preloaded = localStorage.getItem(PRELOAD_KEY);
  if (preloaded) return false;

  try {
    const res = await fetch('/stickers/manifest.json');
    if (!res.ok) return false;

    const manifest = (await res.json()) as PreloadManifest;
    if (!manifest?.packs) return false;

    const existing: LibrarySticker[] = alive(await db.stickers.toArray());

    let addedCount = 0;

    for (const pack of manifest.packs) {
      for (const item of pack.items) {
        const alreadyHere = existing.some(
          (s) =>
            (s.source?.pack === item.pack && s.source?.file === item.file) ||
            s.name.toLowerCase() === item.name.toLowerCase(),
        );

        if (alreadyHere) continue;

        try {
          const imgRes = await fetch(`/stickers/${encodeURI(item.path)}`);
          if (!imgRes.ok) continue;

          const blob = await imgRes.blob();
          const probe = await createImageBitmap(blob);
          const asset = await putAssetBlob(blob, item.file, probe.width, probe.height);
          probe.close();

          await saveToLibrary({
            name: item.name,
            assetId: asset.id,
            width: asset.width,
            height: asset.height,
            tags: [`pack:${item.pack}`, ...item.tags],
            source: {
              pack: item.pack,
              file: item.file,
              sourceUrl: `/stickers/${encodeURI(item.path)}`,
              author: 'Local Pack',
              licence: 'Personal',
              downloadedOn: new Date().toISOString().slice(0, 10),
            },
          });

          addedCount++;
        } catch {
          // Continue with next item if one fails
        }
      }
    }

    localStorage.setItem(PRELOAD_KEY, 'true');
    return addedCount > 0;
  } catch {
    return false;
  }
}
