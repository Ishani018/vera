import { refusal } from './licence';
import { probeImage } from './image';

/**
 * What a starter pack must say about itself before it may be built.
 *
 * The rule behind every check here: **an image nobody can account for does not
 * ship.** Not "ships with a warning" — does not ship. Everything in a pack is
 * something somebody will put on a thing they sell, and the whole point of
 * downloading by hand is that a person looked at the licence. This makes that
 * looking permanent and checkable instead of remembered.
 *
 * Pure, so every rejection can be tested without a disk.
 */

export const LIMITS = {
  /** Per file. Room for a large scan, short of a file nobody meant to add. */
  bytes: 10 * 1024 * 1024,
  /** The long edge. Above this it is a photograph that wants resizing first. */
  pixels: 4000,
  /** Below this it is a thumbnail somebody grabbed by mistake. */
  leastPixels: 64,
  /** Per pack, so one pack cannot become the whole download. */
  itemsPerPack: 60,
  packBytes: 120 * 1024 * 1024,
} as const;

export type StarterItem = {
  file: string;
  name: string;
  tags: string[];
  sourceUrl: string;
  author: string;
  licence: string;
  downloadedOn: string;
};

export type StarterManifest = {
  pack: string;
  name: string;
  note?: string;
  items: StarterItem[];
};

/** A pack name that is safe as a folder, a tag and a file name all at once. */
export const PACK_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A date somebody can actually check against a download folder. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const REQUIRED: (keyof StarterItem)[] = [
  'file', 'name', 'tags', 'sourceUrl', 'author', 'licence', 'downloadedOn',
];

export type Problem = { where: string; why: string };

/**
 * Everything wrong with a manifest, rather than the first thing.
 *
 * All of them at once because fixing these is a sitting-down job: being told
 * about one missing licence, fixing it, and being told about the next is six
 * rounds of a thing that could have been one.
 */
export function checkManifest(raw: unknown, folder: string): Problem[] {
  const problems: Problem[] = [];
  const say = (where: string, why: string) => problems.push({ where, why });

  if (!raw || typeof raw !== 'object') {
    return [{ where: folder, why: 'the manifest is not an object' }];
  }
  const manifest = raw as Partial<StarterManifest>;

  if (typeof manifest.pack !== 'string' || !PACK_NAME.test(manifest.pack)) {
    say(folder, `pack must be lower-case words joined by hyphens, not ${JSON.stringify(manifest.pack)}`);
  } else if (manifest.pack !== folder) {
    say(folder, `pack says "${manifest.pack}" but the folder is called "${folder}"`);
  }
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
    say(folder, 'name is missing — this is what the pack is called on screen');
  }
  if (!Array.isArray(manifest.items) || manifest.items.length === 0) {
    say(folder, 'items is missing or empty');
    return problems;
  }
  if (manifest.items.length > LIMITS.itemsPerPack) {
    say(folder, `${manifest.items.length} items, and ${LIMITS.itemsPerPack} is the most a pack may hold`);
  }

  const seen = new Set<string>();
  manifest.items.forEach((item, n) => {
    const where = `${folder}/${(item as StarterItem)?.file ?? `item ${n + 1}`}`;
    if (!item || typeof item !== 'object') return say(where, 'not an object');

    for (const field of REQUIRED) {
      const value = (item as StarterItem)[field];
      const empty = field === 'tags' ? !Array.isArray(value) || value.length === 0 : !String(value ?? '').trim();
      if (empty) say(where, `${field} is missing`);
    }
    if (typeof item.file === 'string') {
      if (item.file.includes('/') || item.file.includes('\\') || item.file.startsWith('.')) {
        say(where, 'file must be a plain name inside the pack folder');
      }
      if (!/\.(png|jpe?g|webp)$/i.test(item.file)) say(where, 'file must be a .png, .jpg or .webp');
      if (seen.has(item.file)) say(where, 'this file is listed twice');
      seen.add(item.file);
    }
    if (typeof item.sourceUrl === 'string' && item.sourceUrl && !/^https?:\/\//i.test(item.sourceUrl)) {
      say(where, 'sourceUrl must be a link somebody else can open');
    }
    if (typeof item.downloadedOn === 'string' && item.downloadedOn && !DATE.test(item.downloadedOn)) {
      say(where, `downloadedOn must be a date like 2026-10-01, not "${item.downloadedOn}"`);
    }
    // The one that matters most, and the reason the rest of this exists.
    const no = typeof item.licence === 'string' ? refusal(item.licence) : 'licence is missing';
    if (no) say(where, `refused: ${no}`);
  });

  return problems;
}

/**
 * The manifest and the folder must agree, in both directions.
 *
 * A listed file that is not there is an obvious mistake. A file that is there
 * and is not listed is the dangerous one: it is a picture with no licence, no
 * source and no author, sitting in a folder whose whole purpose is that
 * everything in it has those three things.
 */
export function checkFolder(items: StarterItem[], onDisk: string[], folder: string): Problem[] {
  const problems: Problem[] = [];
  const listed = new Set(items.map((item) => item.file));
  for (const item of items) {
    if (!onDisk.includes(item.file)) {
      problems.push({ where: `${folder}/${item.file}`, why: 'listed in the manifest but not in the folder' });
    }
  }
  for (const file of onDisk) {
    if (!listed.has(file)) {
      problems.push({
        where: `${folder}/${file}`,
        why: 'in the folder but not in the manifest — no source, no author, no licence',
      });
    }
  }
  return problems;
}

/** What is wrong with one file's bytes, if anything. */
export function checkBytes(file: string, bytes: Uint8Array, folder: string): Problem[] {
  const where = `${folder}/${file}`;
  if (bytes.length > LIMITS.bytes) {
    return [{
      where,
      why: `${(bytes.length / 1024 / 1024).toFixed(1)} MB, and ${LIMITS.bytes / 1024 / 1024} MB is the limit`,
    }];
  }
  const probe = probeImage(bytes);
  if (!probe.ok) return [{ where, why: probe.why }];

  const long = Math.max(probe.width, probe.height);
  const short = Math.min(probe.width, probe.height);
  if (long > LIMITS.pixels) {
    return [{ where, why: `${probe.width} × ${probe.height} — resize it under ${LIMITS.pixels} px first` }];
  }
  if (short < LIMITS.leastPixels) {
    return [{ where, why: `${probe.width} × ${probe.height} is a thumbnail, not a sticker` }];
  }
  return [];
}
