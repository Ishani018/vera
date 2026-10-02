/**
 * Every colour, shadow, radius, size, duration and curve in the app, as data.
 *
 * One file rather than a hundred literals spread through components, for two
 * reasons. A value written in twelve places is twelve places to miss when it
 * changes — and the contrast sweep can only check what it can read, so a colour
 * typed into a component is a colour nothing is checking.
 *
 * **Chrome only.** Colours that are part of somebody's work — the default ink
 * of a sticker, the paper a sheet is printed on, the red of a cut line, the
 * text colour a new cover starts with — are not here and must never be. They go
 * into exported files, so a theme that changed them would change what people
 * have already made. They stay written where they are used, next to the thing
 * they are a default for.
 *
 * `scripts/make-tokens.mjs` turns this into `app/tokens.css`, and a test fails
 * if the two have drifted apart.
 */

/* --------------------------------------------------------------- the ramps */

/** A supporting colour: a tint to sit on, a mid tone to fill, a deep one to read. */
export type Ramp = { tint: string; mid: string; deep: string };

export type Neutrals = {
  paper: string;
  ink50: string;
  ink100: string;
  ink200: string;
  ink300: string;
  ink400: string;
  ink500: string;
  ink600: string;
  ink700: string;
  ink900: string;
};

export type Theme = {
  id: string;
  name: string;
  /** What it feels like, for the switcher. */
  note: string;
  neutrals: Neutrals;
  /** The brand teal. The one colour that is the same idea in all three. */
  accent: { tint: string; soft: string; mid: string; deep: string };
  /** Each supporting colour has one job, and the name says which. */
  roles: {
    /** Create, and the one primary action on a screen. */
    coral: Ramp;
    /** Highlights and badges. */
    sun: Ramp;
    /** Stickers. */
    lilac: Ramp;
    /** Something worked. */
    sage: Ramp;
    /**
     * Social sizes.
     *
     * Named denim rather than sky because `sky` is one of Tailwind's own
     * colours: a token called `--color-sky-500` replaces it everywhere, and the
     * first build of this quietly repainted the designer's spine guide, which
     * the screen golden caught as a one-pixel line down the middle of the
     * board. A role name has to be a word Tailwind has not already used.
     */
    denim: Ramp;
    /** Printed sizes. */
    clay: Ramp;
  };
  /** The colour shadows are mixed from, so depth belongs to the theme. */
  shade: string;
  /** The grey behind a board. Deliberately not a cousin of the paper. */
  ground: { pane: string; rail: string; deep: string };
};

export const SUNRISE: Theme = {
  id: 'sunrise',
  name: 'Sunrise',
  note: 'Warm — cream, coral and yellow',
  neutrals: {
    paper: '#FFFFFF',
    ink50: '#FCF9F4',
    ink100: '#F5EFE5',
    ink200: '#E7DECE',
    ink300: '#D4C8B3',
    ink400: '#AC9D84',
    ink500: '#6E6354',
    ink600: '#584E42',
    ink700: '#443C33',
    ink900: '#1D1813',
  },
  accent: { tint: '#E3F0EE', soft: '#9AC7C0', mid: '#0B6A62', deep: '#08544E' },
  roles: {
    coral: { tint: '#FDE7DF', mid: '#C9452C', deep: '#9A3220' },
    sun: { tint: '#FDF0CC', mid: '#F0B429', deep: '#7D5806' },
    lilac: { tint: '#EFE9FB', mid: '#6B4BB8', deep: '#513690' },
    sage: { tint: '#E3F1E4', mid: '#3A7F4C', deep: '#2A5F39' },
    denim: { tint: '#E4EDF7', mid: '#36628E', deep: '#274968' },
    clay: { tint: '#F8E7E4', mid: '#9A4F47', deep: '#753A34' },
  },
  shade: '29, 24, 19',
  ground: { pane: '#6F6F6F', rail: '#5F5F5F', deep: '#8E8E8E' },
};

export const LAGOON: Theme = {
  id: 'lagoon',
  name: 'Lagoon',
  note: 'Cool — sea glass, teal and lavender',
  neutrals: {
    paper: '#FFFFFF',
    ink50: '#F7FAFA',
    ink100: '#EAF1F0',
    ink200: '#D5E2E0',
    ink300: '#B9CBC8',
    ink400: '#8EA5A2',
    ink500: '#5F6E6C',
    ink600: '#4B5856',
    ink700: '#3A4544',
    ink900: '#15201F',
  },
  accent: { tint: '#DCEEEB', soft: '#8FC2BB', mid: '#0B6A62', deep: '#08544E' },
  roles: {
    coral: { tint: '#FBE6E0', mid: '#BF4A34', deep: '#933626' },
    sun: { tint: '#FAEFD2', mid: '#E8AE33', deep: '#75540A' },
    lilac: { tint: '#E9E8FA', mid: '#5B4FB5', deep: '#443A8D' },
    sage: { tint: '#DFF0E6', mid: '#2F7D55', deep: '#225E3F' },
    denim: { tint: '#DEEBF6', mid: '#2E6190', deep: '#21486B' },
    clay: { tint: '#F4E6E5', mid: '#8F4F4B', deep: '#6D3B38' },
  },
  shade: '21, 32, 31',
  ground: { pane: '#6B7271', rail: '#5C6262', deep: '#8A9090' },
};

export const CANDY: Theme = {
  id: 'candy',
  name: 'Candy',
  note: 'Playful — lilac, pink and mint',
  neutrals: {
    paper: '#FFFFFF',
    ink50: '#FBF8FD',
    ink100: '#F2ECF8',
    ink200: '#E2D9EE',
    ink300: '#CBBEDD',
    ink400: '#A294BA',
    ink500: '#675C79',
    ink600: '#534962',
    ink700: '#40384C',
    ink900: '#1B1522',
  },
  accent: { tint: '#E0EFEC', soft: '#93C5BE', mid: '#0B6A62', deep: '#08544E' },
  roles: {
    coral: { tint: '#FCE3EC', mid: '#C03568', deep: '#95254E' },
    sun: { tint: '#FDEFC9', mid: '#F4B52B', deep: '#7A5606' },
    lilac: { tint: '#EDE4FB', mid: '#7342C4', deep: '#57309A' },
    sage: { tint: '#DDF3E9', mid: '#1F7E5C', deep: '#166046' },
    denim: { tint: '#E2EAFA', mid: '#3F5CB0', deep: '#2E4486' },
    clay: { tint: '#F9E4EC', mid: '#A2456B', deep: '#7C3251' },
  },
  shade: '27, 21, 34',
  ground: { pane: '#716E78', rail: '#615F68', deep: '#8F8C96' },
};

export const THEMES: Theme[] = [SUNRISE, LAGOON, CANDY];
export const DEFAULT_THEME = SUNRISE.id;

export const themeById = (id: string | null | undefined): Theme =>
  THEMES.find((one) => one.id === id) ?? SUNRISE;

/**
 * Where the chosen theme is remembered.
 *
 * A new key of its own, not a change to one that already holds somebody's work:
 * nothing in `lib/db.ts` is touched, and losing this one loses a preference
 * rather than a book.
 */
export const THEME_KEY = 'isnaevy:theme';

/** The theme to use, given the address and what was remembered. */
export function chooseTheme(search: string, stored: string | null): string {
  const asked = new URLSearchParams(search || '').get('theme');
  if (asked && THEMES.some((one) => one.id === asked)) return asked;
  if (stored && THEMES.some((one) => one.id === stored)) return stored;
  return DEFAULT_THEME;
}

/* ------------------------------------------------------------- the scales */

/** Corners. One ramp, used everywhere, so nothing is a one-off radius. */
export const RADII: Record<string, string> = {
  xs: '6px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '22px',
  pill: '999px',
};

/**
 * Three steps of depth: resting on the page, raised off it, floating over it.
 *
 * Two shadows each — a tight one for the contact edge and a wide soft one for
 * the cast — because a single blur reads as a glow rather than as a height.
 * Mixed from the theme's own ink, so the shade belongs to the theme.
 */
export const SHADOWS: Record<string, string> = {
  rest: '0 1px 2px rgb(var(--shade) / 0.06), 0 1px 1px rgb(var(--shade) / 0.04)',
  raised: '0 6px 16px -4px rgb(var(--shade) / 0.14), 0 2px 6px -2px rgb(var(--shade) / 0.08)',
  float: '0 18px 40px -12px rgb(var(--shade) / 0.24), 0 6px 14px -6px rgb(var(--shade) / 0.12)',
  /* A halo, for the one button on a screen that is the thing to press. */
  glow: '0 8px 24px -8px rgb(var(--glow) / 0.55)',
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

/* ------------------------------------------------------- what to check */

/**
 * Every pair of colours a reader actually has to read, by name.
 *
 * The sweep runs this list against all three themes. A pair that is not here
 * is a pair nobody is checking, so a new coloured surface means a new line
 * here as well.
 */
export const MUST_READ: { text: string; on: string; what: string; large?: boolean }[] = [
  { text: 'ink900', on: 'ink100', what: 'body text on the page' },
  { text: 'ink900', on: 'paper', what: 'body text on a card' },
  { text: 'ink700', on: 'paper', what: 'a label on a card' },
  { text: 'ink700', on: 'ink100', what: 'a label on the page' },
  { text: 'ink700', on: 'ink50', what: 'a label on a panel' },
  { text: 'ink500', on: 'paper', what: 'muted text on a card' },
  { text: 'ink500', on: 'ink100', what: 'muted text on the page' },
  { text: 'ink500', on: 'ink50', what: 'muted text on a panel' },
  { text: 'accent.mid', on: 'paper', what: 'a link on a card' },
  { text: 'accent.mid', on: 'ink100', what: 'a link on the page' },
  { text: 'accent.mid', on: 'ink50', what: 'a link on a panel' },
  { text: 'accent.deep', on: 'accent.tint', what: 'a chosen tab' },
  { text: 'paper', on: 'accent.mid', what: 'a teal button' },
  { text: 'paper', on: 'accent.deep', what: 'a teal button, pressed' },
  { text: 'paper', on: 'roles.coral.mid', what: 'the Create button' },
  { text: 'paper', on: 'roles.coral.deep', what: 'the Create button, pressed' },
  { text: 'roles.coral.deep', on: 'roles.coral.tint', what: 'a coral badge' },
  { text: 'roles.sun.deep', on: 'roles.sun.tint', what: 'a highlight badge' },
  { text: 'roles.lilac.deep', on: 'roles.lilac.tint', what: 'a sticker badge' },
  { text: 'roles.sage.deep', on: 'roles.sage.tint', what: 'a success note' },
  { text: 'roles.denim.deep', on: 'roles.denim.tint', what: 'a social badge' },
  { text: 'roles.clay.deep', on: 'roles.clay.tint', what: 'a print badge' },
  { text: 'ink700', on: 'roles.coral.tint', what: 'a label on a coral tile' },
  { text: 'ink700', on: 'roles.sun.tint', what: 'a label on a yellow tile' },
  { text: 'ink700', on: 'roles.lilac.tint', what: 'a label on a lilac tile' },
  { text: 'ink700', on: 'roles.sage.tint', what: 'a label on a green tile' },
  { text: 'ink700', on: 'roles.denim.tint', what: 'a label on a blue tile' },
  { text: 'ink700', on: 'roles.clay.tint', what: 'a label on a clay tile' },
  { text: 'paper', on: 'roles.sage.mid', what: 'white on a success fill' },
  { text: 'paper', on: 'roles.lilac.mid', what: 'white on a sticker fill' },
  { text: 'paper', on: 'roles.denim.mid', what: 'white on a social fill' },
  { text: 'paper', on: 'roles.clay.mid', what: 'white on a print fill' },
  /*
    Yellow carries dark text, not white.
    A yellow bright enough to read as sunny cannot reach 4.5:1 against white —
    #A9780A does, and it is brown. Its job is a highlight, and a highlight is
    something you read *on*, so the pair that matters is ink on yellow.
  */
  { text: 'ink900', on: 'roles.sun.mid', what: 'ink on a yellow highlight' },
  { text: 'ink700', on: 'roles.sun.mid', what: 'a label on a yellow highlight' },
];

/** Reads "ink500" or "roles.coral.mid" out of a theme. */
export function colourAt(theme: Theme, path: string): string {
  if (path.startsWith('roles.')) {
    const [, role, step] = path.split('.');
    return (theme.roles as unknown as Record<string, Ramp>)[role][step as keyof Ramp];
  }
  if (path.startsWith('accent.')) {
    const [, step] = path.split('.');
    return (theme.accent as unknown as Record<string, string>)[step];
  }
  return (theme.neutrals as unknown as Record<string, string>)[path];
}
