import type { MatterPage, Poem, Project, RenderOptions, Section } from '../types';
import { ORNAMENT_GLYPHS } from './borders';
import { buildCss, pageGeometry } from './css';
import { RUNTIME_SCRIPT, type RuntimeConfig } from './runtime';
import {
  countLines,
  escapeBlock,
  escapeHtml,
  escapeVerseLine,
  firstLine,
  indexSortKey,
  parseStanzas,
} from './text';

/** Front-matter pages that carry no folio and no running head. */
const DISPLAY_KINDS = new Set(['halfTitle', 'title', 'dedication', 'epigraph']);

export const poemAnchor = (poem: Poem) => `p_${poem.id}`;
export const sectionAnchor = (section: Section) => `s_${section.id}`;

/** Poems in reading order: ungrouped first, then section by section. */
export type BookOrder = {
  loose: Poem[];
  grouped: Array<{ section: Section; poems: Poem[] }>;
  all: Poem[];
};

export function orderBook(project: Project): BookOrder {
  const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;
  const sections = [...project.sections].sort(byOrder);
  const poems = [...project.poems].sort(byOrder);

  const loose = poems.filter((p) => !p.sectionId || !sections.some((s) => s.id === p.sectionId));
  const grouped = sections.map((section) => ({
    section,
    poems: poems.filter((p) => p.sectionId === section.id),
  }));
  const all = [...loose, ...grouped.flatMap((g) => g.poems)];
  return { loose, grouped, all };
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
  parts.push(`<h2 class="poem-title" id="${poemAnchor(poem)}">${escapeHtml(poem.title)}</h2>`);
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

  return `<article class="poem${centered ? ' vc-center' : ''}" data-poem-id="${escapeHtml(poem.id)}" data-title="${escapeHtml(poem.title)}">${parts.join('')}</article>`;
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
  return `<div class="matter-page" data-kind="${page.kind}" data-v="${page.verticalPosition}" data-align="${page.align}" data-recto="${page.startsRecto}" data-display="${display}">${heading}${renderMatterBody(page, project)}</div>`;
}

function renderToc(project: Project, order: BookOrder): string {
  if (!project.toc.enabled) return '';
  const { toc } = project;
  const items: string[] = [];

  const poemItem = (poem: Poem) =>
    `<li class="toc-item is-poem"><a class="toc-entry" href="#${poemAnchor(poem)}"><span class="toc-entry-title">${escapeHtml(poem.title)}</span><span class="toc-leader"></span></a></li>`;

  if (toc.includePoems) {
    order.loose.forEach((p) => items.push(poemItem(p)));
  }
  for (const group of order.grouped) {
    items.push(
      `<li class="toc-item is-section"><a class="toc-entry" href="#${sectionAnchor(group.section)}"><span class="toc-entry-title">${escapeHtml(group.section.title)}</span><span class="toc-leader"></span></a></li>`,
    );
    if (toc.includePoems) group.poems.forEach((p) => items.push(poemItem(p)));
  }

  if (!items.length) return '';
  return `<nav class="toc"><h1>${escapeHtml(toc.heading)}</h1><ul class="toc-list">${items.join('')}</ul></nav>`;
}

function renderFirstLineIndex(project: Project, order: BookOrder): string {
  if (!project.toc.firstLineIndex) return '';
  const entries = order.all
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

function renderBody(project: Project, order: BookOrder): string {
  const parts: string[] = [];
  if (order.loose.length) parts.push(renderPoemRun(order.loose, project));
  for (const group of order.grouped) {
    parts.push(renderSectionOpener(group.section));
    if (group.poems.length) parts.push(renderPoemRun(group.poems, project));
  }
  return parts.join('');
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
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(project.meta.title)}</title>
${options.fontStyle}
<style>${buildCss(project, { screen: preview })}</style>
<script>window.PagedConfig = { auto: false };</script>
<script>window.__VC_CONFIG__ = ${JSON.stringify(runtimeConfig)};</script>
</head>
<body>
<div class="book">
${front ? `<section class="front-matter">${front}</section>` : ''}
<section class="body-matter">${renderBody(project, order)}</section>
${back ? `<section class="back-matter">${back}</section>` : ''}
${pad ? `<section class="pad-matter">${pad}</section>` : ''}
</div>
${options.pagedJsSrc ? `<script src="${escapeHtml(options.pagedJsSrc)}"></script>` : ''}
${options.pagedJsSrc ? `<script>${RUNTIME_SCRIPT}</script>` : ''}
</body>
</html>`;
}
