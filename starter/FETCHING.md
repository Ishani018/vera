# Fetching free graphics

A helper that asks two official APIs for public-domain pictures and writes a
pack folder you can build. It runs on **your** computer, from this repository,
and never inside the app.

```bash
npm run starter:fetch commons "botanical illustration" 20
npm run starter:fetch smithsonian "herbarium sheet" 40
npm run starter:build
```

The first command writes `starter/<query>/` with the pictures and a filled-in
`manifest.json`. The second checks every item again — licence, that it really
decodes as an image, size, duplicates — and only then makes the zip. Install the
zip from the **Library** page in the app.

## Read these first

Before you sell anything made from these, read the terms, not the summary:

- **Wikimedia Commons** — [Reusing content outside
  Wikimedia](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).
  Commons hosts public-domain *and* CC-BY *and* CC-BY-SA work side by side; the
  helper keeps only the first, by the file's own licence template.
- **Smithsonian Open Access** — [the Open Access
  terms](https://www.si.edu/openaccess). An object can be openly described while
  its picture is restricted; the helper keeps only media whose own `usage.access`
  is `CC0`.
- **CC0 itself** — [the deed](https://creativecommons.org/publicdomain/zero/1.0/).
  Note what it does *not* waive: trademark and personality rights. A CC0
  photograph of a logo is still a logo, and a CC0 photograph of a person is still
  a photograph of a person.

## The Smithsonian needs a free key

```bash
export SMITHSONIAN_API_KEY=…   # from https://api.data.gov/signup/
```

It is read from the environment every run. It is never written into this
repository, never put in a manifest, and never sent anywhere but api.si.edu.
Wikimedia Commons needs no key.

## What the helper will and will not do

**It keeps an item only when the API's own licence field says so.** For Commons
that is `extmetadata.LicenseShortName` — the file's own licence template. For
the Smithsonian it is `online_media.media[].usage.access`, which has to be
exactly `CC0`. A search for "public domain ferns" proves nothing about what
comes back, and the helper does not treat it as if it did.

**It records where each thing came from.** Every manifest row carries the page
URL a person can open, the author as the API gave it, the licence string
verbatim, and the date it was downloaded.

**It skips anything whose words suggest somebody owns it**: a short list of
character and brand names, the words *logo, trademark, emblem, insignia,
mascot, wordmark, coat of arms* as whole words in the title, the tags or the
categories, and anything carrying ® or ™. This is a first filter and not a
clearance — it reads words, so it cannot tell a drawing of a mouse from a
drawing of *that* mouse. Everything it skips is listed with its reason when the
run ends.

**It is slow on purpose**: five requests a second across the whole run, and at
most 100 items in one go. Ask again with a narrower query rather than asking for
a thousand.

**It never scrapes a web page.** Both sources are asked through their documented
APIs, with a User-Agent that says what this is.

**It never writes over a pack you already have.** If `starter/<name>/` exists
and has anything in it, the run stops and says so.

**It stops with a clear message when an API refuses.** A 429 says you are being
rate-limited; a 401 or 403 says whether a key is involved; anything else reports
the status it got.

## What it cannot do

It cannot judge a picture — only its words and its licence field. It cannot tell
you whether a public-domain photograph of a sculpture is safe to sell in your
country. And a site's own label can be wrong; the manifest keeps the link so you
can check the claim against the source.
