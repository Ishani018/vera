# Starter packs

Pictures that ship with the app, ready to be installed as stickers. Everything
here is **public domain or CC0** — downloaded by hand, with the source and the
licence written down at the time, because that is the only moment anybody
actually knows them.

## The shape of a pack

```
starter/
  autumn-leaves/
    manifest.json
    oak-leaf.png
    maple-leaf.png
  dist/            ← built zips, not committed
```

One folder per pack. The folder's name is the pack's name: lower case, words
joined by hyphens. It becomes the `pack:` tag on every sticker installed from
it, so it is what you will see in the app.

## The manifest

```json
{
  "pack": "autumn-leaves",
  "name": "Autumn leaves",
  "note": "Pressed leaves, scanned",
  "items": [
    {
      "file": "oak-leaf.png",
      "name": "Oak leaf",
      "tags": ["leaf", "autumn", "brown"],
      "sourceUrl": "https://example.org/items/12345",
      "author": "Jane Smith",
      "licence": "CC0-1.0",
      "downloadedOn": "2026-10-01"
    }
  ]
}
```

Every field is required, including `author` — write `Unknown` if the source does
not say, rather than leaving it out, so the difference between "nobody is named"
and "nobody checked" stays visible.

`sourceUrl` must be a link somebody else can open: the page you got it from, not
the image URL, so the licence is visible beside it.

**The manifest and the folder must match exactly, both ways.** A listed file
that is missing is an obvious mistake. A file in the folder that nobody listed
is the dangerous one — a picture with no source, no author and no licence, in a
folder whose entire purpose is that everything has those three.

## Licences that are accepted

CC0 in any of its spellings, Public Domain Mark, and "no known copyright
restrictions". That is the whole list.

**CC-BY is not on it.** Attribution is a condition, and a sticker on a parcel
carries no credit line. Nor are the site licences — "free for commercial use" on
a stock site is a licence from that site, not a public-domain dedication, and it
can be withdrawn.

## What the check cannot do for you

It checks what the manifest **claims**. It cannot tell whether a site's "CC0"
label is correct, and sites get this wrong.

And CC0 waives copyright — it does not waive **trademark or personality
rights**. A CC0 photograph of a recognisable person, a logo, a branded product
or a modern building can still be unusable on something you sell. That judgement
is yours and it happens before the file lands here.

## Building

```bash
npm run starter:build
```

Checks every pack and writes `starter/dist/<pack>.zip`, with the manifest inside
the zip so the provenance cannot be separated from the pictures. It reports
every problem in every pack at once, and builds nothing for a pack that has one.

## The packs that are here

`sample` — three plain shapes. Enough to run the whole pipeline end to end.

`lines` — eight line drawings: a boat, a cat, a cup, a flower, a heart, a house,
a leaf and a moon.

Neither was downloaded. Both are drawn by a script — `scripts/make-line-pack.mjs`
for `lines` — which settles the licence question by construction, since nothing
came from anywhere. Change a drawing and run that script again; the pictures and
the pack rebuild byte for byte, so a change to one shows up as a change to one.

## Credits

Everything accepted here is CC0 or public domain, so none of it has to be
credited. The **Library** page lists every installed pack with its licence and
source, and every installed sticker with its author, licence and link, and
exports a `CREDITS.txt`
anyway — not because a licence demands it, but so you can thank somebody, check
a claim you took on trust, and find one item again if that claim was wrong.

## Fetching from an API instead of downloading by hand

`npm run starter:fetch <smithsonian|commons> "<query>" [count] [pack]` asks two
official APIs for public-domain pictures and writes a pack folder with its
manifest filled in. It runs on your own computer, keeps only what the API's own
licence field says is CC0 or public domain, and never scrapes a web page. See
[FETCHING.md](FETCHING.md) for how to run it and which terms to read first.

### The whole collection in one go

```bash
npm run starter:fetch-all            # six packs, 12 each, from Commons
npm run starter:fetch-all 20         # 20 each
npm run starter:fetch-all 12 smithsonian
```

Runs the same curated list the app offers as chips — Botanical, Animals, Birds,
Food, Vintage, Ornaments — one pack per category, through the same fetcher, at
the same rate the service asks for, then builds the zips. A category whose
folder already exists is left alone, so running it twice does not download what
you already have; delete the folder to fetch it again. If a service says "slow
down" or refuses, it stops there rather than asking five more times.

**What it writes is not committed.** `.gitignore` keeps every fetched pack out
of git: they are downloads, not source, and this script can write them again.
The two packs that *are* committed — `sample` and `lines` — are drawn by
`scripts/make-line-pack.mjs` rather than downloaded.
