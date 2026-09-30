# The demo container: the app, and a Chromium to print with.
#
# Everything that can drift is pinned by digest, because the PDF goldens are
# tied to an engine. The strict tier of `npm run golden` compares a digest of
# the actual PDF bytes, and two Chrome builds do not put the same ink in the
# same place — so an unpinned browser turns a golden that proves something into
# a golden that skips. Pinned here to 141.0.7390.37, which is the build the
# current goldens were recorded on, so the container checks itself in full.
#
#   ubuntu   by image digest
#   node     by tarball SHA-256
#   chromium by zip SHA-256, from Chrome for Testing
#
# Debian's `chromium` package would have been shorter and is not pinnable in
# any lasting way: apt versions are withdrawn from the archive when they are
# superseded, so a version pin that works today fails to build in a month, and
# no pin at all silently changes the engine under the goldens.

FROM ubuntu:24.04@sha256:008173c23f95b170204355c12626cb5a965d779a7e1283b09e9cffbb1bf33ca3 AS base

ENV DEBIAN_FRONTEND=noninteractive

# Fonts first, and deliberately: a bare container has none at all, and Chrome
# renders boxes instead of type without telling anyone. The export inlines the
# book's own faces, so these are the fallback for everything else — the
# interface, and any face that failed to fetch.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl unzip xz-utils \
      fonts-liberation fonts-noto-core fonts-noto-color-emoji \
      libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 \
      libcairo2 libcups2t64 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0t64 \
      libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
      libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
      libxkbcommon0 libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

# An intercepting proxy's CA, if there is one between this build and the
# internet. A no-op when the secret is not supplied, which is the normal case:
#
#   docker build --secret id=extra_ca,src=/path/to/ca.crt .
#
# Needed because everything below is fetched over HTTPS and checked against a
# digest, and a proxy that re-signs traffic breaks the fetch long before the
# digest gets a chance to be the thing that fails.
RUN --mount=type=secret,id=extra_ca,target=/tmp/extra-ca.crt \
    if [ -s /tmp/extra-ca.crt ]; then \
      install -m 644 /tmp/extra-ca.crt /usr/local/share/ca-certificates/extra-ca.crt \
      && update-ca-certificates; \
    fi

# ---------------------------------------------------------------------- node
ARG NODE_VERSION=22.22.2
ARG NODE_SHA256=88fd1ce767091fd8d4a99fdb2356e98c819f93f3b1f8663853a2dee9b438068a
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
    && echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c - \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
         --exclude CHANGELOG.md --exclude LICENSE --exclude README.md \
    && rm /tmp/node.tar.xz \
    && node --version && npm --version

# ------------------------------------------------------------------ chromium
# Chrome for Testing, not Chrome: it is versioned, archived, and downloadable
# without a signed-in browser, which is what makes a digest pin possible.
ARG CHROME_VERSION=141.0.7390.37
ARG CHROME_SHA256=128b0505afabfa89660842aa0a33a1bd5949244a7027f8b44d1d2fd8f23d7669
RUN curl -fsSL "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-linux64.zip" -o /tmp/chrome.zip \
    && echo "${CHROME_SHA256}  /tmp/chrome.zip" | sha256sum -c - \
    && unzip -q /tmp/chrome.zip -d /opt \
    && rm /tmp/chrome.zip \
    && mkdir -p /opt/pw-browsers \
    && ln -s /opt/chrome-linux64/chrome /opt/pw-browsers/chromium \
    && ln -s /opt/chrome-linux64/chrome /usr/local/bin/chromium \
    && /usr/local/bin/chromium --version

# `lib/server/browser.ts` looks here first. Nothing else in the app needs to
# know where the browser is, and no export code changes to point it at this one.
#
# The path is /opt/pw-browsers/chromium and not somewhere tidier because the
# goldens key their strict tier on the engine *and the path it was launched
# from* — `sameEngine` in scripts/golden.mjs compares `via`. Put the same
# binary somewhere else and the strict tier stops comparing and starts
# skipping, which looks like a pass and proves nothing. Matching the recorded
# path costs a symlink and buys the full check inside the container.
ENV CHROME_PATH=/opt/pw-browsers/chromium

# ----------------------------------------------------------------- the build
FROM base AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Node has its own bundled CA list and ignores the system trust store, so the
# extra CA has to be named for it. Unset, and unnoticed, without one.
RUN if [ -f /usr/local/share/ca-certificates/extra-ca.crt ]; then \
      export NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/extra-ca.crt; \
    fi; npm ci
COPY . .
RUN npm run build

# --------------------------------------------------------------------- serve
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# The whole tree, dev dependencies included, for two reasons that are not
# laziness: puppeteer-core is a devDependency and the export needs it at
# runtime, and keeping tests and scripts means the deployed image can run
# `npm run golden` against the very Chromium it will print with.
COPY --from=build /app /app

# Chrome wants more than Docker's default 64MB of /dev/shm for a big page.
# `--disable-dev-shm-usage` is already in the launch arguments, which handles
# it; this is the belt to that pair of braces and costs nothing.
RUN mkdir -p /dev/shm

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["npm", "run", "start", "--", "--port", "8080", "--hostname", "0.0.0.0"]
