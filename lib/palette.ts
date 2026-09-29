/**
 * The colours offered before anyone reaches for a picker.
 *
 * Twenty-four, arranged in four rows of six: neutrals, then greens and blues,
 * then the reds and pinks, then the warm end. Chosen to sit with the paper and
 * ink the rest of the app is made of rather than against it, and to include
 * enough dark ones that a cover can be set in something other than black.
 *
 * Every one of them is a plain hex string, which is what the cover model
 * stores, so nothing here needs converting on the way in or out.
 */
export const PALETTE: Array<{ hex: string; name: string }> = [
  { hex: '#FFFFFF', name: 'Paper' },
  { hex: '#F4EFE4', name: 'Cream' },
  { hex: '#D2CCC2', name: 'Chalk' },
  { hex: '#B5ADA1', name: 'Mist' },
  { hex: '#7A7266', name: 'Stone' },
  { hex: '#1B1815', name: 'Ink' },

  { hex: '#0B6A62', name: 'Teal' },
  { hex: '#2E8C83', name: 'Sea' },
  { hex: '#7BA391', name: 'Sage' },
  { hex: '#1F4D3A', name: 'Forest' },
  { hex: '#8A9A5B', name: 'Olive' },
  { hex: '#4C6B3F', name: 'Moss' },

  { hex: '#1E2F53', name: 'Navy' },
  { hex: '#2C5AA0', name: 'Blue' },
  { hex: '#7FA8D9', name: 'Sky' },
  { hex: '#6E2A5B', name: 'Plum' },
  { hex: '#A23E63', name: 'Berry' },
  { hex: '#E2A0B4', name: 'Rose' },

  { hex: '#B4331F', name: 'Red' },
  { hex: '#C4693F', name: 'Terracotta' },
  { hex: '#8A6522', name: 'Bronze' },
  { hex: '#D89B2A', name: 'Amber' },
  { hex: '#F0D48A', name: 'Butter' },
  { hex: '#6B4A2F', name: 'Brown' },
];

/** Where the recently used colours are kept. A new key; no existing one moved. */
export const RECENT_COLOURS_KEY = 'versecraft:recentColours';

const LIMIT = 8;

/** True for `#rgb` and `#rrggbb`, which is everything the model ever holds. */
export function isHex(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/** Six digits, upper case, so the same colour is one entry and not three. */
export function normaliseHex(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (!isHex(trimmed)) return trimmed;
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return trimmed;
}

/**
 * The last few colours used, newest first.
 *
 * Wrapped because storage is not always there: a private window, cleared site
 * data, or a browser that simply says no. A colour list nobody can read is not
 * a reason for the editor to fall over.
 */
export function readRecentColours(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_COLOURS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string' && isHex(value));
  } catch {
    return [];
  }
}

/** Puts one at the front, keeps the list short, and never throws. */
export function rememberColour(hex: string): string[] {
  const colour = normaliseHex(hex);
  if (!isHex(colour)) return readRecentColours();
  const next = [colour, ...readRecentColours().filter((old) => old !== colour)].slice(0, LIMIT);
  try {
    window.localStorage.setItem(RECENT_COLOURS_KEY, JSON.stringify(next));
  } catch {
    /* Remembering is a convenience; not remembering is not an error. */
  }
  return next;
}
