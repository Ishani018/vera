'use client';

import { useMemo, useState } from 'react';
import {
  DEFAULT_IMPORT_OPTIONS,
  readFileAsText,
  splitIntoPoems,
  toPoems,
  type ImportOptions,
} from '@/lib/import';
import { useStore } from '@/lib/store';
import { Modal } from './Modal';
import { Button, Field, NumberInput, Notice, Select, TextArea, TextInput, Toggle } from './ui';

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const update = useStore((s) => s.update);

  const [text, setText] = useState('');
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_IMPORT_OPTIONS);
  const [sectionId, setSectionId] = useState<string>('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(
    () => (text.trim() ? splitIntoPoems(text, options) : []),
    [text, options],
  );

  const set = <K extends keyof ImportOptions>(key: K, value: ImportOptions[K]) =>
    setOptions((previous) => ({ ...previous, [key]: value }));

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setFileError(null);
    try {
      const parts: string[] = [];
      for (const file of Array.from(files)) {
        parts.push(await readFileAsText(file));
      }
      // Files are joined with the delimiter so each one stays a separate poem
      // even when the split mode is set to delimiter.
      setText((current) =>
        [current, ...parts].filter((p) => p.trim()).join(`\n\n${options.delimiter}\n\n`),
      );
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'That file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const doImport = () => {
    if (!parsed.length) return;
    update((draft) => {
      draft.poems.push(...toPoems(parsed, draft.poems.length, sectionId || null));
    });
    onClose();
  };

  return (
    <Modal
      title="Import poems"
      onClose={onClose}
      width="max-w-4xl"
      footer={
        <>
          <span className="mr-auto text-[11px] text-ink-400">
            {parsed.length
              ? `${parsed.length} poem${parsed.length === 1 ? '' : 's'} detected`
              : 'Paste text or choose files to see a preview'}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={doImport} disabled={!parsed.length}>
            Import {parsed.length || ''}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 transition-colors hover:bg-ink-700">
              Choose files…
              <input
                type="file"
                multiple
                accept=".txt,.md,.markdown,.docx"
                className="hidden"
                onChange={(e) => void onFiles(e.target.files)}
              />
            </label>
            <span className="text-[11px] text-ink-400">.txt, .md or .docx — or paste below</span>
            {busy && <span className="text-[11px] text-ink-400">Reading…</span>}
          </div>

          {fileError && <Notice level="error">{fileError}</Notice>}

          <TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            spellCheck={false}
            placeholder={`Paste the manuscript here.\n\nLine breaks and blank lines are kept exactly as they are.`}
            className="font-mono text-[12px]"
          />

          {parsed.length > 0 && (
            <div className="rounded-md border border-ink-700 bg-ink-850">
              <p className="border-b border-ink-800 px-3 py-2 text-[11px] uppercase tracking-wider text-ink-400">
                Preview
              </p>
              <ul className="max-h-44 overflow-y-auto px-3 py-2">
                {parsed.map((poem, i) => (
                  <li key={i} className="flex gap-2 py-0.5">
                    <span className="w-6 shrink-0 tabular-nums text-ink-600">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{poem.title}</span>
                    <span className="shrink-0 text-[11px] text-ink-400">
                      {poem.body.split('\n').filter((l) => l.trim()).length} lines
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Field label="Split poems on">
            <Select
              value={options.mode}
              onChange={(mode) => set('mode', mode)}
              options={[
                { value: 'delimiter', label: 'A delimiter line' },
                { value: 'blankLines', label: 'A run of blank lines' },
                { value: 'single', label: 'Nothing — one poem' },
              ]}
            />
          </Field>

          {options.mode === 'delimiter' && (
            <Field label="Delimiter" hint="A line containing only this separates poems.">
              <TextInput
                value={options.delimiter}
                onChange={(e) => set('delimiter', e.target.value)}
                spellCheck={false}
                className="font-mono"
              />
            </Field>
          )}

          {options.mode === 'blankLines' && (
            <Field label="Blank lines" hint="Fewer than this stays a stanza break.">
              <NumberInput
                value={options.blankLineCount}
                onChange={(v) => set('blankLineCount', Math.round(v))}
                min={2}
                max={10}
                step={1}
              />
            </Field>
          )}

          <Toggle
            label="First line is the title"
            checked={options.firstLineIsTitle}
            onChange={(v) => set('firstLineIsTitle', v)}
          />

          {project && project.sections.length > 0 && (
            <Field label="Add to part">
              <Select
                value={sectionId}
                onChange={setSectionId}
                options={[
                  { value: '', label: 'No part' },
                  ...project.sections.map((s) => ({ value: s.id, label: s.title })),
                ]}
              />
            </Field>
          )}

          <Notice level="info">
            Markdown headings become titles. Indentation, line breaks and stanza breaks are
            preserved exactly — nothing is re-wrapped.
          </Notice>
        </div>
      </div>
    </Modal>
  );
}
