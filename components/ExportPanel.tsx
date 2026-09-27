'use client';

import { useMemo, useRef, useState } from 'react';
import {
  exportCoverPdf,
  exportInteriorPdf,
  exportProjectJson,
  importProjectJson,
  printCover,
  printInterior,
} from '@/lib/exportClient';
import { padToEven } from '@/lib/kdp';
import { useStore } from '@/lib/store';
import { countByLevel, validateProject } from '@/lib/validate';
import { Button, Notice } from './ui';

type Status = { level: 'ok' | 'error' | 'info'; text: string } | null;

export function ExportPanel() {
  const project = useStore((s) => s.project);
  const pageCount = useStore((s) => s.pageCount);
  const replaceProject = useStore((s) => s.replaceProject);
  const [busy, setBusy] = useState<'interior' | 'cover' | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [printFallback, setPrintFallback] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const issues = useMemo(
    () => (project ? validateProject(project, pageCount) : []),
    [project, pageCount],
  );
  const counts = countByLevel(issues);

  if (!project) return null;

  const finalPages = padToEven(pageCount || 0);
  const padded = finalPages - pageCount;

  const run = async (which: 'interior' | 'cover') => {
    setBusy(which);
    setStatus(null);
    try {
      const outcome =
        which === 'interior'
          ? await exportInteriorPdf(project)
          : await exportCoverPdf(project, finalPages);
      if (outcome.needsPrintFallback) setPrintFallback(true);
      setStatus({ level: outcome.ok ? 'ok' : 'error', text: outcome.message });
    } catch (error) {
      setStatus({
        level: 'error',
        text: error instanceof Error ? error.message : 'Export failed.',
      });
    } finally {
      setBusy(null);
    }
  };

  const print = async (which: 'interior' | 'cover') => {
    try {
      if (which === 'interior') printInterior(project, padded);
      else await printCover(project, finalPages);
      setStatus({
        level: 'info',
        text: 'Opened a print window. Choose “Save as PDF”, set margins to None and turn background graphics on.',
      });
    } catch (error) {
      setStatus({
        level: 'error',
        text: error instanceof Error ? error.message : 'Could not open the print window.',
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-ink-200 bg-ink-50 p-2.5">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          Before you upload
        </h4>
        {issues.length === 0 ? (
          <Notice level="ok">Nothing to flag. The book is ready for KDP.</Notice>
        ) : (
          <ul className="space-y-1.5">
            {issues.map((issue) => (
              <li key={issue.id} className="flex gap-2">
                <span
                  className={
                    issue.level === 'error'
                      ? 'text-red-400'
                      : issue.level === 'warning'
                        ? 'text-amber-400'
                        : 'text-ink-500'
                  }
                  aria-hidden
                >
                  ●
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ink-900">{issue.message}</span>
                  {issue.fix && <span className="block text-[11px] text-ink-500">{issue.fix}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {(counts.error > 0 || counts.warning > 0) && (
          <p className="mt-2 text-[11px] text-ink-500">
            {counts.error} to fix, {counts.warning} to consider. Exporting is never blocked.
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-ink-500">
        <dt>Interior pages</dt>
        <dd className="text-right tabular-nums text-ink-700">
          {pageCount || '—'}
          {padded > 0 && ` (+${padded} blank)`}
        </dd>
        <dt>Uploaded as</dt>
        <dd className="text-right tabular-nums text-ink-700">{finalPages || '—'} pages</dd>
      </dl>

      <div className="grid gap-2">
        <Button variant="primary" disabled={busy !== null} onClick={() => void run('interior')}>
          {busy === 'interior' ? 'Rendering…' : 'Export interior PDF'}
        </Button>
        <Button disabled={busy !== null} onClick={() => void run('cover')}>
          {busy === 'cover' ? 'Rendering…' : 'Export cover PDF'}
        </Button>
      </div>

      {status && (
        <Notice level={status.level === 'ok' ? 'ok' : status.level === 'error' ? 'error' : 'info'}>
          {status.text}
        </Notice>
      )}

      {printFallback && (
        <div className="space-y-2 rounded-md border border-ink-200 bg-ink-50 p-2.5">
          <p className="text-[11px] text-ink-500">
            No Chromium on the server. Print the same Paged.js output from this browser instead —
            the pagination and type are identical.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => void print('interior')}>Print interior</Button>
            <Button onClick={() => void print('cover')}>Print cover</Button>
          </div>
        </div>
      )}

      <div className="border-t border-ink-200 pt-3">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          Backup
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => void exportProjectJson(project)}>Save project</Button>
          <Button onClick={() => fileRef.current?.click()}>Load project</Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            try {
              await replaceProject(await importProjectJson(file));
              setStatus({ level: 'ok', text: 'Project loaded.' });
            } catch (error) {
              setStatus({
                level: 'error',
                text: error instanceof Error ? error.message : 'That file could not be read.',
              });
            }
          }}
        />
        <p className="mt-2 text-[11px] text-ink-500">
          Everything lives in this browser. Save a copy before clearing site data.
        </p>
      </div>
    </div>
  );
}
