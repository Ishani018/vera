'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { BookPreview } from './BookPreview';
import { CoverDesigner } from './CoverDesigner';
import { HelpPanel } from './HelpPanel';
import { IllustrationEditor } from './IllustrationEditor';
import { MODES, ModePanel, type Mode } from './Modes';
import { PoemEditor } from './PoemEditor';
import { Walkthrough, useWalkthrough } from './Walkthrough';
import { Button, SegmentedControl, cx } from './ui';

type Tab = 'book' | 'cover';

export function Workspace() {
  const status = useStore((s) => s.status);
  const project = useStore((s) => s.project);
  const init = useStore((s) => s.init);
  const pageCount = useStore((s) => s.pageCount);
  const setImportOpen = useStore((s) => s.setImportOpen);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const [tab, setTab] = useState<Tab>('book');
  const [mode, setMode] = useState<Mode>('write');
  const [helpOpen, setHelpOpen] = useState(false);
  const walkthrough = useWalkthrough();

  /**
   * Undo is intercepted everywhere, including inside text fields. A controlled
   * React input has no reliable native undo stack of its own, so leaving it to
   * the browser would mean undo works in some places and silently not others.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      // "?" is a shortcut only when it is not being typed into something.
      const typing =
        target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '');
      if (!mod && !typing && event.key === '?') {
        event.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  useEffect(() => {
    void init();
  }, [init]);

  if (status === 'loading' || !project) {
    return (
      <main className="flex h-dvh items-center justify-center">
        <p className="text-ink-500">Opening your collection…</p>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex items-center gap-4 border-b border-ink-200 bg-paper px-5">
        <Link
          href="/"
          title="All your books"
          className="rounded-lg py-4 pr-1 text-[20px] font-semibold tracking-tight transition-colors hover:text-accent-500"
        >
          Verse<span className="text-accent-500">craft</span>
        </Link>
        <span className="truncate rounded-lg px-3 py-2 text-ink-700">{project.meta.title}</span>

        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'book', label: 'Book' },
            { value: 'cover', label: 'Cover' },
          ]}
        />

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={undo} disabled={!canUndo} title="Undo" aria-label="Undo">
            ↺
          </Button>
          <Button variant="ghost" onClick={redo} disabled={!canRedo} title="Redo" aria-label="Redo">
            ↻
          </Button>
          <span className="rounded-full bg-ink-100 px-4 py-2 text-[14px] tabular-nums text-ink-700">
            {pageCount ? `${pageCount} pages` : 'counting…'}
          </span>
          <Button variant="ghost" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (?)">
            ?
          </Button>
          <Button
            variant="ghost"
            onClick={() => walkthrough.update({ step: walkthrough.progress.step, dismissed: false })}
            title="Reopen the getting-started walkthrough"
          >
            Guide
          </Button>
          <Button
            variant={tab === 'book' && mode === 'export' ? 'default' : 'primary'}
            onClick={() => {
              setTab('book');
              setMode('export');
            }}
          >
            Export PDF
          </Button>
        </div>
      </header>

      {tab === 'book' ? (
        <div className="grid min-h-0 flex-1 grid-cols-[104px_404px_minmax(0,1fr)]">
          <nav className="flex flex-col gap-1.5 border-r border-ink-200 bg-paper p-2.5">
            {MODES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setMode(entry.id)}
                aria-current={mode === entry.id}
                className={cx(
                  'grid justify-items-center gap-2 rounded-2xl px-1 pb-3 pt-4 transition-colors',
                  mode === entry.id
                    ? 'bg-accent-50 text-accent-500'
                    : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900',
                )}
              >
                <span aria-hidden className="text-[25px] leading-none">
                  {entry.glyph}
                </span>
                <span className="text-[13.5px] font-[570]">{entry.label}</span>
              </button>
            ))}
          </nav>

          <ModePanel mode={mode} />

          <div className="min-h-0">
            <BookPreview />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <CoverDesigner />
        </div>
      )}

      <PoemEditor />
      <IllustrationEditor />
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      <Walkthrough
        {...walkthrough}
        onOpenImport={() => {
          setTab('book');
          setMode('write');
          setImportOpen(true);
        }}
      />
    </main>
  );
}
