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

/**
 * Reads a dropped file to plain text. .docx goes through mammoth, which is
 * loaded on demand so its ~200KB never lands in the initial bundle.
 */
export async function readFileAsText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth/mammoth.browser');
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
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
