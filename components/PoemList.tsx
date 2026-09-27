'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState } from 'react';

import { isPoem, isSection, poemsOf, sectionsOf } from '@/lib/contents';
import { id } from '@/lib/defaults';
import { repairStats } from '@/lib/repair';
import { countLines } from '@/lib/render/text';
import { countSamplePoems } from '@/lib/samples';
import { useStore } from '@/lib/store';
import type { ContentItem, Poem, Section } from '@/lib/types';
import { ImportDialog } from './ImportDialog';
import { Button, TextInput, cx } from './ui';

/**
 * The list is the book's contents, shown as they are stored: one flat sortable
 * sequence of part headings and poems. Dragging a poem above or below a heading
 * is what moves it between parts, because being under a part *is* following it.
 */

export function PoemList() {
  const project = useStore((s) => s.project);
  const update = useStore((s) => s.update);
  const select = useStore((s) => s.select);
  const selectedPoemId = useStore((s) => s.selectedPoemId);
  const clearSamplePoems = useStore((s) => s.clearSamplePoems);
  const filter = useStore((s) => s.poemFilter);
  const setFilter = useStore((s) => s.setPoemFilter);
  const importing = useStore((s) => s.importOpen);
  const setImporting = useStore((s) => s.setImportOpen);
  const [confirmClear, setConfirmClear] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const allRows: ContentItem[] = project ? project.contents : [];
  const sampleCount = project ? countSamplePoems(project) : 0;
  const poemCount = project ? poemsOf(project).length : 0;
  const partCount = project ? sectionsOf(project).length : 0;

  const needle = filter.trim().toLowerCase();
  // Filtering hides rows, so dragging while filtered would reorder against a
  // sequence the poet cannot see. Reordering is switched off instead.
  const rows = useMemo(() => {
    if (!needle) return allRows;
    return allRows.filter((item) =>
      isPoem(item)
        ? item.title.toLowerCase().includes(needle) || item.body.toLowerCase().includes(needle)
        : item.title.toLowerCase().includes(needle),
    );
  }, [allRows, needle]);

  const warnings = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of allRows) {
      if (!isPoem(item)) continue;
      const stats = repairStats(item.body);
      const count = stats.suggestions + stats.longLines;
      if (count) map.set(item.id, count);
    }
    return map;
  }, [allRows]);

  if (!project) return null;

  // Reordering is a move within the one array, which is all that order means
  // now — there is no membership to rewrite alongside it.
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    update(
      (draft) => {
        const from = draft.contents.findIndex((item) => item.id === active.id);
        const to = draft.contents.findIndex((item) => item.id === over.id);
        if (from < 0 || to < 0) return;
        draft.contents.splice(to, 0, draft.contents.splice(from, 1)[0]);
      },
      { discrete: true },
    );
  };

  const addPoem = () => {
    const newId = id('poem');
    update((draft) => {
      draft.contents.push({
        kind: 'poem',
        id: newId,
        title: 'Untitled',
        body: '',
        epigraph: '',
        dedication: '',
      });
    });
    select(newId);
  };

  const addSection = () => {
    update((draft) => {
      draft.contents.push({
        kind: 'section',
        id: id('sec'),
        title: `Part ${sectionsOf(draft).length + 1}`,
        subtitle: '',
      });
    });
  };

  return (
    <div className="flex h-full flex-col bg-ink-900">
      <header className="space-y-2 border-b border-ink-800 px-3 py-2">
        <h2 className="flex items-baseline gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-300">
          Contents
          <span className="font-normal normal-case tracking-normal text-ink-400">
            {poemCount} poem{poemCount === 1 ? '' : 's'}
            {partCount > 0 && `, ${partCount} part${partCount === 1 ? '' : 's'}`}
            {warnings.size > 0 && (
              <span className="text-amber-300"> · {warnings.size} to check</span>
            )}
          </span>
        </h2>
        {/* Its own row: at 220px the pane is too narrow to sit these beside a heading. */}
        <div className="grid grid-cols-3 gap-1.5">
          <Button onClick={addPoem} title="Add a poem">
            + Poem
          </Button>
          <Button onClick={addSection} title="Add a section or part">
            + Part
          </Button>
          <Button onClick={() => setImporting(true)} title="Import or paste poems">
            Import
          </Button>
        </div>
        {poemCount > 4 && (
          <div className="relative">
            <TextInput
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search titles and lines…"
              aria-label="Search poems"
              className="pr-6"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-ink-500 hover:text-ink-200"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </header>

      {sampleCount > 0 && (
        <div className="space-y-1.5 border-b border-ink-800 bg-ink-850 px-3 py-2 text-[11px] text-ink-300">
          <p>
            {sampleCount} placeholder verse{sampleCount === 1 ? '' : 's'} loaded, to exercise the
            layout.
          </p>
          <div className="flex gap-1.5">
          {confirmClear ? (
            <>
              <Button
                variant="danger"
                onClick={() => {
                  clearSamplePoems();
                  setConfirmClear(false);
                }}
              >
                Remove them
              </Button>
              <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                Keep
              </Button>
            </>
          ) : (
            <Button onClick={() => setConfirmClear(true)}>Clear sample poems</Button>
          )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {needle && (
          <p className="px-3 pb-1.5 text-[11px] text-ink-500">
            {rows.length} match{rows.length === 1 ? '' : 'es'} · reordering is off while filtered
          </p>
        )}
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-ink-400">
            {needle ? (
              <>Nothing matches “{filter}”.</>
            ) : (
              <>
                No poems yet. Use <strong className="text-ink-300">Import</strong> to paste or
                upload a manuscript, or add one by hand.
              </>
            )}
          </p>
        ) : needle ? (
          rows.map((item) =>
            isPoem(item) ? (
              <PoemRow
                key={item.id}
                poem={item}
                warnings={warnings.get(item.id) ?? 0}
                selected={item.id === selectedPoemId}
                onSelect={() => select(item.id)}
                draggable={false}
              />
            ) : null,
          )
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {rows.map((item) =>
                isSection(item) ? (
                  <SectionRow key={item.id} section={item} />
                ) : (
                  <PoemRow
                    key={item.id}
                    poem={item}
                    warnings={warnings.get(item.id) ?? 0}
                    selected={item.id === selectedPoemId}
                    onSelect={() => select(item.id)}
                  />
                ),
              )}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

function DragHandle({ listeners, attributes }: { listeners?: object; attributes?: object }) {
  return (
    <span
      {...attributes}
      {...listeners}
      className="cursor-grab touch-none px-1 text-ink-600 transition-colors hover:text-ink-300 active:cursor-grabbing"
      aria-label="Reorder"
    >
      <svg viewBox="0 0 10 16" className="h-3.5 w-2.5" fill="currentColor" aria-hidden>
        <circle cx="2" cy="3" r="1.2" />
        <circle cx="8" cy="3" r="1.2" />
        <circle cx="2" cy="8" r="1.2" />
        <circle cx="8" cy="8" r="1.2" />
        <circle cx="2" cy="13" r="1.2" />
        <circle cx="8" cy="13" r="1.2" />
      </svg>
    </span>
  );
}

function PoemRow({
  poem,
  selected,
  warnings,
  onSelect,
  draggable = true,
}: {
  poem: Poem;
  selected: boolean;
  warnings: number;
  onSelect: () => void;
  draggable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: poem.id,
    disabled: !draggable,
  });
  const lines = countLines(poem.body);

  return (
    <div
      ref={setNodeRef}
      style={draggable ? { transform: CSS.Transform.toString(transform), transition } : undefined}
      className={cx(
        'group flex items-center gap-1 pl-2 pr-2',
        isDragging && 'relative z-10 opacity-90',
      )}
    >
      {draggable ? (
        <DragHandle listeners={listeners} attributes={attributes} />
      ) : (
        <span className="w-[18px] shrink-0" />
      )}
      <button
        type="button"
        onClick={onSelect}
        className={cx(
          'min-w-0 flex-1 rounded px-2 py-1.5 text-left transition-colors',
          selected ? 'bg-brass-500/15 text-brass-300' : 'hover:bg-ink-850',
        )}
      >
        <span className="flex items-baseline gap-1.5">
          <span className="min-w-0 flex-1 truncate">
            {poem.title || <em className="text-ink-400">Untitled</em>}
          </span>
          {warnings > 0 && (
            <span
              aria-hidden
              title={`${warnings} line${warnings === 1 ? '' : 's'} to check`}
              className="shrink-0 text-[13px] leading-none text-amber-400"
            >
              •
            </span>
          )}
        </span>
        <span className="block truncate text-[11px] text-ink-400">
          {lines ? `${lines} line${lines === 1 ? '' : 's'}` : 'empty'}
          {poem.sampleKey ? ' · placeholder' : ''}
          {warnings > 0 && (
            <span className="text-amber-400/90">
              {' · '}
              {warnings} to check
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

function SectionRow({ section }: { section: Section }) {
  const update = useStore((s) => s.update);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx('group mt-3 flex items-center gap-1 pl-2 pr-2 first:mt-0', isDragging && 'relative z-10')}
    >
      <DragHandle listeners={listeners} attributes={attributes} />
      <input
        value={section.title}
        onChange={(e) =>
          update((draft) => {
            const found = draft.contents.find((item) => item.id === section.id);
            if (found) found.title = e.target.value;
          })
        }
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-300 hover:border-ink-700 focus:border-brass-500 focus:outline-none"
        aria-label="Section title"
      />
      <button
        type="button"
        title="Delete this part (its poems stay, under whatever precedes them)"
        onClick={() =>
          update(
            (draft) => {
              draft.contents = draft.contents.filter((item) => item.id !== section.id);
            },
            { discrete: true },
          )
        }
        className="rounded px-1.5 py-1 text-ink-600 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
