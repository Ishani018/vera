import type { LibrarySticker } from '../types';
import { alive } from '../deleted';

/**
 * The credits for everything installed from a pack.
 *
 * CC0 asks for no attribution — that is the whole point of only accepting it.
 * This exists for the other reasons credit matters: so you can thank somebody,
 * so you can check a claim you relied on, and so you can find and remove one
 * item if its licence turns out to have been wrong. A list you cannot produce
 * is a list you cannot act on.
 *
 * Pure, so the file somebody downloads can be checked without a browser.
 */

export type Credit = {
  id: string;
  name: string;
  pack: string;
  file: string;
  author: string;
  licence: string;
  sourceUrl: string;
  downloadedOn: string;
};

/** Every living sticker that came from a pack, in a stable order. */
export function creditsOf(stickers: LibrarySticker[]): Credit[] {
  return alive(stickers)
    .filter((sticker) => sticker.source)
    .map((sticker) => ({
      id: sticker.id,
      name: sticker.name,
      pack: sticker.source!.pack,
      file: sticker.source!.file,
      author: sticker.source!.author,
      licence: sticker.source!.licence,
      sourceUrl: sticker.source!.sourceUrl,
      downloadedOn: sticker.source!.downloadedOn,
    }))
    .sort((a, b) => a.pack.localeCompare(b.pack) || a.file.localeCompare(b.file));
}

/** The packs represented, with how many of each. */
export function packCounts(credits: Credit[]): { pack: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const credit of credits) counts.set(credit.pack, (counts.get(credit.pack) ?? 0) + 1);
  return [...counts.entries()]
    .map(([pack, count]) => ({ pack, count }))
    .sort((a, b) => a.pack.localeCompare(b.pack));
}

/** Matching on everything a person might remember about an item. */
export function searchCredits(credits: Credit[], query: string, pack: string | null): Credit[] {
  const needle = query.trim().toLowerCase();
  return credits.filter((credit) => {
    if (pack && credit.pack !== pack) return false;
    if (!needle) return true;
    return [credit.name, credit.pack, credit.file, credit.author, credit.licence, credit.sourceUrl]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });
}

/**
 * A plain-text credits file, grouped by pack.
 *
 * Plain text rather than anything cleverer because of where it ends up: pasted
 * into a shop listing, a book's back matter, or an email. Those places take
 * text and nothing else.
 */
export function creditsText(credits: Credit[], when = new Date()): string {
  const lines: string[] = [
    'Sources and licences',
    '',
    `Listed ${when.toISOString().slice(0, 10)}. ${credits.length} ${credits.length === 1 ? 'item' : 'items'}.`,
    '',
    'Everything here is public domain or CC0, so none of it requires attribution.',
    'This list is for checking a claim, thanking somebody, or finding one item again.',
    '',
  ];
  for (const { pack, count } of packCounts(credits)) {
    lines.push(`${pack} (${count})`, '-'.repeat(pack.length + String(count).length + 3), '');
    for (const credit of credits.filter((c) => c.pack === pack)) {
      lines.push(
        `  ${credit.name}`,
        `    file:     ${credit.file}`,
        `    author:   ${credit.author}`,
        `    licence:  ${credit.licence}`,
        `    source:   ${credit.sourceUrl}`,
        `    added:    ${credit.downloadedOn}`,
        '',
      );
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** One installed pack, as the library screen shows it. */
export type PackSummary = {
  pack: string;
  count: number;
  /** Every distinct licence inside it. One, normally — but not guaranteed. */
  licences: string[];
  /** Every distinct place it came from. */
  sources: string[];
  authors: string[];
  /** The ids of the first few, for a collage. */
  ids: string[];
  /** The newest download date in it, as written in the manifest. */
  added: string;
};

/**
 * The installed packs, summarised.
 *
 * A pack is summarised from the stickers rather than stored anywhere, for the
 * same reason a pack is a tag: nothing here needs a table, and a table would be
 * a second account of the truth that could disagree with the first.
 */
export function packSummaries(credits: Credit[]): PackSummary[] {
  const byPack = new Map<string, Credit[]>();
  for (const credit of credits) {
    const list = byPack.get(credit.pack);
    if (list) list.push(credit);
    else byPack.set(credit.pack, [credit]);
  }
  const distinct = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
  return [...byPack.entries()]
    .map(([pack, items]) => ({
      pack,
      count: items.length,
      licences: distinct(items.map((item) => item.licence)),
      sources: distinct(items.map((item) => item.sourceUrl)),
      authors: distinct(items.map((item) => item.author)),
      ids: items.slice(0, 4).map((item) => item.id),
      added: items.map((item) => item.downloadedOn).sort().at(-1) ?? '',
    }))
    .sort((a, b) => a.pack.localeCompare(b.pack));
}
