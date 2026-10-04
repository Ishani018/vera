'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { readableSize, TRASH_DAYS } from '@/lib/deleted';
import { listTrash, purge, restore, type TrashEntry } from '@/lib/trash';
import { ThumbArt, useAssetUrls } from './ThumbArt';
import { Modal } from './Modal';
import { Chequerboard } from './stickers/Thumb';
import { Button, cx } from './ui';

/** How long a delete can be taken back. Long enough to notice, short enough to mean it. */
const UNDO_MS = 8000;

/**
 * What has been deleted, and the way back.
 *
 * Two changes worth explaining.
 *
 * **Every row shows the thing.** A list of names, kinds and byte counts is a
 * list about a filing system; the question somebody opening the trash is
 * actually asking is "is this the one I want back", and a picture answers it in
 * a glance where three lines of metadata do not. Books and designs are drawn
 * from their own contents; a sticker shows itself; an unfinished sticker shows
 * the picture it was being cut out of, because it has no cut-out yet and
 * showing nothing would be truthful and useless.
 *
 * **Deleting forever is undoable for eight seconds.** It used to need a
 * confirmation, which is the usual way to make an irreversible thing safe and
 * is also the way that trains people to press Yes without reading. Instead the
 * row goes immediately and the purge is held: press Undo and nothing happened,
 * leave it and it happens. It is a real hold, not a toast over a completed
 * delete — `purge` sweeps the picture bytes with it and no toast could bring
 * those back.
 *
 * If the dialog is closed while deletes are waiting they are carried out, and
 * if the tab is closed first they simply do not happen, which is the safe way
 * round.
 */
export function Trash({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [entries, setEntries] = useState<TrashEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /** Rows the person has deleted, held back until the undo window closes. */
  const [held, setHeld] = useState<TrashEntry[]>([]);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(() => {
    void listTrash().then(setEntries);
  }, []);
  useEffect(refresh, [refresh]);

  /** Carry out everything waiting, now. */
  const flush = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const doomed = held;
    if (!doomed.length) return;
    setHeld([]);
    for (const entry of doomed) await purge(entry);
    refresh();
    onChanged();
  }, [held, refresh, onChanged]);

  // Closing the dialog is a decision too: the holds are carried out rather
  // than quietly abandoned, so the trash says what it did.
  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const hold = (rows: TrashEntry[]) => {
    if (!rows.length) return;
    setHeld((was) => [...was, ...rows]);
    setEntries((was) => (was ?? []).filter((one) => !rows.some((row) => row.key === one.key)));
    setPicked(new Set());
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flushRef.current(), UNDO_MS);
  };

  // The timer fires later than the render that set it, so it needs the newest
  // `flush` rather than the one that existed when it was scheduled.
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const undo = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setHeld([]);
    refresh();
  };

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      refresh();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const shown = entries ?? [];
  const total = shown.reduce((sum, entry) => sum + entry.bytes, 0);
  const allPicked = shown.length > 0 && picked.size === shown.length;
  const chosen = shown.filter((one) => picked.has(one.key));

  return (
    <Modal
      title="Trash"
      onClose={() => {
        void flush();
        onClose();
      }}
      width="max-w-3xl"
    >
      <div className="flex max-h-[72vh] flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-5 py-3">
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={allPicked}
              disabled={!shown.length}
              onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map((one) => one.key)))}
              className="size-4 accent-ink-900"
            />
            Select all
          </label>
          <span className="mono-label text-ink-500" style={{ fontSize: 10 }}>
            {shown.length} in the trash · {readableSize(total)} · {TRASH_DAYS} days
          </span>
          <span className="ml-auto flex items-center gap-2">
            <Button
              variant="primary"
              disabled={busy || !chosen.length}
              onClick={() => void act(async () => {
                for (const entry of chosen) await restore(entry);
                setPicked(new Set());
              })}
            >
              {chosen.length && chosen.length < shown.length
                ? `Restore ${chosen.length}`
                : 'Restore all'}
            </Button>
            <Button disabled={busy || !chosen.length} onClick={() => hold(chosen)}>
              Delete forever
            </Button>
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {entries === null ? (
            <p className="text-[15px] text-ink-500">Looking…</p>
          ) : shown.length === 0 ? (
            <p className="text-[15px] text-ink-500">
              Nothing in the trash. Anything you delete waits here for {TRASH_DAYS} days.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {shown.map((entry) => (
                <Row
                  key={entry.key}
                  entry={entry}
                  picked={picked.has(entry.key)}
                  busy={busy}
                  onPick={() =>
                    setPicked((was) => {
                      const next = new Set(was);
                      if (next.has(entry.key)) next.delete(entry.key);
                      else next.add(entry.key);
                      return next;
                    })
                  }
                  onRestore={() => void act(() => restore(entry))}
                  onDelete={() => hold([entry])}
                />
              ))}
            </ul>
          )}
        </div>

        {held.length > 0 && (
          <div className="flex items-center gap-3 border-t border-ink-200 px-5 py-3">
            <span className="text-[13.5px]">
              {held.length === 1 ? `${held[0].name} deleted.` : `${held.length} things deleted.`}
            </span>
            <Button onClick={undo}>Undo</Button>
            <span className="mono-label ml-auto text-ink-500" style={{ fontSize: 10 }}>
              Gone for good in a few seconds
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({
  entry,
  picked,
  busy,
  onPick,
  onRestore,
  onDelete,
}: {
  entry: TrashEntry;
  picked: boolean;
  busy: boolean;
  onPick: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const urls = useAssetUrls(entry.assetId ? [entry.assetId] : []);
  const left = Math.max(0, Math.min(1, entry.daysLeft / TRASH_DAYS));

  return (
    <li className={cx('proof', picked && 'is-picked')}>
      <div className={cx('plate flex items-center gap-3 rounded-[6px] bg-paper-100 p-3', picked && 'ring-2 ring-ink-900')}>
        <input
          type="checkbox"
          checked={picked}
          onChange={onPick}
          aria-label={`Choose ${entry.name}`}
          className="size-4 shrink-0 accent-ink-900"
        />

        {/* The thing itself, big enough to recognise. */}
        <Chequerboard className="size-[84px] shrink-0 rounded-[3px] border border-ink-300">
          {entry.assetId && urls[entry.assetId] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls[entry.assetId]} alt="" className="max-h-full max-w-full object-contain" />
          ) : entry.thumb ? (
            <ThumbArt thumb={entry.thumb} />
          ) : null}
        </Chequerboard>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-[15px] font-[560]">{entry.name}</span>
            <span className="tag shrink-0">{entry.what}</span>
          </span>
          <span className="mono-label mt-1 block truncate text-ink-500" style={{ fontSize: 10 }}>
            {entry.contents} · {readableSize(entry.bytes)}
          </span>

          {/* How much of the thirty days is left, as a bar rather than a number
              nobody converts: a sliver reads as "soon" without being read. */}
          <span className="mt-2 flex items-center gap-2">
            <span aria-hidden="true" className="block h-1 flex-1 overflow-hidden rounded-full bg-paper-200">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${left * 100}%`,
                  background: left < 0.2 ? 'var(--color-accenta-500)' : 'var(--color-ink-300)',
                }}
              />
            </span>
            <span className="mono-label shrink-0 text-ink-500" style={{ fontSize: 10 }}>
              {entry.daysLeft === 0
                ? 'goes today'
                : `${entry.daysLeft} day${entry.daysLeft === 1 ? '' : 's'} left`}
            </span>
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <Button variant="primary" disabled={busy} onClick={onRestore}>
            Restore
          </Button>
          <Button disabled={busy} onClick={onDelete}>
            Delete
          </Button>
        </span>
      </div>
    </li>
  );
}
