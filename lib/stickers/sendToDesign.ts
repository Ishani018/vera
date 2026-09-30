'use client';

import { putAssetBlob } from '../assets';
import { safeOf, trimOf } from '../board';
import { getDb } from '../db';
import { id } from '../defaults';
import { boardFor, presetById } from '../presets';
import { startDesign } from '../designs';
import type { CoverSticker, StandaloneDesign } from '../types';

/**
 * A finished sticker, onto a board of its own.
 *
 * The four boards offered here are the ones a sticker is actually for: a post
 * announcing it, a pin that keeps being found months later, and the two printed
 * things a seller puts in a parcel.
 *
 * **The picture is copied, not referenced.** The design gets its own asset, so
 * deleting the sticker afterwards — or emptying the trash, or re-tracing it at
 * a different threshold — cannot reach into a design that was finished weeks
 * ago and change or empty it. That costs a copy of the bytes, and it is worth
 * it: the alternative is a design that quietly breaks long after the decision
 * that broke it.
 */

/** The boards a sticker is worth sending to, in the order they are offered. */
export const SEND_TO = [
  { presetId: 'instagram-post', label: 'Instagram post', note: '1080 × 1080 px' },
  { presetId: 'pinterest-pin', label: 'Pinterest pin', note: '1000 × 1500 px' },
  { presetId: 'postcard-a6', label: 'Postcard', note: '4.25 × 6 in' },
  { presetId: 'bookmark', label: 'Bookmark', note: '2 × 6 in' },
] as const;

/**
 * How much of the safe area the sticker fills.
 *
 * Not all of it. A sticker touching the safe margin on two sides reads as a
 * mistake rather than as a choice, and the first thing anyone does with a
 * design is move things anyway — so it starts somewhere sensible to adjust
 * from rather than somewhere final.
 */
export const FILL = 0.82;

/** Where a picture of this shape sits, centred and contained, on this board. */
export function placeCentred(
  area: { x: number; y: number; width: number; height: number },
  naturalWidth: number,
  naturalHeight: number,
  fill = FILL,
): { x: number; y: number; width: number; height: number } {
  const ratio = naturalWidth / Math.max(1, naturalHeight);
  const roomWidth = area.width * fill;
  const roomHeight = area.height * fill;
  // Contain, not cover: a sticker cropped by its own board is not a sticker.
  const width = Math.min(roomWidth, roomHeight * ratio);
  const height = width / ratio;
  return {
    x: area.x + (area.width - width) / 2,
    y: area.y + (area.height - height) / 2,
    width,
    height,
  };
}

/** The area a sticker is centred in: the safe box where there is one. */
export function roomOn(presetId: string) {
  const preset = presetById(presetId);
  if (!preset) return null;
  const board = boardFor(preset);
  return safeOf(board)[0]?.rect ?? trimOf(board);
}

export type SentDesign = { design: StandaloneDesign; assetId: string };

export async function sendStickerToDesign({
  presetId,
  blob,
  width,
  height,
  name,
}: {
  presetId: string;
  blob: Blob;
  width: number;
  height: number;
  name: string;
}): Promise<SentDesign | null> {
  const db = getDb();
  const room = roomOn(presetId);
  if (!db || !room) return null;

  // The design's own copy of the picture, made before anything else, so a
  // failure here leaves no half-built design behind.
  const asset = await putAssetBlob(blob, `${name || 'sticker'}.png`, width, height);

  const design = await startDesign(presetId);
  if (!design) return null;

  const placed: CoverSticker = {
    id: id('stk'),
    name: name?.trim() || 'Sticker',
    assetId: asset.id,
    naturalWidth: width,
    naturalHeight: height,
    ...placeCentred(room, width, height),
    rotate: 0,
    cornerRadius: 0,
    border: null,
    shadow: false,
    arc: 0,
  };

  const next: StandaloneDesign = {
    ...design,
    name: name?.trim() ? name.trim() : design.name,
    cover: { ...design.cover, stickers: [placed] },
    updatedAt: Date.now(),
  };
  await db.designs.put(next);
  return { design: next, assetId: asset.id };
}
