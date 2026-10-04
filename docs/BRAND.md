# Brand: Vera by Isnaevy

**Vera** is the product: the app people open to set poetry books, make covers, stickers and line art.
**Isnaevy** is the studio that makes it, and stays the umbrella brand (isnaevy.com). On screen the product is the
main name and the studio is a small second mark ("by Isnaevy").

## One place for the names

`lib/brand.ts` holds the product name, the studio name, the byline and the two URLs. Everything on screen reads
from it: the header wordmark, the landing page, the page title and its template (`Page · Vera`), the social
preview, the project-backup message and the backup file name. A rename is a one-line change there.

`tests/brand.test.mjs` fails if either name is written literally anywhere else in `app/`, `components/` or
`lib/` (one exception: the HTTP User-Agent in `lib/graphics/policy.ts`, which a person never sees), and fails if
code that makes a book, cover or PDF starts importing the brand.

| Setting | Env var | Default |
|---|---|---|
| Product site | `NEXT_PUBLIC_SITE_URL` | `https://vera.isnaevy.com` |
| Studio site | `NEXT_PUBLIC_STUDIO_URL` | `https://isnaevy.com` |

The site URL is the base for the social preview image and the page's canonical address. Set it at build time.

## The wordmark

"Vera" is set in Great Vibes, the same script face the Isnaevy wordmark used (loaded in `app/layout.tsx`). It is
text, not a picture, so **no new logo file is needed**. The favicon (`app/icon.svg`) has no letter in it and is
unchanged. The social preview image (`app/opengraph-image.tsx`) uses the system sans, not the script, because the
script is fetched at runtime and a build must not need the network. Swap it for a designed 1200 x 630 image if
you want the script there.

## What is deliberately not renamed

- **Storage.** The IndexedDB database is still `versecraft`; the keys are still `versecraft:*` and
  `isnaevy:theme` / `isnaevy:palette-custom`. Renaming any of them would orphan saved books and preferences.
  If one ever has to change, it needs a migration that copies the old data first. `tests/brand.test.mjs` pins them.
- **Exported books, covers and PDFs.** "Isnaevy" is the publishing brand on KDP. Nothing in the export path reads
  the brand config, and the goldens (PDF and screen) are unchanged by the rename.
- **The GitHub repo name, the package name and the route paths.**
- Old backups still open: a backup file's name is not read, only its contents. New backups are saved as
  `<title>-vera.json`.

## Domains

- `isnaevy.com`: the studio's main site (live).
- `vera.isnaevy.com`: this app. Point a `CNAME` for `vera` at the host, add the domain to the hosting project,
  and set `NEXT_PUBLIC_SITE_URL=https://vera.isnaevy.com` (the default) for the build.
- Browser storage is per origin. Work saved while using the app at another address (a preview URL, or
  localhost) does not appear at `vera.isnaevy.com`; use the project backup (Export) to move a book across.
  People who used the app at an earlier address will not see their books at the new one until they do.
