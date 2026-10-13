import { NextResponse, type NextRequest } from 'next/server';
import { isConfigured } from '@/lib/auth/config';
import { config } from '@/lib/auth/server';
import { SESSION_COOKIE, readSession } from '@/lib/auth/session';

/** Who is signed in, and whether sign-in exists here at all. The page uses this to decide what to show. */
export async function GET(request: NextRequest) {
  const cfg = config();
  const user = await readSession(request.cookies.get(SESSION_COOKIE)?.value, cfg.secret);
  return NextResponse.json(
    { configured: isConfigured(cfg), required: cfg.required, user },
    { headers: { 'cache-control': 'no-store' } },
  );
}
