import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { SessionUser } from './session';

/**
 * The Google sign-in dance, as functions that can be tested without Google.
 *
 * Authorisation-code flow with PKCE, a `state` that ties the return trip to the
 * browser that started it, and a `nonce` that ties the ID token to this attempt.
 * The ID token is checked against Google's published keys — issuer, audience,
 * expiry and nonce — rather than trusted because it arrived over TLS.
 */

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** Where somebody lands after signing in. Only paths on this site: never an open redirect. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  // The auth routes themselves would loop.
  if (value.startsWith('/api/auth')) return '/';
  return value;
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function challengeFor(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

export type Attempt = { state: string; verifier: string; nonce: string; returnTo: string };

export function newAttempt(returnTo: string | null | undefined): Attempt {
  return { state: randomToken(), verifier: randomToken(48), nonce: randomToken(), returnTo: safeReturnTo(returnTo) };
}

export async function authUrl(attempt: Attempt, clientId: string, redirectUri: string): Promise<string> {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: await challengeFor(attempt.verifier),
    code_challenge_method: 'S256',
    // Always show the account chooser: on a shared computer the last account is not necessarily this person.
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

/** The attempt, signed so the browser can carry it through Google and back without being able to alter it. */
export async function sealAttempt(attempt: Attempt, secret: string): Promise<string> {
  return new SignJWT({ ...attempt })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(secret));
}

export async function openAttempt(token: string | undefined, secret: string): Promise<Attempt | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
    const { state, verifier, nonce, returnTo } = payload as Record<string, unknown>;
    if (![state, verifier, nonce, returnTo].every((v) => typeof v === 'string')) return null;
    return { state, verifier, nonce, returnTo: safeReturnTo(returnTo as string) } as Attempt;
  } catch {
    return null;
  }
}

export type Deps = {
  fetch: typeof fetch;
  /** Google's signing keys. Injected so a test can use its own. */
  keys: JWTVerifyGetKey;
  now?: () => number;
};

export const googleKeys = (): JWTVerifyGetKey => createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

export type SignInReason = 'denied' | 'state' | 'exchange' | 'token' | 'unverified';

export class SignInError extends Error {
  reason: SignInReason;
  constructor(reason: SignInReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

/**
 * Turns what came back from Google into a person, or says why not.
 *
 * `params` is the callback's query string. Every check is a separate reason, so
 * the page can say something truer than "something went wrong".
 */
export async function completeSignIn(
  params: URLSearchParams,
  attempt: Attempt | null,
  client: { id: string; secret: string; redirectUri: string },
  deps: Deps,
): Promise<SessionUser> {
  if (params.get('error')) {
    throw new SignInError('denied', params.get('error') === 'access_denied' ? 'You chose not to sign in.' : 'Google did not sign you in.');
  }
  const code = params.get('code');
  // Equal state is what proves the person finishing the trip is the one who started it.
  if (!attempt || !code || params.get('state') !== attempt.state) {
    throw new SignInError('state', 'That sign-in did not start here, or it took too long. Try again.');
  }

  const response = await deps.fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: client.id,
      client_secret: client.secret,
      redirect_uri: client.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: attempt.verifier,
    }).toString(),
  });
  if (!response.ok) throw new SignInError('exchange', 'Google would not complete the sign-in.');
  const body = (await response.json().catch(() => null)) as { id_token?: string } | null;
  if (!body?.id_token) throw new SignInError('exchange', 'Google did not say who you are.');

  let claims: Record<string, unknown>;
  try {
    const verified = await jwtVerify(body.id_token, deps.keys, {
      issuer: ISSUERS,
      audience: client.id,
      currentDate: deps.now ? new Date(deps.now()) : undefined,
    });
    claims = verified.payload as Record<string, unknown>;
  } catch {
    throw new SignInError('token', 'Google’s answer could not be checked.');
  }
  if (claims.nonce !== attempt.nonce) throw new SignInError('token', 'Google’s answer was for a different sign-in.');
  if (typeof claims.sub !== 'string' || typeof claims.email !== 'string') {
    throw new SignInError('token', 'Google did not share an email address.');
  }
  // An unverified address is one anybody could claim.
  if (claims.email_verified !== true) throw new SignInError('unverified', 'That Google account has no verified email address.');

  return {
    id: claims.sub,
    email: claims.email,
    name: typeof claims.name === 'string' && claims.name ? claims.name : claims.email,
    picture: typeof claims.picture === 'string' ? claims.picture : null,
  };
}
