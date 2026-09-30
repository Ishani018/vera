import { NextResponse, type NextRequest } from 'next/server';
import {
  MAX_BODY_BYTES,
  MAX_BODY_MB,
  MIN_BODY_BYTES,
  PER_WINDOW,
  WINDOW_MS,
} from '@/lib/server/exportLimits';
import { admitRender, renderQueueState } from '@/lib/server/renderQueue';

/**
 * What stands between a public demo and somebody else's bill.
 *
 * There are no accounts, so there is no user to meter — an address is the only
 * handle there is, and it is a poor one. It is enough for this: the demo is
 * for KDP sellers trying the thing out, and nobody trying something out needs
 * six exports in ten minutes. Anyone determined can change address, which is
 * why the render queue behind this is a limit on the machine rather than on
 * the person. This layer makes casual abuse expensive and accidental loops
 * harmless; the queue is what stops the machine dying either way.
 *
 * Three refusals, cheapest first:
 *
 *   1. A body too large to be a book — rejected on the header, before a byte
 *      of it is read.
 *   2. Too many exports from one address — 429 with a Retry-After.
 *   3. Every renderer busy and the queue full — 429, immediately, rather than
 *      holding the connection open for four minutes to say the same thing.
 *
 * Node runtime, not Edge, because it shares the render queue's state with the
 * route handlers, and the Edge sandbox has a global scope of its own.
 *
 * Nothing here touches the export routes: they answer exactly as they did, to
 * the requests that reach them.
 */

export const config = {
  runtime: 'nodejs',
  matcher: ['/api/export/:path*'],
};

type Hits = { times: number[] };
const KEY = Symbol.for('isnaevy.exportRate');
const store = globalThis as unknown as Record<symbol, Map<string, Hits> | undefined>;
store[KEY] ??= new Map<string, Hits>();
const seen = store[KEY]!;

/**
 * Who is asking, or null when it is this machine asking itself.
 *
 * Fly sets `Fly-Client-IP` and it is the only one of these the app's own proxy
 * writes, so it is trusted first; `x-forwarded-for` can be set by anyone
 * talking to the machine directly and is a hint, not a fact.
 *
 * Null for a loopback address, and for a request with no forwarding header at
 * all. On a deployed machine neither can come from the public: every public
 * request arrives through Fly's proxy, which sets `Fly-Client-IP` to the real
 * client. So null is somebody on the machine itself — a developer, or
 * `npm run golden`, which posts two exports per run and was locking itself
 * out of its own rate limiter on the third run.
 *
 * Note that `next start` supplies `x-forwarded-for: ::1` for a local request
 * of its own accord, so "no header" alone never fires; the loopback check is
 * the one that does the work.
 *
 * These requests skip the per-address limit and nothing else. The body cap
 * still applies to them and they still take a place in the render queue,
 * because those protect the machine, and this one protects the public from
 * each other.
 */
const LOOPBACK = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1', 'localhost']);

function addressOf(request: NextRequest): string | null {
  const fly = request.headers.get('fly-client-ip');
  const claimed =
    fly?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    '';
  if (!claimed || LOOPBACK.has(claimed)) return null;
  return claimed;
}

/** Drops anything older than the window, so the map cannot grow without end. */
function sweep(now: number): void {
  for (const [address, hits] of seen) {
    hits.times = hits.times.filter((at) => now - at < WINDOW_MS);
    if (hits.times.length === 0) seen.delete(address);
  }
}

let lastSweep = 0;

function tooMany(address: string, now: number): number | null {
  if (now - lastSweep > WINDOW_MS) {
    sweep(now);
    lastSweep = now;
  }
  const hits = seen.get(address) ?? { times: [] };
  hits.times = hits.times.filter((at) => now - at < WINDOW_MS);
  if (hits.times.length >= PER_WINDOW) {
    const oldest = Math.min(...hits.times);
    seen.set(address, hits);
    return Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
  }
  hits.times.push(now);
  seen.set(address, hits);
  return null;
}

const refuse = (status: number, error: string, retryAfter?: number) =>
  NextResponse.json(
    { error },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
      },
    },
  );

export function middleware(request: NextRequest) {
  if (request.method !== 'POST') return NextResponse.next();

  const declared = Number(request.headers.get('content-length') ?? 0);

  // Too small to be a book, so it is a mistake or a probe. Refused before it
  // is admitted, because an admitted request holds a place in the queue until
  // it reaches Chrome — and one that the route is about to reject with a 400
  // never does. Seven of those used to fill the machine for a minute.
  if (declared > 0 && declared < MIN_BODY_BYTES) {
    return refuse(400, 'That request is too small to be a design or a book.');
  }

  if (declared > MAX_BODY_BYTES) {
    return refuse(
      413,
      `That export is ${Math.round(declared / 1024 / 1024)}MB, which is past the ` +
        `${MAX_BODY_MB}MB this demo accepts. Export fewer pages at a time, or use ` +
        '"Print to PDF" in the export panel, which renders in your own browser with no limit.',
    );
  }

  // The address limit before the queue, so a place is not claimed for a
  // request that is about to be turned away for a different reason.
  const address = addressOf(request);
  const wait = address === null ? null : tooMany(address, Date.now());
  if (wait !== null) {
    return refuse(
      429,
      `That is ${PER_WINDOW} exports in ${Math.round(WINDOW_MS / 60000)} minutes, which is ` +
        'the limit for this demo. "Print to PDF" in the export panel has no limit — it ' +
        'renders in your own browser instead of on the server.',
      wait,
    );
  }

  // Claims a place, rather than reading whether one is free. Eight requests
  // arriving together are all still reading their bodies, so none of them has
  // reached Chrome and a read would tell all eight the machine was idle.
  if (!admitRender()) {
    // `inProgress`, not `active`: a burst that arrives together is admitted
    // before any of it reaches Chrome, so "printing" would read as zero at
    // the exact moment the machine is full.
    const { inProgress, capacity } = renderQueueState();
    return refuse(
      429,
      `This demo is rendering all it can at once (${inProgress} of ${capacity} exports ` +
        'in progress). Try again in a minute, or use "Print to PDF" in the export panel, ' +
        'which renders in your own browser instead of on the server.',
      60,
    );
  }

  return NextResponse.next();
}
