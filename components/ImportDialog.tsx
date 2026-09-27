'use client';

import { useMemo, useState } from 'react';
import { insertIntoSection, sectionsOf } from '@/lib/contents';
import {
  DEFAULT_IMPORT_OPTIONS,
  poemsFromFile,
  readFileAsText,
  splitIntoPoems,
  toPoems,
  type ImportOptions,
  type NamedSource,
  type ParsedPoem,
} from '@/lib/import';
import { useStore } from '@/lib/store';
import { Modal } from './Modal';
import { Button, Field, NumberInput, Notice, Select, TextArea, TextInput, Toggle } from './ui';

type Source = NamedSource & { poems: ParsedPoem[] };

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const update = useStore((s) => s.update);

  const [files, setFiles] = useState<NamedSource[]>([]);
  const [text, setText] = useState('');
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_IMPORT_OPTIONS);
  const [sectionId, setSectionId] = useState<string>('');
  const parts = project ? sectionsOf(project) : [];
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Files are parsed one at a time so each keeps its own name. That name is
   * what tells the parser whether a document's first line is the title or the
   * first line of the poem — concatenating the files first would throw it away.
   */
  const fromFiles: Source[] = useMemo(
    () => files.map((file) => ({ ...file, poems: poemsFromFile(file, options) })),
    [files, options],
  );

  const fromPaste = useMemo(
    () => (text.trim() ? splitIntoPoems(text, options) : []),
    [text, options],
  );

  const parsed = useMemo(
    () => [...fromFiles.flatMap((s) => s.poems), ...fromPaste],
    [fromFiles, fromPaste],
  );

  const set = <K extends keyof ImportOptions>(key: K, value: ImportOptions[K]) =>
    setOptions((previous) => ({ ...previous, [key]: value }));

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setFileError(null);
    const added: NamedSource[] = [];
    const failed: string[] = [];
    for (const file of Array.from(list)) {
      try {
        added.push({ name: file.name, text: await readFileAsText(file) });
      } catch (error) {
        failed.push(`${file.name}: ${error instanceof Error ? error.message : 'unreadable'}`);
      }
    }
    setFiles((current) => [...current, ...added]);
    if (failed.length) setFileError(failed.join('\n'));
    setBusy(false);
  };

  const doImport = () => {
    if (!parsed.length) return;
    update(
      (draft) => {
        insertIntoSection(draft.contents, toPoems(parsed), sectionId || null);
      },
      { discrete: true },
    );
    onClose();
  };

  const untitled = parsed.filter((p) => !p.title.trim()).length;

  return (
    <Modal
      title="Import poems"
      onClose={onClose}
      width="max-w-4xl"
      footer={
        <>
          <span className="mr-auto text-[11px] text-ink-500">
            {parsed.length
              ? `${parsed.length} poem${parsed.length === 1 ? '' : 's'} detected` +
                (untitled ? ` · ${untitled} untitled` : '')
              : 'Choose files or paste text to see a preview'}
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
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-md border border-ink-300 bg-ink-100 px-2.5 py-1.5 transition-colors hover:bg-ink-200">
              Choose files…
              <input
                type="file"
                multiple
                accept=".txt,.md,.markdown,.docx"
                className="hidden"
                onChange={(e) => {
                  void onFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            <span className="text-[11px] text-ink-500">
              .txt, .md or .docx — one poem per file keeps its filename as the title
            </span>
            {busy && <span className="text-[11px] text-ink-500">Reading…</span>}
            {files.length > 0 && (
              <Button variant="ghost" className="ml-auto" onClick={() => setFiles([])}>
                Clear files
              </Button>
            )}
          </div>

          {fileError && <Notice level="error">{fileError}</Notice>}

          {fromFiles.length > 0 && (
            <div className="rounded-md border border-ink-300 bg-ink-50">
              <p className="border-b border-ink-200 px-3 py-2 text-[11px] uppercase tracking-wider text-ink-500">
                {fromFiles.length} file{fromFiles.length === 1 ? '' : 's'}
              </p>
              <ul className="max-h-64 overflow-y-auto px-3 py-2">
                {fromFiles.map((source) => (
                  <li key={source.name} className="flex items-baseline gap-2 py-0.5">
                    <span className="min-w-0 flex-[2] truncate text-ink-500" title={source.name}>
                      {source.name}
                    </span>
                    <span className="min-w-0 flex-[3] truncate">
                      {source.poems.length === 1 ? (
                        source.poems[0].title || <em className="text-amber-300">untitled</em>
                      ) : (
                        <span className="text-ink-700">{source.poems.length} poems</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-ink-500">
                      {source.poems.reduce(
                        (n, p) => n + p.body.split('\n').filter((l) => l.trim()).length,
                        0,
                      )}{' '}
                      lines
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={files.length ? 6 : 14}
            spellCheck={false}
            placeholder={'…or paste a manuscript here.\n\nLine breaks and blank lines are kept exactly as they are.'}
            className="font-mono text-[12px]"
          />

          {fromPaste.length > 0 && (
            <div className="rounded-md border border-ink-300 bg-ink-50">
              <p className="border-b border-ink-200 px-3 py-2 text-[11px] uppercase tracking-wider text-ink-500">
                From pasted text
              </p>
              <ul className="max-h-40 overflow-y-auto px-3 py-2">
                {fromPaste.map((poem, i) => (
                  <li key={i} className="flex gap-2 py-0.5">
                    <span className="w-6 shrink-0 tabular-nums text-ink-400">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {poem.title || <em className="text-amber-300">untitled</em>}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-500">
                      {poem.body.split('\n').filter((l) => l.trim()).length} lines
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Field label="Split poems on" hint="Applies within each file, and to pasted text.">
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
            label="Pasted text: first line is the title"
            checked={options.firstLineIsTitle}
            onChange={(v) => set('firstLineIsTitle', v)}
          />

          {parts.length > 0 && (
            <Field label="Add to part">
              <Select
                value={sectionId}
                onChange={setSectionId}
                options={[
                  { value: '', label: 'No part' },
                  ...parts.map((part) => ({ value: part.id, label: part.title })),
                ]}
              />
            </Field>
          )}

          <Notice level="info">
            A file&rsquo;s name is its poem&rsquo;s title. The first line of the document is only
            taken as a title when it says the same thing as the filename — otherwise it stays part
            of the poem.
          </Notice>

          {untitled > 0 && (
            <Notice level="warning">
              {untitled} poem{untitled === 1 ? '' : 's'} will come in untitled. You can name{' '}
              {untitled === 1 ? 'it' : 'them'} in the poem editor.
            </Notice>
          )}
        </div>
      </div>
    </Modal>
  );
}
