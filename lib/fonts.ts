import type { FontedBook, FontSpec } from './types';

export type FontFamily = {
  family: string;
  category: 'serif' | 'sans-serif' | 'display' | 'handwriting' | 'monospace';
  /** Weights Google publishes for this family. */
  variants: string[];
};

export const CATEGORY_FALLBACK: Record<FontFamily['category'], string> = {
  serif: "Georgia, 'Times New Roman', serif",
  'sans-serif': "'Helvetica Neue', Arial, sans-serif",
  display: "Georgia, 'Times New Roman', serif",
  handwriting: "'Segoe Script', cursive",
  monospace: "'SF Mono', Menlo, Consolas, monospace",
};

/**
 * Families the app can offer with no Google Fonts API key configured. Chosen
 * for book work: text faces that hold up at 10–12pt, plus a few display faces
 * for title pages and covers. With a key set, the full Google catalogue is
 * fetched instead and this becomes the offline fallback.
 */
export const BUNDLED_FAMILIES: FontFamily[] = (
  [
    ['EB Garamond', 'serif'],
    ['Cormorant Garamond', 'serif'],
    ['Cormorant', 'serif'],
    ['Crimson Pro', 'serif'],
    ['Crimson Text', 'serif'],
    ['Libre Baskerville', 'serif'],
    ['Lora', 'serif'],
    ['Spectral', 'serif'],
    ['Source Serif 4', 'serif'],
    ['Vollkorn', 'serif'],
    ['Alegreya', 'serif'],
    ['Cardo', 'serif'],
    ['Gentium Book Plus', 'serif'],
    ['Literata', 'serif'],
    ['Neuton', 'serif'],
    ['Old Standard TT', 'serif'],
    ['PT Serif', 'serif'],
    ['Playfair Display', 'serif'],
    ['Bitter', 'serif'],
    ['Domine', 'serif'],
    ['Frank Ruhl Libre', 'serif'],
    ['Merriweather', 'serif'],
    ['Noto Serif', 'serif'],
    ['Zilla Slab', 'serif'],
    ['Faustina', 'serif'],
    ['Petrona', 'serif'],
    ['Newsreader', 'serif'],
    ['Bodoni Moda', 'serif'],
    ['Marcellus', 'serif'],
    ['Cinzel', 'display'],
    ['Italiana', 'display'],
    ['Gilda Display', 'display'],
    ['Yeseva One', 'display'],
    ['Abril Fatface', 'display'],
    ['Della Respira', 'display'],
    ['Inter', 'sans-serif'],
    ['Work Sans', 'sans-serif'],
    ['Karla', 'sans-serif'],
    ['Jost', 'sans-serif'],
    ['Raleway', 'sans-serif'],
    ['Lato', 'sans-serif'],
    ['Montserrat', 'sans-serif'],
    ['Nunito Sans', 'sans-serif'],
    ['Open Sans', 'sans-serif'],
    ['Source Sans 3', 'sans-serif'],
    ['Libre Franklin', 'sans-serif'],
    ['Archivo', 'sans-serif'],
    ['Cormorant Infant', 'serif'],
    ['Quattrocento', 'serif'],
    ['Rosarivo', 'serif'],
    ['Amiri', 'serif'],
    ['Junge', 'serif'],
    ['Andada Pro', 'serif'],
    ['Eczar', 'serif'],
    ['Manrope', 'sans-serif'],
    ['Outfit', 'sans-serif'],
    ['Cousine', 'monospace'],
    ['IBM Plex Serif', 'serif'],
    ['IBM Plex Sans', 'sans-serif'],
    ['JetBrains Mono', 'monospace'],
  ] as Array<[string, FontFamily['category']]>
).map(([family, category]) => ({
  family,
  category,
  variants: ['400', '400italic', '700', '700italic'],
}));

export function fallbackFor(family: string, families: FontFamily[] = BUNDLED_FAMILIES): string {
  const match = families.find((f) => f.family === family);
  return CATEGORY_FALLBACK[match?.category ?? 'serif'];
}

/** Every family a project references, deduplicated. */
export function projectFamilies(project: FontedBook): string[] {
  const specs: FontSpec[] = [
    ...Object.values(project.typography),
    ...project.cover.textBoxes.map((b) => b.font),
  ];
  return [...new Set(specs.map((s) => s.family).filter(Boolean))];
}

/** Every FontSpec a project sets, across the book and the cover. */
export function projectSpecs(project: FontedBook): FontSpec[] {
  return [
    ...Object.values(project.typography),
    ...project.cover.textBoxes.map((b) => b.font),
  ];
}

/**
 * Google Fonts stylesheet URLs covering exactly the faces a project sets — one
 * URL per weight, each carrying every family that uses that weight in upright
 * and italic.
 *
 * Splitting by weight is not an optimisation, it is a correctness requirement.
 * Ask css2 for two weights of a family that has a variable version and it
 * returns the variable font. Chromium cannot embed a variable-font instance in
 * a PDF: it writes Type3 glyph procedures with no embedded font program, and a
 * print service will reject that. Ask for one weight and it returns a static
 * face, which comes out as a properly embedded CIDFontType2 subset. Verified
 * against Chromium in tests/fonts.test.mjs.
 *
 * Italic is always requested alongside, because the stylesheet sets epigraphs
 * and dedications in italic and a synthesised slant is not an italic.
 */
export function projectFontsHrefs(project: FontedBook): string[] {
  const byWeight = new Map<number, Set<string>>();
  for (const spec of projectSpecs(project)) {
    if (!spec.family) continue;
    const families = byWeight.get(spec.weight) ?? new Set<string>();
    families.add(spec.family);
    byWeight.set(spec.weight, families);
  }

  return [...byWeight.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weight, families]) => {
      const params = [...families]
        .sort()
        .map((family) => `family=${encodeURIComponent(family)}:ital,wght@0,${weight};1,${weight}`)
        .join('&');
      return `https://fonts.googleapis.com/css2?${params}&display=block`;
    });
}

/** One weight, both styles — the shape that keeps css2 on static faces. */
export function googleFontsHref(families: string[], weight = 400): string | null {
  if (!families.length) return null;
  const params = families
    .map((family) => `family=${encodeURIComponent(family)}:ital,wght@0,${weight};1,${weight}`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=block`;
}

/** Head markup that links every stylesheet a project needs. */
export function googleFontsLinks(project: FontedBook): string {
  const hrefs = projectFontsHrefs(project);
  if (!hrefs.length) return '';
  return [
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    ...hrefs.map((href) => `<link rel="stylesheet" href="${href}">`),
  ].join('\n');
}
