'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { BookPreview } from './BookPreview';
import { CoverDesigner } from './CoverDesigner';
import { PoemEditor } from './PoemEditor';
import { PoemList } from './PoemList';
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
  const [tab, setTab] = useState<Tab>('book');
  const walkthrough = useWalkthrough();

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
