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
import { restrictToParentElement } from '@dnd-kit/modifiers';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useState } from 'react';
import { getAssetUrl } from '@/lib/assets';
import { useColoring } from '@/lib/coloring/store';
import { pictureAssetId, usesLineArt } from '@/lib/coloring/picture';
import { pageQuality } from '@/lib/coloring/quality';
import type { ColoringBook, ColoringPage } from '@/lib/types';
import { cx } from '../ui';
import { pageName } from '@/lib/home/naming';

const ACCEPT = 'image/png,image/jpeg,image/webp';

/** What a picture has to be to come in, said once. */
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * The pictures, in the order they will be bound.
 *
 * Dragging a thumbnail is the whole of reordering, because the order of this
 * grid is the order of the book — there is no separate running order to keep in
 * step with it.
 */
export function PageGrid() {
  const book = useColoring((s) => s.book);
  const selectedId = useColoring((s) => s.selectedId);
  const select = useColoring((s) => s.select);
  const reorder = useColoring((s) => s.reorder);
  const addFiles = useColoring((s) => s.addFiles);
  const busy = useColoring((s) => s.busy);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!book) return null;

  const take = async (list: FileList | File[] | null) => {
    if (!list) return;
    const files = Array.from(list);
    const usable = files.filter((f) => ACCEPTED_TYPES.includes(f.type));
    const refused = files.filter((f) => !ACCEPTED_TYPES.includes(f.type));
    setRejected(refused.map((f) => f.name));
    if (usable.length) await addFiles(usable);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over: target } = event;
    if (target && active.id !== target.id) reorder(String(active.id), String(target.id));
  };


  return (
    <div className="flex flex-col gap-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files);
        }}
        className={cx(
          'block cursor-pointer rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors',
          over
            ? 'border-accent-500 bg-accent-50'
            : 'border-ink-300 hover:border-accent-500 hover:bg-accent-50',
        )}
      >
        <strong className="block text-[17px] font-semibold">
          {/* An activity book's pages are puzzles and drawings, not paintings. */}
          {book && !usesLineArt(book) ? 'Drop your pages here' : 'Drop your paintings here'}
        </strong>
        <span className="mt-1 block text-[14.5px] text-ink-500">
          JPG, PNG or WebP · they never leave this computer
        </span>
        <input
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => void take(e.target.files)}
        />
      </label>

      {rejected.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-[14.5px] text-amber-900">
          {rejected.length === 1 ? `${rejected[0]} was` : `${rejected.length} files were`} left out.
          Only JPG, PNG and WebP come in. If those are iPhone HEIC pictures, open them in Preview
          and choose <em>File → Export</em> as JPEG — or set the camera to “Most Compatible” so it
          shoots JPG in the first place.
        </p>
      )}

      {book.pages.length === 0 ? (
        <p className="px-2 py-6 text-center text-[15px] text-ink-500">
          Nothing yet. Each picture you add becomes one page to colour in.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToParentElement]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={book.pages.map((p) => p.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-3">
              {book.pages.map((page, index) => (
                <Thumb
                  key={page.id}
                  page={page}
                  index={index}
                  selected={page.id === selectedId}
                  busy={busy.has(page.id)}
                  book={book}
                  onSelect={() => select(page.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function Thumb({
  page,
  index,
  selected,
  busy,
  book,
  onSelect,
}: {
  page: ColoringPage;
  index: number;
  selected: boolean;
  busy: boolean;
  book: ColoringBook;
  onSelect: () => void;
}) {
  const removePage = useColoring((s) => s.removePage);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });
  const [url, setUrl] = useState<string | null>(null);
  const lineArt = usesLineArt(book);
  const shown = pictureAssetId(book, page) ?? page.sourceAssetId;

  useEffect(() => {
    let live = true;
    void getAssetUrl(shown).then((next) => live && setUrl(next));
    return () => {
      live = false;
    };
  }, [shown]);

  const { dpi, soft, stretched } = pageQuality(page, book);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx('group relative', isDragging && 'z-10 opacity-90')}
    >
      <button
        type="button"
        onClick={onSelect}
        {...attributes}
        {...listeners}
        className={cx(
          'block w-full overflow-hidden rounded-xl border-2 bg-paper text-left transition-colors',
          selected ? 'border-accent-500' : 'border-ink-200 hover:border-ink-300',
        )}
      >
        <span className="relative block h-28 bg-ink-100">
          {url && <img src={url} alt="" className="h-28 w-full object-contain" draggable={false} />}
          {lineArt && busy && (
            <span className="absolute inset-0 grid place-items-center bg-paper/75 text-[13px] font-[550] text-ink-700">
              Converting…
            </span>
          )}
          <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink-900/80 text-[12px] font-semibold tabular-nums text-paper">
            {index + 1}
          </span>
        </span>
        <span className="block px-3 py-2.5">
          <span className="block truncate text-[14px] font-[550]">{pageName(page, 0)}</span>
          <span
            className={cx(
              'mt-1.5 inline-block rounded-full px-2.5 py-1 text-[12px] font-semibold',
              soft || stretched ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800',
            )}
            title={`${page.naturalWidth} × ${page.naturalHeight} pixels`}
          >
            {Math.round(dpi)} dpi
          </span>
          {page.rotate === 90 && (
            <span
              className="ml-1.5 inline-block rounded-full bg-ink-100 px-2.5 py-1 text-[12px] font-semibold text-ink-500"
              title="Turned a quarter turn to suit the page"
            >
              turned
            </span>
          )}
          {page.fit === 'cover' && (
            <span
              className="ml-1.5 inline-block rounded-full bg-ink-100 px-2.5 py-1 text-[12px] font-semibold text-ink-500"
              title="Fills the page; the overhang is trimmed off"
            >
              cropped
            </span>
          )}
          {lineArt && page.source === 'lineart' && (
            <span
              className="ml-1.5 inline-block rounded-full bg-ink-100 px-2.5 py-1 text-[12px] font-semibold text-ink-500"
              title={
                page.sourceGuessed
                  ? 'Worked out from the picture — open it to change this'
                  : 'You set this'
              }
            >
              line art{page.upscaled > 1.01 ? ` ×${page.upscaled.toFixed(1)}` : ''}
            </span>
          )}
          {lineArt && !page.lineArtAssetId && (
            <span className="ml-1.5 inline-block rounded-full bg-ink-100 px-2.5 py-1 text-[12px] font-semibold text-ink-500">
              not converted
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={() => removePage(page.id)}
        title="Remove this picture"
        aria-label={`Remove ${page.title || 'this picture'}`}
        className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-ink-900/80 text-paper opacity-0 transition-opacity hover:bg-red-700 group-hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
