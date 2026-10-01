/**
 * What "deleted" means, in one place.
 *
 * Everything this app makes lives in one browser and nowhere else. There is no
 * server copy, no account, and nobody to ask for a book back — so "Delete"
 * used to mean the work was gone the moment the dialog was confirmed, and the
 * only defence was a backup file the author had remembered to save.
 *
 * So deleting marks rather than removes. A deleted thing keeps its row, keeps
 * its pictures, and disappears from every list; it can be found again in the
 * trash for thirty days, after which it goes for real.
 *
 * The rule that makes that safe is narrow and absolute: **one place decides
 * what deleted means, and every list asks it.** A read path that forgets is
 * not a cosmetic bug — it is a deleted book reappearing in a list, or, worse,
 * being written into a backup its author believes is clean.
 *
 * Nothing here touches the database, so everything here can be tested without
 * a browser, and so the modules that do touch it can depend on this without
 * depending on each other.
 */

/** How long something sits in the trash before it is thrown away for real. */
export const TRASH_DAYS = 30;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type Deletable = { deletedAt?: number };

export const isDeleted = (item: Deletable | null | undefined): boolean =>
  typeof item?.deletedAt === 'number';

/** Everything not in the trash. What every list wants. */
export const alive = <T extends Deletable>(items: T[]): T[] => items.filter((i) => !isDeleted(i));

/** Everything in it. What the trash screen wants. */
export const binned = <T extends Deletable>(items: T[]): T[] => items.filter(isDeleted);

/** Past its thirty days, and due to be thrown away. */
export const expired = (item: Deletable, now = Date.now()): boolean =>
  isDeleted(item) && now - item.deletedAt! >= TRASH_DAYS * DAY_MS;

/** Whole days left before it goes, floored at zero. Zero means "today". */
export function daysLeft(item: Deletable, now = Date.now()): number {
  if (!isDeleted(item)) return TRASH_DAYS;
  return Math.max(0, Math.ceil((item.deletedAt! + TRASH_DAYS * DAY_MS - now) / DAY_MS));
}

/** The same record without the mark, for putting one back. */
export function withoutMark<T extends Deletable>(row: T): T {
  const next = { ...row };
  delete next.deletedAt;
  return next;
}

/** A size to put in front of someone, rather than a number of bytes. */
export function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
