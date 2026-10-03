'use client';

import type { ClassicSettings } from '../lineart/xdog';
import type { ColouringSettings } from '../lineart/colouring';
import type { InkedSettings } from '../lineart/inked';
import type { LogoSettings } from './logo';
import type { LookId } from './looks';
import type { LabRequest, LabResponse } from './worker';

/**
 * One worker, started the first time the Lab asks for anything.
 *
 * Requests are numbered for the reason the line-art client numbers its own:
 * dragging a slider fires them faster than they finish, and without the number
 * the answer to an old position arrives after the answer to the new one and the
 * canvas settles on a picture nobody asked for.
 *
 * Here that is worse than it is elsewhere, because a full-size run is seconds
 * rather than milliseconds. So there is also cancelling: asking for a new
 * preview abandons the one in flight rather than queueing behind it. The worker
 * cannot be interrupted mid-run — it is one long synchronous pass — so what is
 * abandoned is the ANSWER, not the work. Dropping it on arrival is what keeps
 * the canvas honest; the engine being fast enough that it rarely matters is
 * Stage 2's business and not this file's.
 */
let worker: Worker | null = null;
let nextId = 1;
type Waiting = {
  resolve: (r: Extract<LabResponse, { ok: true }>) => void;
  reject: (e: Error) => void;
};
const pending = new Map<number, Waiting>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url));
  worker.onmessage = (event: MessageEvent<LabResponse>) => {
    const waiting = pending.get(event.data.id);
    if (!waiting) return;
    pending.delete(event.data.id);
    if (event.data.ok) waiting.resolve(event.data);
    else waiting.reject(new Error(event.data.error));
  };
  worker.onerror = () => {
    for (const one of pending.values()) one.reject(new Error('The Lab stopped. Reload the page.'));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export type LabResult = Extract<LabResponse, { ok: true }>;

export type LabJob = {
  blob: Blob;
  look: LookId;
  classic: ClassicSettings;
  inked: InkedSettings;
  colouring: ColouringSettings;
  logo: LogoSettings;
  longEdge: number;
  removeBackground: boolean;
  wantSvg?: boolean;
};

export function render(job: LabJob): { done: Promise<LabResult>; cancel: () => void } {
  const id = nextId++;
  const request: LabRequest = { id, ...job };
  const done = new Promise<LabResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage(request);
  });
  return {
    done,
    cancel: () => {
      // Forgotten, not stopped. The promise is left unsettled on purpose: the
      // caller has already moved on, and rejecting would make every cancelled
      // slider position look like a failure.
      pending.delete(id);
    },
  };
}

/** True while anything is still running, for a chip that tells the truth. */
export const working = () => pending.size > 0;
