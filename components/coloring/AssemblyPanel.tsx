'use client';

import { COLORING_TRIM_IDS, PAPER_LABELS, getTrim } from '@/lib/kdp';
import { useColoring } from '@/lib/coloring/store';
import type { PaperType } from '@/lib/types';
import { MatterPage } from './MatterPage';
import { Select, TextInput, Toggle } from '../ui';
import { PanelField as Field, PanelSection } from '../panel/Panel';
import { newColouringBookTitle } from '@/lib/home/naming';

/**
 * The book's details: its name, what size it prints at, and what goes in the
 * front. Under the pictures, and shut: these are set once, near the start, and
 * the pictures are what somebody came to work on.
 *
 * What used to follow — the page arithmetic and the warnings — is at Export,
 * which already lists the same checks, so there is one place to read them.
 */
export function AssemblyPanel() {
  const book = useColoring((s) => s.book);
  const update = useColoring((s) => s.update);
  const setBookSetting = useColoring((s) => s.setBookSetting);
  if (!book) return null;

  const trim = getTrim(book.trim.trimId);
  const matter = [
    book.coloring.titlePage,
    book.coloring.copyrightPage,
    book.coloring.belongsToPage,
    book.coloring.colorTestPage,
  ].filter(Boolean).length;

  return (
    <div>
      <PanelSection title="Book details" collapsible now={book.meta.title}>
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
      </PanelSection>

      <PanelSection title="Paper" collapsible now={`${trim.width}″ × ${trim.height}″`}>
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
      </PanelSection>

      <PanelSection
        title="Front of the book"
        collapsible
        now={`${matter} of 4 pages`}
        note="Four pages, each optional. Three can be a drawing of your own, through the same cleanup as a colouring page."
      >
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
      </PanelSection>
    </div>
  );
}

