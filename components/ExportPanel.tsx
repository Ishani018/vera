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
import { PanelSection } from './panel/Panel';
import { CARD, cardStyle } from './studio/Shell';
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

  const needsAttention = counts.error + counts.warning;

  return (
    <div>
      {/*
        The answer first. Four paragraphs of problems, every one of them in the
        same big type, buried the two buttons this screen is for; now the verdict
        is one line, the detail is a click away, and the files come next.
      */}
      <PanelSection title="Is it ready?">
        <div
          className="flex items-center gap-3 rounded-[10px] border px-3.5 py-3"
          style={{ borderColor: 'var(--studio-line)', background: 'var(--studio-page)' }}
        >
          <span
            aria-hidden="true"
            className={`size-3 shrink-0 rounded-full ${
              counts.error > 0 ? 'bg-red-500' : counts.warning > 0 ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-[600] leading-tight">
              {issues.length === 0
                ? 'Ready for KDP'
                : counts.error > 0
                  ? `${counts.error} to fix first`
                  : `${counts.warning} to consider`}
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: 'var(--color-ink-500)' }}>
              {issues.length === 0
                ? 'Nothing to flag.'
                : `${needsAttention > 0 ? `${needsAttention} to check` : 'Notes only'}. Exporting is never blocked.`}
            </span>
          </span>
        </div>

        {issues.length > 0 && (
          <details className="group">
            <summary
              className="cursor-pointer list-none text-[13px] font-[550] text-accent-600 underline-offset-2 hover:underline"
            >
              <span className="group-open:hidden">Show what to check</span>
              <span className="hidden group-open:inline">Hide</span>
            </summary>
            <ul className="mt-2.5 space-y-3">
              {issues.map((issue) => (
                <li key={issue.id} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`mt-[7px] size-2 shrink-0 rounded-full ${
                      issue.level === 'error' ? 'bg-red-500' : issue.level === 'warning' ? 'bg-amber-500' : 'bg-ink-400'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] leading-snug text-ink-900">{issue.message}</span>
                    {issue.fix && (
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-500">{issue.fix}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </PanelSection>

      <PanelSection title="Make the PDFs">
        <FileCard
          title="Interior"
          detail={`${pageCount || '—'} pages${padded > 0 ? ` + ${padded} blank for KDP's even count` : ''}`}
          action={
            <Button variant="primary" className="w-full" disabled={busy !== null} onClick={() => void run('interior')}>
              {busy === 'interior' ? 'Rendering…' : 'Export interior PDF'}
            </Button>
          }
        />
        <FileCard
          title="Cover"
          detail={`Spine sized for ${finalPages || '—'} pages`}
          action={
            <Button className="w-full" disabled={busy !== null} onClick={() => void run('cover')}>
              {busy === 'cover' ? 'Rendering…' : 'Export cover PDF'}
            </Button>
          }
        />

        {status && (
          <Notice level={status.level === 'ok' ? 'ok' : status.level === 'error' ? 'error' : 'info'}>
            {status.text}
          </Notice>
        )}
      </PanelSection>

      {printFallback && (
        <PanelSection
          title="Print instead"
          note="No Chromium on the server. The same Paged.js output prints from this browser — the pagination and type are identical."
        >
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => void print('interior')}>Print interior</Button>
            <Button onClick={() => void print('cover')}>Print cover</Button>
          </div>
        </PanelSection>
      )}

      <PanelSection title="Backup" collapsible>
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
        <p className="text-[12.5px] text-ink-500">
          Everything lives in this browser. Save a copy before clearing site data.
        </p>
      </PanelSection>
    </div>
  );
}

/** A file the panel can make: what it is, what is in it, and the one button that makes it. */
function FileCard({ title, detail, action }: { title: string; detail: string; action: React.ReactNode }) {
  return (
    <div className={CARD} style={{ ...cardStyle, padding: '12px 14px' }}>
      <h4 className="text-[14.5px] font-[600] leading-tight">{title}</h4>
      <p className="mb-2.5 mt-0.5 text-[12.5px]" style={{ color: 'var(--color-ink-500)' }}>
        {detail}
      </p>
      {action}
    </div>
  );
}
