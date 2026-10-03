'use client';

import { COLORING_TRIM_IDS, MIN_PAGES, PAPER_LABELS, getTrim } from '@/lib/kdp';
import { useColoring } from '@/lib/coloring/store';
import { validateColoringBook } from '@/lib/coloring/validate';
import { frontMatterPages } from '@/lib/render/coloringLayout';
import type { PaperType } from '@/lib/types';
import { MatterPage } from './MatterPage';
import { Field, Notice, Select, TextInput, Toggle } from '../ui';
import { newColouringBookTitle } from '@/lib/home/naming';

/**
 * How the book is put together: what size it prints at, what goes in the front,
 * and whether every picture gets a blank back.
 *
 * The warnings live here rather than at export because that is far too late to
 * be told a book is nineteen pages long.
 */
export function AssemblyPanel({ pageCount }: { pageCount: number }) {
  const book = useColoring((s) => s.book);
  const update = useColoring((s) => s.update);
  const setBookSetting = useColoring((s) => s.setBookSetting);
  if (!book) return null;

  const issues = validateColoringBook(book, pageCount);
  const trim = getTrim(book.trim.trimId);
  const front = frontMatterPages(book);
  const backs = book.coloring.singleSided ? book.pages.length : 0;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <h3 className="text-[17px] font-semibold">The book</h3>
        <div className="mt-3 flex flex-col gap-3.5">
          <Field label="Title">
            <TextInput
              value={book.meta.title}
              onChange={(e) =>
                update((draft) => {
                  draft.meta.title = e.target.value;
                  draft.name = e.target.value || newColouringBookTitle();
                })
              }
            />
          </Field>
          <Field label="Subtitle">
            <TextInput
              value={book.meta.subtitle}
              onChange={(e) => update((draft) => void (draft.meta.subtitle = e.target.value))}
            />
          </Field>
          <Field label="Author">
            <TextInput
              value={book.meta.author}
              onChange={(e) => update((draft) => void (draft.meta.author = e.target.value))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Year">
              <TextInput
                value={book.meta.year}
                onChange={(e) => update((draft) => void (draft.meta.year = e.target.value))}
              />
            </Field>
            <Field label="ISBN (optional)" hint="Leave blank to use KDP's free one.">
              <TextInput
                value={book.meta.isbn}
                onChange={(e) => update((draft) => void (draft.meta.isbn = e.target.value))}
              />
            </Field>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-[17px] font-semibold">Paper</h3>
        <div className="mt-3 flex flex-col gap-3.5">
          <Field label="Size" hint={`${trim.width}″ × ${trim.height}″ when trimmed`}>
            <Select
              value={book.trim.trimId}
              onChange={(value) => update((draft) => void (draft.trim.trimId = value))}
              options={COLORING_TRIM_IDS.map((tid) => ({
                value: tid,
                label: getTrim(tid).label,
              }))}
            />
          </Field>
          <Field label="Paper" hint="Decides the spine width as well as the feel.">
            <Select
              value={book.trim.paper}
              onChange={(value) =>
                update((draft) => void (draft.trim.paper = value as PaperType))
              }
              options={(Object.keys(PAPER_LABELS) as PaperType[]).map((p) => ({
                value: p,
                label: PAPER_LABELS[p],
              }))}
            />
          </Field>
          <Toggle
            label="Let pictures run off the edge"
            hint="Bleed. Needed for any picture set to fill the page; KDP trims it off."
            checked={book.trim.bleed}
            onChange={(value) => update((draft) => void (draft.trim.bleed = value))}
          />
          <Toggle
            label="A blank page behind every picture"
            hint="Single-sided, so a marker that soaks through spoils nothing."
            checked={book.coloring.singleSided}
            onChange={(value) => setBookSetting('singleSided', value)}
          />
        </div>
      </section>

      <section>
        <h3 className="text-[17px] font-semibold">Front of the book</h3>
        <p className="mt-1 text-[14px] text-ink-500">
          Four pages, each optional. Three of them can be a drawing of your own instead of the
          built-in design — it goes through the same cleanup as a coloring page.
        </p>
        <div className="mt-3 flex flex-col gap-5">
          <MatterPage
            slot="title"
            label="Title page"
            hint="The title, the subtitle and your name."
            on={book.coloring.titlePage}
            onToggle={(value) => setBookSetting('titlePage', value)}
          />
          <Toggle
            label="Copyright page"
            hint="The year, the notice, and the ISBN if you have one."
            checked={book.coloring.copyrightPage}
            onChange={(value) => setBookSetting('copyrightPage', value)}
          />
          <MatterPage
            slot="belongs"
            label="“This book belongs to”"
            hint="A line for a name."
            on={book.coloring.belongsToPage}
            onToggle={(value) => setBookSetting('belongsToPage', value)}
          />
          <MatterPage
            slot="colorTest"
            label="Pen test page"
            hint="Empty boxes for trying a pen before it soaks through a picture."
            on={book.coloring.colorTestPage}
            onToggle={(value) => setBookSetting('colorTestPage', value)}
          />
        </div>
      </section>

      <section>
        <h3 className="text-[17px] font-semibold">How it adds up</h3>
        <dl className="mt-3 divide-y divide-ink-200 text-[14.5px]">
          <Row label="Front of the book" value={`${front} page${front === 1 ? '' : 's'}`} />
          <Row label="Pictures" value={`${book.pages.length}`} />
          <Row label="Blank backs" value={backs ? `${backs}` : 'none'} />
          <Row
            label="Printed length"
            value={pageCount ? `${pageCount} pages` : 'counting…'}
            strong
          />
        </dl>
        {pageCount > 0 && pageCount < MIN_PAGES && (
          <p className="mt-3 text-[14px] text-ink-500">
            {MIN_PAGES - pageCount} more page{MIN_PAGES - pageCount === 1 ? '' : 's'} to reach
            KDP&rsquo;s minimum. Another {Math.ceil((MIN_PAGES - pageCount) / (backs ? 2 : 1))}{' '}
            picture{Math.ceil((MIN_PAGES - pageCount) / (backs ? 2 : 1)) === 1 ? '' : 's'} would do
            it.
          </p>
        )}
      </section>

      {issues.length > 0 && (
        <section>
          <h3 className="text-[17px] font-semibold">Before you publish</h3>
          <div className="mt-3 flex flex-col gap-2.5">
            {issues.map((issue) => (
              <Notice key={issue.id} level={issue.level}>
                <strong className="font-[570]">{issue.message}</strong>
                {issue.fix && <span className="mt-0.5 block opacity-80">{issue.fix}</span>}
              </Notice>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-ink-500">{label}</dt>
      <dd className={strong ? 'font-[570] tabular-nums' : 'tabular-nums'}>{value}</dd>
    </div>
  );
}
