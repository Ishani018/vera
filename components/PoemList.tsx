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

import { isIllustration, isPoem, isSection, poemsOf, sectionsOf } from '@/lib/contents';
import { id } from '@/lib/defaults';
import { repairStats } from '@/lib/repair';
import { countLines } from '@/lib/render/text';
import { countSamplePoems } from '@/lib/samples';
import { useStore } from '@/lib/store';
import type { ContentItem, Illustration, Poem, Section } from '@/lib/types';
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
  const plateCount = allRows.filter(isIllustration).length;

  const needle = filter.trim().toLowerCase();
  // Filtering hides rows, so dragging while filtered would reorder against a
  // sequence the poet cannot see. Reordering is switched off instead.
  const rows = useMemo(() => {
    if (!needle) return allRows;
    return allRows.filter((item) => {
      const haystack = isPoem(item)
        ? item.title + '\n' + item.body
        : isIllustration(item)
          ? item.title + '\n' + item.caption
          : item.title;
      return haystack.toLowerCase().includes(needle);
    });
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

  const addIllustration = () => {
    const newId = id('plate');
    update((draft) => {
      draft.contents.push({
        kind: 'illustration',
        id: newId,
        title: '',
        caption: '',
        assetId: '',
        naturalWidth: 0,
        naturalHeight: 0,
        fit: 'contain',
        startsRecto: false,
        facingBlank: false,
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
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-col gap-3">
        {/* Equal weight, deliberately: a plate is as ordinary a thing to add to
            a collection as a poem is. */}
        <div className="grid grid-cols-3 gap-2.5">
          <AddButton onClick={addPoem} glyph="¶" label="Poem" title="Add a poem" />
          <AddButton onClick={addSection} glyph="§" label="Part" title="Add a part" />
          <AddButton
            onClick={addIllustration}
            glyph="▣"
            label="Illustration"
            title="Add a full-page illustration"
          />
        </div>
        <button
          type="button"
          onClick={() => setImporting(true)}
          className="w-full rounded-2xl border border-dashed border-ink-300 py-4 text-[15px] font-[550] text-ink-700 transition-colors hover:border-accent-500 hover:text-accent-500"
        >
          Import from .docx, .txt or .md
        </button>
        {poemCount > 4 && (
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-ink-500"
            >
              ⌕
            </span>
            <TextInput
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search titles and lines"
              aria-label="Search poems"
              className="pl-11 pr-10"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded px-1 text-ink-500 hover:text-ink-900"
              >
                ✕
              </button>
            )}
          </div>
        )}
        <p className="text-[14px] text-ink-500">
          {poemCount} poem{poemCount === 1 ? '' : 's'}
          {plateCount > 0 && `, ${plateCount} plate${plateCount === 1 ? '' : 's'}`}
          {partCount > 0 && `, ${partCount} part${partCount === 1 ? '' : 's'}`}
          {warnings.size > 0 && (
            <span className="text-accent-600"> · {warnings.size} to check</span>
          )}
        </p>
      </header>

      {sampleCount > 0 && (
        <div className="space-y-3 rounded-2xl bg-ink-100 px-4 py-4 text-[14.5px] text-ink-700">
          <p>
            {sampleCount} placeholder verse{sampleCount === 1 ? '' : 's'} loaded, to exercise the
            layout.
          </p>
          <div className="flex gap-2">
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

      <div className="-mx-2">
        {needle && (
          <p className="px-3 pb-2 text-[14px] text-ink-500">
            {rows.length} match{rows.length === 1 ? '' : 'es'} · reordering is off while filtered
          </p>
        )}
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[15px] text-ink-500">
            {needle ? (
              <>Nothing matches “{filter}”.</>
            ) : (
              <>
                No poems yet. Use <strong className="text-ink-700">Import</strong> to paste or
                upload a manuscript, or add one by hand.
              </>
            )}
          </p>
        ) : needle ? (
          rows.map((item) =>
            isSection(item) ? null : (
              <ItemRow
                key={item.id}
                item={item}
                warnings={warnings.get(item.id) ?? 0}
                selected={item.id === selectedPoemId}
                onSelect={() => select(item.id)}
                draggable={false}
              />
            ),
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
                  <ItemRow
                    key={item.id}
                    item={item}
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

/** A big, plainly-labelled way to add one of the three things a book is made of. */
function AddButton({
  onClick,
  glyph,
  label,
  title,
}: {
  onClick: () => void;
  glyph: string;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="grid justify-items-center gap-2 rounded-2xl border border-ink-300 bg-paper px-1 pb-3 pt-4 text-[14.5px] font-[570] transition-colors hover:border-accent-500 hover:bg-accent-50 hover:text-accent-500"
    >
      <span aria-hidden className="text-[22px] leading-none">
        {glyph}
      </span>
      {label}
    </button>
  );
}

function DragHandle({ listeners, attributes }: { listeners?: object; attributes?: object }) {
  return (
    <span
      {...attributes}
      {...listeners}
      className="cursor-grab touch-none px-1 text-ink-400 transition-colors hover:text-ink-700 active:cursor-grabbing"
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

/**
 * What kind of thing a row is, at a glance.
 *
 * The icon is not decoration: a plate with a name reads exactly like a poem
 * with a name in a list of titles, and knowing which is which is the whole
 * question when deciding what to do with it.
 */
function KindMark({ item }: { item: Poem | Illustration }) {
  const plate = isIllustration(item);
  return (
    <span
      aria-hidden
      title={plate ? 'Illustration page' : 'Poem'}
      className={cx(
        'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[15px] leading-none',
        plate ? 'bg-emerald-50 text-emerald-800' : 'bg-sky-50 text-sky-800',
      )}
    >
      {plate ? '▣' : '¶'}
    </span>
  );
}

function ItemRow({
  item,
  selected,
  warnings,
  onSelect,
  draggable = true,
}: {
  item: Poem | Illustration;
  selected: boolean;
  warnings: number;
  onSelect: () => void;
  draggable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !draggable,
  });
  const plate = isIllustration(item);
  const lines = plate ? 0 : countLines(item.body);

  return (
    <div
      ref={setNodeRef}
      style={draggable ? { transform: CSS.Transform.toString(transform), transition } : undefined}
      className={cx(
        'group flex items-center gap-1.5 rounded-xl px-1',
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
          'min-w-0 flex-1 rounded-xl px-2.5 py-3 text-left transition-colors',
          selected ? 'bg-accent-50 text-ink-900 ring-1 ring-accent-200' : 'hover:bg-ink-50',
        )}
      >
        <span className="flex items-center gap-3">
          <KindMark item={item} />
          <span className="min-w-0 flex-1 truncate text-[16px] font-[550]">
            {item.title || (
              <em className="text-ink-500">{plate ? 'Untitled plate' : 'Untitled'}</em>
            )}
          </span>
          {warnings > 0 && (
            <span
              aria-hidden
              title={`${warnings} line${warnings === 1 ? '' : 's'} to check`}
              className="shrink-0 text-[13px] leading-none text-amber-700"
            >
              •
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate pl-[44px] text-[13.5px] text-ink-500">
          {plate
            ? item.assetId
              ? `Illustration · ${item.naturalWidth} × ${item.naturalHeight}px`
              : 'Illustration · no picture yet'
            : lines
              ? `${lines} line${lines === 1 ? '' : 's'}`
              : 'empty'}
          {!plate && item.sampleKey ? ' · placeholder' : ''}
          {warnings > 0 && (
            <span className="text-amber-700">
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
        className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2.5 py-2 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-500 hover:border-ink-300 focus:border-accent-500 focus:outline-none"
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
        className="rounded px-1.5 py-1 text-ink-400 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
