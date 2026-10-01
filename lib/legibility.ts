import type { CoverSpec, CoverTextBox } from './types';

/**
 * Will the title read at the size people actually meet it?
 *
 * A cover is designed at nine inches tall and sold at about an inch. Almost
 * nobody sees it full size before deciding whether to click, so a title that
 * is beautiful on the screen it was made on and a grey smudge in a search
 * result has failed at the only moment that pays. It is the commonest and
 * most expensive mistake in self-publishing, and it is entirely avoidable by
 * looking at the thing small.
 *
 * So this works out two things, and states both rather than pronouncing:
 * how big the title's type actually becomes, and whether it stands out from
 * what is behind it.
 */

/**
 * How tall the cover is in a search result, in device pixels.
 *
 * An approximation of the desktop search-result size, and deliberately one
 * number in one place so it can be argued with. **It has not been measured
 * against Amazon** — no page was fetched to check it — and the right way to
 * disagree is to change this constant and look again. Mobile is smaller
 * still, which is why `TIGHT` below is not generous.
 */
export const BROWSE_HEIGHT_PX = 160;

/**
 * The size, in rendered pixels, below which type stops being read.
 *
 * Body copy on a screen is about 16px and small print about 11px. Letterforms
 * start to collapse into each other below about 9, whatever the face — so 9
 * is the floor for "can be read at all", and 14 is where a title is read at a
 * glance rather than squinted at. Between them it depends on the face, the
 * weight and the eyes, which is what "tight" means.
 */
export const UNREADABLE_PX = 9;
export const TIGHT_PX = 14;

/**
 * Contrast the title must have against what is behind it.
 *
 * WCAG asks 4.5:1 of small text and 3:1 of large. A cover title is large type
 * by the time it is printed and small type by the time it is browsed, and it
 * is the browsing that decides whether anyone ever prints it — so it is held
 * to the small-text bar.
 */
export const CONTRAST_MIN = 4.5;
export const CONTRAST_BAD = 3;

/* ----------------------------------------------------------------- colour */

/** `#abc` and `#aabbcc`, which is everything the cover model stores. */
export function parseHex(value: string): { r: number; g: number; b: number } | null {
  const hex = value.trim().replace(/^#/, '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Relative luminance, as WCAG defines it. */
export function luminance(colour: string): number | null {
  const rgb = parseHex(colour);
  if (!rgb) return null;
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** The WCAG ratio between two colours, 1 to 21, or null if either is not one. */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/* ------------------------------------------------------------------ title */

/**
 * Which box is the title.
 *
 * The biggest type on the front, because that is what a title is — guessed
 * from the design rather than from the book's metadata, since the box on the
 * cover is the thing being judged and it may say something quite different
 * from `meta.title`. Ties go to whichever is higher up the cover.
 */
export function titleBox(cover: CoverSpec, frontPanel = 'front'): CoverTextBox | null {
  const candidates = (cover.textBoxes ?? []).filter(
    (box) => box.text.trim().length > 0 && (box.panel === frontPanel || box.panel === 'board'),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, box) => {
    if (box.font.sizePt !== best.font.sizePt) return box.font.sizePt > best.font.sizePt ? box : best;
    return box.y < best.y ? box : best;
  });
}

/** How tall that type is once the whole front cover is `browsePx` tall. */
export function sizeAtBrowse(
  sizePt: number,
  coverHeightPt: number,
  browsePx = BROWSE_HEIGHT_PX,
): number {
  if (!coverHeightPt) return 0;
  return (sizePt * browsePx) / coverHeightPt;
}

export type Verdict = 'ok' | 'tight' | 'unreadable' | 'nothing-to-judge';

export type Legibility = {
  verdict: Verdict;
  /** What is being judged, so the reader knows which box it means. */
  title: string | null;
  /** Its type size once the cover is thumbnail-sized. */
  pxAtBrowse: number;
  /** Against the flat colour behind it, or null where it sits over a picture. */
  contrast: number | null;
  /** Why, in the order worth reading. Already worded. */
  notes: string[];
};

/**
 * The whole judgement.
 *
 * Contrast is only computed where the answer is knowable from the design: a
 * title over a flat colour. Over a photograph there is no single colour
 * behind it, and guessing an average would produce a number that reads as
 * authoritative and is not — so it says it cannot tell, which is true and
 * more useful.
 */
export function judgeCover(
  cover: CoverSpec,
  coverHeightPt: number,
  {
    browsePx = BROWSE_HEIGHT_PX,
    frontPanel = 'front',
    /** True where a picture covers the part of the cover the title sits on. */
    overPicture = false,
  }: { browsePx?: number; frontPanel?: string; overPicture?: boolean } = {},
): Legibility {
  const box = titleBox(cover, frontPanel);
  if (!box) {
    return {
      verdict: 'nothing-to-judge',
      title: null,
      pxAtBrowse: 0,
      contrast: null,
      notes: ['There is no text on the front to judge yet.'],
    };
  }

  const pxAtBrowse = sizeAtBrowse(box.font.sizePt, coverHeightPt, browsePx);
  const behind = panelColour(cover, box.panel);
  const contrast = overPicture ? null : contrastRatio(box.font.color, behind);
  const notes: string[] = [];

  let verdict: Verdict = 'ok';
  const rounded = Math.round(pxAtBrowse * 10) / 10;

  if (pxAtBrowse < UNREADABLE_PX) {
    verdict = 'unreadable';
    notes.push(
      `The title comes out at ${rounded}px in a search result, below the ${UNREADABLE_PX}px ` +
        'at which letters stop being distinguishable. Make it larger, or shorter.',
    );
  } else if (pxAtBrowse < TIGHT_PX) {
    verdict = 'tight';
    notes.push(
      `The title comes out at ${rounded}px in a search result. It can be read, but not at a ` +
        `glance — ${TIGHT_PX}px is where a title stops needing to be squinted at.`,
    );
  } else {
    notes.push(`The title comes out at ${rounded}px in a search result, which reads easily.`);
  }

  if (contrast === null) {
    notes.push(
      overPicture
        ? 'It sits over a picture, so how well it stands out cannot be worked out from the ' +
          'design — judge that one by eye, small.'
        : 'Its colour or the colour behind it is not a plain one, so the contrast could not be ' +
          'measured.',
    );
  } else {
    const ratio = contrast.toFixed(1);
    if (contrast < CONTRAST_BAD) {
      verdict = 'unreadable';
      notes.push(
        `It is ${ratio}:1 against what is behind it, which disappears at this size. Anything ` +
          `under ${CONTRAST_BAD}:1 is not a contrast, it is a texture.`,
      );
    } else if (contrast < CONTRAST_MIN) {
      if (verdict === 'ok') verdict = 'tight';
      notes.push(
        `It is ${ratio}:1 against what is behind it, under the ${CONTRAST_MIN}:1 that small ` +
          'text needs. It will go muddy on a dim screen.',
      );
    } else {
      notes.push(`It is ${ratio}:1 against what is behind it, which stands out cleanly.`);
    }
  }

  return { verdict, title: box.text.trim(), pxAtBrowse, contrast, notes };
}

/** The flat colour on the panel a box sits on. */
function panelColour(cover: CoverSpec, panel: string): string {
  if (panel === 'back') return cover.backColor || cover.backgroundColor;
  if (panel === 'spine') return cover.spineColor || cover.backgroundColor;
  return cover.backgroundColor;
}
