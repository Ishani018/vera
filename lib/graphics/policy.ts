/**
 * The rules the in-app graphics browser obeys, with the network taken out.
 *
 * Two of them matter more than the rest.
 *
 * **What may be fetched.** `/api/graphics/fetch` takes a URL from the client,
 * which means it is a request to make this server fetch whatever somebody
 * types. Without a closed allow-list that is a hole: an attacker asks it for
 * `http://169.254.169.254/…` or `http://localhost:5432/` and the server reads
 * the inside of its own network back to them. So: https only, an exact host
 * from a list of two, no credentials in the URL, no port of its own, and the
 * same check again on a redirect.
 *
 * **What the services ask of us.** Wikimedia's 2026 rate limits put a client
 * with a descriptive User-Agent on 200 requests a minute and one without on
 * ten, with a 403 or 429 for a missing or browser-like agent; they ask for
 * requests in series, batched through generators, and cached locally. The
 * Smithsonian needs an api.data.gov key and allows 1000 an hour with one.
 * This file holds the numbers; `app/api/graphics/*` does the asking.
 *
 * Everything here is pure, so every rule is tested without a socket.
 */

/* --------------------------------------------------------------- who we are */

/**
 * The User-Agent every request carries.
 *
 * Wikimedia's policy asks for `name/version (contact) library/version` and
 * blocks a browser string or a library default. The contact is this repository,
 * which is where somebody would go to complain about the traffic.
 */
export const USER_AGENT =
  'Isnaevy/1.0 (https://github.com/Ishani018/book; sticker pack builder) node-fetch';

/* ------------------------------------------------------- what may be fetched */

/**
 * The only hosts `/api/graphics/fetch` will open.
 *
 * `upload.wikimedia.org` is where every Commons original lives; `ids.si.edu` is
 * the Smithsonian's image delivery service. Exact hosts, compared whole: a
 * suffix test would accept `upload.wikimedia.org.example.com`, which is a host
 * anybody can register.
 */
export const ALLOWED_HOSTS = ['upload.wikimedia.org', 'ids.si.edu'] as const;

/** Ten megabytes, the same ceiling a hand-made pack item has. */
export const MAX_BYTES = 10 * 1024 * 1024;

/** What a picture may be. SVG is not here: it is a document that can run. */
export const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type Verdict = { ok: true; url: URL } | { ok: false; why: string };

/**
 * Whether this server may fetch a URL at all.
 *
 * Refuses with a reason rather than a boolean, so the route can say which rule
 * was broken and a test can tell two refusals apart.
 */
export function allowedSource(raw: string): Verdict {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, why: 'that is not a URL' };
  }
  if (url.protocol !== 'https:') return { ok: false, why: 'only https is fetched' };
  if (url.username || url.password) return { ok: false, why: 'a URL with credentials in it is refused' };
  if (url.port) return { ok: false, why: 'a URL with a port of its own is refused' };
  if (!(ALLOWED_HOSTS as readonly string[]).includes(url.hostname)) {
    return { ok: false, why: `${url.hostname} is not a host this fetches from` };
  }
  return { ok: true, url };
}

/** Whether a size is within the cap. Unknown length is allowed through here
 *  and caught while reading, because a server need not send Content-Length. */
export const withinCap = (bytes: number | null): boolean => bytes === null || bytes <= MAX_BYTES;

/** Whether a Content-Type is a picture this app can open. */
export function allowedType(header: string | null): boolean {
  const type = (header ?? '').split(';')[0].trim().toLowerCase();
  return (ALLOWED_TYPES as readonly string[]).includes(type);
}

/* -------------------------------------------------------------- asking nicely */

/**
 * How often this server may ask a service, in milliseconds between requests.
 *
 * Wikimedia's compliant-agent tier is 200 a minute. One a second is well under
 * it and leaves room for every other copy of this app on the same address,
 * which is the number that actually gets counted. The Smithsonian's is 1000 an
 * hour with a key, so one every four seconds is the honest pace there.
 */
export const PACE = { commons: 1000, smithsonian: 4000 } as const;

export type Source = keyof typeof PACE;

/** When the next request may go out, given when the last one did. */
export const nextSlot = (source: Source, lastAt: number, now: number): number =>
  Math.max(now, lastAt + PACE[source]);

/**
 * How long to wait after a 429.
 *
 * Wikimedia usually sends `Retry-After`; without it they ask for at least five
 * seconds. A header that is nonsense is treated as absent rather than as zero.
 */
export function retryAfter(header: string | null): number {
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(60_000, seconds * 1000);
  return 5000;
}

/* ------------------------------------------------------------------ caching */

/** What a search is, as a cache key. */
export const cacheKey = (source: string, query: string, page: number): string =>
  `${source}:${query.trim().toLowerCase()}:${page}`;

/** How long a search answer is reused. Ten minutes; the results barely move. */
export const CACHE_MS = 10 * 60 * 1000;

export type Cached<T> = { at: number; value: T };

export const stillFresh = (entry: Cached<unknown> | undefined, now: number): boolean =>
  Boolean(entry) && now - entry!.at < CACHE_MS;

/* ---------------------------------------------------------- building the ask */

/** How many results one page of browsing asks for. */
export const PAGE_SIZE = 24;

/**
 * The Commons search URL.
 *
 * One generator query rather than one request per file, which is what their
 * etiquette asks for: `generator=search` with `prop=imageinfo` returns the
 * licence, the author and the file URL for every hit in a single round trip.
 */
export function commonsSearchUrl(query: string, page: number): string {
  const parameters = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '1',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: '6',
    gsrlimit: String(PAGE_SIZE),
    gsroffset: String(Math.max(0, page) * PAGE_SIZE),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size',
    iiurlwidth: '320',
    iiextmetadatafilter: 'LicenseShortName|Artist|Categories|ObjectName',
  });
  return `https://commons.wikimedia.org/w/api.php?${parameters}`;
}

/** The Smithsonian search URL. The key is the caller's to supply. */
export function smithsonianSearchUrl(query: string, page: number, key: string): string {
  const parameters = new URLSearchParams({
    q: `${query} AND online_media_type:"Images"`,
    rows: String(PAGE_SIZE),
    start: String(Math.max(0, page) * PAGE_SIZE),
    api_key: key,
  });
  return `https://api.si.edu/openaccess/api/v1.0/search?${parameters}`;
}

/** A pack name for whatever was searched for, so added items are grouped. */
export const packFor = (query: string): string =>
  query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'browsed';

/** As many as one press of "Add all" may take. */
export const ADD_ALL_LIMIT = 20;

/** The categories offered beside the search box, as searches. */
export const CATEGORIES: { label: string; query: string }[] = [
  { label: 'Botanical', query: 'botanical illustration' },
  { label: 'Animals', query: 'animal illustration engraving' },
  { label: 'Birds', query: 'bird illustration lithograph' },
  { label: 'Food', query: 'fruit botanical illustration' },
  { label: 'Vintage', query: 'vintage engraving ornament' },
  { label: 'Ornaments', query: 'decorative ornament border' },
];
