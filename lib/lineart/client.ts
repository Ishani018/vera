'use client';

import type { LineArtSettings, SourceKind } from '../types';
import type { LineArtRequest, LineArtResponse } from './worker';

/**
 * One worker, shared, started on first use.
 *
 * Requests are numbered because sliding a slider fires them faster than they
 * complete: without the number the answer to an old position would arrive after
 * the answer to the new one and the preview would settle on the wrong picture.
 */
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: LineArtResult) => void; reject: (e: Error) => void }>();

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
  worker.onmessage = (event: MessageEvent<LineArtResponse>) => {
    const waiting = pending.get(event.data.id);
    if (!waiting) return;
    pending.delete(event.data.id);
    if (event.data.ok) waiting.resolve(event.data);
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
  options: { source?: SourceKind; targetLongEdge?: number } = {},
): Promise<LineArtResult> {
  const id = nextId++;
  const request: LineArtRequest = { id, blob, settings, ...options };
  return new Promise<LineArtResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage(request);
  });
}

/** True while anything is still being converted, for a spinner that tells the truth. */
export const converting = () => pending.size > 0;
