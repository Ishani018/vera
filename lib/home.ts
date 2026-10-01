import type { LibraryEntry } from './projects';
import { presetById } from './presets';

/**
 * How the front page sorts, searches and groups what you have made.
 *
 * Pure, so every rule here is checked without a browser: which chip a card
 * belongs under, what the badge on it says, which cards a search matches, and —
 * the one that deletes things — which designs count as empty.
 */

export type HomeFilter = 'all' | 'books' | 'covers' | 'posts' | 'print' | 'stickers';

export const HOME_FILTERS: { id: HomeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'books', label: 'Books' },
  { id: 'covers', label: 'Covers' },
  { id: 'posts', label: 'Posts' },
  { id: 'print', label: 'Print' },
  { id: 'stickers', label: 'Stickers' },
];

/** Whether an entry belongs under a chip. One card can be under two. */
export function inFilter(entry: LibraryEntry, filter: HomeFilter): boolean {
  if (filter === 'all') return true;
  const book = entry.kind !== 'design';
  switch (filter) {
    case 'books':
      return book;
    // A book's cover is not a separate thing here — it is the front of the
    // book, and the card already shows it. So "Covers" is the books whose
    // cover has something on it, which is the only honest reading of the data.
    case 'covers':
      return book && hasSomething(entry);
    case 'posts':
      return !book && presetById(entry.presetId ?? '')?.kind === 'screen';
    case 'print':
      return !book && presetById(entry.presetId ?? '')?.kind === 'print';
    case 'stickers':
      return entry.stickers > 0;
    default:
      return true;
  }
}

export const filterEntries = (entries: LibraryEntry[], filter: HomeFilter): LibraryEntry[] =>
  entries.filter((entry) => inFilter(entry, filter));

/** Anything at all on the board — a picture, a sticker or a line of type. */
export const hasSomething = (entry: LibraryEntry): boolean => entry.thumb.items.length > 0;

/**
 * The short word in the corner of a card.
 *
 * The line under the name already says the long version ("Instagram post ·
 * 1080 × 1080 px"); this is for telling two cards apart at a glance across a
 * grid, so it is one or two words and never wraps.
 */
export function badgeFor(entry: LibraryEntry): string {
  if (entry.kind === 'coloring') return 'Colouring';
  if (entry.kind !== 'design') return 'Book';
  const preset = presetById(entry.presetId ?? '');
  if (!preset) return 'Design';
  return preset.name.replace(/^Instagram /, 'IG ');
}

/** Everything a search of your own work ought to look at. */
export function searchEntries(entries: LibraryEntry[], query: string): LibraryEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) =>
    [entry.name, entry.type, badgeFor(entry)].join(' ').toLowerCase().includes(needle),
  );
}

/**
 * A design with nothing on it.
 *
 * Only designs: a book with no poems in it yet is a book somebody is about to
 * write, not litter. And only what the card itself shows — if the thumbnail is
 * blank, the board is blank, and the two can never disagree because they are
 * the same list of items.
 */
export const isEmptyDesign = (entry: LibraryEntry): boolean =>
  entry.kind === 'design' && !hasSomething(entry);

export const emptyDesigns = (entries: LibraryEntry[]): LibraryEntry[] =>
  entries.filter(isEmptyDesign);

/** "3 empty designs" — or the one, named, because naming one is kinder. */
export function cleanUpLine(empties: LibraryEntry[]): string {
  if (empties.length === 0) return 'Nothing empty to clear up.';
  if (empties.length === 1) {
    return `${empties[0].name || 'One design'} has nothing on it. It goes to the trash.`;
  }
  return `${empties.length} designs have nothing on them. They go to the trash.`;
}
