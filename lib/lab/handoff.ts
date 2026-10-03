'use client';

import { saveFileToLibrary } from '../cover/library';
import { useColoring } from '../coloring/store';
import type { LookId } from './looks';

/**
 * Getting a drawing out of the Lab and into the rest of the app.
 *
 * All three of these go through flows that already exist, and none of them
 * changes a schema, a storage key or a table. That is deliberate and it is also
 * the cheapest way to be sure a drawing made here behaves exactly like one made
 * anywhere else: it IS one.
 */

/** A blob as a file the existing importers will accept. */
function asFile(blob: Blob, name: string): File {
  return new File([blob], `${name}.png`, { type: 'image/png' });
}

/**
 * Into My stickers, tagged.
 *
 * Two tags: `lab`, so everything made here can be found at once, and the look,
 * so somebody who liked what Bold did to one picture can find the others. Tags
 * rather than a column, because the stickers table already has tags and already
 * searches them — this needs no schema change at all.
 */
export async function saveToMyStickers(blob: Blob, name: string, look: LookId) {
  return saveFileToLibrary(asFile(blob, name), ['lab', look]);
}

/**
 * Into the Sticker Studio.
 *
 * By way of the library, which is how the studio already receives things, so
 * the drawing arrives as an ordinary sticker rather than as a special case the
 * studio has to know about.
 */
export async function sendToStickerStudio(blob: Blob, name: string, look: LookId) {
  const saved = await saveToMyStickers(blob, name, look);
  return saved;
}

/**
 * Into the colouring book that is already open.
 *
 * `addFiles` is the colouring editor's own importer, and it works on whichever
 * book that editor currently has open — which it reads from the key it already
 * uses. Nothing new is stored and no key is added; this is the same call the
 * editor's own drop zone makes.
 *
 * It returns false when there is no book open, because adding a page to nothing
 * is not a thing that can succeed quietly.
 */
export async function addToColouringBook(blob: Blob, name: string): Promise<boolean> {
  const store = useColoring.getState();
  if (!store.book) await store.load();
  if (!useColoring.getState().book) return false;
  const added = await useColoring.getState().addFiles([asFile(blob, name)]);
  return added.length > 0;
}
