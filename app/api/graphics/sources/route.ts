import { NextResponse } from 'next/server';
import { smithsonianKey } from '@/lib/graphics/server';

/**
 * Which collections this server can offer.
 *
 * The Smithsonian needs a key from api.data.gov, and a key is a thing about the
 * server rather than about the visitor — so the page asks rather than guesses,
 * and says how to add one when the answer is no.
 *
 * It answers with two booleans. It never says what the key is.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ commons: true, smithsonian: Boolean(smithsonianKey()) });
}
