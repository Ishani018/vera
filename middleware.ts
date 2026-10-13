import { NextResponse, type NextRequest } from 'next/server';
import { isConfigured, readConfig } from '@/lib/auth/config';
import { SESSION_COOKIE, readSession } from '@/lib/auth/session';

/**
 * Asks for a sign-in, when the host has said it wants one.
 *
 * Off unless `AUTH_REQUIRED=true`, so running the app on your own computer needs
 * no Google account and no setup. On, it fails CLOSED: if sign-in is required but
 * not configured, nobody gets in, rather than everybody. Pages send you to the
 * sign-in screen; the API answers 401, because a fetch cannot follow a login page.
 */
export async function middleware(request: NextRequest) {
  const cfg = readConfig();
  if (!cfg.required) return NextResponse.next();

  const user = isConfigured(cfg)
    ? await readSession(request.cookies.get(SESSION_COOKIE)?.value, cfg.secret)
    : null;
  if (user) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }
  const to = request.nextUrl.clone();
  to.pathname = '/signin';
  to.search = `?returnTo=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(to);
}

export const config = {
  // Everything except the sign-in screen and its routes, the health check, and
  // the static things a signed-out page needs to draw itself.
  matcher: [
    '/((?!signin|api/auth|api/health|_next/|icon.svg|opengraph-image|favicon|vendor/|fonts/|starter/).*)',
  ],
};
