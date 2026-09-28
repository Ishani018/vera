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
  return stripInlineMarkup(stanzas[0]?.lines[0]?.trim() ?? '');
}

/**
 * Inline emphasis, as a lightweight markup inside the plain-text body.
 *
 * The body has to stay a plain string: it is what the editor edits, what the
 * importer writes, what the repair view splits and joins, and what round-trips
 * through the project JSON. Storing runs of styled text instead would infect
 * all of that. So emphasis is written the way people already write it in a
 * plain-text field — *italic* and **bold** — and an asterisk that is meant
 * literally is escaped as \*.
 */
const ESCAPED_STAR = '\u0000';

export function renderInlineMarkup(escaped: string): string {
  const protectedText = escaped.replace(/\\\*/g, ESCAPED_STAR);
  const bolded = protectedText.replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '<strong>$1</strong>');
  const emphasised = bolded.replace(/\*(?=\S)([^*\n]*?\S)\*/g, '<em>$1</em>');
  return emphasised.split(ESCAPED_STAR).join('*');
}

/** The same text with its markup removed, for counting and for running heads. */
export function stripInlineMarkup(value: string): string {
  return value
    .replace(/\\\*/g, ESCAPED_STAR)
    .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '$1')
    .replace(/\*(?=\S)([^*\n]*?\S)\*/g, '$1')
    .split(ESCAPED_STAR)
    .join('*');
}

/**
 * JSON safe to put inside a `<script>` tag.
 *
 * `JSON.stringify` knows nothing about HTML, so a book called
 * `</script><script>…` closes the tag it is sitting in and whatever follows is
 * parsed as markup. The parser looks for the literal characters, so escaping
 * them inside the string leaves the value identical once JSON is read back.
 * U+2028 and U+2029 go too: they are legal in JSON and are line terminators in
 * a script, which would break it in half.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
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
  if (!match) return renderInlineMarkup(escapeHtml(line));
  const indent = match[0].replace(/\t/g, '    ').replace(/ /g, NBSP);
  return indent + renderInlineMarkup(escapeHtml(line.slice(match[0].length)));
}

/** Renders arbitrary user prose (front matter, blurbs) preserving line breaks. */
export function escapeBlock(value: string): string {
  return renderInlineMarkup(escapeHtml(value)).replace(/\n/g, '<br>');
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
