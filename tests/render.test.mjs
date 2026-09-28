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
import { FLIP_SCRIPT } from '../lib/render/flip.ts';
import { VIEWER_SCRIPT } from '../lib/render/viewer.ts';

function seeded(overrides = {}) {
  const project = createProject(overrides);
  project.contents = buildSamplePoems();
  return project;
}

const poemsIn = (project) => project.contents.filter((item) => item.kind === 'poem');

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
  for (const poem of poemsIn(project)) {
    assert.ok(html.includes(`id="p_${poem.id}"`), `missing anchor for ${poem.title}`);
    assert.ok(html.includes(`href="#p_${poem.id}"`), `missing TOC link for ${poem.title}`);
  }
});

test('poems carry their title as data so a continuation page can name them', () => {
  const project = seeded();
  const html = render(project);
  const long = poemsIn(project).find((p) => p.sampleKey.endsWith('page-break'));
  assert.ok(html.includes(`data-title="${long.title.replace(/&/g, '&amp;')}"`));
});

const part = (id, title) => ({ kind: 'section', id, title, subtitle: '' });
const poem = (id, title = id) => ({
  kind: 'poem',
  id,
  title,
  body: 'a line',
  epigraph: '',
  dedication: '',
});

test('the book is read in list order, whatever that order is', () => {
  const project = createProject();
  project.contents = [poem('a'), part('s0', 'One'), poem('b'), part('s1', 'Two'), poem('c')];
  const order = orderBook(project);
  assert.deepEqual(order.poems.map((p) => p.id), ['a', 'b', 'c']);
  assert.deepEqual(
    order.blocks.map((b) => (b.kind === 'section' ? b.section.title : b.poems.map((p) => p.id))),
    [['a'], 'One', ['b'], 'Two', ['c']],
  );
});

// The old model could not say this at all: every poem had to sit inside a part
// or before all of them, so a poem printed between two parts was unreachable.
test('a poem can be printed between two parts', () => {
  const project = createProject();
  project.contents = [part('s0', 'One'), poem('a'), poem('interlude'), part('s1', 'Two')];
  const html = render(project);
  const at = (needle) => html.indexOf(needle);
  assert.ok(at('id="p_interlude"') > at('id="s_s0"'), 'the interlude follows the first part');
  assert.ok(at('id="p_interlude"') < at('id="s_s1"'), 'and precedes the second');
});

test('neighbouring poems form one run, and a part heading ends it', () => {
  const project = createProject();
  project.contents = [poem('a'), poem('b'), part('s0', 'One'), poem('c')];
  const blocks = orderBook(project).blocks;
  assert.deepEqual(
    blocks.map((b) => (b.kind === 'poems' ? b.poems.length : 'section')),
    [2, 'section', 1],
  );
});

const plate = (id, patch = {}) => ({
  kind: 'illustration',
  id,
  title: '',
  caption: '',
  assetId: 'a1',
  naturalWidth: 2000,
  naturalHeight: 3000,
  fit: 'contain',
  startsRecto: false,
  facingBlank: false,
  ...patch,
});

const withPlate = (patch = {}, opts = {}) => {
  const project = createProject();
  project.contents = [plate('x', patch)];
  return render(project, { assets: { a1: 'data:image/png;base64,AAA' }, ...opts });
};

test('a plate breaks onto a page of its own and carries its picture', () => {
  const html = withPlate({ caption: 'Low Water' });
  assert.match(html, /<figure class="plate" id="i_x"/);
  assert.match(html, /<img class="plate-image" src="data:image\/png;base64,AAA"/);
  assert.match(html, /<figcaption class="plate-caption">Low Water<\/figcaption>/);
  assert.match(html, /\.plate \{[\s\S]*?break-before: page;/);
});

// Same trap as the poems: an inline style makes Paged.js treat the element as
// undisplayed, and the page stops breaking where it was told to.
test('a plate carries no inline style', () => {
  assert.ok(!/<figure class="plate"[^>]*\sstyle=/.test(withPlate({ fit: 'bleed' })));
  assert.ok(!/<img class="plate-image"[^>]*\sstyle=/.test(withPlate({ fit: 'bleed' })));
});

test('an empty plate still takes a page, and says so only in the preview', () => {
  const project = createProject();
  project.contents = [plate('x', { assetId: '' })];
  assert.match(render(project, { mode: 'preview' }), /<div class="plate-empty">/);
  // The rule stays in the stylesheet either way; it is the element that must go.
  assert.ok(!render(project).includes('<div class="plate-empty">'), 'that label must never print');
  assert.match(render(project), /<figure class="plate" id="i_x"/);
});

// The page facing a plate is the verso across the gutter — the page *before*
// it. `break-after` would have left the blank on the wrong side of the fold.
test('keeping the facing page blank puts a real blank verso before the plate', () => {
  const html = withPlate({ facingBlank: true });
  assert.match(html, /<div class="plate-facing-blank"><\/div><figure class="plate"/);
  assert.match(html, /data-recto="true"/, 'there is only a facing page if it is on a recto');
  assert.match(html, /\.plate-facing-blank \{[\s\S]*?break-before: left;/);
  assert.match(html, /\.plate\[data-recto='true'\] \{ break-before: right; \}/);
  assert.ok(!html.includes('break-after: right'), 'that would blank the page after, not the one facing');
});

test('a plate without a caption gets the whole page for its picture', () => {
  const tall = withPlate({ caption: '' }).match(/data-fit='contain'\] \.plate-image \{[\s\S]*?max-height: ([\d.]+)in/)[1];
  const short = withPlate({ caption: 'x' }).match(/data-caption='true'\] \.plate-image \{\s*max-height: ([\d.]+)in/)[1];
  assert.ok(Number(short) < Number(tall), 'a captioned plate leaves room for the caption');
  assert.match(withPlate({ caption: 'x' }), /data-caption="true"/);
  assert.match(withPlate({ caption: '' }), /data-caption="false"/);
});

// The inside margin is on the right of a verso and the left of a recto, so a
// bleeding picture cannot use one offset for both.
test('a bleeding plate reaches the sheet edge from whichever side it lands on', () => {
  const html = withPlate({ fit: 'bleed' });
  assert.match(html, /\.pagedjs_left_page \.plate\[data-fit='bleed'\] \.plate-image \{ left: -[\d.]+in; \}/);
  assert.match(html, /\.pagedjs_right_page \.plate\[data-fit='bleed'\] \.plate-image \{ left: -[\d.]+in; \}/);
  const left = Number(html.match(/\.pagedjs_left_page[^{]*\{ left: -([\d.]+)in/)[1]);
  const right = Number(html.match(/\.pagedjs_right_page[^{]*\{ left: -([\d.]+)in/)[1]);
  assert.notEqual(left, right, 'mirrored margins mean the two sides differ');
});

test('a plate ends the poem run it interrupts, so no ornament crosses it', () => {
  const project = createProject();
  project.contents = [poem('a'), plate('x'), poem('b')];
  const blocks = orderBook(project).blocks;
  assert.deepEqual(blocks.map((b) => b.kind), ['poems', 'plate', 'poems']);
});

test('a named plate is listed in the contents; an unnamed one is not', () => {
  const project = createProject();
  project.contents = [plate('named', { title: 'Plate I' }), plate('anon')];
  const html = render(project, { assets: { a1: 'x' } });
  assert.match(html, /class="toc-entry" href="#i_named"/);
  assert.ok(!html.includes('href="#i_anon"'), 'nothing to call it and nowhere to point');
});

test('the contents page lists everything in printed order', () => {
  const project = createProject();
  project.contents = [poem('a', 'Alpha'), part('s0', 'One'), poem('b', 'Beta')];
  const html = render(project);
  const entries = [...html.matchAll(/class="toc-entry-title">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(entries, ['Alpha', 'One', 'Beta']);
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

test('font families and colours are sanitised before reaching the stylesheet', () => {
  const project = seeded();
  project.typography.body.family = "Evil'; } body { display:none } .x{";
  project.typography.body.color = 'red; background: url(http://x)';
  project.ornament.color = '"><script>';
  const html = render(project);
  assert.ok(!html.includes('display:none'), 'family escaped its declaration');
  assert.ok(!html.includes('url(http://x)'), 'colour escaped its declaration');
  assert.ok(!html.includes('<script>"'), 'ornament colour escaped its declaration');
  assert.ok(!html.includes("'Evil';"), 'family must not close its own quote');
  assert.match(html, /font-family: 'Evil body displaynone x'/);
});

test('a failed webfont stylesheet cannot stop pagination', () => {
  // Paged.js waits on every stylesheet, so the runtime drops broken ones first
  // and races the rest against a timeout.
  assert.ok(RUNTIME_SCRIPT.includes('settleStylesheets'));
  assert.ok(RUNTIME_SCRIPT.includes('__VC_FONTS_FAILED__'));
  assert.ok(RUNTIME_SCRIPT.includes('Promise.race'));
});

// --- audit: what real poetry actually contains -------------------------------

import { renderInlineMarkup, stripInlineMarkup } from '../lib/render/text.ts';

import { buildColoringHtml } from '../lib/render/coloringHtml.ts';
import { createColoringBook } from '../lib/projects.ts';

/** A coloring book with `count` converted pictures in it. */
function coloringFixture(count) {
  const book = createColoringBook('Ghosts');
  book.pages = Array.from({ length: count }, (_, i) => ({
    id: `page_${i}`,
    title: `Picture ${i + 1}`,
    source: 'painting',
    sourceGuessed: true,
    sourceAssetId: `src_${i}`,
    lineArtAssetId: `art_${i}`,
    renderedWith: null,
    upscaled: 1,
    fit: 'contain',
    rotate: 0,
    naturalWidth: 1200,
    naturalHeight: 900,
    settings: book.coloring.lineArt,
  }));
  return book;
}

const coloringOptions = () => ({
  mode: 'export',
  fontStyle: '',
  pagedJsSrc: '',
  guides: { margins: false, bleed: false, safe: false, gutter: false },
  assets: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`art_${i}`, `blob:art${i}`])),
  padPages: 0,
});


/** Builds a one-poem project so a single feature can be looked at in isolation. */
function withPoem(patch) {
  const project = createProject();
  project.contents = [
    {
      kind: 'poem',
      id: 'x1',
      title: 'A Title',
      body: 'first line\nsecond line',
      epigraph: '',
      dedication: '',
      ...patch,
    },
  ];
  return project;
}

test('audit: indented lines keep their indent as hard spaces', () => {
  const html = render(withPoem({ body: 'flush left\n    four spaces in\n\tone tab in' }));
  assert.match(html, /class="poem-line">    four spaces in/);
  // A tab has no width in HTML flow, so it becomes four hard spaces.
  assert.match(html, /class="poem-line">    one tab in/);
});

test('audit: a centred poem drops the turnover indent it cannot use', () => {
  const centred = render(withPoem({ align: 'center' }));
  assert.match(centred, /data-align="center"/);
  assert.match(centred, /\.poem\[data-align='center'\] \.poem-line \{ text-align: center; \}/);
  assert.match(centred, /data-align='center'\][\s\S]*?padding-left: 0;[\s\S]*?text-indent: 0;/);
  // Default poems are untouched by any of that.
  assert.match(render(withPoem({})), /data-align="inherit"/);
});

test('audit: em-dashes, smart quotes and ellipses pass through untouched', () => {
  const body = 'An em—dash, “smart quotes”, an ellipsis… and an en–dash';
  const html = render(withPoem({ body }));
  assert.ok(html.includes(body), 'punctuation must not be normalised or escaped away');
});

test('audit: a non-breaking space survives as a non-breaking space', () => {
  const html = render(withPoem({ body: 'a b' }));
  assert.ok(html.includes('a b'));
});

test('audit: unicode beyond Latin-1 is preserved', () => {
  const body = 'Πλάγια\nКириллица\n日本語\n🕊';
  const html = render(withPoem({ body }));
  for (const line of body.split('\n')) assert.ok(html.includes(line), `${line} was lost`);
});

test('audit: a one-line poem renders as one stanza of one line', () => {
  const html = render(withPoem({ body: 'The only line.' }));
  const stanzas = html.match(/<div class="stanza">/g) ?? [];
  assert.equal(stanzas.length, 1);
  assert.equal((html.match(/class="poem-line"/g) ?? []).length, 1);
});

test('audit: an untitled poem gets no heading and no contents entry', () => {
  const project = withPoem({ title: '' });
  const html = render(project);
  assert.ok(!html.includes('<h2 class="poem-title">'), 'an empty h2 would still take the title space');
  assert.ok(!html.includes('href="#p_x1"'), 'no dotted line to nowhere');
  // It still has to be a link target, for the index of first lines.
  assert.match(html, /<article class="poem" id="p_x1"/);
});

test('audit: an untitled poem still appears in the index of first lines', () => {
  const project = withPoem({ title: '' });
  project.toc.firstLineIndex = true;
  const html = render(project);
  assert.match(html, /class="index-entry" href="#p_x1"/);
  assert.ok(html.includes('first line'));
});

test('audit: a titled poem keeps its heading and its contents entry', () => {
  const project = withPoem({});
  const html = render(project);
  assert.match(html, /<h2 class="poem-title">A Title<\/h2>/);
  assert.ok(html.includes('href="#p_x1"'));
});

test('running heads are resolved at render time, not by a CSS string()', () => {
  const html = render(withPoem({}));
  assert.ok(!html.includes('string-set'), 'string() cannot fall back for an untitled poem');
  assert.match(html, /content: var\(--vc-head-left, ""\)/);
  assert.match(html, /content: var\(--vc-head-right, ""\)/);
  assert.match(html, /"heads":\{"verso":"bookTitle","recto":"author"/);
});

test('a poem carries the head text it wants, stripped of markup', () => {
  const html = render(withPoem({ title: 'A *shaped* title' }));
  assert.match(html, /data-head="A shaped title"/);
});

test('inline emphasis becomes real emphasis, and a literal asterisk survives', () => {
  assert.equal(renderInlineMarkup('an *italic* word'), 'an <em>italic</em> word');
  assert.equal(renderInlineMarkup('a **bold** word'), 'a <strong>bold</strong> word');
  assert.equal(renderInlineMarkup('* * *'), '* * *', 'a dinkus is not emphasis');
  assert.equal(renderInlineMarkup('5 * 3 and 2 * 4'), '5 * 3 and 2 * 4');
  assert.equal(renderInlineMarkup('a \\*literal\\* pair'), 'a *literal* pair');
  assert.equal(stripInlineMarkup('an *italic* and **bold** line'), 'an italic and bold line');
});

test('emphasis reaches the rendered verse line', () => {
  const html = render(withPoem({ body: 'a line with *stress* in it' }));
  assert.ok(html.includes('a line with <em>stress</em> in it'));
});

test('emphasis markup never leaks into a TOC entry or an index line', () => {
  const project = withPoem({ body: '*The first line*\nsecond' });
  project.toc.firstLineIndex = true;
  const html = render(project);
  const index = html.slice(html.indexOf('index-first-lines'));
  assert.ok(index.includes('The first line'));
  assert.ok(!index.includes('*The first line*'));
});

// Every script injected as a raw string shares the same trap: one backtick or
// one dollar-brace and the whole document is templated wrong at build time.
test('the injected viewer and flip scripts carry no template syntax', () => {
  for (const [name, script] of [
    ['viewer', VIEWER_SCRIPT],
    ['flip', FLIP_SCRIPT],
  ]) {
    assert.ok(!script.includes('`'), name + ' has a backtick');
    assert.ok(!script.includes('${'), name + ' has a dollar-brace');
  }
});

test('the flip is installed into the viewer, not left as a dangling global', () => {
  assert.ok(FLIP_SCRIPT.includes('window.__VC_FLIP__'));
  assert.ok(VIEWER_SCRIPT.includes('flip.install(apiForFlip())'));
  // The two pages the leaf carries are neither in the spread it leaves nor the
  // one it arrives at, so the viewer has to be able to show an arbitrary pair.
  assert.ok(VIEWER_SCRIPT.includes('override || spreadPages(spread)'));
});

test('the turning sheet is cut into strips rather than rotated flat', () => {
  assert.ok(!VIEWER_SCRIPT.includes('@keyframes vc-turn-out'), 'the flat rotation is gone');
  assert.ok(FLIP_SCRIPT.includes('preserve-3d'));
  assert.ok(FLIP_SCRIPT.includes('backface-visibility: hidden'));
  assert.ok(FLIP_SCRIPT.includes('MAX_BEND'));
});

// The bend is added to the tangent angle, so it could in principle push the
// sheet past flat before the turn is over. It must not: a drag is solved by
// bisecting on the sheet's reach, which only works while that reach falls
// monotonically. sin(x) <= x is what keeps it safe for any bend up to 1.
test('the sheet never overshoots flat, whatever the bend', () => {
  const MAX_BEND = Number(FLIP_SCRIPT.match(/var MAX_BEND = ([\d.]+);/)[1]);
  assert.ok(MAX_BEND > 0 && MAX_BEND <= 1, 'bend of ' + MAX_BEND + ' is outside the safe range');

  const angle = (t, s, W) =>
    Math.PI * t + MAX_BEND * Math.sin(Math.PI * t) * Math.sin((Math.PI * s) / W);
  const W = 1;
  const N = 26;
  let previous = Infinity;
  for (let step = 0; step <= 200; step++) {
    const t = step / 200;
    let reach = 0;
    for (let i = 0; i < N; i++) {
      const phi = angle(t, ((i + 0.5) * W) / N, W);
      assert.ok(phi <= Math.PI + 1e-9, 'tangent angle passed flat at t=' + t);
      reach += (W / N) * Math.cos(phi);
    }
    assert.ok(reach < previous + 1e-9, 'the sheet reached further at t=' + t + ' than before it');
    previous = reach;
  }
});

test('the preview can navigate on its own once it has the focus', () => {
  // Clicking or dragging inside the preview moves focus into the iframe, and
  // the app's own key handler stops hearing anything from then on.
  assert.ok(VIEWER_SCRIPT.includes("addEventListener('keydown'"));
  assert.ok(VIEWER_SCRIPT.includes("versecraft:spread"));
});

// --- the coloring interior ----------------------------------------------------

test('a coloring book renders one page per picture, on rectos when single-sided', () => {
  const book = coloringFixture(3);
  const html = buildColoringHtml(book, coloringOptions());
  assert.equal((html.match(/class="cpage"/g) || []).length, 3);
  assert.equal((html.match(/data-recto="true"/g) || []).length, 3);

  book.coloring.singleSided = false;
  assert.ok(!buildColoringHtml(book, coloringOptions()).includes('data-recto="true"'));
});

test('the front matter is exactly the pages that are switched on', () => {
  const book = coloringFixture(1);
  const all = buildColoringHtml(book, coloringOptions());
  assert.ok(all.includes('data-label="Title page"'));
  assert.ok(all.includes('data-label="Copyright"'));
  assert.ok(all.includes('data-label="This book belongs to"'));
  assert.ok(all.includes('data-label="Pen test page"'));

  book.coloring.titlePage = false;
  book.coloring.colorTestPage = false;
  const fewer = buildColoringHtml(book, coloringOptions());
  assert.ok(!fewer.includes('data-label="Title page"'));
  assert.ok(!fewer.includes('data-label="Pen test page"'));
  assert.ok(fewer.includes('data-label="Copyright"'));
});

test('a page nobody has converted yet still renders, from the original', () => {
  const book = coloringFixture(1);
  book.pages[0].lineArtAssetId = null;
  const html = buildColoringHtml(book, { ...coloringOptions(), assets: { src_0: 'blob:source' } });
  assert.ok(html.includes('blob:source'), 'it should fall back to the upload');
});

test('a page with no picture at all says so rather than rendering nothing', () => {
  const book = coloringFixture(1);
  const html = buildColoringHtml(book, { ...coloringOptions(), assets: {} });
  assert.ok(html.includes('cpage-missing'));
});

test('every page is placed for both sides of the fold', () => {
  const html = buildColoringHtml(coloringFixture(2), coloringOptions());
  assert.equal((html.match(/\.pagedjs_left_page #cp_/g) || []).length, 2);
  assert.equal((html.match(/\.pagedjs_right_page #cp_/g) || []).length, 2);
});

test('the sheet is sized in inches, not in percentages', () => {
  // A percentage height resolves against Paged.js's own auto-height wrappers,
  // which is nothing at all — and every picture was clipped away by its own
  // overflow rule. The regression is invisible in a page count, so it is
  // pinned here instead.
  const book = coloringFixture(1);
  const html = buildColoringHtml(book, coloringOptions());
  const rule = html.match(/\.cpage, \.matter-sheet, \.matter-art, \.vc-blank-page \{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /height: 8\.75in/);
  assert.match(rule, /width: 8\.625in/);
  assert.ok(!/height: 100%/.test(rule), 'a percentage height does not resolve here');
});

test('nothing in a coloring book carries an inline style attribute', () => {
  // The same Paged.js trap the poetry renderer has: an element with a style
  // attribute is treated as undisplayed and the break before it is swallowed.
  const html = buildColoringHtml(coloringFixture(3), coloringOptions());
  const body = html.slice(html.indexOf('<body>'));
  assert.ok(!/<(?!script)[a-z]+[^>]*\sstyle=/i.test(body), 'found an inline style in the body');
});

test('a title with markup in it cannot escape into the page', () => {
  const book = coloringFixture(1);
  book.meta.title = '</title><script>alert(1)</script>';
  book.pages[0].title = '"><img onerror=alert(2)>';
  const html = buildColoringHtml(book, coloringOptions());
  assert.ok(!html.includes('<script>alert(1)'), 'the title escaped into markup');
  // The words survive escaping, of course; what must not survive is the
  // punctuation that would turn them into a tag or close the script block.
  assert.ok(!html.includes('<img onerror'), 'the page name became a tag');
  assert.ok(!html.includes('</script>alert'), 'the title closed the config block');
  const config = html.match(/window\.__VC_CONFIG__ = (.*);<\/script>/)?.[1] ?? '';
  assert.ok(config.length > 2, 'the runtime config should still be there');
  assert.ok(!config.includes('<'), 'nothing in the config may open a tag');
  // And it is still the same string once JSON has been read back.
  assert.equal(JSON.parse(config).heads.bookTitle, book.meta.title);
});
