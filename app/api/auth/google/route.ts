import { NextResponse, type NextRequest } from 'next/server';
import { isConfigured } from '@/lib/auth/config';
import { authUrl, newAttempt, sealAttempt } from '@/lib/auth/flow';
import { ATTEMPT_COOKIE, config, isSecure, originOf } from '@/lib/auth/server';
import { cookieOptions } from '@/lib/auth/session';

/** Starts sign-in: remembers the attempt in a short-lived signed cookie, then sends the browser to Google. */
export async function GET(request: NextRequest) {
  const cfg = config();
  const origin = originOf(request, cfg);
  if (!isConfigured(cfg)) return NextResponse.redirect(`${origin}/signin?error=not-set-up`);

  const attempt = newAttempt(request.nextUrl.searchParams.get('returnTo'));
  const target = await authUrl(attempt, cfg.clientId!, `${origin}/api/auth/callback`);
  const response = NextResponse.redirect(target);
  response.cookies.set(ATTEMPT_COOKIE, await sealAttempt(attempt, cfg.secret!), cookieOptions(isSecure(origin), 600));
  return response;
}
