import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

/** POST, not GET: a link in a page or an image tag must not be able to sign somebody out. */
export async function POST() {
  const response = NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
