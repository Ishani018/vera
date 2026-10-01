import { readCommons, readSmithsonian, type Found } from '../starter/fetch';
import {
  PACE,
  USER_AGENT,
  cacheKey,
  commonsSearchUrl,
  retryAfter,
  smithsonianSearchUrl,
  stillFresh,
  type Cached,
  type Source,
} from './policy';

/**
 * Asking Wikimedia Commons and the Smithsonian, politely, on the server.
 *
 * On the server rather than from the page for two reasons. The key, when there
 * is one, stays on the server; and the pace is kept per server rather than per
 * open tab, which is the number the services actually count.
 *
 * What their rules ask for, and where each is honoured:
 *
 * - **A descriptive User-Agent.** Wikimedia's 2026 limits give a compliant
 *   agent 200 requests a minute and an unidentified one ten, and answer a
 *   browser-like or missing agent with a 403. `USER_AGENT` is the string.
 * - **Requests in series.** One at a time per source, a pace apart — never a
 *   burst, and never one request per result: the Commons search is a single
 *   generator query that brings back the licence, the author and the file URL
 *   for every hit at once.
 * - **Back off on a 429.** Their `Retry-After` when it is sent, five seconds
 *   when it is not, which is their stated floor.
 * - **Cache locally.** Ten minutes per search, in memory, so pressing a
 *   category chip twice asks once.
 * - **One User-Agent, not several.** Spreading traffic across strings to hide
 *   volume is exactly what they ask people not to do.
 *
 * The Smithsonian needs a key from api.data.gov (1000 requests an hour with
 * one). It is read from the environment and never sent anywhere but api.si.edu.
 */

export type Pick = {
  id: string;
  title: string;
  author: string;
  licence: string;
  sourceUrl: string;
  fileUrl: string;
  thumbUrl: string;
};

export type SearchResult = {
  items: Pick[];
  /** What was refused and why, so the screen can say "4 skipped". */
  skipped: { title: string; why: string }[];
  more: boolean;
};

export class ServiceRefused extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ServiceRefused';
  }
}

/** When each source may next be asked. Module state: one per server, not per tab. */
const lastAsked: Record<Source, number> = { commons: 0, smithsonian: 0 };
const waiting: Record<Source, Promise<void>> = {
  commons: Promise.resolve(),
  smithsonian: Promise.resolve(),
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One request at a time per source, a pace apart.
 *
 * Each source has a queue of one promise: a new ask waits for the one before it
 * to finish and then for the gap. Two people searching at once are two requests
 * a second apart, not two at once.
 */
async function paced<T>(source: Source, run: () => Promise<T>): Promise<T> {
  const mine = waiting[source].then(async () => {
    const due = lastAsked[source] + PACE[source];
    const now = Date.now();
    if (due > now) await sleep(due - now);
    lastAsked[source] = Date.now();
  });
  waiting[source] = mine.catch(() => undefined);
  await mine;
  return run();
}

const cache = new Map<string, Cached<SearchResult>>();

/** The key, if there is one. Absent means the Smithsonian is simply not offered. */
export const smithsonianKey = (): string | null =>
  process.env.SMITHSONIAN_API_KEY ?? process.env.SI_API_KEY ?? null;

async function askJson(url: string, source: Source, what: string): Promise<unknown> {
  let response: Response;
  try {
    response = await paced(source, () =>
      fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip', Accept: 'application/json' },
        // A search answer is a document, not a redirect chain to follow.
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      }),
    );
  } catch (error) {
    throw new ServiceRefused(
      `${what} could not be reached. ${error instanceof Error ? error.message : ''}`.trim(),
      502,
    );
  }
  if (response.status === 429) {
    const wait = retryAfter(response.headers.get('retry-after'));
    throw new ServiceRefused(
      `${what} is asking us to slow down. Try again in about ${Math.ceil(wait / 1000)} seconds.`,
      429,
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new ServiceRefused(
      source === 'smithsonian'
        ? `${what} refused the key (${response.status}). Check SMITHSONIAN_API_KEY.`
        : `${what} refused the request (${response.status}).`,
      502,
    );
  }
  if (!response.ok) {
    throw new ServiceRefused(`${what} answered ${response.status}.`, 502);
  }
  try {
    return await response.json();
  } catch {
    throw new ServiceRefused(`${what} answered with something that is not JSON.`, 502);
  }
}

const asPick = (found: Found, thumbUrl: string): Pick => ({
  id: found.id,
  title: found.title,
  author: found.author,
  licence: found.licence,
  sourceUrl: found.pageUrl,
  fileUrl: found.fileUrl,
  thumbUrl,
});

/** A thumbnail URL, if the search gave one, falling back to the original. */
function thumbFor(body: unknown, id: string, fileUrl: string): string {
  const pages = (body as { query?: { pages?: Record<string, { pageid?: number; imageinfo?: { thumburl?: string }[] }> } })
    ?.query?.pages;
  if (!pages) return fileUrl;
  for (const page of Object.values(pages)) {
    if (String(page?.pageid ?? '') === id) return page?.imageinfo?.[0]?.thumburl || fileUrl;
  }
  return fileUrl;
}

export async function search(source: Source, query: string, page: number): Promise<SearchResult> {
  const key = cacheKey(source, query, page);
  const had = cache.get(key);
  if (stillFresh(had, Date.now())) return had!.value;

  let result: SearchResult;
  if (source === 'commons') {
    const body = await askJson(commonsSearchUrl(query, page), 'commons', 'Wikimedia Commons');
    const { kept, skipped } = readCommons(body);
    result = {
      items: kept.map((found) => asPick(found, thumbFor(body, found.id, found.fileUrl))),
      skipped,
      more: kept.length + skipped.length > 0,
    };
  } else {
    const apiKey = smithsonianKey();
    if (!apiKey) throw new ServiceRefused('The Smithsonian needs an API key.', 400);
    const body = await askJson(
      smithsonianSearchUrl(query, page, apiKey),
      'smithsonian',
      'the Smithsonian Open Access API',
    );
    const { kept, skipped } = readSmithsonian(body);
    result = {
      items: kept.map((found) => asPick(found, found.fileUrl)),
      skipped,
      more: kept.length + skipped.length > 0,
    };
  }

  cache.set(key, { at: Date.now(), value: result });
  // A cache that only grows is a leak with a nice name.
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return result;
}
