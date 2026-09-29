import { curvedText, type CurvedText } from '../cover/curve';
import type { CoverSticker, CoverTextBox, CoverableBook } from '../types';
import { coverLayout, type CoverLayout } from './coverLayout';
import { stickerImageKey, stickerRect } from './stickers';
import { cssColor, cssFamily, escapeBlock, escapeHtml, escapeSvgText } from './text';

/**
 * The wraparound cover as a single-page document.
 *
 * No Paged.js here: a cover is one page at an exact size, so a plain @page rule
 * plus absolute positioning in inches is both simpler and more predictable.
 */

function fontCss(box: CoverTextBox): string {
  const f = box.font;
  return [
    `font-family: '${cssFamily(f.family)}', ${f.fallback};`,
    `font-weight: ${f.weight};`,
    `font-style: ${f.italic ? 'italic' : 'normal'};`,
    `font-size: ${f.sizePt}pt;`,
    `line-height: ${f.lineHeight};`,
    `letter-spacing: ${f.letterSpacingEm}em;`,
    `color: ${cssColor(f.color)};`,
    `text-align: ${f.align};`,
    f.transform === 'smallcaps'
      ? 'font-variant-caps: small-caps;'
      : f.transform !== 'none'
        ? `text-transform: ${f.transform};`
        : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function boxCss(
  box: CoverTextBox,
  arc: CurvedText | null,
  layout: CoverLayout,
  index: number,
): string {
  const panel = layout.panels[box.panel];
  // Spine text runs top-to-bottom, the convention for English-language spines,
  // and is rotated about its own start so the box position stays meaningful.
  const spine = box.panel === 'spine';
  const rotate = spine ? 90 + box.rotate : box.rotate;
  const transform = rotate ? ` transform: rotate(${rotate}deg); transform-origin: left top;` : '';
  // A curved box is the same box: it is put in the same place, turned the same
  // way, and wears the same type. Only its size and its own offset come from
  // the arc, which needs more room than the line it replaces.
  const left = panel.x + box.x + (arc?.offsetX ?? 0);
  const top = panel.y + box.y + (arc?.offsetY ?? 0);
  const size = arc
    ? `width: ${arc.width}pt;\n  height: ${arc.height}pt;\n  overflow: visible;`
    : `width: ${box.width}pt;`;
  return `#cb${index} {
  position: absolute;
  left: ${left}pt;
  top: ${top}pt;
  ${size}
  ${fontCss(box)}${transform}
}`;
}

/**
 * A curved box's markup: an SVG whose letters ride along an arc.
 *
 * Real text, not a picture of it. Chromium writes SVG text into the PDF as
 * glyphs from the embedded font, each with its own turn on the curve, so a
 * curved title prints exactly as sharp as a straight one and can still be
 * searched and selected. Drawing it to a canvas instead would have cost all of
 * that for nothing.
 */
function curvedHtml(box: CoverTextBox, arc: CurvedText | null, index: number): string {
  if (!arc) return `<div class="cover-text" id="cb${index}">${escapeBlock(box.text)}</div>`;
  const paths = arc.lines
    .map((line, i) => `<path id="cp${index}-${i}" d="${line.path}" fill="none"></path>`)
    .join('');
  const texts = arc.lines
    .map((line, i) =>
      line.text
        ? `<text text-anchor="${line.anchor}"><textPath href="#cp${index}-${i}" ` +
          `startOffset="${line.startOffset}">${escapeSvgText(line.text)}</textPath></text>`
        : '',
    )
    .join('');
  return `<svg class="cover-text cover-curved" id="cb${index}" viewBox="${arc.viewBox}" xmlns="http://www.w3.org/2000/svg"><defs>${paths}</defs>${texts}</svg>`;
}

/**
 * One sticker, positioned in inches on the whole cover.
 *
 * The rotation is about the sticker's centre rather than its corner, because
 * that is what turning a thing on a page means to anyone doing it: the picture
 * spins where it sits instead of swinging away across the cover.
 */
function stickerCss(sticker: CoverSticker, index: number): string {
  // Where the picture actually lands, which a bend moves and resizes.
  const rect = stickerRect(sticker);
  const bent = Boolean(sticker.arc);
  const shorter = Math.min(sticker.width, sticker.height);
  const radius = sticker.cornerRadius * shorter;
  const rules = [
    'position: absolute;',
    `left: ${rect.x}pt;`,
    `top: ${rect.y}pt;`,
    `width: ${rect.width}pt;`,
    `height: ${rect.height}pt;`,
  ];
  if (!bent) rules.push('overflow: hidden;');
  if (sticker.rotate) rules.push(`transform: rotate(${sticker.rotate}deg);`);
  // A bent picture is no longer a rectangle, so a rounded corner and a border
  // would be drawing a frame around a shape that is not there any more. The
  // panel hides both rather than letting them be set and ignored.
  if (!bent && radius > 0) rules.push(`border-radius: ${radius.toFixed(4)}pt;`);
  if (!bent && sticker.border) {
    rules.push(`border: ${sticker.border.widthPt}pt solid ${cssColor(sticker.border.color)};`);
  }
  // A soft drop shadow. Printed rather than screen-only, so it is kept gentle:
  // a hard shadow on a paper cover reads as a mistake. A bent one follows the
  // curved edge instead of boxing it, which is what drop-shadow reads off the
  // transparency that box-shadow cannot see.
  if (sticker.shadow) {
    rules.push(
      bent
        ? 'filter: drop-shadow(0 0.04in 0.06in rgba(0,0,0,0.33));'
        : 'box-shadow: 0 0.04in 0.09in rgba(0,0,0,0.33);',
    );
  }
  return `#cs${index} {
  ${rules.join('\n  ')}
}`;
}

export type CoverRenderOptions = {
  pageCount: number;
  fontStyle: string;
  /** Draw fold lines, bleed and the barcode reserve. Designer preview only. */
  guides: boolean;
  /** Raise the print dialog once fonts and the image have settled. */
  autoPrint?: boolean;
  /** Asset id to URL. Without an entry the image is simply not drawn. */
  assets?: Record<string, string>;
};

export function buildCoverHtml(project: CoverableBook, options: CoverRenderOptions): string {
  const layout = coverLayout(project, options.pageCount);
  const { dimensions: d, panels, barcode } = layout;
  const cover = project.cover;

  const image = cover.frontImage;
  const imageSrc = image ? (options.assets?.[image.assetId] ?? '') : '';
  const imageRect = cover.imageSpansWrap
    ? { x: 0, y: 0, width: layout.width, height: layout.height }
    : {
        x: panels.front.x - layout.bleed,
        y: 0,
        width: panels.front.width + layout.bleed,
        height: layout.height,
      };

  const imageHtml = image && imageSrc
    ? `<img class="cover-image" src="${escapeHtml(imageSrc)}" alt="">`
    : '';

  // Worked out once and handed to both: the markup and the rule that places it
  // have to be describing the same arc.
  const arcs = cover.textBoxes.map(curvedText);
  const boxes = cover.textBoxes.map((box, i) => curvedHtml(box, arcs[i], i)).join('');

  const boxStyles = cover.textBoxes
    .map((box, i) => boxCss(box, arcs[i], layout, i))
    .join('\n');

  // Stickers are written in array order, which is what puts the last one on
  // top. They come before the text so a caption is never buried under a
  // picture that happens to have been added after it.
  const stickers = (cover.stickers ?? [])
    .map((sticker, i) => {
      const src = options.assets?.[stickerImageKey(sticker)] ?? '';
      if (!src) return '';
      return `<div class="cover-sticker" id="cs${i}"><img src="${escapeHtml(src)}" alt="${escapeHtml(sticker.name)}"></div>`;
    })
    .join('');

  const stickerStyles = (cover.stickers ?? [])
    .map((sticker, i) => stickerCss(sticker, i))
    .join('\n');

  const guides = options.guides
    ? `<div class="guide guide-fold" id="fold-a"></div>
<div class="guide guide-fold" id="fold-b"></div>
<div class="guide guide-bleed"></div>
<div class="guide guide-safe" id="safe-back"></div>
<div class="guide guide-safe" id="safe-front"></div>`
    : '';

  const barcodeHtml = cover.showBarcodeZone
    ? `<div class="barcode-zone"><span>Barcode area reserved by KDP<br>2" × 1.2"</span></div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(project.meta.title)} — cover</title>
${options.fontStyle}
<style>
@page { size: ${layout.width}pt ${layout.height}pt; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
.cover {
  position: relative;
  width: ${layout.width}pt;
  height: ${layout.height}pt;
  overflow: hidden;
  background: ${cssColor(cover.backgroundColor)};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.panel { position: absolute; }
#panel-back {
  left: 0; top: 0;
  width: ${panels.spine.x}pt;
  height: ${layout.height}pt;
  background: ${cssColor(cover.backColor)};
}
#panel-spine {
  left: ${panels.spine.x}pt; top: 0;
  width: ${panels.spine.width}pt;
  height: ${layout.height}pt;
  background: ${cssColor(cover.spineColor)};
}
.cover-image {
  position: absolute;
  left: ${imageRect.x}pt;
  top: ${imageRect.y}pt;
  width: ${imageRect.width}pt;
  height: ${imageRect.height}pt;
  object-fit: ${image?.fit ?? 'cover'};
  object-position: center;
}
.cover-sticker img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
${stickerStyles}
.cover-text { position: absolute; white-space: pre-wrap; }
/* The letters take their colour from the type spec like any other text; an
   SVG would otherwise paint them solid black whatever the box said. */
.cover-curved text { fill: currentColor; }
${boxStyles}
.barcode-zone {
  position: absolute;
  left: ${barcode.x}pt; top: ${barcode.y}pt;
  width: ${barcode.width}pt; height: ${barcode.height}pt;
  border: 1px dashed rgba(0,0,0,0.45);
  background: rgba(255,255,255,0.55);
  display: flex; align-items: center; justify-content: center;
  font: italic 7pt Georgia, serif; color: rgba(0,0,0,0.6); text-align: center;
}
.guide { position: absolute; pointer-events: none; }
.guide-fold { top: 0; height: ${layout.height}pt; border-left: 1px dashed rgba(0,90,255,0.85); }
#fold-a { left: ${layout.folds[0]}pt; }
#fold-b { left: ${layout.folds[1]}pt; }
.guide-bleed {
  left: ${layout.bleed}pt; top: ${layout.bleed}pt;
  width: ${layout.width - 2 * layout.bleed}pt; height: ${layout.height - 2 * layout.bleed}pt;
  border: 1px solid rgba(220,38,38,0.85);
}
.guide-safe { top: ${layout.bleed + 18}pt; height: ${layout.height - 2 * layout.bleed - 36}pt; border: 1px dashed rgba(16,185,129,0.8); }
#safe-back { left: ${panels.back.x + 18}pt; width: ${panels.back.width - 36}pt; }
#safe-front { left: ${panels.front.x + 18}pt; width: ${panels.front.width - 36}pt; }
${
  options.guides
    ? ''
    : // Not merely painted invisible: not drawn at all.
      //
      // Painting it transparent still left a label on the page, set in the
      // `Georgia, serif` this rule asks for — and some Chrome builds write
      // fully transparent text into the PDF while others drop it. The result
      // was a cover that embedded a font subset of whatever serif the printing
      // machine happened to have, for text nobody can see. It never showed on
      // paper, but a print PDF should contain what the book asks for and
      // nothing else.
      '.barcode-zone { display: none; }'
}
</style>
</head>
<body>
<div class="cover">
  <div class="panel" id="panel-back"></div>
  <div class="panel" id="panel-spine"></div>
  ${imageHtml}
  ${stickers}
  ${barcodeHtml}
  ${boxes}
  ${guides}
</div>
${
  options.autoPrint
    ? `<script>
document.fonts.ready.then(function () {
  requestAnimationFrame(function () { window.print(); });
});
</script>`
    : ''
}
</body>
</html>`;
}
