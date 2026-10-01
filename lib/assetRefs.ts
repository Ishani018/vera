import { illustrationsOf } from './contents';
import { matterArtwork } from './render/coloringLayout';
import type { AnyProject, CoverSpec, CoverTemplate, Design, LibrarySticker } from './types';

/**
 * Which pictures a thing depends on.
 *
 * Needed by the trash, for two questions it cannot answer without it: how much
 * room the trash is actually taking, and which bytes are safe to let go of when
 * something is deleted for ever. Both are about references rather than about
 * any one book.
 *
 * `lib/exportClient.ts` has its own walk of a project for the same purpose —
 * gathering what a backup must carry. This is not that one refactored, because
 * that file is part of the export path and the export path is not to be
 * touched. The two must agree, so the tests check them against each other.
 */

/** Everything a cover, a board or a design places. */
export function coverAssetIds(cover: CoverSpec | undefined): string[] {
  if (!cover) return [];
  return [
    cover.frontImage?.assetId,
    ...(cover.stickers ?? []).map((sticker) => sticker.assetId),
  ].filter((id): id is string => Boolean(id));
}

export function designAssets(design: Design): string[] {
  return coverAssetIds(design.cover);
}

/**
 * Every picture a book depends on: its cover, its launch kit, and its insides.
 *
 * A colouring book counts both the line art and the photograph it came from,
 * because a page that has not been converted yet falls back to the original
 * and a page that has still keeps it, so that the settings stay re-appliable.
 */
export function projectAssets(project: AnyProject): string[] {
  const inside =
    project.kind === 'coloring'
      ? [...project.pages, ...matterArtwork(project)].flatMap((page) => [
          page.lineArtAssetId,
          page.sourceAssetId,
        ])
      : illustrationsOf(project).map((plate) => plate.assetId);

  return [
    ...coverAssetIds(project.cover),
    ...(project.designs ?? []).flatMap(designAssets),
    ...inside,
  ].filter((id): id is string => Boolean(id));
}

export function stickerAssets(sticker: LibrarySticker): string[] {
  return sticker.assetId ? [sticker.assetId] : [];
}

export function templateAssets(template: CoverTemplate): string[] {
  return coverAssetIds(template.cover);
}
