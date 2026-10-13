'use client';

import { useEffect, useState } from 'react';
import { illustrationsOf } from '@/lib/contents';
import { useStore } from '@/lib/store';
import { BookPreview } from './BookPreview';
import { CoverDesigner } from './CoverDesigner';
import { HelpPanel } from './HelpPanel';
import { IllustrationEditor } from './IllustrationEditor';
import { LaunchKit } from './LaunchKit';
import { MODES, ModePanel, type Mode } from './Modes';
import { useOpenIntent } from './openIntent';
import { PoemEditor } from './PoemEditor';
import { Walkthrough, useWalkthrough } from './Walkthrough';
import { Wordmark } from './Wordmark';
import { Button, SegmentedControl, cx } from './ui';

type Tab = 'book' | 'cover' | 'kit';

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

  // A tile on the front page can point straight at a cover or a launch-kit
  // board; without this the tile would have to lie about where it goes.
  const intent = useOpenIntent();
  useEffect(() => {
    if (intent) setTab(intent.open === 'cover' ? 'cover' : 'kit');
  }, [intent]);
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
      {/*
        The same treatment `StudioHeader` already has, and never got here: it
        scrolls sideways rather than pushing the window wider. Without
        `min-w-0` and `overflow-x-auto` the right-hand group — undo, redo, the
        page count, help, Guide, Export PDF — pushed 113px past the viewport at
        800 wide and took the whole page's horizontal scrollbar with it, which
        drags the manuscript sideways under the cursor.
      */}
      <header className="flex min-w-0 items-center gap-4 overflow-x-auto border-b border-ink-200 bg-paper px-5">
        <Wordmark />
        <span className="truncate rounded-lg px-3 py-2" style={{ color: 'var(--text-on-sheet)' }}>
          {project.meta.title}
        </span>

        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'book', label: 'Book' },
            { value: 'cover', label: 'Cover' },
            { value: 'kit', label: 'Launch kit' },
          ]}
        />

        {/* shrink-0, so a narrow window scrolls the bar rather than squashing
            every control in it into an unreadable column of letters. */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
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
          <nav
            className="flex flex-col gap-1.5 border-r p-2.5"
            style={{ background: 'var(--studio-card)', borderColor: 'var(--studio-line)' }}
          >
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
      ) : tab === 'cover' ? (
        <div className="min-h-0 flex-1">
          <PoetryCover />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <PoetryKit openDesign={intent?.open === 'kit' ? intent.designId : null} />
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

/**
 * The shared cover designer, given the poetry book to work on.
 *
 * A wrapper rather than a store read inside the designer, so the same
 * component serves a coloring book without either side knowing about the
 * other's state.
 */
function PoetryCover() {
  const project = useStore((s) => s.project);
  const update = useStore((s) => s.update);
  const pageCount = useStore((s) => s.pageCount);
  return (
    <CoverDesigner
      project={project}
      update={update}
      pageCount={pageCount}
      displayFont={project?.typography.sectionTitle ?? { family: 'EB Garamond', fallback: 'serif' }}
      pictures={(project ? illustrationsOf(project) : [])
        .filter((plate) => plate.assetId)
        .map((plate) => ({
          key: plate.id,
          name: plate.title || plate.caption || 'Illustration',
          assetId: plate.assetId,
          width: plate.naturalWidth,
          height: plate.naturalHeight,
        }))}
    />
  );
}

/**
 * The launch kit, given the poetry book to hang designs on.
 *
 * The same wrapper shape as the cover above: the kit is written against any
 * book, and the store read stays out here so neither side learns about the
 * other's state.
 */
function PoetryKit({ openDesign }: { openDesign?: string | null }) {
  const project = useStore((s) => s.project);
  const update = useStore((s) => s.update);
  if (!project) return null;
  return (
    <LaunchKit
      project={project}
      update={update}
      displayFont={project.typography.sectionTitle}
      openDesign={openDesign}
      pictures={illustrationsOf(project)
        .filter((plate) => plate.assetId)
        .map((plate) => ({
          key: plate.id,
          name: plate.title || plate.caption || 'Illustration',
          assetId: plate.assetId!,
          width: plate.naturalWidth,
          height: plate.naturalHeight,
        }))}
    />
  );
}
