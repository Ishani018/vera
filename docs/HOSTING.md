# Hosting the demo

A public URL for the current app, with no accounts. Everything a visitor makes
stays in their browser; the server exists only to render PDFs and images.

## What is here

| File | What it does |
| --- | --- |
| `Dockerfile` | Ubuntu, Node and Chromium, each pinned by digest, plus fonts |
| `.dockerignore` | Keeps `node_modules` and build output out of the context |
| `fly.toml` | One 4GB machine, scaled to zero, health-checked |
| `middleware.ts` | Body cap, per-address export limit, and the 429 when full |
| `lib/server/renderQueue.ts` | Two renders at once, five queued, the rest refused |
| `app/api/health/route.ts` | What the health check reads |
| `docs/PRIVACY.md` | Draft privacy notice and demo disclaimer |

The export routes are untouched. The render gate hooks into `launchBrowser`,
which every render already goes through.

## Deploying

```sh
# once
brew install flyctl          # or: curl -L https://fly.io/install.sh | sh
fly auth login
$EDITOR fly.toml             # change `app` to a name nobody has taken
fly launch --no-deploy --copy-config

# every time
fly deploy
```

Then, once, in the dashboard — **this cannot be set from `fly.toml`**:

```sh
fly orgs                                       # find the org slug
open https://fly.io/dashboard/<org>/billing    # Spending management
```

Set a monthly limit and an alert below it. A £20–25 cap is far above what this
should cost and still catches a runaway.

### Checking it came up

```sh
fly status
curl https://<app>.fly.dev/api/health
```

`browser` must read `ready`. If it reads `missing`, `CHROME_PATH` is wrong and
every export will fall back to printing from the visitor's own browser.

### A custom domain

```sh
fly certs add isnaevy.com
fly certs show isnaevy.com      # prints the DNS records to create
```

Add the A/AAAA (or CNAME) records it prints. Fly issues and renews the
certificate itself; `force_https` is already on.

## The knobs

All are environment variables, set in `fly.toml` under `[env]` or with
`fly secrets set`.

| Variable | Default | What it does |
| --- | --- | --- |
| `CHROME_PATH` | `/opt/pw-browsers/chromium` | Which browser renders. Must match the goldens' path to keep the strict tier comparing |
| `RENDER_MAX_CONCURRENT` | `2` | Renders at once. Raising it past 2 on a 4GB machine risks the kernel killing the process |
| `RENDER_MAX_QUEUED` | `5` | How many may wait before arrivals get a 429 |
| `MAX_EXPORT_BODY_MB` | `400` | Refused on the header, before the body is read |
| `EXPORT_PER_WINDOW` | `5` | Exports per address per window |
| `EXPORT_WINDOW_MS` | `600000` | The window, in milliseconds |

## Measured, in the container

On one machine capped at 4GB, Chrome 141.0.7390.37:

- **A 40-page colouring book exports.** 267.6MB request (40 photographs and 40
  line-art pages, inline as base64), 200 OK in 40–47s, a 35.9MB PDF of 86
  pages, no fonts failed.
- **Peak memory for that render: 1.78GB.** Which is why two at once is the
  limit and why the machine asks for 4GB.
- **`npm run golden` passes inside the image with its strict tier comparing**,
  not skipping: `e3e2a36e0ac60ce1` and `d4eeeb9e99cb1bfe`, unchanged.

## Running it locally

```sh
docker build -t isnaevy:local .
docker run --rm -p 8080:8080 --memory=4g isnaevy:local
```

Behind an intercepting proxy, pass its CA so the pinned downloads verify:

```sh
docker build --secret id=extra_ca,src=/path/to/ca.crt -t isnaevy:local .
```

The image keeps its tests and scripts, so it can check itself:

```sh
docker exec -e GOLDEN_BASE_URL=http://127.0.0.1:8080 <container> npm run golden
```

## Known: the screen goldens are tied to `next dev`

`npm run golden:screen` compares 0 pixels against a **development** server and
**12 pixels** against a production build (`npm run build && npm start`), every
time, on the same machine and the same Chromium.

The difference is one row of pixels at the bottom-left edge of the Instagram
board — the clipped top of something drawn just below the board, which the two
builds place a fraction of a pixel apart. It is invisible to a person and the
layout tier, which measures positions in points, is identical either way.

It matters for one reason: **the deployed container is a production build, so
it renders that row differently from what the screen goldens certify.** The
goldens were recorded against a dev server and have not been re-recorded.

Worth deciding, separately from hosting:

- record a second screen-golden tier against a production build, or
- have the screen golden refuse to run against a dev server, so the tier it
  compares is always the one that ships.

This was found while setting up hosting; it predates it and is not caused by
it.
