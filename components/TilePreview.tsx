import type { ReactNode } from 'react';
import { CATEGORY_TINT, type TileArt, type TileCategory } from '@/lib/tiles';
import { DRAWING_FITS, PREVIEW_BOX, PREVIEW_INSET } from '@/lib/preview';
import { cx } from './ui';

/**
 * The one sized box every preview sits in, and the drawings that go in it.
 *
 * One component rather than a box written out at each place that needs one.
 * The bug this replaces was a drawing that carried its own size: it was written
 * for a 96 px tile, and the first time it was put in a 44 px one it kept its 80
 * by 120 pixels, hung out of the bottom of the card and sat over the title.
 * Nothing warned, because an svg that overflows its parent is not an error —
 * it is just a picture somewhere it should not be.
 *
 * So the size lives here and nowhere else. A drawing fills what it is given
 * and keeps its proportions; the box clips, in case a later drawing is drawn
 * outside its own viewBox.
 */

export function PreviewBox({
  category,
  size = PREVIEW_BOX,
  round = false,
  className,
  children,
}: {
  category: TileCategory;
  /** The square it occupies, in pixels. The only place a size is decided. */
  size?: number;
  round?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'grid shrink-0 place-items-center overflow-hidden',
        round ? 'rounded-full' : 'rounded-lg',
        className,
      )}
      style={{
        width: size,
        height: size,
        padding: PREVIEW_INSET,
        background: CATEGORY_TINT[category],
      }}
    >
      {children}
    </span>
  );
}

/** A drawing in its box: the pair, so neither is used without the other. */
export function TilePreview({
  art,
  category,
  size,
  className,
}: {
  art: TileArt;
  category: TileCategory;
  size?: number;
  className?: string;
}) {
  return (
    <PreviewBox category={category} size={size} className={className}>
      <TileDrawing art={art} />
    </PreviewBox>
  );
}

/**
 * One drawing per tile, at the tile's own proportions — and at no size at all.
 *
 * Every one is a 120 by 80 viewBox scaled to fit whatever it is put in. None of
 * them may carry a width, a height or a sizing class: that is the whole of the
 * fix, and `tests/preview.test.mjs` reads this file and fails if one does.
 */
export function TileDrawing({ art }: { art: TileArt }) {
  // From the tokens, so a drawing belongs to the theme it is drawn in.
  const stroke = 'var(--color-ink-400)';
  const paper = 'var(--color-paper)';
  const fits = { ...DRAWING_FITS, viewBox: `0 0 120 80` } as const;
  switch (art) {
    case 'interior':
      return (
        <svg {...fits} role="img" aria-label="An open book">
          <rect x="8" y="8" width="51" height="64" fill={paper} stroke={stroke} />
          <rect x="61" y="8" width="51" height="64" fill={paper} stroke={stroke} />
          {[22, 30, 38, 46].map((y, i) => (
            <rect key={y} x="16" y={y} width={[30, 22, 34, 18][i]} height="2.4" fill={stroke} />
          ))}
          {[22, 30, 38].map((y, i) => (
            <rect key={y} x="69" y={y} width={[26, 34, 20][i]} height="2.4" fill={stroke} />
          ))}
        </svg>
      );
    case 'wrap':
      return (
        <svg {...fits} role="img" aria-label="A wrap cover">
          <rect x="6" y="12" width="48" height="56" fill={paper} stroke={stroke} />
          <rect x="54" y="12" width="12" height="56" fill="var(--color-ink-200)" stroke={stroke} />
          <rect x="66" y="12" width="48" height="56" fill={paper} stroke={stroke} />
          <rect x="76" y="26" width="28" height="4" fill="var(--color-ink-500)" />
          <rect x="76" y="34" width="18" height="3" fill={stroke} />
        </svg>
      );
    case 'square':
      return (
        <svg {...fits} role="img" aria-label="A square post">
          <rect x="32" y="4" width="56" height="56" fill={paper} stroke={stroke} />
          <circle cx="60" cy="26" r="11" fill="var(--color-ink-200)" />
          <rect x="42" y="44" width="36" height="4" fill="var(--color-ink-500)" />
          <rect x="48" y="52" width="24" height="3" fill={stroke} />
        </svg>
      );
    case 'pin':
      return (
        <svg {...fits} role="img" aria-label="A tall pin">
          <rect x="42" y="2" width="36" height="72" fill={paper} stroke={stroke} />
          <rect x="48" y="10" width="24" height="26" fill="var(--color-ink-200)" />
          <rect x="48" y="44" width="24" height="4" fill="var(--color-ink-500)" />
          <rect x="48" y="52" width="16" height="3" fill={stroke} />
        </svg>
      );
    case 'postcard':
      return (
        <svg {...fits} role="img" aria-label="A postcard">
          <rect x="34" y="6" width="52" height="68" fill={paper} stroke={stroke} />
          <rect x="40" y="12" width="40" height="30" fill="var(--color-ink-200)" />
          <rect x="40" y="50" width="32" height="3.5" fill="var(--color-ink-500)" />
          <rect x="40" y="58" width="22" height="3" fill={stroke} />
        </svg>
      );
    case 'bookmark':
      return (
        <svg {...fits} role="img" aria-label="A bookmark">
          <rect x="52" y="2" width="16" height="72" fill={paper} stroke={stroke} />
          <rect x="56" y="10" width="8" height="8" fill="var(--color-ink-200)" />
          <rect x="56" y="24" width="8" height="26" fill={stroke} opacity="0.5" />
          <path d="M52 74 L60 66 L68 74 Z" fill="var(--color-ink-200)" stroke={stroke} />
        </svg>
      );
    case 'sticker':
      // A shape with a die-cut edge round it, which is the thing itself.
      return (
        <svg {...fits} role="img" aria-label="A die-cut sticker">
          <path
            d="M44 12 Q60 4 76 12 Q92 22 88 42 Q84 64 60 70 Q34 66 30 44 Q26 22 44 12 Z"
            fill={paper}
            stroke={stroke}
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <path
            d="M46 22 Q60 16 72 24 Q82 34 76 48 Q66 60 54 56 Q40 50 42 36 Q43 27 46 22 Z"
            fill="var(--color-ink-200)"
            stroke={stroke}
          />
          <circle cx="54" cy="36" r="3" fill={stroke} />
          <circle cx="67" cy="38" r="3" fill={stroke} />
        </svg>
      );
  }
}
