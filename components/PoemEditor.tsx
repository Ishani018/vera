'use client';

import { useMemo } from 'react';
import { countLines, parseStanzas } from '@/lib/render/text';
import { useStore } from '@/lib/store';
import { Modal } from './Modal';
import { Button, Field, Select, TextArea, TextInput } from './ui';

export function PoemEditor() {
  const project = useStore((s) => s.project);
  const selectedPoemId = useStore((s) => s.selectedPoemId);
  const select = useStore((s) => s.select);
  const update = useStore((s) => s.update);

  const poem = project?.poems.find((p) => p.id === selectedPoemId);

  const stats = useMemo(() => {
    if (!poem) return null;
    const stanzas = parseStanzas(poem.body);
    const lines = countLines(poem.body);
    const longest = stanzas.reduce(
      (max, s) => Math.max(max, ...s.lines.map((l) => l.length)),
      0,
    );
    return { stanzas: stanzas.length, lines, longest };
  }, [poem]);

  if (!project || !poem) return null;

  const edit = (patch: Partial<typeof poem>) =>
    update((draft) => {
      const found = draft.poems.find((p) => p.id === poem.id);
      if (found) Object.assign(found, patch);
    });

  const remove = () => {
    update((draft) => {
      draft.poems = draft.poems.filter((p) => p.id !== poem.id).map((p, i) => ({ ...p, order: i }));
    });
    select(null);
  };

  return (
    <Modal
      title="Edit poem"
      onClose={() => select(null)}
      width="max-w-3xl"
      footer={
        <>
          {stats && (
            <span className="mr-auto text-[11px] tabular-nums text-ink-400">
              {stats.lines} lines · {stats.stanzas} stanza{stats.stanzas === 1 ? '' : 's'} · longest
              line {stats.longest} characters
            </span>
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
      <div className="space-y-4">
        <Field label="Title">
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

        {project.sections.length > 0 && (
          <Field label="Part">
            <Select
              value={poem.sectionId ?? ''}
              onChange={(value) => edit({ sectionId: value || null })}
              options={[
                { value: '', label: 'No part' },
                ...project.sections.map((s) => ({ value: s.id, label: s.title })),
              ]}
            />
          </Field>
        )}

        <Field
          label="Body"
          hint="Every line break here is a line break in the book. Blank lines separate stanzas; leading spaces are kept."
        >
          <TextArea
            value={poem.body}
            onChange={(e) => edit({ body: e.target.value })}
            rows={20}
            spellCheck={false}
            /* Monospace while editing so indentation is countable, even though
               the book is set in a serif. */
            className="font-mono text-[12.5px] leading-6"
          />
        </Field>
      </div>
    </Modal>
  );
}
