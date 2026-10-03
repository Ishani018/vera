import type { LibraryEntry } from '../projects';

/**
 * What to call a design nobody has named.
 *
 * "Untitled" is the worst thing a list of your own work can say. It is the same
 * word on every row, it sorts together, and it tells you nothing about which of
 * the four is the one you were working on last night.
 *
 * A design almost always names itself: the first words on it are usually the
 * title somebody typed, and a sheet with no words on it still has stickers.
 * Failing both, the date is at least different from the row above it.
 *
 * Pure, and out here rather than in the component, so the rules can be tested
 * against the awkward cases — a board of one punctuation mark, a heading of
 * forty words, a design made at midnight — rather than eyeballed.
 */

/** Longer than this and it stops being a name and starts being a paragraph. */
const MOST = 32;

/** A date that reads like a person wrote it: "3 October", or "today". */
function dayAndMonth(at: number, now: number): string {
  const made = new Date(at);
  const today = new Date(now);
  const sameDay =
    made.getFullYear() === today.getFullYear() &&
    made.getMonth() === today.getMonth() &&
    made.getDate() === today.getDate();
  if (sameDay) return 'today';
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${made.getDate()} ${months[made.getMonth()]}`;
}

/**
 * The first words actually written on a board.
 *
 * Trimmed, collapsed, and cut at a word boundary rather than mid-syllable. A
 * run of punctuation is not a name: somebody typing an em dash into a text box
 * has not titled anything, and "—" in a list is worse than a date.
 */
export function firstWords(text: string): string | null {
  const tidy = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!/[\p{L}\p{N}]/u.test(tidy)) return null;
  if (tidy.length <= MOST) return tidy;
  const cut = tidy.slice(0, MOST);
  const space = cut.lastIndexOf(' ');
  return `${(space > MOST / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * What this entry should be called in a list.
 *
 * In order: the name somebody gave it; the first words on it; what it is made
 * of; and only then the date.
 */
export function nameFor(entry: LibraryEntry, now = Date.now()): string {
  const given = entry.name?.trim();
  if (given) return given;

  for (const item of entry.thumb?.items ?? []) {
    if (item.kind !== 'text') continue;
    const words = firstWords(item.text);
    if (words) return words;
  }

  if (entry.stickers > 0) {
    return entry.stickers === 1 ? 'One sticker' : `${entry.stickers} stickers`;
  }

  return `Draft, ${dayAndMonth(entry.at, now)}`;
}
