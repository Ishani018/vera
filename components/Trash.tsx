'use client';

import { useCallback, useEffect, useState } from 'react';
import { readableSize, TRASH_DAYS } from '@/lib/deleted';
import { emptyTrash, listTrash, purge, restore, type TrashEntry } from '@/lib/trash';
import { Modal } from './Modal';
import { Button, Notice } from './ui';

/**
 * What has been deleted, and the way back.
 *
 * Deleting is the only action in this app that used to be unrecoverable, and
 * it was unrecoverable in the worst way: silently, locally, with no copy
 * anywhere. This screen exists so that the confirmation dialog can stop being
 * the last line of defence.
 *
 * Two numbers are shown for each thing and both are chosen carefully. The days
 * left, because thirty days is a promise and a promise needs a countdown. And
 * the space it is holding, because keeping deleted books costs room in a
 * browser that has a quota and will start refusing to save when it runs out —
 * which would be a very confusing way to discover that the trash was full.
 *
 * The size is what would actually come back, not what the thing weighs.
 * Pictures are shared, so a book whose photographs are also in another book is
 * holding nothing of its own, and saying otherwise would be a number that
 * never comes true when you press the button.
 */
export function Trash({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [entries, setEntries] = useState<TrashEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<'all' | string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void listTrash().then(setEntries);
  }, []);
  useEffect(refresh, [refresh]);

  const act = async (work: () => Promise<unknown>, told: string) => {
    setBusy(true);
    setConfirming(null);
    try {
      await work();
      setSaid(told);
      refresh();
      // The front page is showing a list this just changed.
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const total = (entries ?? []).reduce((sum, entry) => sum + entry.bytes, 0);

  return (
    <Modal title="Trash" onClose={onClose} width="max-w-2xl">
      <div className="max-h-[70vh] overflow-y-auto p-5">
        <p className="text-[14px] leading-relaxed text-ink-500">
          Anything deleted waits here for {TRASH_DAYS} days, then goes for good. Nothing in this
          list appears anywhere else in the app, and nothing in it is written into a backup.
        </p>

        {said && (
          <div className="mt-3">
            <Notice level="ok">{said}</Notice>
          </div>
        )}

        {entries === null ? (
          <p className="mt-4 text-[15px] text-ink-500">Looking…</p>
        ) : entries.length === 0 ? (
          <p className="mt-4 text-[15px] text-ink-500">
            The trash is empty. Nothing has been deleted, or everything deleted has already been
            restored.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13px] text-ink-500">
                {entries.length} {entries.length === 1 ? 'thing' : 'things'}, holding{' '}
                <strong className="font-[570] text-ink-700">{readableSize(total)}</strong>
              </span>
              {confirming === 'all' ? (
                <span className="flex items-center gap-2">
                  <span className="text-[13px] text-ink-700">Delete all {entries.length}?</span>
                  <Button onClick={() => setConfirming(null)}>Keep them</Button>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      void act(emptyTrash, `Emptied the trash — ${readableSize(total)} freed.`)
                    }
                  >
                    Empty trash
                  </Button>
                </span>
              ) : (
                <Button disabled={busy} onClick={() => setConfirming('all')}>
                  Empty trash
                </Button>
              )}
            </div>

            <ul className="mt-3 flex flex-col gap-2">
              {entries.map((entry) => (
                <li
                  key={entry.key}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-ink-200 p-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-[560]">
                      {entry.name}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-ink-500">
                      {entry.what} · {readableSize(entry.bytes)} ·{' '}
                      {entry.daysLeft === 0
                        ? 'goes today'
                        : `${entry.daysLeft} day${entry.daysLeft === 1 ? '' : 's'} left`}
                    </span>
                  </span>

                  {confirming === entry.key ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-[13px] text-ink-700">Really?</span>
                      <Button onClick={() => setConfirming(null)}>Keep it</Button>
                      <Button
                        variant="danger"
                        disabled={busy}
                        onClick={() =>
                          void act(() => purge(entry), `${entry.name} is gone for good.`)
                        }
                      >
                        Delete forever
                      </Button>
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() => void act(() => restore(entry), `${entry.name} is back.`)}
                      >
                        Restore
                      </Button>
                      <Button disabled={busy} onClick={() => setConfirming(entry.key)}>
                        Delete forever
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
