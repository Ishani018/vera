import type { BorderSettings, BorderStyle } from '../types';

/**
 * Decorative page frames.
 *
 * Borders are drawn on a box inset from the *text block*, so they can only ever
 * move outward into the margin by `insetIn` — they can never cross into the
 * gutter or the bleed zone, because the text block is already inside both.
 *
 * Straight rules are plain CSS borders. The ornamental styles add SVG corner
 * pieces as fixed-size, non-repeating background images, so nothing stretches.
 */

export type BorderCss = {
  /** Declarations for the outer frame box. */
  outer: string;
  /** Declarations for the inner frame box, or null when the style has one box. */
  inner: string | null;
};

function dataUri(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}")`;
}

/** An L-shaped bracket, drawn for the top-left corner and rotated for the rest. */
function bracketCorner(color: string, weight: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <g fill="none" stroke="${color}" stroke-width="${weight * 2}">
      <path d="M0 14 L0 0 L14 0"/>
      <path d="M6 20 L6 6 L20 6"/>
      <circle cx="6" cy="6" r="1.6" fill="${color}" stroke="none"/>
    </g>
  </svg>`;
}

/** A fleuron-ish leaf that reads as floral at print sizes without being fussy. */
function floralCorner(color: string, weight: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44">
    <g fill="none" stroke="${color}" stroke-width="${weight * 1.6}" stroke-linecap="round">
      <path d="M2 22 C2 10 10 2 22 2"/>
      <path d="M8 22 C8 14 14 8 22 8"/>
      <path d="M22 8 C18 8 14 5 14 1"/>
      <path d="M8 22 C8 18 5 14 1 14"/>
    </g>
    <circle cx="22" cy="22" r="2" fill="${color}"/>
  </svg>`;
}

function cornerBackgrounds(svg: string, size: number): string {
  const rotated = (deg: number) =>
    dataUri(
      svg.replace(
        '<g ',
        `<g transform="rotate(${deg} ${size / 2} ${size / 2})" `,
      ),
    );
  return [
    `background-image: ${rotated(0)}, ${rotated(90)}, ${rotated(180)}, ${rotated(270)};`,
    'background-position: left top, right top, right bottom, left bottom;',
    'background-repeat: no-repeat;',
    `background-size: ${size}px ${size}px;`,
  ].join('\n  ');
}

export function borderCss(border: BorderSettings): BorderCss {
  const { color, weightPt: w } = border;
  const style: BorderStyle = border.style;

  switch (style) {
    case 'thin':
      return { outer: `border: ${w}pt solid ${color};`, inner: null };

    case 'double':
      return {
        outer: `border: ${w}pt solid ${color};`,
        inner: `border: ${Math.max(0.4, w * 0.6)}pt solid ${color}; inset: ${w + 3}pt;`,
      };

    case 'deco':
      return {
        outer: [
          `border: ${w}pt solid ${color};`,
          cornerBackgrounds(bracketCorner(color, w), 40),
        ].join('\n  '),
        inner: null,
      };

    case 'floral':
      return {
        outer: [
          `border: ${Math.max(0.4, w * 0.7)}pt solid ${color};`,
          cornerBackgrounds(floralCorner(color, w), 44),
        ].join('\n  '),
        inner: null,
      };

    case 'corners':
      return {
        outer: cornerBackgrounds(bracketCorner(color, w), 40),
        inner: null,
      };
  }
}

export const BORDER_STYLE_LABELS: Record<BorderStyle, string> = {
  thin: 'Thin rule',
  double: 'Double rule',
  deco: 'Art deco',
  floral: 'Floral',
  corners: 'Corner flourishes',
};

export const ORNAMENT_GLYPHS = {
  asterism: '⁂',
  fleuron: '❧',
  dinkus: '* * *',
  diamond: '◆',
  rule: '',
} as const;

export const ORNAMENT_LABELS = {
  asterism: 'Asterism ⁂',
  fleuron: 'Fleuron ❧',
  dinkus: 'Dinkus * * *',
  diamond: 'Diamond ◆',
  rule: 'Short rule',
} as const;
