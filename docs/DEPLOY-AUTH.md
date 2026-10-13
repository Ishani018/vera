# Google sign-in and deploying

Sign-in here does one thing: it says **who is using the app**. Books, pictures and
settings still live only in the browser (IndexedDB) and are never uploaded.
Nothing is stored on the server about a person; the session is a signed cookie
holding their Google id, name, email and picture, and the Google access token is
thrown away as soon as it has been used to prove who they are.

It is off unless you set it up, so running the app on your own computer needs no
Google account.

## 1. Make a Google OAuth client

1. Google Cloud Console → **APIs & Services → OAuth consent screen**. Pick
   *External* (or *Internal* if everyone is in one Google Workspace). Add the app
   name and a support email. Scopes needed: `openid`, `email`, `profile` (the
   defaults; none are "sensitive", so no Google review is needed).
2. **Credentials → Create credentials → OAuth client ID → Web application.**
3. **Authorised redirect URIs** — add one for every address the app is reached at:
   - `http://localhost:3000/api/auth/callback` (development)
   - `https://YOUR-DOMAIN/api/auth/callback` (production)

   They must match exactly, including `https`, the port, and no trailing slash.
4. Copy the **client id** and **client secret**.

While the consent screen is in *Testing*, only the Google accounts you list as
test users can sign in. Move it to *In production* to let anyone.

## 2. Set the environment

Copy `.env.example` to `.env.local` (development) or set the same names in your
host's environment settings (production). Never commit the real values.

| Name | What |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From step 1. |
| `AUTH_SECRET` | 32+ random characters; signs the cookie. `openssl rand -base64 48`. Changing it signs everybody out. |
| `APP_URL` | The public address, no trailing slash. Must be what you registered in step 1. |
| `AUTH_REQUIRED` | `true` to ask everyone to sign in. Unset = the app stays open and sign-in is optional. |
| `AUTH_ALLOWED` | Optional. `ada@example.com,@school.org` limits who may sign in. |

`AUTH_REQUIRED=true` **fails closed**: if you turn it on but miss a setting above,
nobody gets in, rather than everybody. The sign-in screen says so.

## 3. What is protected

With `AUTH_REQUIRED=true` every page redirects to `/signin`, and every `/api/*`
route (PDF export, fonts, graphics) answers `401` until signed in. Left open: the
sign-in screen, `/api/auth/*`, `/api/health`, and the static files the sign-in
screen needs to draw itself.

Anything that costs the server something (the PDF export runs a real Chromium) is
behind the same gate, which is the reason to turn it on for a public deployment.

## How it works (for review)

Authorisation-code flow with **PKCE (S256)**, a **`state`** bound to the browser
that started it (carried in a 10-minute signed, HttpOnly cookie), and a **`nonce`**
bound to the ID token. The ID token is verified against Google's published keys —
signature, issuer, audience, expiry, nonce — and an unverified email is refused.
`returnTo` can only be a path on this site. Sign-out is `POST` only. Cookies are
`HttpOnly`, `SameSite=Lax`, and `Secure` whenever the app is served over https.
The code is `lib/auth/*`, `app/api/auth/*`, `app/signin`, `middleware.ts`; the
whole flow is tested offline in `tests/auth.test.mjs` with a local key pair
standing in for Google.

## Not done yet (decisions for deployment)

- **A host.** The PDF export needs a real Chromium on the server, so a container
  host (Fly.io, Railway, Render…) is the straightforward choice; serverless hosts
  need a bundled Chromium and have tight limits. An unmerged `hosting` branch has a
  Dockerfile, a render queue and limits written for this.
- **Rate limiting** on `/api/export/*` per signed-in user. Sign-in makes it
  possible (the session has a stable `id`); it is not built.
- **Sync.** Books are per browser. Making them follow an account needs a database
  and file storage and changes the privacy promise; deliberately not part of this.
