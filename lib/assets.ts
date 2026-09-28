'use client';

import { getDb } from './db';

/**
 * Binary assets — cover art, illustrations — live in their own IndexedDB table,
 * not inside the project document.
 *
 * A base64 image inside the project is the same bytes copied into every place
 * the project goes: the autosave on each keystroke, the JSON backup, the export
 * request body, and every entry in the undo history. One 4MB cover becomes tens
 * of megabytes of duplication the moment undo exists. Keeping the bytes in one
 * table and referring to them by id makes the project small enough to clone
 * freely, which is what the rest of the app assumes it can do.
 *
 * Blobs are stored rather than data URLs: IndexedDB stores them natively, and a
 * blob is roughly a third the size of its base64 form.
 */

export type AssetRecord = {
  id: string;
  name: string;
  mime: string;
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  createdAt: number;
};

/** What the project stores: a reference, plus what validation needs to know. */
export type ImageRef = {
  assetId: string;
  naturalWidth: number;
  naturalHeight: number;
  fit: 'cover' | 'contain';
};

export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedImageError';
  }
}

const objectUrls = new Map<string, string>();

function newId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 18);
  return `asset_${random}`;
}

/** Reads an image's true pixel size, which is what every DPI check needs. */
async function measure(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new UnsupportedImageError('That file is not an image the browser can read.'));
      image.src = url;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function putAsset(file: File): Promise<AssetRecord> {
  if (/\.tiff?$/i.test(file.name) || file.type === 'image/tiff') {
    throw new UnsupportedImageError(
      'Browsers cannot display TIFF, so it cannot be previewed or embedded. Convert it to a ' +
        'high-quality JPEG or PNG first — KDP accepts both.',
    );
  }
  const db = getDb();
  if (!db) throw new Error('No local database available.');

  const { width, height } = await measure(file);
  const record: AssetRecord = {
    id: newId(),
    name: file.name,
    mime: file.type || 'image/png',
    blob: file,
    width,
    height,
    bytes: file.size,
    createdAt: Date.now(),
  };
  await db.assets.put(record);
  return record;
}

/**
 * Stores bytes the app made itself — line art out of the converter, rather than
 * a file someone chose. Same table, same ids; it just skips the file dialog.
 */
export async function putAssetBlob(blob: Blob, name: string, width: number, height: number) {
  const db = getDb();
  if (!db) throw new Error('No local database available.');
  const record: AssetRecord = {
    id: newId(),
    name,
    mime: blob.type || 'image/png',
    blob,
    width,
    height,
    bytes: blob.size,
    createdAt: Date.now(),
  };
  await db.assets.put(record);
  return record;
}

/** Stores a data URL as an asset. Used to migrate projects saved before this. */
export async function putAssetFromDataUrl(dataUrl: string, name = 'cover'): Promise<AssetRecord> {
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], name, { type: blob.type || 'image/png' });
  return putAsset(file);
}

export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  return getDb()?.assets.get(id);
}

/**
 * A URL the preview can use. Object URLs are cached per asset for the life of
 * the page: creating one per render would leak a handle on every keystroke.
 */
export async function getAssetUrl(id: string): Promise<string | null> {
  const cached = objectUrls.get(id);
  if (cached) return cached;
  const record = await getAsset(id);
  if (!record) return null;
  const url = URL.createObjectURL(record.blob);
  objectUrls.set(id, url);
  return url;
}

export function forgetAssetUrl(id: string): void {
  const url = objectUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(id);
  }
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });

/**
 * Resolves assets to data URLs for anything that leaves the browser — the
 * export request and the JSON backup. Object URLs are meaningless outside this
 * document, so those two paths need the bytes inline.
 */
export async function assetsAsDataUrls(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out: Record<string, string> = {};
  await Promise.all(
    unique.map(async (id) => {
      const record = await getAsset(id);
      if (record) out[id] = await blobToDataUrl(record.blob);
    }),
  );
  return out;
}

/** Writes assets back in from a restored backup, keeping their original ids. */
export async function importAssets(assets: Record<string, string>): Promise<void> {
  const db = getDb();
  if (!db) return;
  const entries = Object.entries(assets ?? {});
  for (const [id, dataUrl] of entries) {
    if (await db.assets.get(id)) continue;
    const blob = await (await fetch(dataUrl)).blob();
    const { width, height } = await measure(blob);
    await db.assets.put({
      id,
      name: id,
      mime: blob.type || 'image/png',
      blob,
      width,
      height,
      bytes: blob.size,
      createdAt: Date.now(),
    });
  }
}

/**
 * Copies an asset's bytes under a new id.
 *
 * This is what makes "each book keeps its own copy" true. A sticker placed
 * from the library, or from a template, gets its own bytes, so tidying the
 * library afterwards cannot reach back into a cover that has already been
 * made and leave a hole in it.
 */
export async function copyAsset(id: string, name?: string): Promise<AssetRecord | null> {
  const db = getDb();
  const source = await getAsset(id);
  if (!db || !source) return null;
  const record: AssetRecord = {
    ...source,
    id: newId(),
    name: name ?? source.name,
    createdAt: Date.now(),
  };
  await db.assets.put(record);
  return record;
}

/**
 * Deletes assets nothing refers to any more.
 *
 * The caller supplies every id still in use, and "in use" now means more than
 * the open book: the sticker library and the saved cover templates hold assets
 * too, and sweeping those would empty the library the next time anything was
 * tidied.
 */
export async function pruneAssets(usedIds: string[]): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const used = new Set(usedIds);
  const all = await db.assets.toArray();
  const orphans = all.filter((a) => !used.has(a.id));
  for (const orphan of orphans) {
    forgetAssetUrl(orphan.id);
    await db.assets.delete(orphan.id);
  }
  return orphans.length;
}
