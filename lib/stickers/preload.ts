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

let inFlightPreload: Promise<boolean> | null = null;

/**
 * Preloads the curated sticker directory into the local library if not yet populated.
 *
 * It only adds stickers, never duplicates, and automatically cleans up any existing duplicates.
 */
export async function ensurePreloadedStickers(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (inFlightPreload) return inFlightPreload;

  inFlightPreload = (async () => {
    const db = getDb();
    if (!db) return false;

    // Deduplicate any existing items in the database
    const existing: LibrarySticker[] = alive(await db.stickers.toArray());
    const seen = new Set<string>();
    existing.sort((a, b) => b.createdAt - a.createdAt);

    for (const s of existing) {
      const key = s.source?.file
        ? `${s.source.pack}:${s.source.file}`
        : (s.assetId ? `asset:${s.assetId}` : s.name.trim().toLowerCase());
      if (seen.has(key)) {
        await db.stickers.delete(s.id);
      } else {
        seen.add(key);
      }
    }

    const preloaded = localStorage.getItem(PRELOAD_KEY);
    if (preloaded && existing.length > 0) return false;

    try {
      const res = await fetch('/stickers/manifest.json');
      if (!res.ok) return false;

      const manifest = (await res.json()) as PreloadManifest;
      if (!manifest?.packs) return false;

      let addedCount = 0;

      for (const pack of manifest.packs) {
        for (const item of pack.items) {
          const itemKey = `${item.pack}:${item.file}`;
          const nameKey = item.name.trim().toLowerCase();

          if (seen.has(itemKey) || seen.has(nameKey)) continue;

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

            seen.add(itemKey);
            seen.add(nameKey);
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
  })();

  try {
    return await inFlightPreload;
  } finally {
    inFlightPreload = null;
  }
}
