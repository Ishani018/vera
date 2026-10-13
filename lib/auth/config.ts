/**
 * What the server knows about sign-in, read from the environment.
 *
 * Nothing here is a secret that belongs in the repository: the Google client id
 * and secret, and the key the session cookie is signed with, are all set where
 * the app is hosted. `.env.example` lists them.
 */

export type AuthConfig = {
  /** Google OAuth client. Null when sign-in has not been set up on this server. */
  clientId: string | null;
  clientSecret: string | null;
  /** Signs the session cookie. At least 32 characters; null means sign-in is off. */
  secret: string | null;
  /** Public address of the app, used to build the redirect URI. Null: use the request's. */
  appUrl: string | null;
  /** When true, the app asks everybody to sign in. Off by default, so local use stays open. */
  required: boolean;
  /** Optional allow-list: full addresses, or `@domain` for a whole domain. Empty = anyone with a Google account. */
  allowed: string[];
};

export function readConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const list = (env.AUTH_ALLOWED ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const secret = env.AUTH_SECRET && env.AUTH_SECRET.length >= 32 ? env.AUTH_SECRET : null;
  return {
    clientId: env.GOOGLE_CLIENT_ID || null,
    clientSecret: env.GOOGLE_CLIENT_SECRET || null,
    secret,
    appUrl: env.APP_URL ? env.APP_URL.replace(/\/+$/, '') : null,
    required: env.AUTH_REQUIRED === 'true',
    allowed: list,
  };
}

/** True when everything needed to sign somebody in is present. */
export function isConfigured(config: AuthConfig): boolean {
  return Boolean(config.clientId && config.clientSecret && config.secret);
}

/**
 * Whether this address may sign in.
 *
 * Case-insensitive. An entry starting with `@` allows the whole domain, and only
 * that exact domain: `@school.org` does not let in `x@evil-school.org`.
 */
export function isAllowed(email: string, allowed: string[]): boolean {
  if (!allowed.length) return true;
  const address = email.trim().toLowerCase();
  const domain = address.slice(address.lastIndexOf('@'));
  return allowed.some((entry) => (entry.startsWith('@') ? entry === domain : entry === address));
}
