import assert from 'node:assert/strict';
import test from 'node:test';
import { SignJWT, generateKeyPair } from 'jose';

import { isAllowed, isConfigured, readConfig } from '../lib/auth/config.ts';
import {
  SignInError,
  authUrl,
  challengeFor,
  completeSignIn,
  newAttempt,
  openAttempt,
  safeReturnTo,
  sealAttempt,
} from '../lib/auth/flow.ts';
import { readSession, signSession } from '../lib/auth/session.ts';

/**
 * Google sign-in, without Google.
 *
 * A key pair made here stands in for Google's signing keys, so every check the
 * real flow makes — state, PKCE, issuer, audience, nonce, expiry, a verified
 * email — can be shown to fail on its own. A sign-in that "works" is easy; what
 * has to be right is every way it should not.
 */

const SECRET = 'a-test-secret-that-is-at-least-32-characters-long';
const CLIENT = { id: 'client-123.apps.googleusercontent.com', secret: 'shh', redirectUri: 'https://vera.example/api/auth/callback' };
const person = { id: '1098', email: 'ada@example.com', name: 'Ada Lovelace', picture: 'https://lh3.example/a.png' };

// ------------------------------------------------------------------ config

test('sign-in is off until the three things it needs are all set', () => {
  assert.equal(isConfigured(readConfig({})), false);
  assert.equal(isConfigured(readConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' })), false, 'no signing key');
  assert.equal(isConfigured(readConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', AUTH_SECRET: SECRET })), true);
});

test('a signing key under 32 characters is refused, not used', () => {
  const cfg = readConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', AUTH_SECRET: 'short' });
  assert.equal(cfg.secret, null);
  assert.equal(isConfigured(cfg), false);
});

test('requiring sign-in is opt-in and exact', () => {
  assert.equal(readConfig({}).required, false);
  assert.equal(readConfig({ AUTH_REQUIRED: 'true' }).required, true);
  for (const nearly of ['TRUE', '1', 'yes', 'false', '']) {
    assert.equal(readConfig({ AUTH_REQUIRED: nearly }).required, false, nearly);
  }
});

test('the app address loses its trailing slash', () => {
  assert.equal(readConfig({ APP_URL: 'https://vera.example///' }).appUrl, 'https://vera.example');
});

test('the allow-list matches addresses and whole domains, and only exactly', () => {
  const list = readConfig({ AUTH_ALLOWED: ' Ada@Example.com , @school.org ' }).allowed;
  assert.deepEqual(list, ['ada@example.com', '@school.org']);
  assert.equal(isAllowed('ADA@example.com', list), true, 'case does not matter');
  assert.equal(isAllowed('kid@school.org', list), true, 'a whole domain');
  assert.equal(isAllowed('kid@evil-school.org', list), false, 'a domain is not a suffix match');
  assert.equal(isAllowed('kid@school.org.evil.com', list), false);
  assert.equal(isAllowed('someone@example.com', list), false);
  assert.equal(isAllowed('anyone@anywhere.io', []), true, 'no list means anyone with a Google account');
});

// ----------------------------------------------------------------- session

test('a session round-trips to the same person', async () => {
  const token = await signSession(person, SECRET);
  assert.deepEqual(await readSession(token, SECRET), person);
});

test('a session that was altered, expired, or signed with another key is nobody', async () => {
  const now = Date.now();
  const token = await signSession(person, SECRET, now);

  const [head, body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), email: 'root@example.com' })).toString('base64url');
  assert.equal(await readSession(`${head}.${forged}.${sig}`, SECRET), null, 'changed contents');
  assert.equal(await readSession(token, 'another-secret-that-is-at-least-32-chars!!'), null, 'wrong key');
  assert.equal(await readSession(token, SECRET, now + 31 * 86400 * 1000), null, 'past 30 days');
  assert.equal(await readSession(token, SECRET, now + 29 * 86400 * 1000) !== null, true, 'still good at 29');
  assert.equal(await readSession('not.a.token', SECRET), null);
  assert.equal(await readSession(undefined, SECRET), null);
  assert.equal(await readSession(token, null), null, 'no key configured');
});

test('a token with the algorithm set to none is not accepted', async () => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: '1', email: 'x@y.z', exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
  assert.equal(await readSession(`${header}.${body}.`, SECRET), null);
});

// ---------------------------------------------------------------- redirects

test('only paths on this site can be returned to', () => {
  assert.equal(safeReturnTo('/coloring?open=cover'), '/coloring?open=cover');
  assert.equal(safeReturnTo('/'), '/');
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'evil.example', '', null, undefined]) {
    assert.equal(safeReturnTo(bad), '/', String(bad));
  }
  assert.equal(safeReturnTo('/api/auth/callback'), '/', 'the auth routes would loop');
});

// -------------------------------------------------------------- the request

test('the request to Google asks for the right things and proves possession with PKCE', async () => {
  const attempt = newAttempt('/poetry');
  const url = new URL(await authUrl(attempt, CLIENT.id, CLIENT.redirectUri));
  const q = url.searchParams;
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(q.get('client_id'), CLIENT.id);
  assert.equal(q.get('redirect_uri'), CLIENT.redirectUri);
  assert.equal(q.get('response_type'), 'code');
  assert.equal(q.get('scope'), 'openid email profile');
  assert.equal(q.get('state'), attempt.state);
  assert.equal(q.get('nonce'), attempt.nonce);
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.equal(q.get('code_challenge'), await challengeFor(attempt.verifier));
  assert.notEqual(q.get('code_challenge'), attempt.verifier, 'the verifier itself must never be sent');
  assert.equal(q.get('prompt'), 'select_account');
});

test('every attempt is different, and the verifier is long enough to be secret', () => {
  const a = newAttempt('/');
  const b = newAttempt('/');
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.nonce, b.nonce);
  assert.notEqual(a.verifier, b.verifier);
  assert.ok(a.verifier.length >= 43, 'RFC 7636 asks for at least 43 characters');
});

test('the attempt survives the trip through Google, and cannot be altered on it', async () => {
  const attempt = newAttempt('/stickers');
  const sealed = await sealAttempt(attempt, SECRET);
  assert.deepEqual(await openAttempt(sealed, SECRET), attempt);

  const [head, body, sig] = sealed.split('.');
  const edited = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), returnTo: 'https://evil.example' })).toString('base64url');
  assert.equal(await openAttempt(`${head}.${edited}.${sig}`, SECRET), null);
  assert.equal(await openAttempt(sealed, 'another-secret-that-is-at-least-32-chars!!'), null);
  assert.equal(await openAttempt(undefined, SECRET), null);
});

// ------------------------------------------------------------- the response

async function google() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  const keys = async () => publicKey;
  const mint = (claims = {}, { key = privateKey, issuer = 'https://accounts.google.com', audience = CLIENT.id, expires = '10m' } = {}) =>
    new SignJWT({ email_verified: true, email: person.email, name: person.name, picture: person.picture, ...claims })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(person.id)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expires)
      .sign(key);
  return { keys, mint, wrongKey: other.privateKey };
}

/** What the callback is handed: Google's `?code=…&state=…`, and a fake token endpoint that returns `idToken`. */
function trip({ attempt, idToken, status = 200, query = {}, body }) {
  const params = new URLSearchParams({ code: 'abc', state: attempt?.state ?? 'x', ...query });
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body ?? { id_token: idToken }), { status });
  };
  return { params, fetch, calls };
}

const reason = async (promise) => {
  try {
    await promise;
    return 'none';
  } catch (error) {
    assert.ok(error instanceof SignInError, `expected a SignInError, got ${error}`);
    return error.reason;
  }
};

test('a good sign-in becomes the right person', async () => {
  const g = await google();
  const attempt = newAttempt('/');
  const t = trip({ attempt, idToken: await g.mint({ nonce: attempt.nonce }) });
  const user = await completeSignIn(t.params, attempt, CLIENT, { fetch: t.fetch, keys: g.keys });
  assert.deepEqual(user, person);

  // And what we sent to Google's token endpoint proves the PKCE verifier.
  const sent = new URLSearchParams(t.calls[0].init.body);
  assert.equal(t.calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(sent.get('code_verifier'), attempt.verifier);
  assert.equal(sent.get('grant_type'), 'authorization_code');
  assert.equal(sent.get('redirect_uri'), CLIENT.redirectUri);
});

test('a missing name falls back to the email, and a missing picture is null', async () => {
  const g = await google();
  const attempt = newAttempt('/');
  const t = trip({ attempt, idToken: await g.mint({ nonce: attempt.nonce, name: undefined, picture: undefined }) });
  const user = await completeSignIn(t.params, attempt, CLIENT, { fetch: t.fetch, keys: g.keys });
  assert.equal(user.name, person.email);
  assert.equal(user.picture, null);
});

test('declining at Google is reported as that, not as an error', async () => {
  const g = await google();
  const attempt = newAttempt('/');
  const t = trip({ attempt, query: { error: 'access_denied', code: '' } });
  assert.equal(await reason(completeSignIn(t.params, attempt, CLIENT, { fetch: t.fetch, keys: g.keys })), 'denied');
  assert.equal(t.calls.length, 0, 'nothing should be sent to Google after a refusal');
});

test('a return trip with the wrong state, or none, is refused before anything is sent to Google', async () => {
  const g = await google();
  const attempt = newAttempt('/');
  const t = trip({ attempt, idToken: await g.mint({ nonce: attempt.nonce }), query: { state: 'somebody-elses' } });
  assert.equal(await reason(completeSignIn(t.params, attempt, CLIENT, { fetch: t.fetch, keys: g.keys })), 'state');
  assert.equal(await reason(completeSignIn(t.params, null, CLIENT, { fetch: t.fetch, keys: g.keys })), 'state', 'no attempt cookie');
  assert.equal(t.calls.length, 0);
  const noCode = trip({ attempt, query: { code: '' } });
  noCode.params.delete('code');
  assert.equal(await reason(completeSignIn(noCode.params, attempt, CLIENT, { fetch: noCode.fetch, keys: g.keys })), 'state');
});

test('a token endpoint that says no, or says nothing useful, is an exchange failure', async () => {
  const g = await google();
  const attempt = newAttempt('/');
  const refused = trip({ attempt, status: 400, body: { error: 'invalid_grant' } });
  assert.equal(await reason(completeSignIn(refused.params, attempt, CLIENT, { fetch: refused.fetch, keys: g.keys })), 'exchange');
  const empty = trip({ attempt, body: {} });
  assert.equal(await reason(completeSignIn(empty.params, attempt, CLIENT, { fetch: empty.fetch, keys: g.keys })), 'exchange');
});

test('an ID token that fails any check is refused', async () => {
  const g = await google();
  const attempt = newAttempt('/');
  const go = async (idToken) => {
    const t = trip({ attempt, idToken });
    return reason(completeSignIn(t.params, attempt, CLIENT, { fetch: t.fetch, keys: g.keys }));
  };
  const good = { nonce: attempt.nonce };

  assert.equal(await go(await g.mint(good, { key: g.wrongKey })), 'token', 'signed by a key that is not Google’s');
  assert.equal(await go(await g.mint(good, { audience: 'someone-elses-client' })), 'token', 'meant for another app');
  assert.equal(await go(await g.mint(good, { issuer: 'https://evil.example' })), 'token', 'not issued by Google');
  assert.equal(await go(await g.mint(good, { expires: '-1m' })), 'token', 'expired');
  assert.equal(await go(await g.mint({ nonce: 'a-different-attempt' })), 'token', 'for a different sign-in (replay)');
  assert.equal(await go(await g.mint({})), 'token', 'no nonce at all');
  assert.equal(await go('garbage'), 'token');
  assert.equal(await go(await g.mint({ ...good, email: undefined })), 'token', 'no email');
});

test('both spellings of Google’s issuer are accepted', async () => {
  const g = await google();
  const attempt = newAttempt('/');
  const t = trip({ attempt, idToken: await g.mint({ nonce: attempt.nonce }, { issuer: 'accounts.google.com' }) });
  assert.equal((await completeSignIn(t.params, attempt, CLIENT, { fetch: t.fetch, keys: g.keys })).email, person.email);
});

test('an unverified email address is not a sign-in', async () => {
  const g = await google();
  const attempt = newAttempt('/');
  for (const email_verified of [false, undefined, 'true']) {
    const t = trip({ attempt, idToken: await g.mint({ nonce: attempt.nonce, email_verified }) });
    assert.equal(await reason(completeSignIn(t.params, attempt, CLIENT, { fetch: t.fetch, keys: g.keys })), 'unverified', String(email_verified));
  }
});
