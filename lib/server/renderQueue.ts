import 'server-only';

/**
 * How many Chromes may print at once, and how many may wait.
 *
 * Chrome is the only expensive thing this server does. A cover is a second or
 * two; a forty-page colouring interior is three quarters of a minute and
 * about 1.8GB, because the pictures arrive inline in the request and are held
 * as base64, as buffers and again inside the browser. Two of those at once fit
 * in a 4GB machine. Three do not, and the failure is not a slow queue but the
 * kernel killing the process — which loses the renders already in flight as
 * well as the one that caused it.
 *
 * So: two at a time, five more allowed to wait, and everyone after that told
 * so at once rather than left holding a connection that will time out.
 *
 * Admission is decided in middleware and the limit is enforced here, and the
 * two have to agree about a burst that arrives in the same millisecond. They
 * cannot agree by looking at `active` alone: eight simultaneous requests are
 * all still reading their bodies when the eighth is admitted, so none of them
 * has asked for a slot yet and the queue looks empty to every one of them.
 * `pending` is the fix — a request counts against the limit from the moment
 * it is let in, not from the moment it reaches Chrome.
 *
 * The state lives on `globalThis` on purpose. Middleware and route handlers
 * are compiled into separate bundles, so a module-level variable would give
 * each of them a queue of its own and neither would be the real one. There is
 * one Node process, so there is one global.
 *
 * One process, too, is the assumption: this counts renders on *this* machine.
 * With more than one machine behind the proxy each gets its own allowance,
 * which is the right behaviour — the limit exists to protect a machine's
 * memory, and every machine has its own.
 */

export const MAX_CONCURRENT = Number(process.env.RENDER_MAX_CONCURRENT ?? 2);
export const MAX_QUEUED = Number(process.env.RENDER_MAX_QUEUED ?? 5);

/** Long enough for the slowest honest render, short enough to not wedge. */
const QUEUE_TIMEOUT_MS = Number(process.env.RENDER_QUEUE_TIMEOUT_MS ?? 240_000);

/**
 * How long an admitted request may take to reach Chrome before it is assumed
 * never to be coming.
 *
 * It covers reading the body and parsing it — seconds, even for 268MB — and
 * it exists because some admitted requests never do reach Chrome: a malformed
 * body is a 400 from the route, and the route has no idea this file exists.
 * Without the sweep those would hold a place in the queue for ever, and the
 * machine would refuse work while doing none.
 */
const PENDING_TTL_MS = Number(process.env.RENDER_PENDING_TTL_MS ?? 60_000);

export class RenderBusyError extends Error {
  readonly status = 429;
  constructor(message: string) {
    super(message);
    this.name = 'RenderBusyError';
  }
}

type Waiter = { resolve: () => void; reject: (error: Error) => void; timer: NodeJS.Timeout };
type QueueState = { active: number; waiting: Waiter[]; pending: number[] };

const KEY = Symbol.for('isnaevy.renderQueue');
const store = globalThis as unknown as Record<symbol, QueueState | undefined>;
store[KEY] ??= { active: 0, waiting: [], pending: [] };
const queue = store[KEY]!;

const CAPACITY = MAX_CONCURRENT + MAX_QUEUED;

function sweepPending(now = Date.now()): void {
  while (queue.pending.length && now - queue.pending[0]! > PENDING_TTL_MS) queue.pending.shift();
}

/** Everything that counts against capacity right now. */
function taken(): number {
  sweepPending();
  return queue.active + queue.waiting.length + queue.pending.length;
}

/** What the health endpoint reports. */
export function renderQueueState(): {
  active: number;
  waiting: number;
  admitted: number;
  /** Everything counted against capacity, whichever of the three it is in. */
  inProgress: number;
  capacity: number;
  maxConcurrent: number;
  maxQueued: number;
  full: boolean;
} {
  const inProgress = taken();
  return {
    active: queue.active,
    waiting: queue.waiting.length,
    // Let in, not yet at Chrome: still reading or parsing a large body.
    admitted: queue.pending.length,
    inProgress,
    capacity: CAPACITY,
    maxConcurrent: MAX_CONCURRENT,
    maxQueued: MAX_QUEUED,
    full: inProgress >= CAPACITY,
  };
}

/**
 * Claims a place for a request that has only just arrived.
 *
 * Called by middleware, which is where a refusal can be turned into a 429
 * without the export routes knowing any of this exists. Returns false when
 * the machine is full, and the caller should refuse; true when the request
 * may go on to the handler, having already been counted.
 */
export function admitRender(): boolean {
  if (taken() >= CAPACITY) return false;
  queue.pending.push(Date.now());
  return true;
}

/**
 * Waits for a renderer, and hands back the way to give it up.
 *
 * The release is idempotent: it is wired to the browser's `disconnected`
 * event as well as to the failure paths, and a crash and a clean close would
 * otherwise both fire it.
 */
export async function acquireRenderSlot(): Promise<() => void> {
  // This request was counted when it was admitted; it is about to be counted
  // as active or waiting instead. Oldest first, because they are timestamps
  // and any one of them will do — they are a count, not a queue of identities.
  sweepPending();
  queue.pending.shift();

  if (queue.active < MAX_CONCURRENT) {
    queue.active += 1;
    return releaser();
  }

  // Past the queue as well. Only reachable by a request that never went
  // through middleware, since admission already refused anyone past capacity.
  if (queue.waiting.length >= MAX_QUEUED) {
    throw new RenderBusyError(
      'Too many exports are being rendered at once. Try again in a minute.',
    );
  }

  await new Promise<void>((resolve, reject) => {
    const waiter: Waiter = {
      resolve,
      reject,
      timer: setTimeout(() => {
        const at = queue.waiting.indexOf(waiter);
        if (at >= 0) queue.waiting.splice(at, 1);
        reject(new RenderBusyError('Waited too long for a free renderer. Try again.'));
      }, QUEUE_TIMEOUT_MS),
    };
    queue.waiting.push(waiter);
  });

  return releaser();
}

function releaser(): () => void {
  let given = false;
  return () => {
    if (given) return;
    given = true;
    const next = queue.waiting.shift();
    if (next) {
      clearTimeout(next.timer);
      // The slot passes straight to the next in line rather than being
      // returned and taken again, so `active` never dips and lets a third
      // render in through the gap.
      next.resolve();
      return;
    }
    queue.active = Math.max(0, queue.active - 1);
  };
}
