import { id } from './defaults';
import type { Poem } from './types';

/**
 * Bringing a manuscript in.
 *
 * The whole job is to not destroy the poems on the way through. Line breaks,
 * blank lines and leading indentation all carry meaning in verse, so nothing
 * here trims interior whitespace, collapses runs of spaces or re-wraps a line.
 * The only text that is discarded is trailing whitespace at the very ends of a
 * poem, and blank lines used as separators.
 */

export type SplitMode = 'delimiter' | 'blankLines' | 'single';

export type ImportOptions = {
  mode: SplitMode;
  /** Line that separates poems in `delimiter` mode, e.g. "---" or "***". */
  delimiter: string;
  /** How many consecutive blank lines separate poems in `blankLines` mode. */
  blankLineCount: number;
  /** Treat each poem's first line as its title. */
  firstLineIsTitle: boolean;
};

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  mode: 'delimiter',
  delimiter: '---',
  blankLineCount: 3,
  firstLineIsTitle: true,
};

export type ParsedPoem = { title: string; body: string };

function normalise(text: string): string {
  // Normalise line endings and strip a BOM; nothing else about the text moves.
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(start, end);
}

function splitChunks(text: string, options: ImportOptions): string[][] {
  const lines = normalise(text).split('\n');

  if (options.mode === 'single') return [lines];

  if (options.mode === 'delimiter') {
    const needle = options.delimiter.trim();
    const chunks: string[][] = [];
    let current: string[] = [];
    for (const line of lines) {
      if (needle && line.trim() === needle) {
        chunks.push(current);
        current = [];
      } else {
        current.push(line);
      }
    }
    chunks.push(current);
    return chunks;
  }

  // blankLines: a run of at least N blank lines starts a new poem.
  const threshold = Math.max(2, options.blankLineCount);
  const chunks: string[][] = [];
  let current: string[] = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line.trim() === '') {
      blankRun += 1;
      current.push(line);
      continue;
    }
    if (blankRun >= threshold && trimBlankEdges(current).length) {
      chunks.push(current);
      current = [];
    }
    blankRun = 0;
    current.push(line);
  }
  chunks.push(current);
  return chunks;
}

/** A markdown heading, if the chunk opens with one. */
function markdownHeading(line: string): string | null {
  const match = /^#{1,6}\s+(.*\S)\s*$/.exec(line);
  return match ? match[1] : null;
}

export function splitIntoPoems(text: string, options: ImportOptions): ParsedPoem[] {
  return splitChunks(text, options)
    .map((chunk) => trimBlankEdges(chunk))
    .filter((chunk) => chunk.length > 0)
    .map((chunk, index) => {
      const heading = markdownHeading(chunk[0]);
      if (heading) {
        return { title: heading, body: trimBlankEdges(chunk.slice(1)).join('\n') };
      }
      if (options.firstLineIsTitle && chunk.length > 1) {
        return { title: chunk[0].trim(), body: trimBlankEdges(chunk.slice(1)).join('\n') };
      }
      return { title: `Untitled ${index + 1}`, body: chunk.join('\n') };
    })
    .filter((poem) => poem.body.trim().length > 0 || poem.title.length > 0);
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Turns mammoth's HTML into the plain verse text the rest of the importer
 * expects: one line per line of verse, one blank line per stanza break.
 *
 * Neither of mammoth's outputs can do this alone, and both fail silently:
 *
 * - `extractRawText` joins paragraphs with a blank line, so every line of verse
 *   ends up looking like its own stanza, and it drops <w:br/> entirely — the
 *   soft line break a poet gets from Shift+Enter, which is how most verse in
 *   Word is actually broken. Two lines come back welded into one.
 * - `convertToHtml` keeps <br> but discards empty paragraphs, which is where
 *   the stanza breaks were.
 *
 * Asking for HTML *and* empty paragraphs keeps both signals, and this collapses
 * them back to text. Leading spaces survive because they are inside the
 * paragraph's text; a Word heading becomes a markdown heading, so a manuscript
 * whose titles are styled as headings gets its titles recognised for free.
 */
export function docxHtmlToVerse(html: string): string {
  const blocks: string[] = [];
  const blockPattern = /<(p|h[1-6]|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;

  for (const match of html.matchAll(blockPattern)) {
    const tag = match[1].toLowerCase();
    const inner = match[2]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    const text = decodeEntities(inner);

    if (!text.trim()) {
      blocks.push('');
      continue;
    }
    const heading = /^h[1-6]$/.test(tag) ? `${'#'.repeat(Number(tag[1]))} ` : '';
    blocks.push(heading + text.replace(/[ \t]+$/gm, ''));
  }

  return blocks.join('\n');
}

/**
 * Reads a dropped file to plain text. .docx goes through mammoth, which is
 * loaded on demand so its ~200KB never lands in the initial bundle.
 */
export async function readFileAsText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth/mammoth.browser');
    const buffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml(
      { arrayBuffer: buffer },
      // Empty paragraphs are the stanza breaks. Mammoth throws them away by
      // default, which is fine for prose and ruinous for verse.
      { ignoreEmptyParagraphs: false },
    );
    return docxHtmlToVerse(result.value);
  }
  if (name.endsWith('.doc')) {
    throw new Error(
      'Legacy .doc files are not supported. Save the file as .docx, or paste the text in.',
    );
  }
  return file.text();
}

export function toPoems(parsed: ParsedPoem[], startOrder: number, sectionId: string | null): Poem[] {
  return parsed.map((p, i) => ({
    id: id('poem'),
    title: p.title,
    body: p.body,
    epigraph: '',
    dedication: '',
    sectionId,
    order: startOrder + i,
  }));
}
