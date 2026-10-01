import { NextResponse } from 'next/server';
import {
  MAX_BYTES,
  USER_AGENT,
  allowedSource,
  allowedType,
  withinCap,
} from '@/lib/graphics/policy';
import { probeImage } from '@/lib/starter/image';

/**
 * One picture, fetched on the browser's behalf.
 *
 * This route takes a URL from the page, which makes it the most dangerous thing
 * in the app: without a closed list it would fetch whatever anybody asked it
 * to, including the inside of the network it is running in. So, in order:
 *
 * 1. https only, an exact host from a list of two, no credentials, no port.
 * 2. One redirect hop at most, and the destination goes through the same check
 *    — a 302 to somewhere else is how an allow-list is usually got around.
 * 3. The Content-Type has to be a PNG, a JPEG or a WebP. Never an SVG: an SVG
 *    is a document that can carry script, and this hands the bytes back.
 * 4. Content-Length, when sent, has to be inside the cap — and the body is
 *    counted as it is read, because a server need not send one.
 * 5. The bytes are decoded far enough to prove they really are that picture.
 *    A server can say "image/png" and send anything at all.
 *
 * It streams nothing back to any other host and keeps nothing.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const no = (why: string, status = 400) => NextResponse.json({ error: why }, { status });

export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get('url') ?? '';
  const verdict = allowedSource(asked);
  if (!verdict.ok) return no(verdict.why);

  let response: Response;
  try {
    response = await fetch(verdict.url, {
      headers: { 'User-Agent': USER_AGENT },
      // Manual, so a redirect is a decision rather than something that happens.
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location') ?? '';
      const onward = allowedSource(new URL(next, verdict.url).toString());
      if (!onward.ok) return no(`it redirected somewhere this does not fetch from: ${onward.why}`);
      response = await fetch(onward.url, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
    }
  } catch (error) {
    return no(`that picture could not be fetched: ${error instanceof Error ? error.message : ''}`.trim(), 502);
  }

  if (!response.ok) return no(`the file answered ${response.status}.`, 502);

  const type = response.headers.get('content-type');
  if (!allowedType(type)) return no(`that is not a PNG, JPEG or WebP (${type ?? 'no type given'}).`);

  const stated = response.headers.get('content-length');
  if (!withinCap(stated === null ? null : Number(stated))) {
    return no(`that picture is over the ${MAX_BYTES / 1024 / 1024} MB limit.`, 413);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!withinCap(bytes.length)) {
    return no(`that picture is over the ${MAX_BYTES / 1024 / 1024} MB limit.`, 413);
  }

  const probe = probeImage(bytes);
  if (!probe.ok) return no(`that file is not a picture: ${probe.why}`);

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': type!.split(';')[0].trim().toLowerCase(),
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=3600',
      // Belt and braces: whatever it turns out to be, it is not a page.
      'Content-Disposition': 'attachment',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
