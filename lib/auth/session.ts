import { SignJWT, jwtVerify } from 'jose';

/**
 * The signed-in person, kept in one cookie.
 *
 * A signed (not encrypted) token: the browser may read it, which is fine — it
 * holds a name and a picture — but cannot change it. Nothing from Google beyond
 * that is kept: the access token is used once to prove who signed in and then
 * discarded, so there is nothing here that could be used to reach their account.
 */

export type SessionUser = {
  /** Google's stable id for the person. The email can change; this cannot. */
  id: string;
  email: string;
  name: string;
  picture: string | null;
};

export const SESSION_COOKIE = 'vera_session';
export const SESSION_DAYS = 30;

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(user: SessionUser, secret: string, now = Date.now()): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, picture: user.picture })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + SESSION_DAYS * 86400)
    .sign(key(secret));
}

/** The user in a session token, or null for anything wrong with it: expired, altered, or not ours. */
export async function readSession(
  token: string | undefined | null,
  secret: string | null,
  now = Date.now(),
): Promise<SessionUser | null> {
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ['HS256'],
      currentDate: new Date(now),
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    return {
      id: payload.sub,
      email: payload.email,
      name: typeof payload.name === 'string' && payload.name ? payload.name : payload.email,
      picture: typeof payload.picture === 'string' ? payload.picture : null,
    };
  } catch {
    return null;
  }
}

/** Cookie attributes. `secure` follows the connection, so plain http://localhost still works in dev. */
export function cookieOptions(secure: boolean, maxAgeSeconds = SESSION_DAYS * 86400) {
  return { httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: maxAgeSeconds };
}
