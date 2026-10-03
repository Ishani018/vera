/**
 * Every colour, radius, size, duration and curve in the app, as data.
 *
 * One file rather than a hundred literals spread through components, for two
 * reasons. A value written in twelve places is twelve places to miss when it
 * changes — and the contrast sweep can only check what it can read, so a colour
 * typed into a component is a colour nothing is checking.
 *
 * **Chrome only.** Colours that are part of somebody's work — the default ink
 * of a sticker, the paper a sheet is printed on, the red of a cut line, the
 * text colour a new cover starts with — are not here and must never be. They go
 * into exported files, so a palette that changed them would change what people
 * have already made. They stay written where they are used, next to the thing
 * they are a default for. `tests/export-palette.test.mjs` proves an export is
 * byte-identical under two palettes.
 *
 * `scripts/make-tokens.mjs` turns this into `app/tokens.css`, and a test fails
 * if the two have drifted apart.
 */

/* ------------------------------------------------------------ the palette */

/**
 * The seventeen roles, in the order they are reasoned about.
 *
 * `ink` is text and outlines, darkest first. `paper` is the surfaces a page is
 * built from, lightest first. `sheet` is the one pure white that page
 * silhouettes and text on accents are drawn in — it stays white even in the
 * dark palette, because a picture of a sheet of paper is a picture of a sheet
 * of paper whatever the room is like.
 *
 * Three accents and no more. `accentA` is the primary action and the red marks
 * a proof sheet carries; `accentB` is the secondary, the teal; `accentC` is a
 * highlight, which is a colour you read *on* rather than read.
 */
export type Palette = {
  id: string;
  name: string;
  /** What it feels like, for the picker. */
  note: string;

  ink900: string;
  ink700: string;
  ink500: string;
  ink300: string;

  paper50: string;
  paper100: string;
  paper200: string;
  paper300: string;

  /** Pure paper white. Page silhouettes, and text drawn on an accent. */
  sheet: string;

  accentA500: string;
  accentA700: string;
  accentA100: string;

  accentB500: string;
  accentB700: string;
  accentB100: string;

  accentC400: string;
  accentC100: string;

  /**
   * A near-black that survives on a white shape in a dark palette.
   *
   * Only the dark palette needs it: there, `ink900` is nearly white, so a page
   * silhouette drawn in `sheet` has nothing dark to outline it with and a tag
   * on yellow has nothing dark to be lettered in. Everywhere else it is the
   * same as `ink900` and costs nothing.
   */
  outline: string;

  /** A dark sidebar fills with ink900 (or `outline`); a tinted one with paper200. */
  sidebarStyle: 'dark' | 'tinted';
  /** Whether text on accentA is the sheet white or the ink. */
  textOnAccentA: 'sheet' | 'ink';
  isDark: boolean;
};

/**
 * The default. A printer's proof sheet: warm paper, black ink, red marks.
 *
 * The red and the teal are the two colours from the cover, and they are the
 * two accents in every palette here — what changes between palettes is the
 * paper and the ink around them, not what the accents mean.
 */
export const PRESS_PROOF: Palette = {
  id: 'press-proof',
  name: 'Press proof',
  note: 'Warm proof paper, black ink, red marks',
  ink900: '#1B1815',
  ink700: '#3A332B',
  ink500: '#6B6256',
  ink300: '#A79E90',
  paper50: '#FBF7EE',
  paper100: '#F5EEDF',
  paper200: '#EBE2CE',
  paper300: '#DDD1B8',
  sheet: '#FFFFFF',
  accentA500: '#D1432A',
  accentA700: '#A8321D',
  accentA100: '#F6D9D1',
  accentB500: '#0B6A62',
  accentB700: '#084F49',
  accentB100: '#D3E8E4',
  accentC400: '#F3C84B',
  accentC100: '#FBEFC6',
  outline: '#1B1815',
  sidebarStyle: 'dark',
  textOnAccentA: 'sheet',
  isDark: false,
};

export const SHERBET: Palette = {
  id: 'sherbet',
  name: 'Sherbet',
  note: 'Soft plum and peach',
  ink900: '#3B2433',
  ink700: '#5C4155',
  // Nudged 13% darker from #86697D: mono small print on paper100 came to 4.19
  // and the tagline on the tinted sidebar to 3.64.
  ink500: '#755B6D',
  ink300: '#B9A2B2',
  paper50: '#FFF8F3',
  paper100: '#FDEBE2',
  paper200: '#F8D9CB',
  paper300: '#EBC4B3',
  sheet: '#FFFFFF',
  accentA500: '#BE4D63',
  accentA700: '#8E3247',
  accentA100: '#FAD5DC',
  accentB500: '#3F7F8A',
  accentB700: '#2C5C65',
  accentB100: '#D6ECEF',
  accentC400: '#F7C48B',
  accentC100: '#FDEBD3',
  outline: '#3B2433',
  sidebarStyle: 'tinted',
  textOnAccentA: 'sheet',
  isDark: false,
};

export const MINT_CLOUD: Palette = {
  id: 'mint-cloud',
  name: 'Mint cloud',
  note: 'Cool green paper, warm red marks',
  ink900: '#1F3A33',
  ink700: '#3C5A51',
  // Nudged 17% darker from #647F75, which failed on all four of its surfaces —
  // 3.37 on the tinted sidebar was the worst of them.
  ink500: '#536961',
  ink300: '#9DB4AA',
  paper50: '#F5FBF7',
  paper100: '#E6F4EC',
  paper200: '#D2E8DA',
  paper300: '#B8D6C4',
  sheet: '#FFFFFF',
  accentA500: '#BF4F37',
  accentA700: '#8F3724',
  accentA100: '#F8D8CE',
  accentB500: '#3E78A8',
  accentB700: '#2A5578',
  accentB100: '#D8E8F5',
  accentC400: '#F3D77B',
  accentC100: '#FBF1CC',
  outline: '#1F3A33',
  sidebarStyle: 'tinted',
  textOnAccentA: 'sheet',
  isDark: false,
};

export const LILAC_HAZE: Palette = {
  id: 'lilac-haze',
  name: 'Lilac haze',
  note: 'Violet paper, magenta and indigo',
  ink900: '#2A2145',
  ink700: '#473C69',
  // Nudged 8% darker from #6F6590: the tagline on the tinted sidebar was 3.97.
  ink500: '#665D84',
  ink300: '#A79FC4',
  paper50: '#FAF7FF',
  paper100: '#F0EAFB',
  paper200: '#E3DAF6',
  paper300: '#CDBFEA',
  sheet: '#FFFFFF',
  accentA500: '#C2417D',
  accentA700: '#922F5E',
  accentA100: '#F9D4E6',
  accentB500: '#4B5BC4',
  accentB700: '#343F92',
  accentB100: '#DADFF8',
  accentC400: '#F5D77A',
  accentC100: '#FCF1CA',
  outline: '#2A2145',
  sidebarStyle: 'tinted',
  textOnAccentA: 'sheet',
  isDark: false,
};

/**
 * Riso. The one palette whose primary carries ink rather than white.
 *
 * A risograph pink that white can sit on is not a risograph pink — it is a
 * maroon. The colour is the point here, so the text gives way instead, which is
 * what `textOnAccentA` exists for.
 */
export const RISO: Palette = {
  id: 'riso',
  name: 'Riso',
  note: 'Fluorescent pink and blue on newsprint',
  ink900: '#111A6B',
  ink700: '#2A3490',
  ink500: '#4F58A8',
  ink300: '#9AA0D4',
  paper50: '#F6F2E7',
  paper100: '#ECE6D3',
  paper200: '#DFD7BE',
  paper300: '#C9BFA2',
  sheet: '#FFFEFA',
  accentA500: '#FF4FA3',
  // Nudged 5% darker from #C21F78: as lettering it came to 4.47 on paper100 and
  // 4.18 on its own pale badge. The 500 keeps its fluorescent pink exactly.
  accentA700: '#B81D72',
  accentA100: '#FFD3E8',
  accentB500: '#0078BF',
  accentB700: '#00568A',
  accentB100: '#CFE6F5',
  accentC400: '#FFE14A',
  accentC100: '#FFF5B8',
  outline: '#111A6B',
  sidebarStyle: 'dark',
  textOnAccentA: 'ink',
  isDark: false,
};

/**
 * Night. The ink and paper ramps swap ends.
 *
 * `ink900` is the lightest ink because it is still the *strongest* ink — the
 * role is "the colour body text is", not "the dark one". Keeping the names
 * meaning the same thing in every palette is what lets one stylesheet serve
 * both, and `outline` covers the one case that genuinely needs a near-black.
 */
export const NIGHT: Palette = {
  id: 'night',
  name: 'Night',
  note: 'Dark room, same red and teal',
  ink900: '#F4EEE1',
  ink700: '#D8CFBE',
  ink500: '#A39A8A',
  ink300: '#6F6759',
  paper50: '#14110E',
  paper100: '#1F1B16',
  paper200: '#2B261F',
  paper300: '#453E33',
  sheet: '#FFFFFF',
  accentA500: '#D1432A',
  accentA700: '#FF8A6E',
  accentA100: '#3A1B14',
  accentB500: '#0E8277',
  accentB700: '#4FC3B6',
  accentB100: '#12302D',
  accentC400: '#F3C84B',
  accentC100: '#2E2A18',
  outline: '#0C0A08',
  sidebarStyle: 'dark',
  textOnAccentA: 'sheet',
  isDark: true,
};

export const PALETTES: Palette[] = [PRESS_PROOF, SHERBET, MINT_CLOUD, LILAC_HAZE, RISO, NIGHT];

/** Kept under the old name so nothing that imports `THEMES` has to care. */
export const THEMES = PALETTES;

export const DEFAULT_THEME = PRESS_PROOF.id;

export const themeById = (id: string | null | undefined): Palette =>
  PALETTES.find((one) => one.id === id) ?? PRESS_PROOF;

/**
 * Where the chosen palette is remembered.
 *
 * A key of its own, not a change to one that already holds somebody's work:
 * nothing in `lib/db.ts` is touched, and losing this one loses a preference
 * rather than a book.
 */
export const THEME_KEY = 'isnaevy:theme';

/** Where a palette somebody mixed themselves is remembered. The one new key. */
export const CUSTOM_KEY = 'isnaevy:palette-custom';

/** The id a made-up palette answers to. */
export const CUSTOM_ID = 'custom';

/** The palette to use, given the address and what was remembered. */
export function chooseTheme(search: string, stored: string | null): string {
  const asked = new URLSearchParams(search || '').get('theme');
  const known = (id: string | null) =>
    Boolean(id) && (id === CUSTOM_ID || PALETTES.some((one) => one.id === id));
  if (known(asked)) return asked as string;
  if (known(stored)) return stored as string;
  return DEFAULT_THEME;
}

/* ------------------------------------------------------------- the scales */

/**
 * Corners.
 *
 * Press Proof has four and only four: 6 on anything you press or type into, 3
 * on a badge or tag, 8 on a rail item, 18 on a pill. `pill` stays for the two
 * places that are genuinely a lozenge.
 */
export const RADII: Record<string, string> = {
  tag: '3px',
  xs: '6px',
  sm: '8px',
  md: '6px',
  lg: '8px',
  xl: '18px',
  pill: '999px',
};

/**
 * Depth, without blur.
 *
 * A proof sheet has no drop shadows on it. What it has is outlines, flat tints
 * and crop marks, so these are kept only because a handful of floating things —
 * a popover, a dialog, a toast — still have to read as *over* rather than *in*.
 * Even those are a hairline and a short offset, never a glow.
 */
export const SHADOWS: Record<string, string> = {
  rest: 'none',
  raised: 'none',
  float: '0 2px 0 rgb(var(--shade) / 0.10), 0 8px 18px -10px rgb(var(--shade) / 0.30)',
  glow: 'none',
};

/** How long things take. Nothing here is slower than half a second. */
export const MOTION: Record<string, string> = {
  fast: '120ms',
  base: '200ms',
  slow: '320ms',
  slower: '480ms',
};

/** How they get there. */
export const EASING: Record<string, string> = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  /* Overshoots a little and settles. For a thing that snaps into place. */
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
};

/** The type scale. Body is 13.5; everything else is a step from it. */
export const TYPE: Record<string, string> = {
  xs: '11.5px',
  sm: '12.5px',
  base: '13.5px',
  md: '15px',
  lg: '17px',
  xl: '20px',
  display: '26px',
  hero: '34px',
};

/** Space, in fours. */
export const SPACE: Record<string, string> = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
};

/**
 * The three faces, and what each is for.
 *
 * Kept here rather than in CSS so the one place that decides what a label is
 * set in is the same place that decides what colour it is.
 */
export const FONTS = {
  /** Headings, and the one italic word in the hero. */
  display: "'Fraunces', 'Iowan Old Style', Georgia, serif",
  /** Body, buttons, anything someone reads a sentence of. */
  body: "'Inter', ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif",
  /** Small uppercase labels, sizes, badges, tags. A proof sheet's annotations. */
  mono: "'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  /** The wordmark, and nothing else. */
  script: "'Great Vibes', 'Snell Roundhand', cursive",
} as const;

/* ---------------------------------------------- what the palette works out */

/** Relative luminance, by the WCAG formula. Local so this file imports nothing. */
function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const channel = (at: number) => {
    const c = parseInt(n.slice(at, at + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Whether text on this fill should be the sheet white or the near-black.
 *
 * Worked out rather than declared, because the answer differs *within* a
 * palette: Riso's pink needs ink and Riso's deep magenta needs white, and a
 * single `textOnAccentA` per palette would be wrong for one of them. The
 * palette still declares `textOnAccentA` because that is the brand decision for
 * the primary button; this is the general rule everything else uses.
 */
export function textOn(palette: Palette, fill: string): string {
  const dark = palette.outline;
  return ratio(palette.sheet, fill) >= ratio(dark, fill) ? palette.sheet : dark;
}

/**
 * The ink to letter in on a white page silhouette.
 *
 * In every light palette that is just `ink900`. In the dark one `ink900` is
 * nearly white, and a silhouette is still a white sheet of paper, so it is
 * `outline` — which is the whole reason that role exists.
 */
export const inkOnSheet = (p: Palette) => (p.isDark ? p.outline : p.ink900);
export const mutedOnSheet = (p: Palette) => (p.isDark ? p.ink300 : p.ink500);

/* ------------------------------------------------------- what to check */

/**
 * Every pair of colours a reader actually has to read, by name.
 *
 * The sweep runs this list against all six palettes. A pair that is not here
 * is a pair nobody is checking, so a new coloured surface means a new line
 * here as well.
 *
 * Three names are resolved per palette rather than listed twice — `textOnA`,
 * `textOnA700` and `inkOnSheet` — because the right answer genuinely differs
 * between palettes, and writing both possibilities as fixed pairs would fail
 * one palette or the other whatever was chosen.
 *
 * **What is deliberately not here: hairline borders.** A 1px rule between two
 * surfaces is not text and not a control, and holding `ink300` to 3:1 against
 * the paper would make every border on the page read as a heavy outline — which
 * is the opposite of the look. Where a border carries meaning rather than
 * separation (a focus ring, a selected card) it is drawn in `ink900`, which
 * passes easily.
 */
export const MUST_READ: { text: string; on: string; what: string; large?: boolean }[] = [
  /* Text on the surfaces a page is built from. */
  { text: 'ink900', on: 'paper50', what: 'body text on the page' },
  { text: 'ink900', on: 'paper100', what: 'body text on a plate' },
  { text: 'ink900', on: 'paper200', what: 'body text on a tinted sidebar' },
  { text: 'ink700', on: 'paper50', what: 'a label on the page' },
  { text: 'ink700', on: 'paper100', what: 'a label on a plate' },
  { text: 'ink700', on: 'paper200', what: 'a label on a tint' },
  { text: 'ink500', on: 'paper50', what: 'mono small print on the page' },
  { text: 'ink500', on: 'paper100', what: 'mono small print on a plate' },

  /* Text drawn on a white page silhouette, which stays white in every palette. */
  { text: 'inkOnSheet', on: 'sheet', what: 'a title on a page silhouette' },
  { text: 'mutedOnSheet', on: 'sheet', what: 'small print on a page silhouette' },

  /* The sidebar, dark or tinted. */
  { text: 'sidebarText', on: 'sidebarFill', what: 'a nav label on the sidebar' },
  { text: 'sidebarMuted', on: 'sidebarFill', what: 'the tagline on the sidebar' },
  { text: 'sidebarActiveText', on: 'sidebarActiveFill', what: 'the active nav row' },

  /* Accents as text. The deep step letters; the mid step fills. */
  { text: 'accentA700', on: 'paper50', what: 'a red mark on the page' },
  { text: 'accentA700', on: 'paper100', what: 'a red mark on a plate' },
  { text: 'accentA700', on: 'accentA100', what: 'a red badge' },
  { text: 'accentB700', on: 'paper50', what: 'a teal link on the page' },
  { text: 'accentB700', on: 'paper100', what: 'a teal link on a plate' },
  { text: 'accentB700', on: 'accentB100', what: 'a teal chip' },

  /* Accents as fills. */
  { text: 'textOnA', on: 'accentA500', what: 'the Create button' },
  { text: 'textOnA700', on: 'accentA700', what: 'the Create button, pressed' },
  { text: 'sheet', on: 'accentB500', what: 'white on a teal fill' },

  /*
    Yellow carries dark text, not white. A yellow bright enough to read as a
    highlighter cannot reach 4.5:1 against white, and its job is to be read
    *on*. `outline` rather than `ink900` because in the dark palette `ink900`
    is nearly white and the yellow is not.
  */
  { text: 'outline', on: 'accentC400', what: 'ink on a yellow highlight' },
  { text: 'ink900', on: 'accentC100', what: 'text on a pale yellow note' },
  { text: 'ink700', on: 'accentC100', what: 'a label on a pale yellow note' },
];

/**
 * A colour by name, for the sweep.
 *
 * The names that are not roles are the decisions above, resolved for this
 * palette.
 */
export function colourAt(palette: Palette, path: string): string {
  switch (path) {
    case 'textOnA':
      return palette.textOnAccentA === 'ink' ? palette.outline : palette.sheet;
    case 'textOnA700':
      return textOn(palette, palette.accentA700);
    case 'inkOnSheet':
      return inkOnSheet(palette);
    case 'mutedOnSheet':
      return mutedOnSheet(palette);
    case 'sidebarFill':
      return palette.sidebarStyle === 'dark'
        ? palette.isDark
          ? palette.outline
          : palette.ink900
        : palette.paper200;
    /*
      A dark sidebar wants the palette's *lightest* ink on it, and which role
      that is flips with the palette. In a light palette `paper50` is the
      near-white page and `ink300` the muted grey; in the dark one `paper50` IS
      the near-black page, so putting it on a near-black sidebar would be
      invisible — there the light end of the ramp is `ink900`.
    */
    case 'sidebarText':
      if (palette.sidebarStyle !== 'dark') return palette.ink900;
      return palette.isDark ? palette.ink900 : palette.paper50;
    case 'sidebarMuted':
      if (palette.sidebarStyle !== 'dark') return palette.ink500;
      return palette.isDark ? palette.ink500 : palette.ink300;
    case 'sidebarActiveFill':
      if (palette.sidebarStyle !== 'dark') return palette.sheet;
      return palette.isDark ? palette.ink900 : palette.paper50;
    case 'sidebarActiveText':
      return palette.isDark ? palette.outline : palette.ink900;
    default:
      return (palette as unknown as Record<string, string>)[path];
  }
}
