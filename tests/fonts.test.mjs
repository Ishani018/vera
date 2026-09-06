import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createProject } from '../lib/defaults.ts';
import {
  BUNDLED_FAMILIES,
  CATEGORY_FALLBACK,
  fallbackFor,
  googleFontsHref,
  googleFontsLinks,
  projectFontsHrefs,
  projectSpecs,
} from '../lib/fonts.ts';

/**
 * The invariant these guard was established against real Chromium: css2 returns
 * a *variable* font when more than one weight of a family is requested, and
 * Chromium cannot embed a variable-font instance in a PDF — it emits Type3
 * glyph procedures with no embedded font program, which print services reject.
 * One weight per request keeps css2 on static faces, which embed correctly.
 */
function weightsPerFamily(href) {
  const counts = new Map();
  for (const [, family, axes] of href.matchAll(/family=([^:&]+):ital,wght@([^&]+)/g)) {
    const weights = new Set(axes.split(';').map((pair) => pair.split(',')[1]));
    counts.set(decodeURIComponent(family), weights);
  }
  return counts;
}

test('every font URL asks for exactly one weight per family', () => {
  const project = createProject();
  project.typography.poemTitle.weight = 700;
  project.typography.sectionTitle.weight = 600;
  project.typography.sectionTitle.family = 'Cinzel';

  const hrefs = projectFontsHrefs(project);
  assert.ok(hrefs.length >= 3, 'weights 400, 600 and 700 need their own requests');
  for (const href of hrefs) {
    for (const [family, weights] of weightsPerFamily(href)) {
      assert.equal(weights.size, 1, `${family} in ${href} would return a variable font`);
    }
  }
});

test('both styles are requested at each weight, so italics are real', () => {
  const hrefs = projectFontsHrefs(createProject());
  for (const href of hrefs) {
    for (const [, , axes] of href.matchAll(/family=([^:&]+):ital,wght@([^&]+)/g)) {
      const styles = new Set(axes.split(';').map((pair) => pair.split(',')[0]));
      assert.deepEqual([...styles].sort(), ['0', '1']);
    }
  }
});

test('families sharing a weight are batched into one request', () => {
  const project = createProject();
  const hrefs = projectFontsHrefs(project);
  // The defaults use EB Garamond and Cormorant Garamond, both at 400.
  assert.equal(hrefs.length, 1);
  assert.equal(weightsPerFamily(hrefs[0]).size, 2);
});

test('a project with no families asks for nothing', () => {
  const project = createProject();
  for (const spec of projectSpecs(project)) spec.family = '';
  assert.deepEqual(projectFontsHrefs(project), []);
  assert.equal(googleFontsLinks(project), '');
  assert.equal(googleFontsHref([]), null);
});

test('cover text families are requested too', () => {
  const project = createProject();
  project.cover.textBoxes = [
    {
      id: 'b1',
      panel: 'front',
      text: 'Title',
      x: 0,
      y: 0,
      widthIn: 3,
      rotate: 0,
      font: { ...project.typography.body, family: 'Cinzel', weight: 700 },
    },
  ];
  const hrefs = projectFontsHrefs(project);
  assert.ok(hrefs.some((h) => h.includes('Cinzel')), 'cover font missing from requests');
});

test('fallback stacks come from the family category', () => {
  assert.equal(fallbackFor('EB Garamond'), CATEGORY_FALLBACK.serif);
  assert.equal(fallbackFor('Inter'), CATEGORY_FALLBACK['sans-serif']);
  // An unknown family is assumed to be a text face, which is the safe guess.
  assert.equal(fallbackFor('Not A Real Family'), CATEGORY_FALLBACK.serif);
});

test('the bundled family list is well formed', () => {
  assert.ok(BUNDLED_FAMILIES.length > 40);
  assert.equal(new Set(BUNDLED_FAMILIES.map((f) => f.family)).size, BUNDLED_FAMILIES.length);
  for (const family of BUNDLED_FAMILIES) {
    assert.ok(CATEGORY_FALLBACK[family.category], `${family.family} has an unknown category`);
  }
});
