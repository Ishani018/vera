import { NextResponse, type NextRequest } from 'next/server';
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

/**
 * The biggest request that could be an honest book.
 *
 * The export posts every picture inline as base64, so a forty-page colouring
 * interior with photographs is genuinely hundreds of megabytes — the limit
 * cannot be small without breaking the main thing this demo is for. What it
 * can do is refuse the ones that are not books: base64 is four bytes for
 * three, so 400MB of request is around 300MB of pictures, which is far past
 * any colouring book a person has actually assembled.
 *
 * Two of these at once is the reason the machine is asked for 4GB.
 */
const MAX_BODY_BYTES = Number(process.env.MAX_EXPORT_BODY_MB ?? 400) * 1024 * 1024;

/** Five exports in ten minutes, per address. */
const WINDOW_MS = Number(process.env.EXPORT_WINDOW_MS ?? 10 * 60 * 1000);
const PER_WINDOW = Number(process.env.EXPORT_PER_WINDOW ?? 5);

type Hits = { times: number[] };
const KEY = Symbol.for('isnaevy.exportRate');
const store = globalThis as unknown as Record<symbol, Map<string, Hits> | undefined>;
store[KEY] ??= new Map<string, Hits>();
const seen = store[KEY]!;

/**
 * Who is asking.
 *
 * Fly sets `Fly-Client-IP` and it is the only one of these the app's own proxy
 * writes, so it is trusted first; `x-forwarded-for` can be set by anyone
 * talking to the machine directly and is a hint, not a fact. Behind Fly the
 * first entry is the real client because Fly appends.
 */
function addressOf(request: NextRequest): string {
  const fly = request.headers.get('fly-client-ip');
  if (fly) return fly.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
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
  if (declared > MAX_BODY_BYTES) {
    return refuse(
      413,
      `That export is ${Math.round(declared / 1024 / 1024)}MB, which is past the ` +
        `${Math.round(MAX_BODY_BYTES / 1024 / 1024)}MB this demo accepts. Export fewer ` +
        'pages at a time, or use "Print to PDF" in the export panel, which renders in ' +
        'your own browser with no limit.',
    );
  }

  // The address limit before the queue, so a place is not claimed for a
  // request that is about to be turned away for a different reason.
  const wait = tooMany(addressOf(request), Date.now());
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
