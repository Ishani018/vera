import { existsSync } from 'node:fs';
import { NextResponse } from 'next/server';
import { renderQueueState } from '@/lib/server/renderQueue';

/**
 * Is this machine able to serve?
 *
 * Fly restarts a machine that fails this, so it answers the narrow question —
 * the process is up and the browser it prints with is on disk — and not the
 * broad one. Launching Chrome to be sure would take seconds, cost memory, and
 * turn a health check into the thing most likely to exhaust the render slots
 * it is reporting on.
 *
 * The queue numbers are here because this is the only endpoint worth polling:
 * they say whether exports are backing up without anyone having to try one.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHROME = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '';

export function GET() {
  const browser = CHROME ? existsSync(CHROME) : null;
  return NextResponse.json(
    {
      ok: browser !== false,
      // null where no path was configured: the app falls back to printing
      // from the visitor's own browser, which is degraded but not broken.
      browser: browser === null ? 'not configured' : browser ? 'ready' : 'missing',
      renders: renderQueueState(),
      uptimeSeconds: Math.round(process.uptime()),
    },
    { status: browser === false ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
