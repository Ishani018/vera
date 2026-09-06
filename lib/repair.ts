/**
 * Line-break repair.
 *
 * Verse that has been through a copy-paste — out of a phone note, a web page, a
 * PDF — often arrives with its line breaks in the wrong places: two lines of
 * verse welded into one paragraph, or a break landing mid-sentence because the
 * text was hard-wrapped at some other width and then reflowed. Nothing can
 * detect this reliably, because only the poet knows where the lines go. What
 * can be done is to point at the places that look wrong and make fixing them
 * one click instead of a retype.
 *
 * Every operation here takes a body and returns a new body. The body stays a
 * plain string with meaningful newlines, which is what the renderer and the
 * importer already work in.
 */

/** A line longer than this is worth looking at; roughly a printed measure. */
export const LONG_LINE_CHARS = 60;

/**
 * Below this, a line is too short to be two lines of verse welded together, and
 * a mid-line capital is far more likely to be a name or a quotation.
 *
 * Deliberately well under LONG_LINE_CHARS. A run-on is not the same thing as a
 * long line: two short lines joined come to about fifty characters, which sits
 * inside any sensible measure and would never be flagged as long, yet it is
 * exactly the case worth catching.
 */
export const MIN_SUGGEST_CHARS = 24;

export type SplitSuggestion = {
  /** Character offset in the line at which the second line would start. */
  offset: number;
  confidence: 'high' | 'low';
  reason: string;
};

const lines = (body: string) => body.replace(/\r\n?/g, '\n').split('\n');

export function isLongLine(line: string, threshold = LONG_LINE_CHARS): boolean {
  return line.trim().length > threshold;
}

/**
 * Where a line probably wants to break.
 *
 * A capital letter after a comma or a full stop, mid-line, is the signature of
 * two lines of verse in one paragraph — verse capitalises line openings far
 * more often than prose does mid-sentence. A sentence that simply ends
 * mid-line is a weaker signal but still worth offering.
 */
export function suggestSplits(line: string, minLength = MIN_SUGGEST_CHARS): SplitSuggestion[] {
  if (line.trim().length <= minLength) return [];

  const found = new Map<number, SplitSuggestion>();

  const add = (offset: number, confidence: SplitSuggestion['confidence'], reason: string) => {
    const trimmedStart = line.slice(0, offset).trim().length;
    const trimmedEnd = line.slice(offset).trim().length;
    // A split that leaves almost nothing on one side is not a line break.
    if (trimmedStart < 3 || trimmedEnd < 3) return;
    const existing = found.get(offset);
    if (!existing || (existing.confidence === 'low' && confidence === 'high')) {
      found.set(offset, { offset, confidence, reason });
    }
  };

  for (const match of line.matchAll(/[,;:]\s+(?=["'(‘“]?[A-Z])/g)) {
    add(match.index + match[0].length, 'high', 'capital after a comma');
  }
  for (const match of line.matchAll(/[.?!]\s+(?=["'(‘“]?[A-Z])/g)) {
    add(match.index + match[0].length, 'high', 'capital after a full stop');
  }
  for (const match of line.matchAll(/[.?!]\s+(?=\S)/g)) {
    add(match.index + match[0].length, 'low', 'sentence ends mid-line');
  }

  return [...found.values()].sort((a, b) => a.offset - b.offset);
}

/** Every position between words where a split is possible, for manual clicks. */
export function splitPoints(line: string): number[] {
  const points: number[] = [];
  for (const match of line.matchAll(/\S\s+(?=\S)/g)) {
    points.push(match.index + match[0].length);
  }
  return points;
}

/** Splits one line in two at `offset`, dropping the whitespace between them. */
export function splitLine(body: string, lineIndex: number, offset: number): string {
  const all = lines(body);
  const line = all[lineIndex];
  if (line === undefined) return body;

  const head = line.slice(0, offset).replace(/\s+$/, '');
  const tail = line.slice(offset).replace(/^\s+/, '');
  if (!head || !tail) return body;

  all.splice(lineIndex, 1, head, tail);
  return all.join('\n');
}

/**
 * Joins a line to the one after it — the undo for a split, and the fix for a
 * break that landed mid-phrase. A blank line between them is a stanza break, so
 * that is removed instead, which is what "join" means at that point.
 */
export function joinWithNext(body: string, lineIndex: number): string {
  const all = lines(body);
  if (lineIndex < 0 || lineIndex >= all.length - 1) return body;

  if (all[lineIndex + 1].trim() === '') {
    all.splice(lineIndex + 1, 1);
    return all.join('\n');
  }

  const joined = `${all[lineIndex].replace(/\s+$/, '')} ${all[lineIndex + 1].replace(/^\s+/, '')}`;
  all.splice(lineIndex, 2, joined);
  return all.join('\n');
}

/** Adds a stanza break after a line, or removes the one already there. */
export function toggleStanzaBreakAfter(body: string, lineIndex: number): string {
  const all = lines(body);
  if (lineIndex < 0 || lineIndex >= all.length) return body;

  if (all[lineIndex + 1]?.trim() === '') {
    all.splice(lineIndex + 1, 1);
  } else {
    all.splice(lineIndex + 1, 0, '');
  }
  return all.join('\n');
}

/**
 * Applies every high-confidence suggestion in the poem, repeatedly, because
 * splitting a line can leave a second half that is still too long and still
 * has a suggestion in it.
 */
export function applyAllSuggestions(body: string, minLength = MIN_SUGGEST_CHARS): string {
  let current = body;
  // Bounded so a pathological line cannot spin: each pass makes a real split
  // or stops, and no poem needs more than this many rounds.
  for (let pass = 0; pass < 40; pass += 1) {
    const all = lines(current);
    let changed = false;
    for (let i = 0; i < all.length; i += 1) {
      const [first] = suggestSplits(all[i], minLength).filter((s) => s.confidence === 'high');
      if (!first) continue;
      const next = splitLine(current, i, first.offset);
      if (next !== current) {
        current = next;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return current;
}

export type RepairStats = {
  lines: number;
  stanzas: number;
  longLines: number;
  suggestions: number;
  longestLine: number;
};

export function repairStats(body: string, longThreshold = LONG_LINE_CHARS): RepairStats {
  const all = lines(body);
  const verse = all.filter((l) => l.trim() !== '');
  let stanzas = 0;
  let open = false;
  for (const line of all) {
    if (line.trim() === '') {
      open = false;
      continue;
    }
    if (!open) {
      stanzas += 1;
      open = true;
    }
  }
  return {
    lines: verse.length,
    stanzas,
    longLines: verse.filter((l) => isLongLine(l, longThreshold)).length,
    suggestions: verse.reduce(
      (n, l) => n + suggestSplits(l).filter((s) => s.confidence === 'high').length,
      0,
    ),
    longestLine: verse.reduce((m, l) => Math.max(m, l.length), 0),
  };
}
