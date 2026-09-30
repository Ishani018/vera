'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDb } from '@/lib/db';
import { getDesign, saveDesign } from '@/lib/designs';
import { exportStandaloneDesign } from '@/lib/exportClient';
import { picturesOf, type BookPicture } from '@/lib/pictures';
import { presetById } from '@/lib/presets';
import { listProjects, migrateProject, type ProjectSummary } from '@/lib/projects';
import type { Design, StandaloneDesign } from '@/lib/types';
import { DesignEditor } from './DesignEditor';
import { Modal } from './Modal';
import { StudioHeader } from './StudioHeader';
import { Button, TextInput } from './ui';

/** What a new text box is set in, on a board with no book to take it from. */
const DEFAULT_FACE = { family: 'EB Garamond', fallback: 'serif' };

/**
 * A design that belongs to no book, open on its own.
 *
 * It holds the design in state and writes it back after a pause, which is the
 * same bargain the book editors make: typing should not be a transaction, and
 * closing the tab should not lose the last word typed.
 */
export function DesignWorkspace() {
  const [design, setDesign] = useState<StandaloneDesign | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [pictures, setPictures] = useState<BookPicture[]>([]);
  const [borrowing, setBorrowing] = useState(false);
  const [books, setBooks] = useState<ProjectSummary[]>([]);

  /* ------------------------------------------------------------------ saving */

  const pending = useRef<StandaloneDesign | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (next) void saveDesign(next);
  }, []);

  const update = useCallback(
    (recipe: (draft: Design) => void) => {
      setDesign((current) => {
        if (!current) return current;
        const draft = structuredClone(current);
        recipe(draft);
        pending.current = draft;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          const write = pending.current;
          pending.current = null;
          if (write) void saveDesign(write);
        }, 400);
        return draft;
      });
    },
    [],
  );

  // Whatever is still waiting goes down before the page does. Leaving it to
  // the timer means the last edit before a close is the one that is lost.
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  /* ----------------------------------------------------------------- opening */

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) return setStatus('missing');
    void getDesign(id).then((found) => {
      if (!found) return setStatus('missing');
      setDesign(found);
      setStatus('ready');
    });
  }, []);

  /* --------------------------------------------------- pictures from a book */

  const borrowed = design?.borrowedFrom;
  useEffect(() => {
    if (!borrowed) return setPictures([]);
    const db = getDb();
    if (!db) return;
    void db.projects.get(borrowed).then((row) => {
      // A book that has since been deleted simply lends nothing; the design
      // keeps the pictures it already placed, because those are copied by id.
      setPictures(row ? picturesOf(migrateProject(row)) : []);
    });
  }, [borrowed]);

  const openBorrow = () => {
    setBorrowing(true);
    void listProjects().then(setBooks);
  };

  if (status === 'loading') {
    return (
      <main className="flex h-dvh items-center justify-center">
        <p className="text-ink-500">Opening…</p>
      </main>
    );
  }

  if (status === 'missing' || !design) {
    return (
      <main className="flex h-dvh flex-col">
        <StudioHeader />
        <div className="grid flex-1 place-items-center px-6">
          <div className="text-center">
            <h1 className="text-[24px] font-semibold tracking-tight">That design isn’t here</h1>
            <p className="mt-2 text-[16px] text-ink-500">
              It may have been deleted.{' '}
              <Link href="/" className="text-accent-500 underline">
                Everything you have made
              </Link>{' '}
              is on the front page.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const preset = presetById(design.presetId);

  return (
    <main className="flex h-dvh flex-col">
      {/* The name lives here, and only here: the editor's own bar used to say
          it again, and the size after it, which made a header out of a header. */}
      <StudioHeader>
        <TextInput
          value={design.name}
          onChange={(e) => {
            const name = e.target.value;
            update((draft) => void (draft.name = name));
          }}
          aria-label="Design name"
          className="max-w-xs border-transparent bg-transparent text-[16px] font-[560] hover:border-ink-200 focus:border-ink-300"
        />
        <span className="shrink-0 text-[13px] text-ink-500">
          {preset ? `${preset.name} · ${preset.stated}` : ''}
        </span>
        <span className="ml-auto shrink-0 text-[13px] text-ink-500">saved on this computer</span>
      </StudioHeader>

      <div className="min-h-0 flex-1">
        <DesignEditor
          design={design}
          update={update}
          displayFont={DEFAULT_FACE}
          pictures={pictures}
          showName={false}
          rail
          // Named after the book only once there is one to name.
          bookTray={
            pictures.length ? { title: 'Pictures from a book', empty: '' } : null
          }
          onExport={(format, scale) => {
            flush();
            return exportStandaloneDesign(design, format, scale);
          }}
          onBack={() => {
            flush();
            window.location.href = '/';
          }}
          backLabel="← Everything"
          borrow={
            <button
              type="button"
              onClick={openBorrow}
              className="w-full rounded-xl border border-dashed border-ink-300 px-3 py-2.5 text-[13.5px] text-ink-700 transition-colors hover:border-accent-500 hover:text-accent-600"
            >
              {borrowed ? 'Pictures from another book…' : 'Use pictures from a book…'}
            </button>
          }
        />
      </div>

      {borrowing && (
        <Modal title="Borrow pictures" onClose={() => setBorrowing(false)} width="max-w-xl">
          <div className="flex flex-col gap-2.5 p-5">
            <p className="text-[14px] leading-relaxed text-ink-500">
              A book’s pictures appear in the tray, to drag onto this board. The book itself is not
              changed, and a picture you place is copied, so deleting the book later cannot empty
              this design.
            </p>
            {books.length === 0 && (
              <p className="text-[14px] text-ink-500">There are no books saved on this computer.</p>
            )}
            {books.map((book) => (
              <button
                key={book.id}
                type="button"
                onClick={() => {
                  setBorrowing(false);
                  update((draft) => void ((draft as StandaloneDesign).borrowedFrom = book.id));
                }}
                className="rounded-xl border border-ink-200 p-3.5 text-left transition-colors hover:border-accent-500"
              >
                <span className="block truncate text-[16px] font-[560]">{book.name}</span>
                <span className="mt-0.5 block text-[13px] text-ink-500">
                  {book.kind === 'coloring' ? 'Colouring book' : 'Poetry book'} · {book.items}{' '}
                  {book.kind === 'coloring' ? 'picture' : 'poem'}
                  {book.items === 1 ? '' : 's'}
                </span>
              </button>
            ))}
            {borrowed && (
              <div className="mt-1">
                <Button
                  onClick={() => {
                    setBorrowing(false);
                    update((draft) => void delete (draft as StandaloneDesign).borrowedFrom);
                  }}
                >
                  Stop borrowing
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </main>
  );
}
