import type { CoverSticker, CoverTextBox, CoverableBook } from '../types';
import { coverLayout, type CoverLayout } from './coverLayout';
import { cssColor, cssFamily, escapeBlock, escapeHtml } from './text';

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

function boxCss(box: CoverTextBox, layout: CoverLayout, index: number): string {
  const panel = layout.panels[box.panel];
  // Spine text runs top-to-bottom, the convention for English-language spines,
  // and is rotated about its own start so the box position stays meaningful.
  const spine = box.panel === 'spine';
  const rotate = spine ? 90 + box.rotate : box.rotate;
  const transform = rotate ? ` transform: rotate(${rotate}deg); transform-origin: left top;` : '';
  const left = panel.x + box.x;
  const top = panel.y + box.y;
  return `#cb${index} {
  position: absolute;
  left: ${left}in;
  top: ${top}in;
  width: ${box.widthIn}in;
  ${fontCss(box)}${transform}
}`;
}

/**
 * One sticker, positioned in inches on the whole cover.
 *
 * The rotation is about the sticker's centre rather than its corner, because
 * that is what turning a thing on a page means to anyone doing it: the picture
 * spins where it sits instead of swinging away across the cover.
 */
function stickerCss(sticker: CoverSticker, index: number): string {
  const shorter = Math.min(sticker.widthIn, sticker.heightIn);
  const radius = sticker.cornerRadius * shorter;
  const rules = [
    'position: absolute;',
    `left: ${sticker.x}in;`,
    `top: ${sticker.y}in;`,
    `width: ${sticker.widthIn}in;`,
    `height: ${sticker.heightIn}in;`,
    'overflow: hidden;',
  ];
  if (sticker.rotate) rules.push(`transform: rotate(${sticker.rotate}deg);`);
  if (radius > 0) rules.push(`border-radius: ${radius.toFixed(4)}in;`);
  if (sticker.border) {
    rules.push(`border: ${sticker.border.widthPt}pt solid ${cssColor(sticker.border.color)};`);
  }
  // A soft drop shadow. Printed rather than screen-only, so it is kept gentle:
  // a hard shadow on a paper cover reads as a mistake.
  if (sticker.shadow) rules.push('box-shadow: 0 0.04in 0.09in rgba(0,0,0,0.33);');
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
    ? { x: 0, y: 0, width: d.width, height: d.height }
    : { x: panels.front.x - d.bleed, y: 0, width: panels.front.width + d.bleed, height: d.height };

  const imageHtml = image && imageSrc
    ? `<img class="cover-image" src="${escapeHtml(imageSrc)}" alt="">`
    : '';

  const boxes = cover.textBoxes
    .map((box, i) => `<div class="cover-text" id="cb${i}">${escapeBlock(box.text)}</div>`)
    .join('');

  const boxStyles = cover.textBoxes.map((box, i) => boxCss(box, layout, i)).join('\n');

  // Stickers are written in array order, which is what puts the last one on
  // top. They come before the text so a caption is never buried under a
  // picture that happens to have been added after it.
  const stickers = (cover.stickers ?? [])
    .map((sticker, i) => {
      const src = options.assets?.[sticker.assetId] ?? '';
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
@page { size: ${d.width}in ${d.height}in; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
.cover {
  position: relative;
  width: ${d.width}in;
  height: ${d.height}in;
  overflow: hidden;
  background: ${cssColor(cover.backgroundColor)};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.panel { position: absolute; }
#panel-back {
  left: 0; top: 0;
  width: ${panels.spine.x}in;
  height: ${d.height}in;
  background: ${cssColor(cover.backColor)};
}
#panel-spine {
  left: ${panels.spine.x}in; top: 0;
  width: ${panels.spine.width}in;
  height: ${d.height}in;
  background: ${cssColor(cover.spineColor)};
}
.cover-image {
  position: absolute;
  left: ${imageRect.x}in;
  top: ${imageRect.y}in;
  width: ${imageRect.width}in;
  height: ${imageRect.height}in;
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
${boxStyles}
.barcode-zone {
  position: absolute;
  left: ${barcode.x}in; top: ${barcode.y}in;
  width: ${barcode.width}in; height: ${barcode.height}in;
  border: 1px dashed rgba(0,0,0,0.45);
  background: rgba(255,255,255,0.55);
  display: flex; align-items: center; justify-content: center;
  font: italic 7pt Georgia, serif; color: rgba(0,0,0,0.6); text-align: center;
}
.guide { position: absolute; pointer-events: none; }
.guide-fold { top: 0; height: ${d.height}in; border-left: 1px dashed rgba(0,90,255,0.85); }
#fold-a { left: ${layout.folds[0]}in; }
#fold-b { left: ${layout.folds[1]}in; }
.guide-bleed {
  left: ${d.bleed}in; top: ${d.bleed}in;
  width: ${d.width - 2 * d.bleed}in; height: ${d.height - 2 * d.bleed}in;
  border: 1px solid rgba(220,38,38,0.85);
}
.guide-safe { top: ${d.bleed + 0.25}in; height: ${d.height - 2 * d.bleed - 0.5}in; border: 1px dashed rgba(16,185,129,0.8); }
#safe-back { left: ${panels.back.x + 0.25}in; width: ${panels.back.width - 0.5}in; }
#safe-front { left: ${panels.front.x + 0.25}in; width: ${panels.front.width - 0.5}in; }
${options.guides ? '' : '.barcode-zone { border-color: transparent; background: transparent; color: transparent; }'}
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
