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

"Vera" is set in **Abril Fatface**, in normal case ("Vera", not "VERA"), at 34 px in a 38 px line box, with
"by Isnaevy" in the small mono style beside it. The header is the same height it was.

- **Colour.** The header bar is white in every palette. The wordmark and the byline use the `outline` token (a
  near-black in all six palettes) rather than `ink-900`, which is nearly white in Night. The byline is the same ink
  at 70% opacity. Nothing else in the header, and no header background, was changed. In Night, the page title and
  the Stickers/Packs/Trash links beside the wordmark are still pale on white; that is an existing issue.
- **Font file.** `public/fonts/wordmark-display-latin.woff2` (12 KB) for the browser and `.woff` for the social-image
  renderer, which cannot read woff2. Loaded by a local `@font-face` in `app/globals.css` and preloaded in
  `app/layout.tsx`. The page never asks Google for it. Rebuild with `scripts/make-wordmark-font.py`.
- **Favicon.** `app/icon.svg`: a bold V taken from the font and converted to outline paths, so it needs no font.
  A 0.9 px outline is added to the letter so its thin stroke survives at 16 px (checked at 16, 32 and 180 px in
  `docs/brand-preview/favicon-check.png`).
- **Social preview.** `app/opengraph-image.tsx` draws "Vera" from the same local font file, and the small text in
  the sans that ships inside Next. It reads both from disk, so a build needs no network.
- **Great Vibes (the old script)** is removed. It was used by the header wordmark, two spots on the landing page
  (the sidebar wordmark and the brand-kit tile), the `--font-script` token (`FONTS.script`), and a check in
  `scripts/topbar-check.mjs`. It was not used by stickers, designs, text presets, the editors' font lists or any
  export. Only old design notes (`docs/design-explorations`, `docs/pressproof-log.md`) still mention it, as history.
  The token is now `--font-wordmark`.

### Font licence and source

| | |
|---|---|
| Font | Abril Fatface, by TypeTogether |
| Licence | SIL Open Font Licence 1.1. Full text: `public/fonts/AbrilFatface-OFL.txt` (kept with the font files) |
| Source | https://github.com/google/fonts/tree/main/ofl/abrilfatface (`AbrilFatface-Regular.ttf`, `OFL.txt`) |
| Downloaded | 2026-10-04 |

The licence reserves the names "Abril" and "Abril Fatface". Subsetting and converting to woff2 count as modifying
the font, so the files in `public/fonts` are renamed inside (family "Wordmark Display") and CSS calls them
"Wordmark Display". The copyright and licence text stay in the files. The font is not sold on its own.

### Fonts that still come from Google

Fraunces, Inter and DM Mono are still fetched from Google Fonts at runtime (one stylesheet link in
`app/layout.tsx`), as they were before. Only the wordmark is self-hosted. Self-hosting those three is a separate step.

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
