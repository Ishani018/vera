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
  // A name that IS one of the old placeholders is not a name. Files saved
  // before this change have "Untitled" written into them as though somebody
  // had chosen it, and showing it back would be the bug rather than a record.
  if (given && !isPlaceholder(given)) return given;

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

/**
 * What to call one poem nobody titled.
 *
 * The same idea as `nameFor`, one level down. A poem almost always names
 * itself: its first line is the line people quote it by, and is how anyone
 * scanning a contents page will recognise it. The number is the last resort,
 * and it is still better than the same word on every row.
 */
export function poemName(poem: { title?: string; body?: string }, index: number): string {
  const given = poem.title?.trim();
  if (given) return given;
  // Only the first line, not the first thirty-two characters of the whole
  // poem: a poem's lines are deliberate, and running two of them together to
  // make a title reads as a mistake rather than as a quotation.
  const firstLine = (poem.body ?? '').split('\n').find((line) => line.trim().length > 0);
  const words = firstWords(firstLine ?? '');
  if (words) return words;
  return `Poem ${index + 1}`;
}

/** The same for a picture in a colouring book, which has no body to quote. */
export function pageName(page: { title?: string }, index: number): string {
  return page.title?.trim() || `Picture ${index + 1}`;
}

/** And for a plate in an illustrated section. */
export function plateName(
  plate: { title?: string; caption?: string },
  index: number,
): string {
  return plate.title?.trim() || firstWords(plate.caption ?? '') || `Plate ${index + 1}`;
}

/**
 * What to call a whole book nobody named.
 *
 * In order: the name on the book, the title of the collection inside it, what
 * the first thing in it is called, how many things are in it, and the date.
 *
 * The step through the first item matters more than it looks. Somebody who has
 * typed one poem and not yet thought about the book has told us what the book
 * is about; "Poetry book, 3 October" has not.
 */
export function bookName(
  book: {
    name?: string;
    kind?: string;
    meta?: { title?: string };
    contents?: Array<{ kind?: string; title?: string; body?: string }>;
    pages?: Array<{ title?: string }>;
  },
  now = Date.now(),
): string {
  const given = book.name?.trim();
  if (given && !isPlaceholder(given)) return given;
  const collection = book.meta?.title?.trim();
  if (collection && !isPlaceholder(collection)) return collection;

  const colouring = book.kind === 'coloring';
  const items = colouring ? (book.pages ?? []) : (book.contents ?? []).filter((one) => one.kind === 'poem');
  if (items.length) {
    const first = colouring
      ? (items[0] as { title?: string }).title?.trim()
      : poemNameIfTitled(items[0] as { title?: string; body?: string });
    if (first) return first;
    const what = colouring ? 'picture' : 'poem';
    return `${items.length} ${what}${items.length === 1 ? '' : 's'}`;
  }

  return `${colouring ? 'Colouring' : 'Poetry'} book, ${dayAndMonth(now, now)}`;
}

/** A poem's own name, but only if it actually has one to give. */
function poemNameIfTitled(poem: { title?: string; body?: string }): string | null {
  const given = poem.title?.trim();
  if (given) return given;
  const firstLine = (poem.body ?? '').split('\n').find((line) => line.trim().length > 0);
  return firstWords(firstLine ?? '');
}

/**
 * The default title a new collection is given.
 *
 * A date, because a date is at least different from the one above it, and
 * because it is obviously a placeholder in a way that "Untitled Collection" is
 * not — somebody who leaves it has left a date, not published a book called
 * Untitled.
 */
export function newCollectionTitle(now = Date.now()): string {
  return `Collection, ${dayAndMonth(now, now)}`;
}

/** And for a new colouring book. */
export function newColouringBookTitle(now = Date.now()): string {
  return `Colouring book, ${dayAndMonth(now, now)}`;
}

/**
 * The placeholders this app used to write into people's documents.
 *
 * They are still in files saved before the change, so a title that is one of
 * them is treated as no title at all rather than being shown back to somebody
 * as though they had chosen it.
 */
const PLACEHOLDERS = new Set([
  'untitled',
  'untitled collection',
  'untitled coloring book',
  'untitled colouring book',
  'untitled document',
  'untitled poem',
  'untitled sticker',
  'untitled plate',
]);

export function isPlaceholder(text: string): boolean {
  return PLACEHOLDERS.has(text.trim().toLowerCase());
}
