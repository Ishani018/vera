import { NextResponse } from 'next/server';

/**
 * Which build is answering.
 *
 * It exists for the screen goldens. They are recorded against a production
 * build and must refuse to run against `next dev`, because the two do not lay
 * out identically — measured on one machine with one Chromium, the Instagram
 * board differs by twelve pixels along its bottom edge between them. A golden
 * recorded against a development server certifies a server nobody visits.
 *
 * Asking the server rather than sniffing the HTML, because the server is the
 * only thing that actually knows, and a probe that guesses from markup breaks
 * the first time Next changes its markup.
 *
 * Deliberately says nothing else. There is no deployment here to be healthy or
 * unhealthy: everything this app makes lives in the visitor's own browser.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { mode: process.env.NODE_ENV === 'production' ? 'production' : 'development' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
