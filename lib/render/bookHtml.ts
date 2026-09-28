import { isIllustration, isSection } from '../contents';
import type {
  ContentItem,
  Illustration,
  MatterPage,
  Poem,
  Project,
  RenderOptions,
  Section,
} from '../types';
import { ORNAMENT_GLYPHS } from './borders';
import { buildCss, pageGeometry } from './css';
import { RUNTIME_SCRIPT, type RuntimeConfig } from './runtime';
import { FLIP_SCRIPT } from './flip';
import { VIEWER_SCRIPT } from './viewer';
import {
  countLines,
  escapeBlock,
  escapeHtml,
  escapeVerseLine,
  firstLine,
  indexSortKey,
  jsonForScript,
  parseStanzas,
  stripInlineMarkup,
} from './text';

/** Front-matter pages that carry no folio and no running head. */
const DISPLAY_KINDS = new Set(['halfTitle', 'title', 'dedication', 'epigraph']);

export const poemAnchor = (poem: Poem) => `p_${poem.id}`;
export const sectionAnchor = (section: Section) => `s_${section.id}`;
export const plateAnchor = (plate: Illustration) => `i_${plate.id}`;

/**
 * One stretch of the book.
 *
 * Poems are gathered into runs because the ornament between poems belongs
 * *between* them and nowhere else, so the renderer needs to know which poems
 * are neighbours. A part opener always ends the run before it.
 */
export type Block =
  | { kind: 'section'; section: Section }
  | { kind: 'plate'; plate: Illustration }
  | { kind: 'poems'; poems: Poem[] };

export type BookOrder = {
  /** Everything in the body, in printed order. */
  items: ContentItem[];
  /** The same sequence, with neighbouring poems gathered together. */
  blocks: Block[];
  /** Every poem, in printed order. */
  poems: Poem[];
};

export function orderBook(project: Project): BookOrder {
  const items = project.contents;
  const blocks: Block[] = [];
  const poems: Poem[] = [];

  for (const item of items) {
    if (isSection(item)) {
      blocks.push({ kind: 'section', section: item });
      continue;
    }
    // A plate takes a page of its own, so it ends the run it interrupts and
    // the poems after it start a new one — which is what stops an ornament
    // being drawn across a picture.
    if (isIllustration(item)) {
      blocks.push({ kind: 'plate', plate: item });
      continue;
    }
    poems.push(item);
    const last = blocks[blocks.length - 1];
    if (last?.kind === 'poems') last.poems.push(item);
    else blocks.push({ kind: 'poems', poems: [item] });
  }

  return { items, blocks, poems };
}

function renderPoem(poem: Poem, project: Project): string {
  const stanzas = parseStanzas(poem.body);
  const lines = countLines(poem.body);
  const onOwnPage = project.layout.poemStart !== 'continuous';
  const centered =
    onOwnPage &&
    project.layout.verticalCenterShortPoems &&
    lines > 0 &&
    lines <= project.layout.shortPoemMaxLines;

  const parts: string[] = [];
  // An untitled poem gets no title element at all. An empty one would still
  // occupy the space below a title and would set an empty running head.
  if (poem.title.trim()) {
    parts.push(`<h2 class="poem-title">${escapeHtml(poem.title)}</h2>`);
  }
  if (poem.epigraph.trim()) {
    parts.push(`<p class="poem-epigraph">${escapeBlock(poem.epigraph)}</p>`);
  }
  if (poem.dedication.trim()) {
    parts.push(`<p class="poem-dedication">${escapeBlock(poem.dedication)}</p>`);
  }
  for (const stanza of stanzas) {
    const body = stanza.lines
      .map((line) => `<p class="poem-line">${escapeVerseLine(line)}</p>`)
      .join('');
    parts.push(`<div class="stanza">${body}</div>`);
  }

  // The anchor lives on the article, not the title, so an untitled poem is
  // still a link target for the index of first lines.
  return `<article class="poem${centered ? ' vc-center' : ''}" id="${poemAnchor(poem)}" data-poem-id="${escapeHtml(poem.id)}" data-align="${poem.align ?? 'inherit'}" data-title="${escapeHtml(poem.title)}" data-head="${escapeHtml(stripInlineMarkup(poem.title))}">${parts.join('')}</article>`;
}

function renderOrnament(project: Project): string {
  const { ornament } = project;
  if (!ornament.betweenPoems || project.layout.poemStart !== 'continuous') return '';
  if (ornament.glyph === 'rule') return `<div class="ornament is-rule"></div>`;
  return `<div class="ornament">${ORNAMENT_GLYPHS[ornament.glyph]}</div>`;
}

function renderPoemRun(poems: Poem[], project: Project): string {
  const ornament = renderOrnament(project);
  return poems.map((p) => renderPoem(p, project)).join(ornament);
}

function renderSectionOpener(section: Section): string {
  const subtitle = section.subtitle.trim()
    ? `<p class="section-subtitle">${escapeBlock(section.subtitle)}</p>`
    : '';
  return `<div class="section-open"><h1 id="${sectionAnchor(section)}">${escapeHtml(section.title)}</h1>${subtitle}</div>`;
}

/**
 * A plate.
 *
 * No inline `style` here either: Paged.js treats an element carrying one as
 * undisplayed, and the whole page would stop breaking where it is told to. The
 * fit, the side and the facing page are data attributes the stylesheet reads.
 */
function renderIllustration(plate: Illustration, options: RenderOptions): string {
  const src = plate.assetId ? (options.assets?.[plate.assetId] ?? '') : '';
  const alt = stripInlineMarkup(plate.caption || plate.title);

  const picture = src
    ? `<img class="plate-image" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`
    : // Still a page, so the book paginates the same before and after the
      // picture arrives. The export checks refuse to ship it empty.
      (options.mode === 'preview'
        ? '<div class="plate-empty">No picture chosen yet</div>'
        : '');

  const caption = plate.caption.trim()
    ? `<figcaption class="plate-caption">${escapeBlock(plate.caption)}</figcaption>`
    : '';

  // facingBlank implies a recto: the page facing a plate is the verso across
  // the gutter from it, so the plate has to be on the right-hand side for there
  // to be one to leave empty.
  const recto = plate.startsRecto || plate.facingBlank;

  // That verso is the page *before* the plate, and no single break property can
  // ask for one blank page and then a recto. An empty page-high spacer does it:
  // it takes the next verso, and the plate's own break sends it to the recto
  // after. `break-after: right` would have left the blank on the wrong side of
  // the gutter — after the plate rather than facing it.
  const facing = plate.facingBlank ? '<div class="plate-facing-blank"></div>' : '';

  return `${facing}<figure class="plate" id="${plateAnchor(plate)}" data-fit="${plate.fit}" data-recto="${recto}" data-caption="${Boolean(plate.caption.trim())}" data-title="${escapeHtml(stripInlineMarkup(plate.title))}">${picture}${caption}</figure>`;
}

function renderMatterBody(page: MatterPage, project: Project): string {
  const { meta } = project;
  switch (page.kind) {
    case 'halfTitle':
      return `<p class="matter-body">${escapeHtml(page.body.trim() || meta.title)}</p>`;
    case 'title': {
      const sub = meta.subtitle.trim()
        ? `<span class="title-sub">${escapeHtml(meta.subtitle)}</span>`
        : '';
      const publisher = meta.publisher.trim()
        ? `<p class="matter-body matter-publisher">${escapeHtml(meta.publisher)}</p>`
        : '';
      return `<p class="matter-body"><span class="title-main">${escapeHtml(meta.title)}</span>${sub}<span class="title-author">${escapeHtml(meta.author)}</span></p>${publisher}`;
    }
    case 'copyright': {
      const isbn = meta.isbn.trim()
        ? `\n\nISBN: ${meta.isbn.trim()}`
        : '';
      const extra = meta.copyrightExtra.trim() ? `\n\n${meta.copyrightExtra.trim()}` : '';
      return `<p class="matter-body">${escapeBlock(page.body + isbn + extra)}</p>`;
    }
    default:
      return `<p class="matter-body">${escapeBlock(page.body)}</p>`;
  }
}

function renderMatterPage(page: MatterPage, project: Project): string {
  if (!page.enabled) return '';
  const heading = page.heading.trim()
    ? `<h1 class="matter-heading">${escapeHtml(page.heading)}</h1>`
    : '';
  const display = DISPLAY_KINDS.has(page.kind);
  // No inline `style` attribute here, deliberately: Paged.js marks every
  // element carrying one as "undisplayed", and an undisplayed element is
  // skipped when it looks for the node before a `break-before`. That silently
  // dropped every front-matter page break. Alignment goes through data-align
  // and the stylesheet instead. `tests/render.test.mjs` guards this.
  return `<div class="matter-page" data-kind="${page.kind}" data-label="${escapeHtml(page.label)}" data-v="${page.verticalPosition}" data-align="${page.align}" data-recto="${page.startsRecto}" data-display="${display}">${heading}${renderMatterBody(page, project)}</div>`;
}

function renderToc(project: Project, order: BookOrder): string {
  if (!project.toc.enabled) return '';
  const { toc } = project;
  const items: string[] = [];

  const poemItem = (poem: Poem) =>
    `<li class="toc-item is-poem"><a class="toc-entry" href="#${poemAnchor(poem)}"><span class="toc-entry-title">${escapeHtml(poem.title)}</span><span class="toc-leader"></span></a></li>`;

  // The contents page is the book's own order, read straight off. An untitled
  // poem has no name to print and no heading to link to, so it is skipped.
  for (const entry of order.items) {
    if (entry.kind === 'section') {
      items.push(
        `<li class="toc-item is-section"><a class="toc-entry" href="#${sectionAnchor(entry)}"><span class="toc-entry-title">${escapeHtml(entry.title)}</span><span class="toc-leader"></span></a></li>`,
      );
    } else if (entry.kind === 'illustration') {
      if (toc.includePoems && entry.title.trim()) {
        items.push(
          `<li class="toc-item is-plate"><a class="toc-entry" href="#${plateAnchor(entry)}"><span class="toc-entry-title">${escapeHtml(entry.title)}</span><span class="toc-leader"></span></a></li>`,
        );
      }
    } else if (toc.includePoems && entry.title.trim()) {
      items.push(poemItem(entry));
    }
  }

  if (!items.length) return '';
  return `<nav class="toc"><h1>${escapeHtml(toc.heading)}</h1><ul class="toc-list">${items.join('')}</ul></nav>`;
}

function renderFirstLineIndex(project: Project, order: BookOrder): string {
  if (!project.toc.firstLineIndex) return '';
  const entries = order.poems
    .map((poem) => ({ poem, line: firstLine(poem.body) }))
    .filter((e) => e.line.length > 0)
    .sort((a, b) => indexSortKey(a.line).localeCompare(indexSortKey(b.line)));

  if (!entries.length) return '';
  const items = entries
    .map(
      (e) =>
        `<li class="index-item"><a class="index-entry" href="#${poemAnchor(e.poem)}"><span class="toc-entry-title">${escapeHtml(e.line)}</span><span class="toc-leader"></span></a></li>`,
    )
    .join('');
  return `<section class="index-first-lines"><h1>${escapeHtml(project.toc.firstLineIndexHeading)}</h1><ul class="index-list">${items}</ul></section>`;
}

function renderBody(project: Project, order: BookOrder, options: RenderOptions): string {
  return order.blocks
    .map((block) => {
      if (block.kind === 'section') return renderSectionOpener(block.section);
      if (block.kind === 'plate') return renderIllustration(block.plate, options);
      return renderPoemRun(block.poems, project);
    })
    .join('');
}

export function buildBookHtml(project: Project, options: RenderOptions): string {
  const order = orderBook(project);

  const front = [
    ...[...project.frontMatter].sort((a, b) => a.order - b.order).map((p) => renderMatterPage(p, project)),
    renderToc(project, order),
  ]
    .filter(Boolean)
    .join('');

  const back = [
    ...[...project.backMatter].sort((a, b) => a.order - b.order).map((p) => renderMatterPage(p, project)),
    renderFirstLineIndex(project, order),
  ]
    .filter(Boolean)
    .join('');

  const pad = Array.from(
    { length: Math.max(0, options.padPages) },
    () => '<div class="vc-blank-page"></div>',
  ).join('');

  const preview = options.mode === 'preview';
  const geo = pageGeometry(project);

  const runtimeConfig: RuntimeConfig = {
    continuedMarker: project.layout.continuedMarker,
    showContinuedMarker: project.layout.showContinuedMarker,
    guides: preview ? options.guides : { margins: false, bleed: false, safe: false, gutter: false },
    geometry: {
      contentTop: geo.contentTop,
      contentBottom: geo.contentBottom,
      contentInside: geo.contentInside,
      contentOutside: geo.contentOutside,
      bleed: geo.bleed,
    },
    postToParent: preview,
    autoPrint: Boolean(options.autoPrint),
    heads: {
      verso: project.headers.verso,
      recto: project.headers.recto,
      bookTitle: project.meta.title,
      author: project.meta.author,
    },
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(project.meta.title)}</title>
${options.fontStyle}
<style>${buildCss(project, { screen: preview })}</style>
<script>window.PagedConfig = { auto: false };</script>
<script>window.__VC_CONFIG__ = ${jsonForScript(runtimeConfig)};</script>
</head>
<body>
<div class="book">
${front ? `<section class="front-matter">${front}</section>` : ''}
<section class="body-matter">${renderBody(project, order, options)}</section>
${back ? `<section class="back-matter">${back}</section>` : ''}
${pad ? `<section class="pad-matter">${pad}</section>` : ''}
</div>
${options.pagedJsSrc ? `<script src="${escapeHtml(options.pagedJsSrc)}"></script>` : ''}
${options.pagedJsSrc ? `<script>${RUNTIME_SCRIPT}</script>` : ''}
${preview ? `<script>${FLIP_SCRIPT}</script><script>${VIEWER_SCRIPT}</script>` : ''}
</body>
</html>`;
}
