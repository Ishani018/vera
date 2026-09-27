'use client';

import { useMemo, useRef, useState } from 'react';
import { isPoem, moveToSection, sectionOfItem, sectionsOf } from '@/lib/contents';
import { repairStats } from '@/lib/repair';
import { parseStanzas } from '@/lib/render/text';
import { useStore } from '@/lib/store';
import type { Align, Poem } from '@/lib/types';
import { Modal } from './Modal';
import { RepairView } from './RepairView';
import { Button, Field, Select, TextArea, TextInput, cx } from './ui';

type Tab = 'text' | 'repair';

export function PoemEditor() {
  const project = useStore((s) => s.project);
  const selectedPoemId = useStore((s) => s.selectedPoemId);
  const select = useStore((s) => s.select);
  const update = useStore((s) => s.update);
  const [tab, setTab] = useState<Tab>('text');
  const [confirmConvert, setConfirmConvert] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const poem = project?.contents.find(
    (item): item is Poem => isPoem(item) && item.id === selectedPoemId,
  );
  const parts = project ? sectionsOf(project) : [];
  const partId = project && poem ? (sectionOfItem(project, poem.id)?.id ?? '') : '';
  const stats = useMemo(() => (poem ? repairStats(poem.body) : null), [poem]);

  if (!project || !poem) return null;

  const edit = (patch: Partial<Poem>) =>
    update((draft) => {
      const found = draft.contents.find((item) => item.id === poem.id);
      if (found) Object.assign(found, patch);
    });

  const remove = () => {
    update(
      (draft) => {
        draft.contents = draft.contents.filter((item) => item.id !== poem.id);
      },
      { discrete: true },
    );
    select(null);
  };

  /**
   * Wraps the selection in the body field. Emphasis is markup inside the plain
   * text rather than a styled editor, so this is what a toolbar button does:
   * put the asterisks in, and put the cursor back where it was.
   */
  const wrapSelection = (marker: string) => {
    const field = bodyRef.current;
    if (!field) return;
    const { selectionStart: start, selectionEnd: end, value } = field;
    if (start === end) return;
    const selected = value.slice(start, end);

    // Clicking again on already-wrapped text takes the markup off.
    const already =
      value.slice(start - marker.length, start) === marker &&
      value.slice(end, end + marker.length) === marker;

    const next = already
      ? value.slice(0, start - marker.length) + selected + value.slice(end + marker.length)
      : value.slice(0, start) + marker + selected + marker + value.slice(end);

    edit({ body: next });
    requestAnimationFrame(() => {
      field.focus();
      const shift = already ? -marker.length : marker.length;
      field.setSelectionRange(start + shift, end + shift);
    });
  };

  /**
   * Becoming a plate keeps the page's place in the book but throws the verse
   * away, so a poem with text in it asks first.
   */
  const turnIntoIllustration = () => {
    if (poem.body.trim() && !confirmConvert) {
      setConfirmConvert(true);
      return;
    }
    update(
      (draft) => {
        const at = draft.contents.findIndex((item) => item.id === poem.id);
        if (at < 0) return;
        draft.contents[at] = {
          kind: 'illustration',
          id: poem.id,
          title: poem.title,
          caption: '',
          assetId: '',
          naturalWidth: 0,
          naturalHeight: 0,
          fit: 'contain',
          startsRecto: false,
          facingBlank: false,
        };
      },
      { discrete: true },
    );
    setConfirmConvert(false);
  };

  return (
    <Modal
      title={poem.title.trim() || 'Untitled poem'}
      onClose={() => select(null)}
      width="max-w-3xl"
      footer={
        <>
          {stats && (
            <span className="mr-auto text-[11px] tabular-nums text-ink-500">
              {stats.lines} lines · {stats.stanzas} stanza{stats.stanzas === 1 ? '' : 's'} ·
              longest line {stats.longestLine}
              {stats.longLines > 0 && (
                <span className="text-amber-300"> · {stats.longLines} over the measure</span>
              )}
            </span>
          )}
          {confirmConvert ? (
            <Button variant="danger" onClick={turnIntoIllustration}>
              Discard the verse and make it a plate
            </Button>
          ) : (
            <Button onClick={turnIntoIllustration} title="Keep its place, make it a picture">
              Turn into an illustration
            </Button>
          )}
          <Button variant="danger" onClick={remove}>
            Delete poem
          </Button>
          <Button variant="primary" onClick={() => select(null)}>
            Done
          </Button>
        </>
      }
    >
      <div className="mb-4 inline-flex rounded-md border border-ink-300 bg-ink-100 p-0.5">
        {(
          [
            ['text', 'Text'],
            ['repair', stats?.longLines ? `Line breaks (${stats.longLines})` : 'Line breaks'],
          ] as Array<[Tab, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cx(
              'rounded px-3 py-1 transition-colors',
              tab === value ? 'bg-ink-200 text-ink-900' : 'text-ink-500 hover:text-ink-900',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'repair' ? (
        <RepairView
          body={poem.body}
          onChange={(body) => edit({ body })}
          onBulkChange={(body) =>
            update(
              (draft) => {
                const found = draft.contents.find((item) => item.id === poem.id);
                if (isPoem(found!)) found.body = body;
              },
              { discrete: true },
            )
          }
        />
      ) : (
        <div className="space-y-4">
          <Field label="Title" hint="Leave empty for an untitled poem — it gets no heading, no running head and no contents entry.">
            <TextInput value={poem.title} onChange={(e) => edit({ title: e.target.value })} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Epigraph" hint="Set above the first stanza, in italic.">
              <TextInput value={poem.epigraph} onChange={(e) => edit({ epigraph: e.target.value })} />
            </Field>
            <Field label="Dedication" hint="Printed under the title.">
              <TextInput
                value={poem.dedication}
                onChange={(e) => edit({ dedication: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Alignment" hint="For shaped poems. Turns off the turnover indent.">
              <Select<Align | 'inherit'>
                value={poem.align ?? 'inherit'}
                onChange={(value) => edit({ align: value === 'inherit' ? undefined : value })}
                options={[
                  { value: 'inherit', label: 'Flush left (the book default)' },
                  { value: 'center', label: 'Centred' },
                  { value: 'right', label: 'Ranged right' },
                ]}
              />
            </Field>
            {parts.length > 0 && (
              <Field
                label="Part"
                hint="Moves the poem to the end of that part. Dragging it in the list does the same thing."
              >
                <Select
                  value={partId}
                  onChange={(value) =>
                    update(
                      (draft) => moveToSection(draft.contents, poem.id, value || null),
                      { discrete: true },
                    )
                  }
                  options={[
                    { value: '', label: 'Before the first part' },
                    ...parts.map((part) => ({ value: part.id, label: part.title })),
                  ]}
                />
              </Field>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex-1 text-[11px] font-medium uppercase tracking-wider text-ink-500">
                Body
              </span>
              <Button onClick={() => wrapSelection('*')} title="Italic (wraps the selection in *)">
                <em>I</em>
              </Button>
              <Button onClick={() => wrapSelection('**')} title="Bold (wraps the selection in **)">
                <strong>B</strong>
              </Button>
            </div>
            <TextArea
              ref={bodyRef}
              value={poem.body}
              onChange={(e) => edit({ body: e.target.value })}
              rows={18}
              spellCheck={false}
              className="font-mono text-[12.5px] leading-6"
            />
            <p className="mt-1 text-[11px] text-ink-500">
              Every line break here is a line break in the book. Blank lines separate stanzas;
              leading spaces are kept. Select text and use I or B for emphasis — or type{' '}
              <code className="text-ink-700">*italic*</code> and{' '}
              <code className="text-ink-700">**bold**</code> directly. A literal asterisk is{' '}
              <code className="text-ink-700">\*</code>.
            </p>
          </div>

          {stats && stats.longLines > 0 && (
            <p className="text-[11px] text-amber-300">
              {stats.longLines} line{stats.longLines === 1 ? '' : 's'} longer than the measure.
              The <strong>Line breaks</strong> tab can split them.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Kept for the poem list's line count, which does not need the full stats. */
export const countStanzas = (body: string) => parseStanzas(body).length;
