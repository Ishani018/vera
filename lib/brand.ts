/**
 * The names, in one place.
 *
 * Vera is the product. Isnaevy is the studio that makes it, and stays the umbrella brand. Anything on screen that
 * says either name reads it from here, so a rename is a change to this file and nothing else
 * (`tests/brand.test.mjs` fails if a literal name turns up anywhere else in app/, components/ or lib/).
 *
 * What does NOT come from here, on purpose:
 * - Storage names: the IndexedDB database and every localStorage key keep the names they were created with
 *   ("versecraft:…", "isnaevy:theme"). Renaming one would orphan what people have saved. See docs/BRAND.md.
 * - Anything inside an exported book, cover or PDF. "Isnaevy" is the publishing brand on KDP, and a product
 *   rename must not reach a file somebody has already sent to print.
 */

export type Brand = {
  /** The product: what the app is called. */
  product: string;
  /** The studio behind it: the umbrella brand. */
  studio: string;
  /** "by Isnaevy", the small secondary mark. */
  byline: string;
  /** Where the product lives. */
  siteUrl: string;
  /** Where the studio lives. */
  studioUrl: string;
};

const trimSlash = (url: string) => url.replace(/\/+$/, '');

/** Reads the two URLs from the environment, falling back to the defaults. Pure, so it can be tested with any env. */
export function resolveBrand(env: { NEXT_PUBLIC_SITE_URL?: string; NEXT_PUBLIC_STUDIO_URL?: string } = {}): Brand {
  const product = 'Vera';
  const studio = 'Isnaevy';
  return {
    product,
    studio,
    byline: `by ${studio}`,
    siteUrl: trimSlash(env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://vera.isnaevy.com'),
    studioUrl: trimSlash(env.NEXT_PUBLIC_STUDIO_URL?.trim() || 'https://isnaevy.com'),
  };
}

// Each variable is named in full, because the bundler only substitutes `process.env.NEXT_PUBLIC_X` written out.
export const BRAND = resolveBrand({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_STUDIO_URL: process.env.NEXT_PUBLIC_STUDIO_URL,
});
