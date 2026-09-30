'use client';

import { useEffect, useRef, useState } from 'react';
import { exportEverythingJson, importEverythingJson } from '@/lib/exportClient';
import { askToPersist, persistedState, storageRoom, type PersistState } from '@/lib/persist';
import { Button, Notice, cx } from './ui';

/**
 * The one thing someone has to know before they put an evening into this.
 *
 * There are no accounts and nothing is uploaded, which is the reason to trust
 * it and also the reason it can vanish. Clearing site data takes everything.
 * Safari evicts untouched storage after seven days. A private window forgets
 * on close. None of that is unusual for a browser and all of it is surprising
 * to someone who thinks of a website as a place their work is kept.
 *
 * So it is said once, plainly, on the way in — with the button that makes it
 * survivable right there, rather than a sentence of reassurance and a backup
 * feature three screens away.
 *
 * Dismissed is remembered. A banner that comes back every visit is a banner
 * people learn not to read, and this one is worth reading once.
 */

const DISMISSED_KEY = 'versecraft:storageNotice';

export function StorageNotice({ onChanged }: { onChanged?: () => void }) {
  const [shown, setShown] = useState(false);
  const [persisted, setPersisted] = useState<PersistState>('unknown');
  const [room, setRoom] = useState<{ usedMb: number; quotaMb: number } | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISSED_KEY) === 'seen';
    } catch {
      /* storage blocked — which is itself a reason to show the notice */
    }
    setShown(!dismissed);
    setPersisted(persistedState());
    void storageRoom().then(setRoom);
  }, []);

  const dismiss = () => {
    setShown(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, 'seen');
    } catch {
      /* it will be shown again, which is the safe way to fail */
    }
  };

  if (!shown) return null;

  return (
    <aside className="mb-8 rounded-2xl border border-accent-500/35 bg-accent-50/60 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 text-[18px] leading-none">
          ⚑
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-[580] tracking-tight">
            Your work is saved in this browser only
          </h2>
          <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-ink-700">
            Nothing is uploaded and there is no account, so there is no copy anywhere else.
            Clearing your browsing data deletes it. A private window forgets it when you close
            the tab. Safari throws away storage for sites it has not seen in about a week.
            Your pictures leave this browser only when you press Download, and even then they
            are used to make the file and not kept.
          </p>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-700">
            <strong className="font-[570]">Save a backup file.</strong> It holds every book,
            every design, your stickers and all the pictures, and it restores on any computer.
          </p>

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <BackupButton onChanged={onChanged} />
            <Button onClick={dismiss}>I understand</Button>
            {room && (
              <span className="text-[12.5px] text-ink-500">
                Using {room.usedMb} MB of about {room.quotaMb} MB this browser allows.
              </span>
            )}
          </div>

          {persisted === 'refused' && (
            <p className="mt-2.5 text-[12.5px] leading-snug text-ink-500">
              This browser would not mark the site as persistent, so it may clear the work if
              the disk fills. Keeping a backup file matters more here.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * Backup, and the restore that makes it mean anything.
 *
 * Restore adds and never replaces: anything already on this computer with the
 * same identity is left alone. Restoring is therefore always safe to try, and
 * the worst it can do is nothing — which is the property that lets it be a
 * plain button rather than a dialog full of warnings.
 */
export function BackupButton({
  onChanged,
  variant = 'primary',
}: {
  onChanged?: () => void;
  variant?: 'primary' | 'plain';
}) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const backup = async () => {
    setBusy(true);
    setSaid(null);
    try {
      const { books, designs } = await exportEverythingJson();
      // Worth asking here too: someone who has just taken a backup has shown
      // the browser exactly the kind of engagement it weighs.
      void askToPersist();
      setSaid({
        ok: true,
        text: `Saved ${count(books, 'book')} and ${count(designs, 'design')} to your downloads.`,
      });
    } catch (error) {
      setSaid({ ok: false, text: error instanceof Error ? error.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (chosen: File | undefined) => {
    if (!chosen) return;
    setBusy(true);
    setSaid(null);
    try {
      const { books, designs, skipped } = await importEverythingJson(chosen);
      setSaid({
        ok: true,
        text:
          books + designs === 0
            ? `Nothing new — all ${skipped} of those are already on this computer.`
            : `Added ${count(books, 'book')} and ${count(designs, 'design')}.` +
              (skipped ? ` ${skipped} were already here and were left alone.` : ''),
      });
      onChanged?.();
    } catch (error) {
      setSaid({
        ok: false,
        text: error instanceof Error ? error.message : 'That file could not be read.',
      });
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  return (
    <>
      <span className="flex flex-wrap items-center gap-2">
        <Button
          variant={variant === 'primary' ? 'primary' : undefined}
          disabled={busy}
          onClick={() => void backup()}
        >
          {busy ? 'Working…' : 'Save a backup'}
        </Button>
        <label
          className={cx(
            'cursor-pointer rounded-lg border border-ink-300 px-3 py-1.5 text-[13.5px]',
            'text-ink-700 transition-colors hover:border-ink-400 hover:text-ink-900',
          )}
        >
          Restore…
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void restore(e.target.files?.[0])}
          />
        </label>
      </span>
      {said && (
        <span className="w-full">
          <Notice level={said.ok ? 'ok' : 'error'}>{said.text}</Notice>
        </span>
      )}
    </>
  );
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
