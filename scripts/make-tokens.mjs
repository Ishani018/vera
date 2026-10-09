import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  colourAt,
  EASING,
  FONTS,
  textOn,
  MOTION,
  PALETTES,
  PRESS_PROOF,
  RADII,
  SHADOWS,
  SPACE,
  STUDIO_SHADOWS,
  STUDIO_TYPE,
  TYPE,
} from '../lib/theme.ts';

/**
 * Writes `app/tokens.css` from `lib/theme.ts`.
 *
 * Two representations of the same thing — the data the tests read and the CSS
 * the browser reads — so one of them has to be made from the other. This makes
 * the CSS, and `tests/theme.test.mjs` fails if the file on disk is not what
 * this would write, which is how editing the CSS by hand gets caught.
 *
 *   npm run tokens
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** "#C9452C" as "201 69 44" — spaces, so `rgb(… / .55)` is valid CSS. */
function rgbOf(hex) {
  const n = hex.replace('#', '');
  const to = (at) => parseInt(n.slice(at, at + 2), 16);
  return `${to(0)} ${to(2)} ${to(4)}`;
}

/**
 * Every colour of one palette, as `--token: value` lines.
 *
 * Two sets of names are emitted, and the second set is the point of this
 * comment. The **roles** are the vocabulary of the design language: ink, paper,
 * sheet, accentA/B/C. The **aliases** underneath are the names the app was
 * already written in — `ink-100`, `accent-500`, `coral-500` and the rest — kept
 * pointing at the nearest role so that changing the palette does not require
 * changing every component on the same commit. They are a bridge, not a second
 * system: nothing new should use one, and each is a line that can be deleted
 * once the last component that reads it has moved over.
 */
function colours(p) {
  const lines = [
    '/* roles */',
    `--color-ink-900: ${p.ink900};`,
    `--color-ink-700: ${p.ink700};`,
    `--color-ink-500: ${p.ink500};`,
    `--color-ink-300: ${p.ink300};`,
    '',
    `--color-paper-50: ${p.paper50};`,
    `--color-paper-100: ${p.paper100};`,
    `--color-paper-200: ${p.paper200};`,
    `--color-paper-300: ${p.paper300};`,
    `--color-sheet: ${p.sheet};`,
    '',
    `--color-accenta-500: ${p.accentA500};`,
    `--color-accenta-700: ${p.accentA700};`,
    `--color-accenta-100: ${p.accentA100};`,
    `--color-accentb-500: ${p.accentB500};`,
    `--color-accentb-700: ${p.accentB700};`,
    `--color-accentb-100: ${p.accentB100};`,
    `--color-accentc-400: ${p.accentC400};`,
    `--color-accentc-100: ${p.accentC100};`,
    `--color-outline: ${p.outline};`,
    '',
    '/* what the palette decided, for the components that have to ask */',
    /*
      Asked of `colourAt`, never worked out again here.

      These started as a second copy of the same rules, and the copy drifted:
      a dark sidebar was given `paper50` for its text, which is near-white in
      five palettes and near-BLACK in Night, so Night's nav rows came out
      near-black on near-black. The contrast sweep did not catch it because the
      sweep reads `colourAt` and the browser read this. One of them had to go.
    */
    `--text-on-accenta: ${colourAt(p, 'textOnA')};`,
    // Worked out rather than declared: Riso's pink needs ink on it and Riso's
    // deep magenta needs white, so the hover state cannot inherit the rest one.
    `--text-on-accenta-700: ${colourAt(p, 'textOnA700')};`,
    /*
      Ink on a real white fill — a secondary button, a text field — which is a
      different question from ink on the page. `sheet` is #FFFFFF in every
      palette including Night, where `ink900` is near-WHITE, so anything that
      reached for ink900 on a sheet fill was invisible there. The sweep has
      always checked this pair as "a title on a page silhouette"; it just had no
      variable to hand the stylesheet.
    */
    `--text-on-sheet: ${colourAt(p, 'inkOnSheet')};`,
    `--sidebar-fill: ${colourAt(p, 'sidebarFill')};`,
    `--sidebar-text: ${colourAt(p, 'sidebarText')};`,
    `--sidebar-muted: ${colourAt(p, 'sidebarMuted')};`,
    `--sidebar-active-fill: ${colourAt(p, 'sidebarActiveFill')};`,
    `--sidebar-active-text: ${colourAt(p, 'sidebarActiveText')};`,
    '',
    "/* the studio screens: a page, a card on it, and the card's edge */",
    `--studio-page: ${colourAt(p, 'studioPage')};`,
    `--studio-card: ${colourAt(p, 'studioCard')};`,
    `--studio-line: ${colourAt(p, 'studioLine')};`,
    '',
    '/* aliases — the names the app was written in, pointing at the roles above */',
    `--color-paper: ${p.sheet};`,
    `--color-ink-50: ${p.paper50};`,
    `--color-ink-100: ${p.paper100};`,
    `--color-ink-200: ${p.paper200};`,
    `--color-ink-400: ${p.ink300};`,
    `--color-ink-600: ${p.ink700};`,
    '',
    `--color-accent-50: ${p.accentB100};`,
    `--color-accent-200: ${p.accentB100};`,
    `--color-accent-500: ${p.accentB500};`,
    `--color-accent-600: ${p.accentB700};`,
    '',
    `--color-coral-50: ${p.accentA100};`,
    `--color-coral-500: ${p.accentA500};`,
    `--color-coral-600: ${p.accentA700};`,
    `--color-sun-50: ${p.accentC100};`,
    `--color-sun-500: ${p.accentC400};`,
    `--color-sun-600: ${p.ink900};`,
    `--color-lilac-50: ${p.accentB100};`,
    `--color-lilac-500: ${p.accentB500};`,
    `--color-lilac-600: ${p.accentB700};`,
    `--color-sage-50: ${p.accentB100};`,
    `--color-sage-500: ${p.accentB500};`,
    `--color-sage-600: ${p.accentB700};`,
    `--color-denim-50: ${p.accentB100};`,
    `--color-denim-500: ${p.accentB500};`,
    `--color-denim-600: ${p.accentB700};`,
    `--color-clay-50: ${p.accentA100};`,
    `--color-clay-500: ${p.accentA500};`,
    `--color-clay-600: ${p.accentA700};`,
    '',
    `--color-ground: ${p.paper200};`,
    `--color-ground-rail: ${p.paper300};`,
    `--color-ground-deep: ${p.paper300};`,
    '',
    `--shade: ${rgbOf(p.isDark ? '#000000' : p.ink900)};`,
    `--glow: ${rgbOf(p.accentA500)};`,
    '',
    '/* the chequerboard behind a transparent picture */',
    `--chequer-light: ${p.paper50};`,
    `--chequer-dark: ${p.paper200};`,
  ];
  return lines;
}

const indent = (lines, by) => lines.map((line) => (line ? `${' '.repeat(by)}${line}` : '')).join('\n');

const scale = (prefix, values) =>
  Object.entries(values).map(([key, value]) => `--${prefix}-${key}: ${value};`);

const head = `/*
  GENERATED by scripts/make-tokens.mjs from lib/theme.ts. Do not edit by hand:
  a test compares this file with what that script writes, and an edit here is
  an edit the contrast sweep never sees.

  Run: npm run tokens
*/`;

const body = `${head}

/*
  The default palette, and the shape of all of them.

  Tailwind reads these through @theme, so \`bg-accenta-500\` comes out as
  \`var(--color-accenta-500)\` — which means a palette can change what that
  utility paints by redefining the variable, without a single class changing
  anywhere.

  \`static\` because the palettes below are plain CSS that Tailwind does not
  read: without it Tailwind drops any token no utility happens to mention, and a
  palette would then override a variable the default never defined — which is
  exactly what happened to the coral the first time this was built.
*/
@theme static {
${indent(colours(PRESS_PROOF), 2)}

${indent(scale('radius', RADII), 2)}

${indent(scale('shadow', SHADOWS), 2)}

${indent(scale('motion', MOTION), 2)}

${indent(scale('ease', EASING), 2)}

${indent(scale('text', TYPE), 2)}

${indent(scale('studio-text', STUDIO_TYPE), 2)}

${indent(scale('studio-shadow', STUDIO_SHADOWS), 2)}

${indent(scale('space', SPACE), 2)}

  --font-display: ${FONTS.display};
  --font-body: ${FONTS.body};
  --font-mono: ${FONTS.mono};
  --font-wordmark: ${FONTS.wordmark};
}

${PALETTES.filter((p) => p.id !== PRESS_PROOF.id)
  .map(
    (p) => `/* ${p.name} — ${p.note}. */
:root[data-theme='${p.id}'] {
${indent(colours(p), 2)}
}`,
  )
  .join('\n\n')}
`;

const out = join(ROOT, 'app', 'tokens.css');
const was = (() => {
  try {
    return readFileSync(out, 'utf8');
  } catch {
    return null;
  }
})();
writeFileSync(out, body);
console.log(was === body ? 'app/tokens.css is already up to date.' : 'app/tokens.css written.');
export { body as TOKENS_CSS };
