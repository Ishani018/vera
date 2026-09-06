/**
 * Poem text handling.
 *
 * The one rule that matters: a line break in the source is a line break in the
 * book. Nothing here reflows, re-wraps, joins or trims interior whitespace.
 * A line that is too long for the measure is wrapped by the browser and given a
 * hanging indent by CSS — it never becomes two lines of verse.
 */

export type Stanza = { lines: string[] };

const NBSP = ' ';

/**
 * Splits a poem body into stanzas. One or more blank lines separates stanzas;
 * a run of several blank lines is still a single stanza break, because stanza
 * spacing is a typographic setting, not something the typist controls.
 */
export function parseStanzas(body: string): Stanza[] {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const stanzas: Stanza[] = [];
  let current: string[] = [];

  for (const raw of lines) {
    if (raw.trim() === '') {
      if (current.length) {
        stanzas.push({ lines: current });
        current = [];
      }
      continue;
    }
    current.push(raw);
  }
  if (current.length) stanzas.push({ lines: current });
  return stanzas;
}

/** Total lines of verse, ignoring blank separator lines. */
export function countLines(body: string): number {
  return parseStanzas(body).reduce((n, s) => n + s.lines.length, 0);
}

/** First line of verse, used by the index of first lines. */
export function firstLine(body: string): string {
  const stanzas = parseStanzas(body);
  return stanzas[0]?.lines[0]?.trim() ?? '';
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes a line and protects its leading indentation. `white-space: pre-wrap`
 * already preserves spaces, but a leading space is a soft wrap opportunity, so
 * a wrapped turnover could otherwise start half an indent out of position.
 */
export function escapeVerseLine(line: string): string {
  const match = /^[ \t]+/.exec(line);
  if (!match) return escapeHtml(line);
  const indent = match[0].replace(/\t/g, '    ').replace(/ /g, NBSP);
  return indent + escapeHtml(line.slice(match[0].length));
}

/** Renders arbitrary user prose (front matter, blurbs) preserving line breaks. */
export function escapeBlock(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

/** Escapes a string for use inside a CSS `content: "..."` declaration. */
export function cssString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
}

/** Sort key for the index of first lines: ignore leading quotes and articles. */
export function indexSortKey(line: string): string {
  return line
    .toLocaleLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/^(a|an|the)\s+/u, '');
}

/**
 * Font family names and colours reach the stylesheet as raw CSS. They come from
 * the font API or from an imported project file, so they are not necessarily
 * well behaved. These keep a stray quote or brace from ending the declaration
 * it sits in and starting something else.
 */
export function cssFamily(family: string): string {
  // No apostrophes: the family is emitted inside single quotes, so one would
  // close the string and let whatever follows it become CSS.
  const clean = family
    .replace(/[^\w \-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || 'serif';
}

export function cssColor(color: string): string {
  const clean = color.trim();
  return /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([\d.,%\s/]+\))$/i.test(clean)
    ? clean
    : 'currentColor';
}

/** A bare CSS length in points or inches, with anything else rejected. */
export function cssNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}
