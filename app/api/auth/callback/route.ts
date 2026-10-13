import { NextResponse, type NextRequest } from 'next/server';
import { isAllowed, isConfigured } from '@/lib/auth/config';
import { SignInError, completeSignIn, googleKeys, openAttempt } from '@/lib/auth/flow';
import { ATTEMPT_COOKIE, config, isSecure, originOf } from '@/lib/auth/server';
import { SESSION_COOKIE, cookieOptions, signSession } from '@/lib/auth/session';

/** Google sends the browser back here with a code. Turns it into a session, or into a plain reason why not. */
export async function GET(request: NextRequest) {
  const cfg = config();
  const origin = originOf(request, cfg);
  const fail = (reason: string) => {
    const response = NextResponse.redirect(`${origin}/signin?error=${reason}`);
    response.cookies.delete(ATTEMPT_COOKIE);
    return response;
  };
  if (!isConfigured(cfg)) return fail('not-set-up');

  const attempt = await openAttempt(request.cookies.get(ATTEMPT_COOKIE)?.value, cfg.secret!);
  try {
    const user = await completeSignIn(
      request.nextUrl.searchParams,
      attempt,
      { id: cfg.clientId!, secret: cfg.clientSecret!, redirectUri: `${origin}/api/auth/callback` },
      { fetch, keys: googleKeys() },
    );
    if (!isAllowed(user.email, cfg.allowed)) return fail('not-allowed');

    const response = NextResponse.redirect(`${origin}${attempt!.returnTo}`);
    response.cookies.set(SESSION_COOKIE, await signSession(user, cfg.secret!), cookieOptions(isSecure(origin)));
    response.cookies.delete(ATTEMPT_COOKIE);
    return response;
  } catch (error) {
    return fail(error instanceof SignInError ? error.reason : 'failed');
  }
}
