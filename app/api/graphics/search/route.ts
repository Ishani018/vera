import { NextResponse } from 'next/server';
import { ServiceRefused, search, smithsonianKey } from '@/lib/graphics/server';

/**
 * Searching two public collections for pictures that may be used freely.
 *
 * Nothing to do with the export routes: this fetches JSON from a museum and a
 * wiki and hands back a list. It writes nothing, reads nothing of yours, and
 * knows nothing about any book.
 *
 * What leaves this server is the search words and nothing else — no identifier,
 * no address of yours, no record kept. The page says so in a line under the
 * search box.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams;
  const query = (asked.get('q') ?? '').trim();
  const source = asked.get('source') === 'smithsonian' ? 'smithsonian' : 'commons';
  const page = Math.max(0, Math.min(40, Number(asked.get('page') ?? 0) || 0));

  if (!query) return NextResponse.json({ error: 'Say what to look for.' }, { status: 400 });
  if (query.length > 120) {
    return NextResponse.json({ error: 'That search is too long.' }, { status: 400 });
  }
  if (source === 'smithsonian' && !smithsonianKey()) {
    return NextResponse.json(
      { error: 'The Smithsonian needs an API key on this server.' },
      { status: 400 },
    );
  }

  try {
    const result = await search(source, query, page);
    return NextResponse.json(result, {
      // The same ten minutes the server caches for, so a reload of the page
      // does not re-ask on their behalf either.
      headers: { 'Cache-Control': 'private, max-age=600' },
    });
  } catch (error) {
    if (error instanceof ServiceRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'That search could not be made.' }, { status: 500 });
  }
}
