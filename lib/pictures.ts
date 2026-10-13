import { illustrationsOf } from './contents';
import { isReady, pictureAssetId, usesLineArt } from './coloring/picture';
import type { AnyProject } from './types';

/** A picture already inside a book, offered as something to put on a board. */
export type BookPicture = {
  key: string;
  name: string;
  assetId: string;
  width: number;
  height: number;
};

/**
 * Everything in a book that can go on a board.
 *
 * For a colouring book that is the line art — what actually prints — and for a
 * book of verse it is the plates. Written once here because a design that
 * belongs to no book can still borrow from one, and borrowing should not mean
 * knowing which kind of book it borrowed from.
 */
export function picturesOf(project: AnyProject): BookPicture[] {
  if (project.kind === 'coloring') {
    const asIs = !usesLineArt(project);
    return project.pages
      .filter((page) => isReady(project, page))
      .map((page) => ({
        key: page.id,
        name: page.title || 'Picture',
        assetId: pictureAssetId(project, page)!,
        // As uploaded, nothing was enlarged.
        width: Math.round(page.naturalWidth * (asIs ? 1 : page.upscaled || 1)),
        height: Math.round(page.naturalHeight * (asIs ? 1 : page.upscaled || 1)),
      }));
  }
  return illustrationsOf(project)
    .filter((plate) => plate.assetId)
    .map((plate) => ({
      key: plate.id,
      name: plate.title || plate.caption || 'Illustration',
      assetId: plate.assetId!,
      width: plate.naturalWidth,
      height: plate.naturalHeight,
    }));
}
