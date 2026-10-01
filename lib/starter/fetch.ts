/**
 * The rules the free-graphics helper follows, with the network taken out.
 *
 * Everything here is a decision about somebody else's data: is this item's
 * licence one we accept, is this title one we refuse to touch, what does the
 * manifest row look like, how fast may we ask. All of it is pure, so all of it
 * is tested against saved sample responses and none of the tests go near a
 * network. The script that *does* the asking is `scripts/starter-fetch.mjs`
 * and it is a thin shell round these.
 *
 * The rule that matters most: an item is kept only when the API's own licence
 * field says CC0 or public domain. Never the search page, never a guess from
 * the collection it is in, never "it looks old".
 */

import { refusal } from './licence';

/* ---------------------------------------------------------------- the ask */

export const SOURCES = ['smithsonian', 'commons'] as const;
export type Source = (typeof SOURCES)[number];

/** As fast and as much as one run may take. */
export const LIMITS = {
  /** Requests a second, counted across the whole run. */
  perSecond: 5,
  /** Items a run may keep. Beyond this, run it again with a narrower query. */
  perRun: 100,
} as const;

export type Ask = { source: Source; query: string; count: number; pack?: string };

/** What the command line said, or why it cannot be obeyed. */
export function parseAsk(argv: string[]): { ask: Ask } | { problem: string } {
  const [source, query, count, pack] = argv;
  if (!source || !query) {
    return { problem: 'Usage: npm run starter:fetch <smithsonian|commons> "<query>" [count]' };
  }
  if (!(SOURCES as readonly string[]).includes(source)) {
    return { problem: `Unknown source "${source}". One of: ${SOURCES.join(', ')}.` };
  }
  const wanted = count === undefined ? 20 : Number(count);
  if (!Number.isInteger(wanted) || wanted < 1) {
    return { problem: `"${count}" is not a number of items.` };
  }
  if (wanted > LIMITS.perRun) {
    return {
      problem:
        `${wanted} is more than one run may take. The limit is ${LIMITS.perRun}: ` +
        'run it again with a narrower query rather than asking for a thousand at once.',
    };
  }
  // A fourth argument names the folder, for the curated run where "Animals"
  // is a better pack name than "animal-illustration-engraving". A name with no
  // letters or digits in it is refused rather than quietly becoming the
  // fallback, because somebody who named a pack meant that name.
  if (pack !== undefined && !/[a-z0-9]/i.test(pack)) {
    return { problem: `"${pack}" is not a usable pack name.` };
  }
  const named = pack ? packNameFor(pack) : undefined;
  return {
    ask: { source: source as Source, query: query.trim(), count: wanted, ...(named ? { pack: named } : {}) },
  };
}

/** Milliseconds to wait before request number `n` of a run. */
export const paceFor = (n: number): number => Math.max(0, Math.ceil((n * 1000) / LIMITS.perSecond));

/* ------------------------------------------------------------- the licence */

/**
 * Whether an API's own licence string is one we accept.
 *
 * Delegated to the pack builder's rule rather than kept as a second list here.
 * Two lists would be two answers to one question, and the one that matters is
 * the builder's: a helper that fetched something the builder then refused would
 * waste a download and a person's afternoon.
 */
export const acceptedLicence = (raw: string | null | undefined): boolean =>
  refusal(String(raw ?? '')) === null;

/* ------------------------------------------------- what we will not touch */

/**
 * Names and words that mean "somebody owns this, whatever its copyright says".
 *
 * This is a crude net and is meant to be. It reads the title, the tags and the
 * categories for three things: the name of a character or brand from a short
 * list, the words logo, trademark, emblem, insignia, mascot, and the ® and ™
 * marks. It cannot look at the picture, so it cannot tell a drawing of a mouse
 * from a drawing of *that* mouse — it is a first filter, not a clearance.
 *
 * CC0 waives copyright. It does not waive trademark or personality rights, and
 * a public-domain photograph of a logo is still a logo.
 */
export const REFUSED_WORDS = [
  'logo',
  'trademark',
  'trade mark',
  'registered mark',
  'emblem',
  'insignia',
  'mascot',
  'brand mark',
  'wordmark',
  'coat of arms',
  // The plural of this one is in the middle, where the trailing-s rule below
  // cannot reach it, and "Coats of arms" is how the category is actually named.
  'coats of arms',
];

export const REFUSED_NAMES = [
  'disney',
  'mickey mouse',
  'minnie mouse',
  'pixar',
  'marvel',
  'spider-man',
  'spiderman',
  'batman',
  'superman',
  'pokemon',
  'pokémon',
  'pikachu',
  'nintendo',
  'mario',
  'hello kitty',
  'sanrio',
  'star wars',
  'coca-cola',
  'coca cola',
  'pepsi',
  'nike',
  'adidas',
  'apple inc',
  'barbie',
  'lego',
  'peppa pig',
  'winnie the pooh',
  'snoopy',
  'garfield',
];

const tidyText = (text: string) => text.toLowerCase().replace(/[_]+/g, ' ');

/** Why an item is refused on its words, or null if nothing was found. */
export function refusedByName(title: string, tags: string[] = []): string | null {
  const text = tidyText([title, ...tags].join(' · '));
  if (/[®™]/.test(text)) return 'carries a ® or ™ mark';
  for (const name of REFUSED_NAMES) {
    if (text.includes(tidyText(name))) return `mentions ${name}, which somebody owns the name of`;
  }
  for (const word of REFUSED_WORDS) {
    // Whole words, so "emblematic" and "logotype in a sentence" do not match,
    // but "Logo of the city" does.
    // A trailing "s" counts — a category is "Logos", "Emblems", "Mascots" —
    // but nothing else does, so "emblematic" and "logotype" are left alone.
    if (new RegExp(`(^|[^a-z])${word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}s?($|[^a-z])`).test(text)) {
      return `is described as a ${word}`;
    }
  }
  return null;
}

/* ------------------------------------------------------- reading the APIs */

export type Found = {
  /** A stable id from the source, used to make a filename. */
  id: string;
  title: string;
  /** Where the picture itself is. */
  fileUrl: string;
  /** The page a person should look at, which is what the manifest records. */
  pageUrl: string;
  author: string;
  licence: string;
  tags: string[];
};

export type Skipped = { title: string; why: string };

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Strips the HTML the Commons metadata is full of: "<a href=…>Jane</a>". */
export const plain = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Wikimedia Commons, from `action=query&generator=search&prop=imageinfo`.
 *
 * The licence comes from `extmetadata.LicenseShortName`, which is what the
 * file's own licence template says — not from the search query, which can ask
 * for public domain and be answered with anything.
 */
export function readCommons(body: unknown): { kept: Found[]; skipped: Skipped[] } {
  const pages = (body as { query?: { pages?: Record<string, unknown> } })?.query?.pages ?? {};
  const kept: Found[] = [];
  const skipped: Skipped[] = [];
  for (const raw of Object.values(pages)) {
    const page = raw as Record<string, unknown>;
    const title = text(page.title).replace(/^File:/, '');
    const info = (page.imageinfo as Record<string, unknown>[] | undefined)?.[0];
    if (!info) {
      skipped.push({ title, why: 'the API returned no file for it' });
      continue;
    }
    const meta = (info.extmetadata as Record<string, { value?: unknown }> | undefined) ?? {};
    const licence = plain(text(meta.LicenseShortName?.value));
    const author = plain(text(meta.Artist?.value)) || 'Unknown';
    const categories = plain(text(meta.Categories?.value)).split('|').filter(Boolean);
    const tags = [...categories, plain(text(meta.ObjectName?.value))].filter(Boolean);

    if (!acceptedLicence(licence)) {
      skipped.push({ title, why: `licence is "${licence || 'not stated'}"` });
      continue;
    }
    const refused = refusedByName(title, tags);
    if (refused) {
      skipped.push({ title, why: refused });
      continue;
    }
    const fileUrl = text(info.url);
    if (!fileUrl) {
      skipped.push({ title, why: 'no file URL was returned' });
      continue;
    }
    kept.push({
      id: text(page.pageid) || String(page.pageid ?? title),
      title,
      fileUrl,
      pageUrl: text(info.descriptionurl) || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}`,
      author,
      licence,
      tags: tags.slice(0, 6),
    });
  }
  return { kept, skipped };
}

/**
 * The Smithsonian Open Access search API.
 *
 * Its licence lives at `content.descriptiveNonRepeating.online_media.media[].usage.access`,
 * and only the value `CC0` means the picture may be used — an item can be
 * openly *described* and still have a restricted image, which is exactly the
 * trap this check exists for.
 */
export function readSmithsonian(body: unknown): { kept: Found[]; skipped: Skipped[] } {
  const rows =
    ((body as { response?: { rows?: unknown[] } })?.response?.rows as Record<string, unknown>[]) ?? [];
  const kept: Found[] = [];
  const skipped: Skipped[] = [];
  for (const row of rows) {
    const title = text(row.title);
    const content = (row.content as Record<string, unknown>) ?? {};
    const descriptive = (content.descriptiveNonRepeating as Record<string, unknown>) ?? {};
    const media = ((descriptive.online_media as Record<string, unknown>)?.media as
      | Record<string, unknown>[]
      | undefined) ?? [];
    const picture = media.find(
      (one) => text((one.usage as Record<string, unknown>)?.access as string) === 'CC0',
    );
    if (!picture) {
      const access = media
        .map((one) => text((one.usage as Record<string, unknown>)?.access as string))
        .filter(Boolean);
      skipped.push({ title, why: `no CC0 picture (${access.join(', ') || 'no media at all'})` });
      continue;
    }
    const indexed = (content.indexedStructured as Record<string, unknown>) ?? {};
    const tags = [
      ...((indexed.object_type as string[]) ?? []),
      ...((indexed.topic as string[]) ?? []),
    ].filter(Boolean);
    const refused = refusedByName(title, tags);
    if (refused) {
      skipped.push({ title, why: refused });
      continue;
    }
    const names = (indexed.name as string[]) ?? [];
    kept.push({
      id: text(row.id) || text(row.url) || title,
      title,
      fileUrl: text(picture.content) || text(picture.resource),
      pageUrl: text(descriptive.record_link as string) || text(row.url),
      author: names[0] ?? 'Smithsonian Open Access',
      licence: 'CC0',
      tags: tags.slice(0, 6),
    });
  }
  return { kept, skipped };
}

/* ----------------------------------------------------------- the manifest */

/**
 * A filename that is safe, unique and says what it is.
 *
 * Takes only the title, so the in-app browser can use the same naming without
 * having to build a whole `Found` to ask the question.
 */
export function fileNameFor(
  found: { title: string },
  extension: string,
  taken: Set<string> = new Set(),
): string {
  const stem =
    found.title
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'item';
  const ext = extension.replace(/^\.?/, '.').toLowerCase();
  let name = `${stem}${ext}`;
  let n = 2;
  while (taken.has(name)) name = `${stem}-${n++}${ext}`;
  taken.add(name);
  return name;
}

export type ManifestItem = {
  file: string;
  name: string;
  tags: string[];
  sourceUrl: string;
  author: string;
  licence: string;
  downloadedOn: string;
};

/** The manifest a run writes, in the shape the pack builder checks. */
export function manifestFor(
  pack: string,
  found: { found: Found; file: string }[],
  source: Source,
  query: string,
  on: Date = new Date(),
): { pack: string; name: string; note: string; items: ManifestItem[] } {
  const day = on.toISOString().slice(0, 10);
  return {
    pack,
    name: `${query} (${source})`,
    note:
      `Fetched from the ${source} API on ${day} for the query "${query}". ` +
      'Every item was kept only because that API\'s own licence field said CC0 or public domain.',
    items: found.map(({ found: one, file }) => ({
      file,
      name: one.title.slice(0, 80),
      tags: one.tags.map((tag) => tag.toLowerCase().slice(0, 40)),
      sourceUrl: one.pageUrl,
      author: one.author,
      licence: one.licence,
      downloadedOn: day,
    })),
  };
}

/** A pack folder name from a query: lower case, dashes, nothing else. */
export const packNameFor = (query: string): string =>
  query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'fetched';

/** What a file's bytes are, by what the server said and what the URL ends in. */
export function extensionFor(url: string, contentType: string | null): string | null {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
  const byType: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
  };
  if (byType[type]) return byType[type];
  const guess = (url.split('?')[0].match(/\.(png|jpe?g|webp)$/i) ?? [])[0];
  return guess ? guess.toLowerCase().replace('.jpeg', '.jpg') : null;
}
