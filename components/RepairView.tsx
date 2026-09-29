'use client';

import { useMemo } from 'react';
import {
  LONG_LINE_CHARS,
  applyAllSuggestions,
  isLongLine,
  joinWithNext,
  repairStats,
  splitLine,
  splitPoints,
  suggestSplits,
  toggleStanzaBreakAfter,
} from '@/lib/repair';
import { Button, Notice, cx } from './ui';

/**
 * Repairing line breaks.
 *
 * Verse that has been pasted around loses its line breaks, and no amount of
 * cleverness can put them back reliably — only the poet knows where the lines
 * go. So this does not rewrite anything on its own: it shows every place a line
 * could break, marks the ones that look wrong, and makes accepting one a single
 * click. The poem is never touched until something is clicked.
 */
export function RepairView({
  body,
  onChange,
  onBulkChange,
}: {
  body: string;
  onChange: (body: string) => void;
  /** Rewrites the whole poem, so it gets an undo step of its own. */
  onBulkChange?: (body: string) => void;
}) {
  const rows = useMemo(() => body.replace(/\r\n?/g, '\n').split('\n'), [body]);
  const stats = useMemo(() => repairStats(body), [body]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-ink-200 bg-ink-50 px-3 py-2">
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-500">
          <span>
            <dt className="inline">lines</dt>{' '}
            <dd className="inline tabular-nums text-ink-900">{stats.lines}</dd>
          </span>
          <span>
            <dt className="inline">stanzas</dt>{' '}
            <dd className="inline tabular-nums text-ink-900">{stats.stanzas}</dd>
          </span>
          <span>
            <dt className="inline">over {LONG_LINE_CHARS} chars</dt>{' '}
            <dd
              className={cx(
                'inline tabular-nums',
                stats.longLines ? 'text-amber-700' : 'text-ink-900',
              )}
            >
              {stats.longLines}
            </dd>
          </span>
          <span>
            <dt className="inline">longest</dt>{' '}
            <dd className="inline tabular-nums text-ink-900">{stats.longestLine}</dd>
          </span>
        </dl>
        {stats.suggestions > 0 && (
          <Button
            className="ml-auto"
            onClick={() => (onBulkChange ?? onChange)(applyAllSuggestions(body))}
            title="Split every line at the places marked in amber"
          >
            Accept {stats.suggestions} suggestion{stats.suggestions === 1 ? '' : 's'}
          </Button>
        )}
      </div>

      {/* A run-on is not the same thing as a long line — two short lines joined
          come to about fifty characters — so both have to be clear before this
          poem can be called done. */}
      {stats.longLines === 0 && stats.suggestions === 0 && (
        <Notice level="ok">
          No long lines and nothing that looks like two lines typed as one.
        </Notice>
      )}
      {stats.longLines === 0 && stats.suggestions > 0 && (
        <Notice level="warning">
          No line is longer than the measure, but {stats.suggestions} place
          {stats.suggestions === 1 ? '' : 's'} look
          {stats.suggestions === 1 ? 's' : ''} like two lines typed as one. They are marked in
          amber below.
        </Notice>
      )}

      <ol className="space-y-0.5">
        {rows.map((line, index) =>
          line.trim() === '' ? (
            <StanzaBreakRow
              key={index}
              onRemove={() => onChange(toggleStanzaBreakAfter(body, index - 1))}
            />
          ) : (
            <LineRow
              key={index}
              line={line}
              number={rows.slice(0, index + 1).filter((l) => l.trim()).length}
              canJoin={index < rows.length - 1}
              onSplit={(offset) => onChange(splitLine(body, index, offset))}
              onJoin={() => onChange(joinWithNext(body, index))}
              onStanzaBreak={() => onChange(toggleStanzaBreakAfter(body, index))}
            />
          ),
        )}
      </ol>

      <p className="text-[11px] text-ink-500">
        Click between any two words to break the line there. Amber gaps are where a capital
        follows a comma or a full stop — the usual sign of two lines typed as one.
      </p>
    </div>
  );
}

function StanzaBreakRow({ onRemove }: { onRemove: () => void }) {
  return (
    <li className="group flex items-center gap-2 py-1 pl-11">
      <span className="h-px flex-1 bg-ink-200" />
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-400">
        stanza break
      </span>
      <span className="h-px flex-1 bg-ink-200" />
      <button
        type="button"
        onClick={onRemove}
        title="Remove this stanza break"
        className="shrink-0 rounded px-1 text-ink-400 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
      >
        ✕
      </button>
    </li>
  );
}

function LineRow({
  line,
  number,
  canJoin,
  onSplit,
  onJoin,
  onStanzaBreak,
}: {
  line: string;
  number: number;
  canJoin: boolean;
  onSplit: (offset: number) => void;
  onJoin: () => void;
  onStanzaBreak: () => void;
}) {
  const long = isLongLine(line);
  const suggestions = useMemo(() => suggestSplits(line), [line]);
  const suggested = useMemo(
    () => new Map(suggestions.map((s) => [s.offset, s])),
    [suggestions],
  );
  const points = useMemo(() => splitPoints(line), [line]);

  // The line is rendered as its text with a clickable gap at every word
  // boundary, so any break the poet wants is one click away, not just the
  // suggested ones.
  const chunks: Array<{ text: string; gapAt: number | null }> = [];
  let cursor = 0;
  for (const point of points) {
    chunks.push({ text: line.slice(cursor, point), gapAt: point });
    cursor = point;
  }
  chunks.push({ text: line.slice(cursor), gapAt: null });

  return (
    <li className="group flex items-baseline gap-2">
      <span
        className={cx(
          'w-7 shrink-0 select-none text-right text-[11px] tabular-nums',
          long ? 'text-amber-700/80' : 'text-ink-400',
        )}
        title={long ? `${line.length} characters — longer than the measure` : undefined}
      >
        {number}
      </span>

      <p
        className={cx(
          'min-w-0 flex-1 whitespace-pre-wrap rounded px-1.5 py-0.5 font-mono text-[12.5px] leading-6',
          long ? 'bg-amber-500/[0.07]' : '',
        )}
      >
        {chunks.map((chunk, i) => {
          const hint = chunk.gapAt === null ? undefined : suggested.get(chunk.gapAt);
          return (
            <span key={i}>
              {chunk.text.replace(/\s+$/, '')}
              {chunk.gapAt !== null && (
                <button
                  type="button"
                  onClick={() => onSplit(chunk.gapAt!)}
                  title={hint ? `Split here — ${hint.reason}` : 'Split the line here'}
                  className={cx(
                    'mx-px inline-block w-2 rounded-sm align-baseline transition-colors',
                    hint?.confidence === 'high'
                      ? 'bg-amber-400/45 hover:bg-amber-300'
                      : hint
                        ? 'bg-amber-400/20 hover:bg-amber-300'
                        : 'hover:bg-sky-400/70',
                  )}
                >
                  <span className="sr-only">Split line here</span>
                  {' '}
                </button>
              )}
            </span>
          );
        })}
      </p>

      <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={onStanzaBreak}
          title="Add a stanza break after this line"
          className="rounded px-1.5 py-0.5 text-[11px] text-ink-500 hover:bg-ink-100 hover:text-ink-900"
        >
          ¶
        </button>
        {canJoin && (
          <button
            type="button"
            onClick={onJoin}
            title="Join this line to the next"
            className="rounded px-1.5 py-0.5 text-[11px] text-ink-500 hover:bg-ink-100 hover:text-ink-900"
          >
            ⇥
          </button>
        )}
      </span>
    </li>
  );
}
