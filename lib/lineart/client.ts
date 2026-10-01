'use client';

import type { LineArtSettings, SourceKind } from '../types';
import type {
  InkRequest,
  InkResponse,
  LineArtRequest,
  LineArtResponse,
  StickerOptions,
  StickerRequest,
  StickerResponse,
} from './worker';

/**
 * One worker, shared, started on first use.
 *
 * Requests are numbered because sliding a slider fires them faster than they
 * complete: without the number the answer to an old position would arrive after
 * the answer to the new one and the preview would settle on the wrong picture.
 */
let worker: Worker | null = null;
let nextId = 1;
type Waiting = { resolve: (r: never) => void; reject: (e: Error) => void };
const pending = new Map<number, Waiting>();

export type LineArtResult = {
  blob: Blob;
  width: number;
  height: number;
  source: SourceKind;
  guessed: boolean;
  upscaled: number;
  sourceLongEdge: number;
};

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url));
  worker.onmessage = (event: MessageEvent<LineArtResponse | StickerResponse | InkResponse>) => {
    const waiting = pending.get(event.data.id);
    if (!waiting) return;
    pending.delete(event.data.id);
    if (event.data.ok) waiting.resolve(event.data as never);
    else waiting.reject(new Error(event.data.error));
  };
  worker.onerror = () => {
    for (const waiting of pending.values()) waiting.reject(new Error('The converter stopped.'));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function renderLineArt(
  blob: Blob,
  settings: LineArtSettings,
  options: { source?: SourceKind; targetLongEdge?: number; cacheKey?: string } = {},
): Promise<LineArtResult> {
  const id = nextId++;
  const request: LineArtRequest = { id, blob, settings, ...options };
  return new Promise<LineArtResult>((resolve, reject) => {
    pending.set(id, { resolve: resolve as Waiting['resolve'], reject });
    ensureWorker().postMessage(request);
  });
}

export type StickerResult = {
  blob: Blob;
  width: number;
  height: number;
  transparent: boolean;
  sourceLongEdge: number;
  /** The margin the outline needed, in pixels of this picture. */
  pad: number;
};

/**
 * One finished sticker, made off the main thread.
 *
 * The same worker as the line art, and the same numbering: dragging the
 * tolerance slider fires a request every settle, and without the number the
 * answer to an old position would arrive after the answer to the new one and
 * the preview would keep the wrong picture.
 */
export function renderSticker(
  blob: Blob,
  settings: LineArtSettings,
  options: StickerOptions,
): Promise<StickerResult> {
  const id = nextId++;
  const request: StickerRequest = { id, job: 'sticker', blob, settings, options };
  return new Promise<StickerResult>((resolve, reject) => {
    pending.set(id, { resolve: resolve as Waiting['resolve'], reject });
    ensureWorker().postMessage(request);
  });
}

export type InkResult = { width: number; height: number; ink: Uint8ClampedArray };

/**
 * The traced lines as numbers, for the colouring tools to fill against.
 *
 * Asked for once per trace rather than once per fill: a fill itself is a walk
 * over an array and is quick enough on the main thread that sending it to a
 * worker would add more delay than it saved.
 */
export function traceInk(
  blob: Blob,
  settings: LineArtSettings,
  mode: 'convert' | 'cleanup' | 'asis',
  longEdge: number,
  frame?: InkRequest['frame'],
): Promise<InkResult> {
  const id = nextId++;
  const request: InkRequest = { id, job: 'ink', blob, settings, mode, longEdge, frame };
  return new Promise<InkResult>((resolve, reject) => {
    pending.set(id, { resolve: resolve as Waiting['resolve'], reject });
    ensureWorker().postMessage(request);
  });
}

/** True while anything is still being converted, for a spinner that tells the truth. */
export const converting = () => pending.size > 0;
