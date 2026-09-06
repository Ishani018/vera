import { BLEED, getTrim } from '../kdp';
import type { FontSpec, PageNumberPosition, Project, RunningHeadContent } from '../types';
import { borderCss } from './borders';
import { cssString } from './text';

/** Page geometry, in inches, derived once and reused by CSS and the guides. */
export type PageGeometry = {
  pageWidth: number;
  pageHeight: number;
  bleed: number;
  /** Distance from the sheet edge to the text block. */
  contentTop: number;
  contentBottom: number;
  contentInside: number;
  contentOutside: number;
  /** Extra band reserved above/below the text block for running heads. */
  headerBand: number;
  footerBand: number;
  /** The user's own margins, measured from the trim edge. */
  userTop: number;
  userBottom: number;
  userInside: number;
  userOutside: number;
};

const ptToIn = (pt: number) => pt / 72;

function usesTopBox(project: Project): boolean {
  const { headers } = project;
  return (
    headers.pageNumberPosition === 'topOutside' ||
    headers.verso !== 'none' ||
    headers.recto !== 'none'
  );
}

function usesBottomBox(project: Project): boolean {
  return (
    project.headers.pageNumberPosition === 'bottomCenter' ||
    project.headers.pageNumberPosition === 'bottomOutside'
  );
}

/**
 * Running heads and folios are content, so KDP's margin minimums apply to them
 * too. Rather than letting them sit in the margin (where they would break the
 * minimum), the page margin is grown by a band and the header is placed at the
 * inner edge of that band — always at least `userTop` from the trim edge.
 */
export function pageGeometry(project: Project): PageGeometry {
  const trim = getTrim(project.trim.trimId);
  const bleed = project.trim.bleed ? BLEED : 0;
  const { margins, typography } = project;

  const headerBand = usesTopBox(project) ? ptToIn(typography.runningHead.sizePt * 2.6) : 0;
  const footerBand = usesBottomBox(project) ? ptToIn(typography.pageNumber.sizePt * 2.6) : 0;

  return {
    pageWidth: trim.width + bleed,
    pageHeight: trim.height + 2 * bleed,
    bleed,
    contentTop: bleed + margins.top + headerBand,
    contentBottom: bleed + margins.bottom + footerBand,
    contentInside: margins.inside,
    contentOutside: bleed + margins.outside,
    headerBand,
    footerBand,
    userTop: margins.top,
    userBottom: margins.bottom,
    userInside: margins.inside,
    userOutside: margins.outside,
  };
}

function fontDecls(spec: FontSpec, includeSize = true): string {
  const lines = [
    `font-family: '${spec.family}', ${spec.fallback};`,
    `font-weight: ${spec.weight};`,
    `font-style: ${spec.italic ? 'italic' : 'normal'};`,
    `color: ${spec.color};`,
    `text-align: ${spec.align};`,
  ];
  if (includeSize) {
    lines.push(`font-size: ${spec.sizePt}pt;`, `line-height: ${spec.lineHeight};`);
  }
  if (spec.letterSpacingEm) lines.push(`letter-spacing: ${spec.letterSpacingEm}em;`);
  if (spec.transform === 'smallcaps') {
    lines.push('font-variant-caps: small-caps;', 'font-feature-settings: "smcp" 1;');
  } else if (spec.transform !== 'none') {
    lines.push(`text-transform: ${spec.transform};`);
  }
  return lines.join('\n  ');
}

function headContent(kind: RunningHeadContent, project: Project): string {
  switch (kind) {
    case 'none':
      return 'none';
    case 'bookTitle':
      return cssString(project.meta.title);
    case 'author':
      return cssString(project.meta.author);
    case 'sectionTitle':
      return 'string(sectionTitle)';
    case 'poemTitle':
      return 'string(poemTitle)';
  }
}

type Side = 'left' | 'right';

/** Where the folio goes on a given side, given the chosen position. */
function folioBox(position: PageNumberPosition, side: Side): string | null {
  switch (position) {
    case 'none':
      return null;
    case 'bottomCenter':
      return 'bottom-center';
    case 'bottomOutside':
      return side === 'left' ? 'bottom-left' : 'bottom-right';
    case 'topOutside':
      return side === 'left' ? 'top-left' : 'top-right';
  }
}

function marginBoxes(project: Project, side: Side): string {
  const { headers, typography } = project;
  const out: string[] = [];

  const headKind = side === 'left' ? headers.verso : headers.recto;
  const folio = folioBox(headers.pageNumberPosition, side);

  if (headKind !== 'none') {
    // The head sits at the inner edge of the header band, i.e. hard against the
    // text block and therefore inside the safe area.
    out.push(`@top-center {
    content: ${headContent(headKind, project)};
    vertical-align: bottom;
    padding-bottom: 0.55em;
    ${fontDecls(typography.runningHead)}
    text-align: center;
  }`);
  }

  if (folio) {
    const align =
      folio.endsWith('left') ? 'left' : folio.endsWith('right') ? 'right' : 'center';
    const vertical = folio.startsWith('top') ? 'bottom' : 'top';
    const pad = folio.startsWith('top') ? 'padding-bottom: 0.55em;' : 'padding-top: 0.9em;';
    // The folio comes from --vc-folio, which the runtime writes per page, not
    // from counter(page). Paged.js only applies `counter-reset: page` to the
    // single page carrying the reset, so a CSS counter cannot express "roman
    // through the front matter, then arabic from 1" across a whole book.
    out.push(`@${folio} {
    content: var(--vc-folio, "");
    vertical-align: ${vertical};
    ${pad}
    ${fontDecls(typography.pageNumber)}
    text-align: ${align};
  }`);
  }

  return out.join('\n  ');
}

function pageRules(project: Project, geo: PageGeometry): string {
  // Named pages exist so the runtime can tell front matter from body when it
  // works out folios, and so mirrored margins apply on every page.
  const named = ['frontmatter', 'bodymatter', 'backmatter'];

  const base = `@page {
  size: ${geo.pageWidth}in ${geo.pageHeight}in;
  margin-top: ${geo.contentTop}in;
  margin-bottom: ${geo.contentBottom}in;
  margin-left: ${geo.contentInside}in;
  margin-right: ${geo.contentOutside}in;
}`;

  const sides = named.flatMap((name) =>
    (['left', 'right'] as Side[]).map((side) => {
      const inside = side === 'left' ? 'margin-right' : 'margin-left';
      const outside = side === 'left' ? 'margin-left' : 'margin-right';
      return `@page ${name}:${side} {
  ${inside}: ${geo.contentInside}in;
  ${outside}: ${geo.contentOutside}in;
  ${marginBoxes(project, side)}
}`;
    }),
  );

  // A page opening a poem or section, and any padded blank, carries no folio or
  // running head. Named pages cannot express "first page of this element", so
  // the runtime tags those pages and the rules below switch the boxes off.
  const suppress: string[] = [
    `.pagedjs_page.vc-blank .pagedjs_margin-content { visibility: hidden !important; }`,
  ];
  if (project.headers.suppressOnPoemOpen) {
    suppress.push(`.pagedjs_page.vc-poem-open .pagedjs_margin-content { visibility: hidden !important; }`);
  }
  if (project.headers.suppressOnSectionOpen) {
    suppress.push(`.pagedjs_page.vc-section-open .pagedjs_margin-content { visibility: hidden !important; }`);
  }
  // Front matter pages that are pure display (half title, dedication) read
  // better without a folio; the running head never belongs there at all.
  suppress.push(`.pagedjs_page.vc-display-page .pagedjs_margin-content { visibility: hidden !important; }`);

  return [base, ...sides, ...suppress].join('\n\n');
}

function borderRules(project: Project, geo: PageGeometry): string {
  if (!project.border.enabled) return '';
  const { outer, inner } = borderCss(project.border);
  // Clamp so an over-eager inset can never push the frame past the trim edge.
  const maxInset = Math.max(
    0,
    Math.min(geo.userTop, geo.userBottom, geo.userInside, geo.userOutside) - 0.05,
  );
  const inset = Math.min(project.border.insetIn, maxInset);

  const scopeSelector =
    project.border.scope === 'all'
      ? '.pagedjs_page'
      : project.border.scope === 'poemOpen'
        ? '.pagedjs_page.vc-poem-open'
        : project.border.scope === 'sectionOpen'
          ? '.pagedjs_page.vc-section-open'
          : '.pagedjs_page.vc-matter-page';

  // The frame is measured from the user's own margins, not from the top of the
  // text block, so it encloses the running head and the folio instead of being
  // drawn straight through them.
  const frameTop = geo.bleed + geo.userTop - inset;
  const frameBottom = geo.bleed + geo.userBottom - inset;
  const frameInside = geo.userInside - inset;
  const frameOutside = geo.bleed + geo.userOutside - inset;

  const box = (pseudo: string, decls: string, extra = 0) => `
${scopeSelector}:not(.vc-blank) .pagedjs_pagebox::${pseudo} {
  content: '';
  position: absolute;
  pointer-events: none;
  top: calc(${frameTop}in + ${extra}pt);
  bottom: calc(${frameBottom}in + ${extra}pt);
  ${decls}
}
${scopeSelector}:not(.vc-blank).pagedjs_left_page .pagedjs_pagebox::${pseudo} {
  left: calc(${frameOutside}in + ${extra}pt);
  right: calc(${frameInside}in + ${extra}pt);
}
${scopeSelector}:not(.vc-blank).pagedjs_right_page .pagedjs_pagebox::${pseudo} {
  left: calc(${frameInside}in + ${extra}pt);
  right: calc(${frameOutside}in + ${extra}pt);
}`;

  const rules = [box('before', outer)];
  if (inner) {
    // The second rule of a double frame sits 3pt inside the first.
    rules.push(box('after', inner.replace(/inset: [^;]+;/, ''), 3));
  }
  return `.pagedjs_pagebox { position: relative; }\n${rules.join('\n')}`;
}

function poemRules(project: Project): string {
  const { layout, typography, ornament } = project;
  const breakBefore =
    layout.poemStart === 'recto' ? 'right' : layout.poemStart === 'newPage' ? 'page' : 'auto';

  return `
.poem {
  orphans: 2;
  widows: 2;
  break-before: ${breakBefore};
}
.poem:first-child { break-before: avoid; }

.poem-title {
  margin: ${layout.titleSpaceAboveEm}em 0 ${layout.titleSpaceBelowEm}em;
  break-after: avoid;
  string-set: poemTitle content(text);
  ${fontDecls(typography.poemTitle)}
}

.poem-epigraph {
  margin: 0 0 1.2em;
  font-style: italic;
  font-size: 0.92em;
  opacity: 0.85;
  break-after: avoid;
}

.poem-dedication {
  margin: -0.6em 0 1.2em;
  font-style: italic;
  font-size: 0.9em;
  break-after: avoid;
}

/* A stanza is the unit that must not be split. Verse lines inside it stay
   together so a couplet never ends up straddling the fold. */
.stanza {
  break-inside: avoid;
  margin: 0 0 ${layout.stanzaSpacingEm}em;
}
.stanza:last-child { margin-bottom: 0; }

/* Ragged right, never justified. A line longer than the measure wraps and the
   turnover is indented, so it reads as continuation rather than a new line. */
.poem-line {
  margin: 0;
  text-align: left;
  text-align-last: left;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  hyphens: none;
  padding-left: ${layout.hangingIndentEm}em;
  text-indent: -${layout.hangingIndentEm}em;
}

/* A short poem alone on its page can be optically centred in the text block. */
.poem.vc-center {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100%;
}

.vc-continued {
  ${fontDecls(typography.runningHead)}
  text-align: left;
  margin: 0 0 1.1em;
  font-size: ${Math.max(7.5, typography.runningHead.sizePt - 0.5)}pt;
}

.ornament {
  ${fontDecls(project.typography.body, false)}
  color: ${ornament.color};
  font-size: ${ornament.sizePt}pt;
  text-align: center;
  margin: ${ornament.spacingEm}em 0;
  break-inside: avoid;
  break-after: avoid;
  letter-spacing: 0.35em;
  text-indent: 0.35em;
}
.ornament.is-rule::before {
  content: '';
  display: inline-block;
  width: 22%;
  border-top: 0.75pt solid ${ornament.color};
  vertical-align: 0.35em;
}
`;
}

function tocRules(project: Project): string {
  const { toc, typography } = project;
  return `
.toc { break-before: right; }
.toc h1, .index-first-lines h1 {
  ${fontDecls(typography.sectionTitle)}
  font-size: ${Math.max(14, typography.sectionTitle.sizePt * 0.75)}pt;
  margin: 0 0 1.6em;
  break-after: avoid;
}
.toc-list { list-style: none; margin: 0; padding: 0; }
.toc-item { break-inside: avoid; }
.toc-item.is-section { margin-top: 1.2em; }
.toc-item.is-section:first-child { margin-top: 0; }

/* align-items: last baseline puts the leader and the page number on the final
   line of a title that wraps, which is where a book puts them. */
.toc-entry {
  display: flex;
  align-items: last baseline;
  text-decoration: none;
  ${fontDecls(typography.toc)}
}
.toc-entry-title {
  padding-left: 1.1em;
  text-indent: -1.1em;
}
.toc-item.is-section > .toc-entry {
  font-variant-caps: small-caps;
  letter-spacing: 0.05em;
}
.toc-item.is-poem > .toc-entry { padding-left: ${project.toc.includePoems ? 1 : 0}em; }
.toc-entry-title { flex: 0 1 auto; }
.index-entry { align-items: last baseline; }
.toc-leader {
  flex: 1 1 auto;
  min-width: 1.5em;
  margin: 0 0.45em;
  ${toc.leaderDots ? 'border-bottom: 0.5pt dotted currentColor; opacity: 0.55;' : ''}
  transform: translateY(-0.22em);
}
/* Real page numbers, resolved after pagination. These are printed folios, not
   physical sheet numbers, so an entry points at the number the reader will see
   on the page — matching the folio exactly, front matter included. */
.toc-entry::after {
  content: var(--vc-target, "");
  flex: 0 0 auto;
  font-variant-numeric: lining-nums;
}

.index-first-lines { break-before: page; }
.index-list { list-style: none; margin: 0; padding: 0; }
.index-item { break-inside: avoid; }
.index-entry {
  display: flex;
  align-items: baseline;
  text-decoration: none;
  ${fontDecls(typography.toc)}
}
.index-entry::after {
  content: var(--vc-target, "");
  flex: 0 0 auto;
}
`;
}

function matterRules(project: Project): string {
  const { typography } = project;
  return `
.matter-page {
  break-before: page;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  ${fontDecls(typography.matter)}
}
.matter-page[data-recto='true'] { break-before: right; }
.matter-page[data-align='left'] { text-align: left; }
.matter-page[data-align='center'] { text-align: center; }
.matter-page[data-align='right'] { text-align: right; }
.matter-publisher { margin-top: 2.5em; }
.matter-page[data-v='center'] { justify-content: center; }
.matter-page[data-v='bottom'] { justify-content: flex-end; }
.matter-page[data-v='top'] { justify-content: flex-start; }
.matter-heading {
  ${fontDecls(typography.sectionTitle)}
  font-size: ${Math.max(13, typography.sectionTitle.sizePt * 0.7)}pt;
  margin: 0 0 1.4em;
  break-after: avoid;
}
.matter-body { white-space: pre-wrap; margin: 0; }
.matter-page[data-kind='halfTitle'] .matter-body {
  font-size: ${typography.matter.sizePt * 1.5}pt;
  font-variant-caps: small-caps;
  letter-spacing: 0.12em;
}
.matter-page[data-kind='title'] .matter-body { font-size: ${typography.matter.sizePt * 1.1}pt; }
.matter-page[data-kind='title'] .title-main {
  display: block;
  ${fontDecls(typography.sectionTitle)}
  margin-bottom: 0.35em;
}
.matter-page[data-kind='title'] .title-sub {
  display: block;
  font-style: italic;
  font-size: ${typography.matter.sizePt * 1.05}pt;
  margin-bottom: 2.4em;
}
.matter-page[data-kind='title'] .title-author {
  display: block;
  font-variant-caps: small-caps;
  letter-spacing: 0.1em;
  font-size: ${typography.matter.sizePt * 1.15}pt;
}
.matter-page[data-kind='copyright'] .matter-body {
  font-size: ${Math.max(8, typography.matter.sizePt - 2)}pt;
  line-height: 1.45;
}
.matter-page[data-kind='dedication'] .matter-body,
.matter-page[data-kind='epigraph'] .matter-body { font-style: italic; }

.section-open {
  break-before: ${project.layout.sectionStartsRecto ? 'right' : 'page'};
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100%;
  text-align: center;
}
.section-open h1 {
  ${fontDecls(typography.sectionTitle)}
  string-set: sectionTitle content(text);
  margin: 0;
}
.section-open .section-subtitle {
  margin: 1em 0 0;
  font-style: italic;
  font-size: ${typography.matter.sizePt}pt;
}
`;
}

function guideRules(): string {
  return `
.vc-guides { position: absolute; inset: 0; pointer-events: none; z-index: 40; }
.vc-guides > div { position: absolute; }
.vc-guide-margins { border: 1px dashed rgba(56,132,255,0.75); }
.vc-guide-bleed { border: 1px solid rgba(220,38,38,0.85); }
.vc-guide-safe { border: 1px dashed rgba(16,185,129,0.85); }
.vc-guide-gutter { background: rgba(168,85,247,0.13); }
`;
}

export function buildCss(project: Project, opts: { screen: boolean }): string {
  const geo = pageGeometry(project);
  const { typography } = project;

  return `
:root {
  --content-top: ${geo.contentTop}in;
  --content-bottom: ${geo.contentBottom}in;
  --content-inside: ${geo.contentInside}in;
  --content-outside: ${geo.contentOutside}in;
  --bleed: ${geo.bleed}in;
}

* { box-sizing: border-box; }

html { font-kerning: normal; text-rendering: optimizeLegibility; }

body {
  margin: 0;
  ${fontDecls(typography.body)}
  /* Poetry is never justified: the measure is set by the poet, not the grid. */
  text-align: left;
  hyphens: none;
  background: ${opts.screen ? '#8b8b8b' : 'transparent'};
}

${pageRules(project, geo)}

.front-matter { page: frontmatter; }
.body-matter { page: bodymatter; counter-reset: page 1; }
.back-matter { page: backmatter; }

.vc-blank-page {
  break-before: page;
  height: 100%;
}

${matterRules(project)}
${poemRules(project)}
${tocRules(project)}
${borderRules(project, geo)}
${guideRules()}

${
  opts.screen
    ? `.pagedjs_pages { padding: 24px 0 48px; }
.pagedjs_page { margin: 0 auto 22px; background: #fff; box-shadow: 0 6px 22px rgba(0,0,0,0.35); }
.pagedjs_page.vc-blank { background: #fff; }`
    : ''
}
`;
}
