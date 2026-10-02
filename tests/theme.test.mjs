import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  CANDY,
  DEFAULT_THEME,
  EASING,
  LAGOON,
  MOTION,
  MUST_READ,
  RADII,
  SHADOWS,
  SUNRISE,
  THEMES,
  THEME_KEY,
  TYPE,
  chooseTheme,
  colourAt,
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

test('every readable pair passes AA, in every theme', () => {
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

test('the sweep covers every colour the palette has', () => {
  // A colour nothing checks is a colour nobody has looked at. Each role's mid
  // and deep must appear somewhere in the list.
  const named = new Set(MUST_READ.flatMap((pair) => [pair.text, pair.on]));
  for (const role of ['coral', 'sun', 'lilac', 'sage', 'denim', 'clay']) {
    for (const step of ['tint', 'mid', 'deep']) {
      assert.ok(named.has(`roles.${role}.${step}`), `roles.${role}.${step} is unchecked`);
    }
  }
  for (const step of ['tint', 'mid', 'deep']) {
    assert.ok(named.has(`accent.${step}`), `accent.${step} is unchecked`);
  }
});

test('the three themes are three themes, not one with three names', () => {
  assert.equal(THEMES.length, 3);
  const pages = THEMES.map((theme) => theme.neutrals.ink100);
  assert.equal(new Set(pages).size, 3, pages.join(', '));
  const corals = THEMES.map((theme) => theme.roles.coral.mid);
  assert.equal(new Set(corals).size, 3, corals.join(', '));
});

test('the teal is the brand colour in all three', () => {
  for (const theme of THEMES) assert.equal(theme.accent.mid, '#0B6A62', theme.id);
});

test('Sunrise is the default, and each theme is complete', () => {
  assert.equal(DEFAULT_THEME, SUNRISE.id);
  for (const theme of [SUNRISE, LAGOON, CANDY]) {
    assert.equal(Object.keys(theme.neutrals).length, 10, theme.id);
    assert.equal(Object.keys(theme.roles).length, 6, theme.id);
    for (const ramp of Object.values(theme.roles)) {
      for (const step of ['tint', 'mid', 'deep']) {
        assert.match(ramp[step], /^#[0-9A-F]{6}$/, `${theme.id} ${step}: ${ramp[step]}`);
      }
    }
  }
});

test('a tint is lighter than its mid, and a deep is darker', () => {
  const light = (hex) => contrastRatio(hex, '#000000');
  for (const theme of THEMES) {
    for (const [role, ramp] of Object.entries(theme.roles)) {
      assert.ok(light(ramp.tint) > light(ramp.mid), `${theme.id} ${role}: tint is not lighter`);
      assert.ok(light(ramp.mid) > light(ramp.deep), `${theme.id} ${role}: deep is not darker`);
    }
  }
});

/* -------------------------------------------------------------- the choosing */

test('the address wins, then what was remembered, then the default', () => {
  assert.equal(chooseTheme('?theme=lagoon', 'candy'), 'lagoon');
  assert.equal(chooseTheme('', 'candy'), 'candy');
  assert.equal(chooseTheme('', null), 'sunrise');
  assert.equal(chooseTheme('?theme=nonsense', 'candy'), 'candy', 'a name that is not a theme is ignored');
  assert.equal(chooseTheme('?theme=nonsense', 'also-nonsense'), 'sunrise');
  assert.equal(chooseTheme('?other=1', null), 'sunrise');
});

test('the theme is remembered under a key of its own', () => {
  // Not a key anything else uses: losing it loses a preference, not a book.
  assert.equal(THEME_KEY, 'isnaevy:theme');
  assert.ok(!THEME_KEY.includes('versecraft'), 'that name belongs to the database');
});

test('an unknown id reads as the default rather than as nothing', () => {
  assert.equal(themeById('nope').id, 'sunrise');
  assert.equal(themeById(null).id, 'sunrise');
  assert.equal(themeById('candy').id, 'candy');
});

/* ---------------------------------------------------------------- the scales */

test('three steps of depth, and a halo', () => {
  assert.deepEqual(Object.keys(SHADOWS), ['rest', 'raised', 'float', 'glow']);
  // Each is mixed from the theme's own ink rather than from black.
  for (const [name, value] of Object.entries(SHADOWS)) {
    assert.match(value, /var\(--(shade|glow)\)/, name);
  }
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
  const radii = Object.values(RADII).filter((one) => one !== '999px').map(px);
  assert.deepEqual([...radii].sort((a, b) => a - b), radii, 'the radius scale is out of order');
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

test('every theme is in the stylesheet, and every colour with it', () => {
  const css = readFileSync(join(ROOT, 'app', 'tokens.css'), 'utf8');
  for (const theme of THEMES) {
    if (theme.id !== DEFAULT_THEME) assert.match(css, new RegExp(`data-theme='${theme.id}'`));
    for (const ramp of Object.values(theme.roles)) {
      for (const step of ['tint', 'mid', 'deep']) {
        assert.ok(css.includes(ramp[step]), `${theme.id}: ${ramp[step]} is not in the stylesheet`);
      }
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
