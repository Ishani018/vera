import 'server-only';
import type { NextRequest } from 'next/server';
import { readConfig, type AuthConfig } from './config';

export const ATTEMPT_COOKIE = 'vera_attempt';

/** The config, read fresh each time so a host can change its environment without a rebuild. */
export const config = (): AuthConfig => readConfig();

/**
 * The address the app is reached at, for the redirect URI.
 *
 * `APP_URL` wins: it is what was registered with Google. Without it, the proxy's
 * forwarded host (a platform's router sits in front of the app), then the request's own.
 */
export function originOf(request: NextRequest, cfg: AuthConfig): string {
  if (cfg.appUrl) return cfg.appUrl;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}

export const isSecure = (origin: string) => origin.startsWith('https://');
