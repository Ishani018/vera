import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  CUSTOM_KEY,
  DEFAULT_THEME,
  EASING,
  FONTS,
  MOTION,
  MUST_READ,
  PALETTES,
  PRESS_PROOF,
  RADII,
  SHADOWS,
  THEMES,
  THEME_KEY,
  TYPE,
  chooseTheme,
  colourAt,
  inkOnSheet,
  textOn,
  themeById,
} from '../lib/theme.ts';
import { CONTRAST_MIN, contrastRatio } from '../lib/legibility.ts';

/**
 * The design system, checked as data.
 *
 * The contrast sweep is the important half: every pair of colours a reader has
 * to read, in every theme, against WCAG AA. It can only check what it can read,
 * which is why the colours are data and why the guard at the bottom fails if a
 * component starts carrying its own.
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/* ------------------------------------------------------- the contrast sweep */

test('every readable pair passes AA, in every palette', () => {
  const failures = [];
  for (const theme of THEMES) {
    for (const pair of MUST_READ) {
      const text = colourAt(theme, pair.text);
      const on = colourAt(theme, pair.on);
      const ratio = contrastRatio(text, on);
      const need = pair.large ? 3 : CONTRAST_MIN;
      if (ratio === null || ratio < need) {
        failures.push(`${theme.id}: ${pair.what} — ${text} on ${on} = ${ratio?.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('the sweep covers every colour role the palette has', () => {
  // A colour nothing checks is a colour nobody has looked at. Every role must
  // appear somewhere in the list, as text or as a surface.
  const named = new Set(MUST_READ.flatMap((pair) => [pair.text, pair.on]));
  const resolved = new Set([
    'textOnA',
    'textOnA700',
    'inkOnSheet',
    'mutedOnSheet',
    'sidebarFill',
    'sidebarText',
    'sidebarMuted',
    'sidebarActiveFill',
    'sidebarActiveText',
    // The studio screens' page and card, added when those surfaces were.
    'studioPage',
    'studioCard',
    // What can be read on the white top bar, which is not what can be read on
    // the page: in Night the deep accent steps invert.
    'redOnSheet',
    'tealOnSheet',
  ]);
  const roles = [
    'ink900', 'ink700', 'ink500', 'ink300',
    'paper50', 'paper100', 'paper200', 'paper300', 'sheet',
    'accentA500', 'accentA700', 'accentA100',
    'accentB500', 'accentB700', 'accentB100',
    'accentC400', 'accentC100', 'outline',
  ];
  // Every name used in the sweep is either a role or one of the resolved
  // decisions — a typo in a pair name would otherwise read as `undefined` and
  // quietly pass.
  for (const name of named) {
    assert.ok(roles.includes(name) || resolved.has(name), `${name} is neither a role nor a decision`);
  }
  // And every role that a reader ever sees is covered, directly or through a
  // decision that resolves to it.
  const touched = new Set();
  for (const palette of PALETTES) {
    for (const name of named) {
      const value = colourAt(palette, name);
      for (const role of roles) if (palette[role] === value) touched.add(role);
    }
  }
  for (const role of roles) {
    // paper300 is a rule and a track, never a text background; it is checked by
    // the layout audit instead, where a 1px line is a thing you can measure.
    if (role === 'paper300') continue;
    assert.ok(touched.has(role), `${role} is unchecked`);
  }
});

test('six palettes, and each is genuinely its own', () => {
  assert.equal(PALETTES.length, 6);
  const pages = PALETTES.map((p) => p.paper50);
  assert.equal(new Set(pages).size, 6, pages.join(', '));
  const ids = PALETTES.map((p) => p.id);
  assert.deepEqual(ids, ['press-proof', 'sherbet', 'mint-cloud', 'lilac-haze', 'riso', 'night']);
});

test('press-proof is the default, and every palette is complete', () => {
  assert.equal(DEFAULT_THEME, PRESS_PROOF.id);
  const roles = [
    'ink900', 'ink700', 'ink500', 'ink300',
    'paper50', 'paper100', 'paper200', 'paper300', 'sheet',
    'accentA500', 'accentA700', 'accentA100',
    'accentB500', 'accentB700', 'accentB100',
    'accentC400', 'accentC100', 'outline',
  ];
  for (const palette of PALETTES) {
    for (const role of roles) {
      assert.match(palette[role], /^#[0-9A-F]{6}$/, `${palette.id} ${role}: ${palette[role]}`);
    }
    assert.ok(['dark', 'tinted'].includes(palette.sidebarStyle), palette.id);
    assert.ok(['sheet', 'ink'].includes(palette.textOnAccentA), palette.id);
    assert.equal(typeof palette.isDark, 'boolean', palette.id);
  }
});

test('the ink ramp runs one way and the paper ramp the other', () => {
  const light = (hex) => contrastRatio(hex, '#000000');
  for (const palette of PALETTES) {
    // ink900 is the strongest ink, whichever end of the scale that is.
    assert.ok(light(palette.ink900) < light(palette.ink300) === !palette.isDark,
      `${palette.id}: the ink ramp does not run the way the palette says`);
    assert.ok(light(palette.paper50) > light(palette.paper300) === !palette.isDark,
      `${palette.id}: the paper ramp does not run the way the palette says`);
  }
});

test('one palette is dark, and it is the one that says so', () => {
  const dark = PALETTES.filter((p) => p.isDark);
  assert.equal(dark.length, 1);
  assert.equal(dark[0].id, 'night');
  // In a dark palette the page is darker than the ink, which is the whole test
  // of whether `isDark` was set honestly.
  assert.ok(contrastRatio(dark[0].paper50, '#000000') < contrastRatio(dark[0].ink900, '#000000'));
});

test('outline is a near-black everywhere, including the dark palette', () => {
  for (const palette of PALETTES) {
    // It is what dark text on a white silhouette is drawn in, so it has to work
    // against `sheet` in every palette, dark one included.
    assert.ok(contrastRatio(palette.outline, palette.sheet) >= 4.5, palette.id);
  }
});

test('text on a fill is chosen by contrast, not by hope', () => {
  for (const palette of PALETTES) {
    for (const fill of [palette.accentA500, palette.accentA700, palette.accentB500]) {
      assert.ok(contrastRatio(textOn(palette, fill), fill) >= 4.5, `${palette.id}: ${fill}`);
    }
  }
  // Riso is the palette this exists for: white on its pink is unreadable.
  const riso = PALETTES.find((p) => p.id === 'riso');
  assert.equal(textOn(riso, riso.accentA500), riso.outline);
  assert.equal(riso.textOnAccentA, 'ink');
});

test('a white page silhouette is lettered in something you can read', () => {
  for (const palette of PALETTES) {
    assert.ok(contrastRatio(inkOnSheet(palette), palette.sheet) >= 4.5, palette.id);
  }
});

test('four faces, each with one job', () => {
  assert.deepEqual(Object.keys(FONTS), ['display', 'body', 'mono', 'wordmark']);
  assert.match(FONTS.display, /Fraunces/);
  assert.match(FONTS.body, /Inter/);
  assert.match(FONTS.mono, /DM Mono/);
  assert.match(FONTS.wordmark, /^'Wordmark Display'/);
  // Every stack ends in something the machine already has.
  for (const [name, stack] of Object.entries(FONTS)) {
    assert.match(stack, /(serif|sans-serif|monospace|cursive|system-ui)\s*$/, name);
  }
});

/* -------------------------------------------------------------- the choosing */

test('the address wins, then what was remembered, then the default', () => {
  assert.equal(chooseTheme('?theme=riso', 'night'), 'riso');
  assert.equal(chooseTheme('', 'night'), 'night');
  assert.equal(chooseTheme('', null), 'press-proof');
  assert.equal(chooseTheme('?theme=nonsense', 'night'), 'night', 'a name that is not a palette is ignored');
  assert.equal(chooseTheme('?theme=nonsense', 'also-nonsense'), 'press-proof');
  assert.equal(chooseTheme('?other=1', null), 'press-proof');
  // A palette somebody mixed themselves answers to its own id.
  assert.equal(chooseTheme('?theme=custom', null), 'custom');
  assert.equal(chooseTheme('', 'custom'), 'custom');
});

test('the palette is remembered under keys of its own', () => {
  // Not keys anything else uses: losing one loses a preference, not a book.
  assert.equal(THEME_KEY, 'isnaevy:theme');
  assert.equal(CUSTOM_KEY, 'isnaevy:palette-custom');
  for (const key of [THEME_KEY, CUSTOM_KEY]) {
    assert.ok(!key.includes('versecraft'), 'that name belongs to the database');
  }
});

test('an unknown id reads as the default rather than as nothing', () => {
  assert.equal(themeById('nope').id, 'press-proof');
  assert.equal(themeById(null).id, 'press-proof');
  assert.equal(themeById('night').id, 'night');
});

/* ---------------------------------------------------------------- the scales */

test('a proof sheet has no drop shadows on it', () => {
  assert.deepEqual(Object.keys(SHADOWS), ['rest', 'raised', 'float', 'glow']);
  // Depth comes from outlines, flat tints and crop marks. The only exception is
  // the one step for things that genuinely float over the page, and even that
  // is a hairline and a short offset rather than a glow.
  for (const name of ['rest', 'raised', 'glow']) {
    assert.equal(SHADOWS[name], 'none', `${name} should be none`);
  }
  assert.match(SHADOWS.float, /var\(--shade\)/);
  assert.ok(!/\b\d\dpx \d\dpx/.test(SHADOWS.float), 'float should not be a big soft blur');
});

test('the durations are the four asked for, and none is slow', () => {
  assert.deepEqual(MOTION, { fast: '120ms', base: '200ms', slow: '320ms', slower: '480ms' });
  for (const value of Object.values(MOTION)) {
    assert.ok(Number(value.replace('ms', '')) <= 480);
  }
});

test('three curves: out, in-out, and one that overshoots', () => {
  assert.deepEqual(Object.keys(EASING), ['out', 'inOut', 'spring']);
  // A spring is a curve whose second control point goes past 1.
  const [, , , end] = EASING.spring.match(/cubic-bezier\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)/).slice(1);
  assert.ok(Number(EASING.spring.split(',')[1]) > 1, EASING.spring);
  assert.equal(end, '1');
});

test('the scales are ramps, not piles', () => {
  const px = (value) => Number(value.replace('px', ''));
  const sizes = Object.values(TYPE).map(px);
  assert.deepEqual([...sizes].sort((a, b) => a - b), sizes, 'the type scale is out of order');
  // The radii are a set of four values with names, not a ramp: 3 on a tag, 6 on
  // anything you press or type into, 8 on a rail item, 18 on a pill.
  const radii = Object.values(RADII).filter((one) => one !== '999px').map(px);
  assert.deepEqual([...new Set(radii)].sort((a, b) => a - b), [3, 6, 8, 18]);
});

/* --------------------------------------------- the CSS is made, not written */

test('app/tokens.css is what the generator writes', () => {
  // Two copies of the same thing — the data and the stylesheet — so one is made
  // from the other, and this fails the moment somebody edits the made one.
  const before = readFileSync(join(ROOT, 'app', 'tokens.css'), 'utf8');
  execFileSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--import',
      './tests/ts-resolver.mjs',
      'scripts/make-tokens.mjs',
    ],
    { cwd: ROOT, stdio: 'pipe' },
  );
  const after = readFileSync(join(ROOT, 'app', 'tokens.css'), 'utf8');
  assert.equal(before, after, 'run `npm run tokens` — the stylesheet is out of date');
});

test('every palette is in the stylesheet, and every colour with it', () => {
  const css = readFileSync(join(ROOT, 'app', 'tokens.css'), 'utf8');
  const roles = [
    'ink900', 'ink700', 'ink500', 'ink300',
    'paper50', 'paper100', 'paper200', 'paper300', 'sheet',
    'accentA500', 'accentA700', 'accentA100',
    'accentB500', 'accentB700', 'accentB100',
    'accentC400', 'accentC100', 'outline',
  ];
  for (const palette of PALETTES) {
    if (palette.id !== DEFAULT_THEME) assert.match(css, new RegExp(`data-theme='${palette.id}'`));
    for (const role of roles) {
      assert.ok(css.includes(palette[role]), `${palette.id}: ${role} ${palette[role]} is not in the stylesheet`);
    }
  }
});

test('the tokens are emitted whether or not a utility mentions them', () => {
  // Tailwind drops unused tokens from a plain @theme, and a theme that
  // overrides a variable the default never defined paints nothing.
  assert.match(readFileSync(join(ROOT, 'app', 'tokens.css'), 'utf8'), /@theme static/);
});

/* ------------------------------------------- nothing carries its own colour */

/**
 * Colours that are part of somebody's work rather than part of the chrome.
 *
 * Each goes into a file people keep or sell, so it must not move with a theme:
 * a sticker whose ink changed colour because the app was in Candy would be a
 * sticker nobody asked to change.
 */
const DATA_DEFAULTS = {
  'components/stickers/StickerStudio.tsx': ['#1B1815', '#FFFFFF', '#E8B4B8'],
  'components/stickers/StickerSheet.tsx': ['#FFFFFF', '#D14B4B'],
  'components/CoverDesigner.tsx': ['#1a1a1a', '#ffffff'],
  'components/cover/ColourField.tsx': ['#000000'],
  'app/layout.tsx': ['#F5EFE5'],
};

test('no chrome carries a colour of its own', () => {
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return walk(path);
      return /\.tsx$/.test(path) ? [path] : [];
    });

  const strays = [];
  for (const path of [...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'app'))]) {
    const relative = path.slice(ROOT.length + 1);
    const allowed = DATA_DEFAULTS[relative] ?? [];
    for (const found of readFileSync(path, 'utf8').match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
      if (!allowed.includes(found)) strays.push(`${relative}: ${found}`);
    }
  }
  assert.deepEqual(strays, []);
});

test('the allow-list is only the colours that go into somebody’s files', () => {
  // If this list grows, the question to ask is "does this colour end up in an
  // export?". If not, it is chrome and belongs in lib/theme.ts.
  assert.deepEqual(Object.keys(DATA_DEFAULTS).sort(), [
    'app/layout.tsx',
    'components/CoverDesigner.tsx',
    'components/cover/ColourField.tsx',
    'components/stickers/StickerSheet.tsx',
    'components/stickers/StickerStudio.tsx',
  ]);
});

/* --------------------------------- every colour class names a real token */

/**
 * `bg-paper-0` was used in seven places and compiled to nothing.
 *
 * Tailwind silently drops a utility whose token does not exist, so the elements
 * simply had no background and nobody saw a build error. This is the cheapest
 * guard against the next one: the families below are ours, so every utility
 * built on one of them must name a token that `app/tokens.css` actually defines.
 */
const OUR_FAMILIES = [
  /*
    Longest first: alternation is ordered, so `accent` listed before `accenta`
    would match the first seven letters of `bg-accenta-500` and then report the
    token `accent`, which does not exist. That is exactly what happened the
    first time the new roles were used.
  */
  'accenta',
  'accentb',
  'accentc',
  'accent',
  'outline',
  'paper',
  'sheet',
  'ink',
  'coral',
  'sun',
  'lilac',
  'sage',
  'denim',
  'clay',
  'ground',
];

test('every colour utility built on our own tokens names one that exists', () => {
  const css = readFileSync(join(ROOT, 'app', 'tokens.css'), 'utf8');
  const defined = new Set((css.match(/--color-[a-z0-9-]+/g) ?? []).map((n) => n.slice('--color-'.length)));

  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return walk(path);
      return /\.(tsx|css)$/.test(path) ? [path] : [];
    });

  const families = OUR_FAMILIES.join('|');
  // The utilities that take a colour, with an optional opacity suffix.
  const pattern = new RegExp(
    `\\b(?:bg|text|border|outline|ring|decoration|fill|stroke|from|via|to|shadow|caret|accent)` +
      `-(?:(${families})(?:-[a-z0-9]+)*)(?![a-z0-9])`,
    'g',
  );

  const strays = [];
  for (const path of [...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'app'))]) {
    if (path.endsWith('tokens.css')) continue;
    for (const found of readFileSync(path, 'utf8').match(pattern) ?? []) {
      // Drop the utility prefix and any /40 opacity, leaving the token name.
      const token = found.slice(found.indexOf('-') + 1).split('/')[0];
      if (!defined.has(token)) strays.push(`${path.slice(ROOT.length + 1)}: ${found}`);
    }
  }
  assert.deepEqual([...new Set(strays)], []);
});

/* ------------------------- arbitrary values must say var() out loud */

/**
 * `shadow-[--shadow-rest]` and `duration-[--motion-base]` compiled to nothing.
 *
 * Tailwind 4 emits the bracket's contents verbatim, so `shadow-[--shadow-rest]`
 * becomes `--tw-shadow: --shadow-rest` — a literal string, not a reference, and
 * an invalid `box-shadow` is simply no shadow. The same shorthand worked in
 * Tailwind 3, which is why thirty-three of them were written and none of them
 * ran: every card shadow in the app was missing, and every motion duration and
 * easing fell back to the browser's default.
 *
 * The fix is to write `var()`, so this refuses the shorthand outright. It also
 * checks the token exists, since a correct `var()` naming nothing is the other
 * half of the same mistake.
 */
test('an arbitrary utility value that means a token says var() and names a real one', () => {
  const tokens = new Set(
    (readFileSync(join(ROOT, 'app', 'tokens.css'), 'utf8').match(/--[a-z0-9-]+(?=\s*:)/g) ?? []),
  );
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return walk(path);
      return /\.tsx$/.test(path) ? [path] : [];
    });

  const shorthand = [];
  const missing = [];
  for (const path of [...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'app'))]) {
    const source = readFileSync(path, 'utf8');
    const where = path.slice(ROOT.length + 1);
    for (const found of source.match(/[a-z-]+-\[--[a-z0-9-]+\]/g) ?? []) {
      shorthand.push(`${where}: ${found} — write it as -[var(--…)]`);
    }
    for (const found of source.match(/[a-z-]+-\[var\(--[a-z0-9-]+\)\]/g) ?? []) {
      const name = found.slice(found.indexOf('var(') + 4, found.lastIndexOf(')'));
      // A property the component sets on itself (like --reach or --tilt-x) is
      // not a theme token and is not expected in tokens.css.
      if (!tokens.has(name) && !source.includes(`'${name}'`) && !source.includes(`"${name}"`)) {
        missing.push(`${where}: ${found} — no such token`);
      }
    }
  }
  assert.deepEqual(shorthand, []);
  assert.deepEqual(missing, []);
});

/**
 * The CSS the browser reads says what the model says.
 *
 * `app/tokens.css` is generated, so in principle it cannot disagree with
 * `lib/theme.ts` — but the generator used to work the sidebar colours out a
 * second time, by hand, and the second copy was wrong for Night: it gave a
 * near-black sidebar `paper50` for its text, which is near-white in five
 * palettes and near-BLACK in the dark one. Nothing caught it, because the
 * contrast sweep reads `colourAt` and only the browser read the CSS.
 *
 * This reads the generated file and checks the derived colours against
 * `colourAt` directly, so the two can never drift apart again in silence.
 */
test('the sidebar colours in tokens.css are the ones colourAt decides', () => {
  const css = readFileSync(join(ROOT, 'app', 'tokens.css'), 'utf8');
  const derived = [
    ['--text-on-accenta', 'textOnA'],
    ['--text-on-accenta-700', 'textOnA700'],
    ['--sidebar-fill', 'sidebarFill'],
    ['--sidebar-text', 'sidebarText'],
    ['--sidebar-muted', 'sidebarMuted'],
    ['--sidebar-active-fill', 'sidebarActiveFill'],
    ['--sidebar-active-text', 'sidebarActiveText'],
  ];

  const wrong = [];
  for (const palette of PALETTES) {
    // The block this palette writes, up to the end of it. The default palette
    // has no selector of its own: it is the one `@theme static` declares.
    const at = css.indexOf(`:root[data-theme='${palette.id}']`);
    const start = at === -1 ? css.indexOf('@theme static {') : at;
    assert.notEqual(start, -1, `no block for ${palette.id}`);
    const block = css.slice(start, css.indexOf('\n}', start));
    for (const [token, path] of derived) {
      const found = block.match(new RegExp(`${token}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];
      const want = colourAt(palette, path);
      if (found?.toUpperCase() !== want.toUpperCase()) {
        wrong.push(`${palette.id} ${token}: css says ${found}, colourAt says ${want}`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});

/**
 * Every sidebar row is legible, not just the two the sweep named.
 *
 * The sweep covered `sidebarText` and `sidebarMuted` on `sidebarFill`, and
 * both passed while Night's nav was unreadable, because what the browser drew
 * came from the generator rather than from these roles. Belt and braces: the
 * same pairs again, asserted against the palette data itself.
 */
test('every sidebar pair passes AA in every palette', () => {
  const bad = [];
  for (const palette of PALETTES) {
    const fill = colourAt(palette, 'sidebarFill');
    for (const path of ['sidebarText', 'sidebarMuted']) {
      const ratio = contrastRatio(colourAt(palette, path), fill);
      if (ratio < CONTRAST_MIN) bad.push(`${palette.id} ${path} on the sidebar: ${ratio.toFixed(2)}`);
    }
    const active = contrastRatio(
      colourAt(palette, 'sidebarActiveText'),
      colourAt(palette, 'sidebarActiveFill'),
    );
    if (active < CONTRAST_MIN) bad.push(`${palette.id} the active nav row: ${active.toFixed(2)}`);
  }
  assert.deepEqual(bad, []);
});

/**
 * Nothing hands `background-image` a token that holds a colour.
 *
 * `.dialog` and `.panel` said `background-image: var(--surface-raised)` from
 * when that token was a gradient. Stage 3 flattened it to one colour, because
 * Press Proof has no gradients — and `background-image: #F5EEDF` is not a
 * value, so the browser dropped the declaration and every dialog and panel
 * lost its fill. Nothing warned: an invalid declaration is skipped in silence,
 * and the only sign was a modal you could read the page through.
 *
 * So: find what each token actually holds, and fail if a colour is being used
 * where an image belongs.
 */
test('background-image is never given a token that holds a colour', () => {
  const css = ['tokens.css', 'globals.css', 'surfaces.css']
    .map((name) => readFileSync(join(ROOT, 'app', name), 'utf8'))
    .join('\n');

  /** What a token is declared as, following one level of indirection. */
  const valueOf = (name, seen = new Set()) => {
    if (seen.has(name)) return '';
    seen.add(name);
    const declared = css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim() ?? '';
    const indirect = declared.match(/^var\(--([a-z0-9-]+)\)$/)?.[1];
    return indirect ? valueOf(indirect, seen) : declared;
  };

  const wrong = [];
  for (const [, token] of css.matchAll(/background-image:\s*var\(--([a-z0-9-]+)\)/g)) {
    const value = valueOf(token);
    if (!value) {
      wrong.push(`--${token} is used as a background-image but is never declared`);
      continue;
    }
    // An image is a url() or a gradient. Anything else here is a colour, and
    // a colour in background-image makes the whole declaration invalid.
    if (!/^(url\(|[a-z-]*gradient\()/.test(value)) {
      wrong.push(`background-image: var(--${token}) — that token holds "${value.slice(0, 40)}"`);
    }
  }
  assert.deepEqual(wrong, []);
});
