import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createProject } from '../lib/defaults.ts';
import { buildSamplePoems } from '../lib/samples.ts';
import { buildBookHtml, orderBook } from '../lib/render/bookHtml.ts';
import { pageGeometry } from '../lib/render/css.ts';
import {
  countLines,
  escapeVerseLine,
  firstLine,
  indexSortKey,
  parseStanzas,
} from '../lib/render/text.ts';
import { RUNTIME_SCRIPT } from '../lib/render/runtime.ts';

function seeded(overrides = {}) {
  const project = createProject(overrides);
  project.poems = buildSamplePoems();
  return project;
}

const render = (project, opts = {}) =>
  buildBookHtml(project, {
    mode: 'export',
    fontStyle: '',
    pagedJsSrc: '',
    guides: { margins: false, bleed: false, safe: false, gutter: false },
    padPages: 0,
    ...opts,
  });

test('stanzas split on blank lines, and a run of blanks is still one break', () => {
  const stanzas = parseStanzas('a\nb\n\nc\n\n\n\nd\ne');
  assert.deepEqual(stanzas.map((s) => s.lines), [['a', 'b'], ['c'], ['d', 'e']]);
});

test('line breaks inside a stanza are never joined', () => {
  const body = 'one\ntwo\nthree';
  assert.equal(parseStanzas(body)[0].lines.length, 3);
  assert.equal(countLines(body), 3);
});

test('leading indentation on a verse line is preserved as hard spaces', () => {
  const html = escapeVerseLine('    indented line');
  assert.ok(html.startsWith('    '), html.slice(0, 12));
  assert.ok(html.endsWith('indented line'));
});

test('verse lines are HTML-escaped', () => {
  assert.equal(escapeVerseLine('a < b & "c"'), 'a &lt; b &amp; &quot;c&quot;');
});

test('first line and index sort key ignore leading punctuation and articles', () => {
  assert.equal(firstLine('\n\n  The road holds\nits shape'), 'The road holds');
  assert.equal(indexSortKey('“The road holds'), 'road holds');
  assert.equal(indexSortKey('An evening'), 'evening');
});

/**
 * Paged.js marks any element carrying a `style` attribute as "undisplayed",
 * and then skips it when resolving `break-before`. That silently swallowed
 * every front-matter page break once already; this keeps it swallowed-proof.
 */
test('the rendered book contains no inline style attributes', () => {
  const html = render(seeded());
  const offenders = html.match(/<[a-z][^>]*\sstyle=/gi) || [];
  assert.deepEqual(offenders, [], `inline styles break Paged.js page breaks: ${offenders[0]}`);
});

test('every poem is anchored and the TOC links to those anchors', () => {
  const project = seeded();
  const html = render(project);
  for (const poem of project.poems) {
    assert.ok(html.includes(`id="p_${poem.id}"`), `missing anchor for ${poem.title}`);
    assert.ok(html.includes(`href="#p_${poem.id}"`), `missing TOC link for ${poem.title}`);
  }
});

test('poems carry their title as data so a continuation page can name them', () => {
  const project = seeded();
  const html = render(project);
  const long = project.poems.find((p) => p.sampleKey.endsWith('page-break'));
  assert.ok(html.includes(`data-title="${long.title.replace(/&/g, '&amp;')}"`));
});

test('reading order puts loose poems first, then each section in order', () => {
  const project = seeded();
  project.sections = [
    { id: 's1', title: 'Two', subtitle: '', order: 1 },
    { id: 's0', title: 'One', subtitle: '', order: 0 },
  ];
  project.poems[0].sectionId = 's1';
  project.poems[1].sectionId = 's0';
  const order = orderBook(project);
  assert.deepEqual(order.grouped.map((g) => g.section.title), ['One', 'Two']);
  assert.equal(order.loose.length, project.poems.length - 2);
  assert.equal(order.all.length, project.poems.length);
});

test('a poem assigned to a deleted section falls back to loose', () => {
  const project = seeded();
  project.poems[0].sectionId = 'gone';
  const order = orderBook(project);
  assert.ok(order.loose.some((p) => p.id === project.poems[0].id));
  assert.equal(order.all.length, project.poems.length);
});

test('blank padding pages are emitted only when asked for', () => {
  const project = seeded();
  const blanks = (html) => (html.match(/<div class="vc-blank-page">/g) || []).length;
  assert.equal(blanks(render(project)), 0);
  assert.equal(blanks(render(project, { padPages: 3 })), 3);
});

test('preview mode posts pagination to the parent; export mode does not', () => {
  const project = seeded();
  assert.match(render(project, { mode: 'preview', pagedJsSrc: '/x.js' }), /"postToParent":true/);
  assert.match(render(project), /"postToParent":false/);
});

test('export mode omits the Paged.js script tag so the caller can inject it', () => {
  assert.ok(!render(seeded()).includes('<script src='));
  assert.ok(
    render(seeded(), { mode: 'preview', pagedJsSrc: '/vendor/paged.polyfill.js' })
      .includes('<script src="/vendor/paged.polyfill.js">'),
  );
});

test('the runtime script survives templating with no stray backticks', () => {
  assert.ok(!RUNTIME_SCRIPT.includes('`'));
  assert.ok(!RUNTIME_SCRIPT.includes('${'));
  assert.ok(RUNTIME_SCRIPT.includes('registerHandlers'));
});

test('page geometry adds bleed to the outside edges only, never the gutter', () => {
  const project = seeded();
  project.trim = { trimId: '6x9', bleed: true, paper: 'cream' };
  project.margins = { inside: 0.75, outside: 0.5, top: 0.5, bottom: 0.5 };
  const geo = pageGeometry(project);
  assert.equal(geo.pageWidth, 6.125);
  assert.equal(geo.pageHeight, 9.25);
  assert.equal(geo.contentInside, 0.75, 'gutter gets no bleed');
  assert.equal(geo.contentOutside, 0.625, 'outside margin gets bleed');
});

test('running heads and folios are pushed inside the safe area, not into the margin', () => {
  const project = seeded();
  const withHeads = pageGeometry(project);
  project.headers = {
    verso: 'none', recto: 'none', pageNumberPosition: 'none',
    suppressOnPoemOpen: false, suppressOnSectionOpen: false,
  };
  const without = pageGeometry(project);
  assert.ok(withHeads.headerBand > 0 && withHeads.footerBand > 0);
  assert.equal(without.headerBand, 0);
  assert.equal(without.footerBand, 0);
  assert.ok(withHeads.contentTop > withHeads.userTop, 'head must sit inside the margin');
  assert.equal(without.contentTop, without.userTop);
});

test('a border inset can never be pushed past the trim edge', () => {
  const project = seeded();
  project.margins = { inside: 0.4, outside: 0.3, top: 0.3, bottom: 0.3 };
  project.border = { enabled: true, style: 'thin', color: '#000', weightPt: 1, insetIn: 5, scope: 'all' };
  const css = render(project);
  // Clamped to min(margins) - 0.05 = 0.25, so the frame lands at 0.05in in.
  assert.ok(css.includes('0.04999999999999999in') || css.includes('0.05in'), 'inset was not clamped');
});
