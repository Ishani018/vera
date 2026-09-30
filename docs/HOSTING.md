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
| `lib/server/exportLimits.ts` | The limits, read from the environment in one place |
| `lib/server/renderQueue.ts` | Two renders at once, five queued, the rest refused |
| `app/api/health/route.ts` | What the health check reads, and what limits are in force |
| `docs/PRIVACY.md` | Draft privacy notice and demo disclaimer |

The export routes are untouched. The render gate hooks into `launchBrowser`,
which every render already goes through.

---

## First deploy, from an Apple Silicon Mac

**The build must be remote.** Fly machines are x86-64. An image built on an
M-series Mac is arm64, and a machine given one fails to start with
`exec format error` — which looks like a broken app rather than a broken
architecture, so it is worth getting right the first time.

```sh
# 1. Install flyctl and sign in
brew install flyctl
fly auth signup        # or: fly auth login

# 2. Name the app. `isnaevy-demo` is almost certainly taken.
cd ~/book
$EDITOR fly.toml       # change the `app = ` line

# 3. Create the app on Fly without deploying anything yet.
#    --copy-config keeps the fly.toml in the repo; --no-deploy stops it
#    guessing at a Dockerfile and building something unasked.
fly launch --no-deploy --copy-config --name <your-app-name> --region lhr

# 4. Deploy, building on Fly's builder rather than your Mac.
fly deploy --remote-only
```

The first `fly deploy` takes a while: it downloads Ubuntu, a 176MB Chromium
and the npm tree, then runs `next build`. Later deploys reuse the cached
layers unless `package.json` or the Dockerfile changes.

### If you ever build locally instead

Don't, unless you have a reason. If you must:

```sh
docker buildx build --platform linux/amd64 -t isnaevy:amd64 .
fly deploy --local-only --image isnaevy:amd64
```

Rosetta makes an amd64 build on an M-series Mac slow — minutes, not seconds.
`--remote-only` is faster and cannot get the architecture wrong.

### Check it came up

```sh
fly status
fly logs
curl https://<your-app-name>.fly.dev/api/health
```

The health response should read:

```json
{
  "ok": true,
  "mode": "production",
  "browser": "ready",
  "renders": { "maxConcurrent": 2, "maxQueued": 5, "capacity": 7, ... },
  "exports": { "perWindow": 5, "windowMinutes": 10, "maxBodyMb": 400 }
}
```

`browser` must read **`ready`**. If it reads `missing`, `CHROME_PATH` is wrong
and every export will silently fall back to printing from the visitor's own
browser. `exports` and `renders` echo the limits actually in force, so you can
confirm an override took rather than hoping it did.

### A custom domain

```sh
fly certs add isnaevy.com
fly certs show isnaevy.com      # prints the DNS records to create
```

Add the A/AAAA (or CNAME) records it prints at your registrar. Fly issues and
renews the certificate; `force_https` is already on in `fly.toml`.

---

## Spending: what I could not verify

**I could not reach fly.io from the machine this was written on** — their site
and API are blocked by this sandbox's egress policy. Everything in this section
is from training data, is likely to have moved, and **must be checked against
Fly's billing page before you rely on it**.

### Setting a limit

```sh
fly orgs list                                   # find your org slug
fly dashboard                                   # opens the web dashboard
# then: Organisation → Billing → spending management
```

There is no `fly.toml` key for this and, as far as I know, no first-class
`flyctl` command — it is a dashboard setting, done once per organisation, not
per app.

### Hard cap or alerts only?

**Unverified, and the part most worth checking yourself.** My understanding is
that Fly offers *both* a spending alert (an email at a threshold) and a
spending limit that stops resources when reached — but I am not confident
whether the hard limit is available on every plan, whether it stops machines or
merely blocks new ones, or what it is currently called. **Treat the hard cap as
unconfirmed until you have seen it on the billing page.**

### What does not depend on Fly's billing features

The blast radius is bounded by the configuration regardless, which is the part
you control:

- **One machine, `min_machines_running = 0`.** It cannot scale itself out, so
  the worst case is one 4GB machine running continuously — a known, small
  number rather than an open-ended one.
- **Rate limits** cap how much rendering a stranger can provoke.
- **A kill switch that always works**, whatever the billing page offers:

  ```sh
  fly scale count 0        # stops everything; costs drop to storage only
  fly apps destroy <app>   # and this ends it entirely
  ```

Set a calendar reminder to check the bill in the first week. That is worth more
than any cap, because it catches the thing you did not think to cap.

---

## The knobs

All are environment variables, read at start-up — **not baked in at build
time**, so they can be changed with `fly secrets set` or on the command line
without rebuilding. Verified by running the built server with overrides and
watching the limits change.

| Variable | Default | What it does |
| --- | --- | --- |
| `CHROME_PATH` | `/opt/pw-browsers/chromium` | Which browser renders. Must match the goldens' path to keep the strict tier comparing |
| `RENDER_MAX_CONCURRENT` | `2` | Renders at once. Past 2 on a 4GB machine risks the kernel killing the process |
| `RENDER_MAX_QUEUED` | `5` | How many may wait before arrivals get a 429 |
| `RENDER_QUEUE_TIMEOUT_MS` | `240000` | How long a queued render waits before giving up |
| `RENDER_PENDING_TTL_MS` | `60000` | How long an admitted request may take to reach Chrome before its place is swept |
| `RENDER_IDLE_GRACE_MS` | `10000` | With nothing rendering, how long an admitted request may hold its place before it is assumed lost |
| `MAX_EXPORT_BODY_MB` | `400` | Refused on the header, before the body is read |
| `MIN_EXPORT_BODY_BYTES` | `256` | Below this it is junk, refused before it takes a place in the queue |
| `EXPORT_PER_WINDOW` | `5` | Exports per address per window |
| `EXPORT_WINDOW_MS` | `600000` | The window, in milliseconds |

Raising them for a load test, locally:

```sh
EXPORT_PER_WINDOW=500 MAX_EXPORT_BODY_MB=800 RENDER_MAX_CONCURRENT=4 npm start
```

or on Fly:

```sh
fly secrets set EXPORT_PER_WINDOW=500 MAX_EXPORT_BODY_MB=800
curl https://<app>.fly.dev/api/health    # confirm the new numbers are live
fly secrets unset EXPORT_PER_WINDOW MAX_EXPORT_BODY_MB
```

`fly secrets set` restarts the machine, which is how the new values are read.

### Requests from the machine itself are not rate limited

The per-address limit is skipped for a loopback address, and for a request
with no forwarding header. On Fly that can never be a visitor: every public
request arrives through the proxy, which sets `Fly-Client-IP` to the real
client. It is there because `npm run golden` posts two exports per run and was
locking itself out of its own rate limiter on the third run — and because
`fly ssh console` should be able to check a deployment without spending a
stranger's allowance.

Those requests still obey the body cap and still take a place in the render
queue. The limit skipped is the one that protects visitors from each other,
not the ones that protect the machine.

### One rough edge, on purpose

A request that is the right *size* to be an export but that the route then
rejects holds a place in the render queue until it is swept —
`RENDER_IDLE_GRACE_MS`, ten seconds, when nothing is rendering. Seven of those
in quick succession will make the machine answer 429 for about ten seconds.

Closing it completely would need the export routes to tell the queue when they
are done, and the routes are not to be touched. Junk smaller than
`MIN_EXPORT_BODY_BYTES` is refused before it can take a place at all, which
removes the trivial version of it. What is left needs deliberate,
well-formed-but-invalid requests, and costs ten seconds.

---

## Measured, in the container

On one machine capped at 4GB, Chrome 141.0.7390.37:

- **A 40-page colouring book exports.** 267.6MB request (40 photographs and 40
  line-art pages, inline as base64), 200 OK in 40–47s, a 35.9MB PDF of 86
  pages, no fonts failed.
- **Peak memory for that render: 1.78GB.** Which is why two at once is the
  limit and why the machine asks for 4GB.
- **Ten simultaneous exports:** 7 rendered two at a time, 3 refused with 429
  and a `Retry-After` in 0.3s.
- **`npm run golden` passes inside the image with its strict tier comparing**,
  not skipping: `e3e2a36e0ac60ce1` and `d4eeeb9e99cb1bfe`, unchanged.

**Not measured on Fly.** All of the above is the same image running locally
under a 4GB cap. Fly's proxy, its scale-to-zero wake, and its health checks
have not been exercised.

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

---

## The screen goldens need a production build

`npm run golden:screen` **refuses to run against `next dev`** and says so.

The two builds do not lay out identically. On one machine with one Chromium,
the Instagram board differed by twelve pixels along its bottom edge between
`next dev` and `next start` — the clipped top row of something drawn just below
the board, which the two builds place a fraction of a pixel apart. Invisible to
a person; the layout tier, which measures positions in points, was unaffected.
It went unnoticed for months because the goldens had always been recorded
against a dev server, which is the argument for refusing rather than warning.

The goldens are now recorded against a production build. Running it:

```sh
# Simplest — with nothing on port 3000, it builds and starts one itself
npm run golden:screen

# Or drive it yourself
npm run build && npm start      # one terminal
npm run golden:screen           # another
```

**Never run `npm run build` while `next dev` is running.** It deletes `.next`
underneath the dev server, and the page then loads with no JavaScript at all.
The script now probes `/api/health` with a generous timeout before deciding the
port is free, specifically so it cannot make that mistake itself.

The PDF goldens (`npm run golden`) are unchanged and still start a dev server.
They produce identical digests either way, which has been checked both ways.
