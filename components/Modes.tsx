'use client';

import { TRIM_SIZES, getTrim, padToEven } from '@/lib/kdp';
import { useStore } from '@/lib/store';
import {
  BorderPanel,
  HeadersPanel,
  LayoutPanel,
  MarginBadge,
  MatterPanel,
  MetaPanel,
  TocPanel,
  TrimPanel,
  TypographyPanel,
} from './controls';
import { ExportPanel } from './ExportPanel';
import { ImagesMode } from './ImagesMode';
import { PoemList } from './PoemList';
import { Choice, Scroller } from './ui';
import { Tray } from './panel/Panel';

export type Mode = 'write' | 'design' | 'images' | 'export';

export const MODES: Array<{ id: Mode; glyph: string; label: string }> = [
  { id: 'write', glyph: '✎', label: 'Write' },
  { id: 'design', glyph: '◐', label: 'Design' },
  { id: 'images', glyph: '▣', label: 'Images' },
  { id: 'export', glyph: '⤓', label: 'Export' },
];

const FOLIO_LABELS: Record<string, string> = {
  bottomCenter: 'Centred',
  bottomOutside: 'Bottom outside',
  topOutside: 'Top outside',
  none: 'No numbers',
};

const HEADINGS: Record<Mode, { title: string; blurb: string }> = {
  write: { title: 'Write', blurb: 'Everything the book contains, in the order it is printed.' },
  design: { title: 'Design', blurb: 'How the book looks. Open one tray at a time; the preview follows along.' },
  images: { title: 'Images', blurb: 'Full-page plates, and the pictures the book uses.' },
  export: { title: 'Export', blurb: 'Two PDFs go to KDP: the pages, and the cover.' },
};

export function ModePanel({ mode }: { mode: Mode }) {
  const heading = HEADINGS[mode];
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-y-auto border-r border-ink-200 bg-paper">
      <header className="px-6 pb-2 pt-6">
        <h2 className="text-[26px] font-semibold tracking-tight">{heading.title}</h2>
        <p className="mt-1.5 text-[15px] text-ink-500">{heading.blurb}</p>
      </header>
      <div className="flex flex-col gap-3.5 px-6 pb-8 pt-3.5">
        {mode === 'write' && <WriteMode />}
        {mode === 'design' && <DesignMode />}
        {mode === 'images' && <ImagesMode />}
        {mode === 'export' && <ExportMode />}
      </div>
    </aside>
  );
}

/**
 * Which tray is open, kept in the store so it survives switching modes and
 * ends up in the same place you left it.
 */
function useTray(key: string): [boolean, () => void] {
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  return [panel === key, () => setPanel(key)];
}

function ModeTray({
  id,
  title,
  now,
  highlight,
  children,
}: {
  id: string;
  title: string;
  now?: React.ReactNode;
  highlight?: string;
  children: React.ReactNode;
}) {
  const [open, toggle] = useTray(id);
  const setHighlight = useStore((s) => s.setHighlight);
  return (
    <Tray
      title={title}
      now={now}
      open={open}
      onToggle={toggle}
      onAnyChange={highlight ? () => setHighlight(highlight) : undefined}
    >
      {children}
    </Tray>
  );
}

/* ------------------------------------------------------------------ write */

function WriteMode() {
  return (
    <>
      <PoemList />
      <ModeTray id="meta" title="Book details" highlight=".matter-page">
        <MetaPanel />
      </ModeTray>
      <ModeTray id="matter" title="Front and back matter" highlight=".matter-page">
        <MatterPanel />
      </ModeTray>
      <ModeTray id="toc" title="Contents page" highlight=".toc, .index-first-lines">
        <TocPanel />
      </ModeTray>
    </>
  );
}

/* ----------------------------------------------------------------- design */

/** The three trims a poetry collection is nearly always one of, first. */
const FEATURED = ['5.5x8.5', '5x8', '6x9'];

function PageSize() {
  const project = useStore((s) => s.project)!;
  const update = useStore((s) => s.update);
  const trim = getTrim(project.trim.trimId);

  // Every shape is drawn to one scale, so the cards can be compared by eye
  // rather than by reading the numbers under them.
  const tallest = Math.max(...TRIM_SIZES.map((t) => t.height));
  const ordered = [
    ...FEATURED.map((id) => TRIM_SIZES.find((t) => t.id === id)).filter(Boolean),
    ...TRIM_SIZES.filter((t) => !FEATURED.includes(t.id)),
  ] as typeof TRIM_SIZES;

  return (
    <div>
      <span className="block font-[570]">Pick a shape</span>
      <span className="mt-0.5 block text-[14px] text-ink-500">
        Trim size · what KDP prints to. Scroll for all {TRIM_SIZES.length}.
      </span>
      <Scroller>
        {ordered.map((size) => (
          <Choice
            key={size.id}
            selected={size.id === project.trim.trimId}
            onSelect={() => update((draft) => void (draft.trim.trimId = size.id))}
            caption={`${size.width} × ${size.height}″`}
            note={size.id === '5.5x8.5' ? 'most poetry' : undefined}
          >
            <span
              className="block border border-ink-300 bg-paper shadow-[0_2px_6px_rgba(0,0,0,0.14)]"
              style={{
                height: `${(size.height / tallest) * 74}px`,
                width: `${(size.width / tallest) * 74}px`,
              }}
            />
          </Choice>
        ))}
      </Scroller>
      <p className="mt-1 text-[14px] text-ink-500">
        Now: {trim.width} × {trim.height}″
      </p>
    </div>
  );
}

function DesignMode() {
  const project = useStore((s) => s.project)!;
  const trim = getTrim(project.trim.trimId);
  const type = project.typography.body;

  return (
    <>
      <ModeTray
        id="trim"
        title="Page size and margins"
        now={
          <>
            {trim.width} × {trim.height}″ <MarginBadge />
          </>
        }
        highlight=".pagedjs_page_content"
      >
        <PageSize />
        <TrimPanel />
      </ModeTray>

      <ModeTray
        id="type"
        title="Type"
        now={`${type.sizePt}pt`}
        highlight=".poem-line, .poem-title"
      >
        <TypographyPanel />
      </ModeTray>

      <ModeTray
        id="layout"
        title="How poems sit"
        now={
          project.layout.poemStart === 'continuous'
            ? 'Run on'
            : project.layout.poemStart === 'recto'
              ? 'A right-hand page'
              : 'A new page'
        }
        highlight=".stanza"
      >
        <LayoutPanel />
      </ModeTray>

      <ModeTray
        id="headers"
        title="Page furniture"
        now={FOLIO_LABELS[project.headers.pageNumberPosition]}
        highlight=".pagedjs_margin-content"
      >
        <HeadersPanel />
      </ModeTray>

      <ModeTray
        id="border"
        title="Advanced"
        now={project.border.enabled ? 'Border on' : 'No border'}
        highlight=".ornament, .pagedjs_pagebox"
      >
        <BorderPanel />
      </ModeTray>
    </>
  );
}

/* ----------------------------------------------------------------- export */

function ExportMode() {
  const pageCount = useStore((s) => s.pageCount);
  return (
    <>
      <ExportPanel />
      {pageCount > 0 && (
        <p className="text-[14px] text-ink-500">
          {padToEven(pageCount)} pages after parity padding · saved on this computer, automatically
        </p>
      )}
    </>
  );
}
