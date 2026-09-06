'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { BookPreview } from './BookPreview';
import { CoverDesigner } from './CoverDesigner';
import { PoemEditor } from './PoemEditor';
import { PoemList } from './PoemList';
import { HelpPanel } from './HelpPanel';
import { SettingsPanel } from './SettingsPanel';
import { Walkthrough, useWalkthrough } from './Walkthrough';
import { Button, cx } from './ui';

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
        <p className="text-ink-400">Opening your collection…</p>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-ink-800 bg-ink-900 px-3 py-2">
        <span className="flex items-baseline gap-2">
          <strong className="text-[13px] font-semibold tracking-tight text-brass-400">
            Versecraft
          </strong>
          <span className="text-ink-500">·</span>
          <span className="truncate text-ink-300">{project.meta.title}</span>
        </span>

        <nav className="ml-4 inline-flex rounded-md border border-ink-700 bg-ink-950 p-0.5">
          {(
            [
              ['book', 'Book'],
              ['cover', 'Cover'],
            ] as Array<[Tab, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cx(
                'rounded px-3 py-1 transition-colors',
                tab === value ? 'bg-ink-700 text-ink-200' : 'text-ink-400 hover:text-ink-200',
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        <span className="ml-auto tabular-nums text-[11px] text-ink-500">
          {pageCount ? `${pageCount} pages` : 'paginating…'}
        </span>

        <div className="flex items-center gap-0.5">
          <Button variant="ghost" onClick={undo} disabled={!canUndo} title="Undo">
            ↶
          </Button>
          <Button variant="ghost" onClick={redo} disabled={!canRedo} title="Redo">
            ↷
          </Button>
        </div>
        <Button variant="ghost" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (?)">
          ?
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            walkthrough.update({ step: walkthrough.progress.step, dismissed: false })
          }
          title="Reopen the getting-started walkthrough"
        >
          Guide
        </Button>
      </header>

      {tab === 'book' ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,270px)_minmax(0,1fr)_minmax(280px,340px)]">
          <div className="min-h-0 border-r border-ink-800">
            <PoemList />
          </div>
          <div className="min-h-0">
            <BookPreview />
          </div>
          <div className="min-h-0 border-l border-ink-800">
            <SettingsPanel />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <CoverDesigner />
        </div>
      )}

      <PoemEditor />
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      <Walkthrough
        {...walkthrough}
        onOpenImport={() => {
          setTab('book');
          setImportOpen(true);
        }}
      />
    </main>
  );
}
