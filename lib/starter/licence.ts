/**
 * Which licences a starter pack may carry, and nothing else.
 *
 * A closed list, deliberately. The temptation with licences is to accept
 * anything that looks permissive and sort it out later; the trouble is that
 * "later" is after somebody has sold a sticker sheet. CC-BY is permissive and
 * is not on this list, because attribution is a condition and a sticker on a
 * parcel carries no credit line.
 *
 * Matching ignores case and punctuation, because the same licence is written a
 * dozen ways across the sites people actually download from — "CC0 1.0",
 * "cc0-1.0", "CC0 1.0 Universal", "Public Domain Mark 1.0". What it does not do
 * is guess: a string that is not one of these is refused and named, rather than
 * being given the benefit of the doubt.
 */

/** Every spelling of "you may do what you like with this" that is accepted. */
export const ALLOWED_LICENCES = [
  'cc0',
  'cc0 1 0',
  'cc0 1 0 universal',
  'creative commons zero',
  'creative commons zero 1 0',
  'creative commons zero 1 0 universal',
  // How SPDX and GitHub write it, which is how it arrives when somebody
  // copies the licence name off a repository rather than off a gallery.
  'creative commons zero v1 0 universal',
  'public domain',
  'public domain mark',
  'public domain mark 1 0',
  'pdm 1 0',
  'no known copyright restrictions',
  'no known copyright',
] as const;

/**
 * The same string, with the differences that do not matter taken out.
 *
 * Case, punctuation and runs of spaces: "CC0-1.0" and "cc0 1.0" are the same
 * licence written by two different websites.
 */
export const tidyLicence = (raw: string): string =>
  String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const isAllowedLicence = (raw: string): boolean =>
  (ALLOWED_LICENCES as readonly string[]).includes(tidyLicence(raw));

/**
 * Licences that come up constantly and must still be refused, with the reason.
 *
 * Named rather than lumped in with gibberish, because "CC-BY is not allowed
 * here, and why" is a useful thing to be told, and "unknown licence" is not.
 */
export const REFUSED: { match: RegExp; because: string }[] = [
  {
    match: /^cc by sa/,
    because: 'share-alike would make every sticker you draw from it share-alike too',
  },
  {
    match: /^cc by nc/,
    because: 'non-commercial, and these are for things you sell',
  },
  {
    match: /^cc by nd/,
    because: 'no derivatives, and tracing a sticker from it is a derivative',
  },
  {
    match: /^cc by/,
    because: 'attribution is a condition, and a sticker on a parcel carries no credit line',
  },
  {
    match: /royalty free|free for commercial|unsplash|pexels|pixabay/,
    because: 'a site licence is not a public-domain dedication, whatever the site calls it',
  },
  { match: /^$/, because: 'no licence was given at all' },
];

/** Why a licence was refused, in a sentence, or null when it was not. */
export function refusal(raw: string): string | null {
  if (isAllowedLicence(raw)) return null;
  const tidy = tidyLicence(raw);
  const known = REFUSED.find((rule) => rule.match.test(tidy));
  if (known) return `"${raw || '(blank)'}" — ${known.because}`;
  return `"${raw}" is not a public-domain dedication this accepts`;
}
