'use client';

import { googleFontsLinks } from './fonts';
import { padToEven } from './kdp';
import { buildBookHtml } from './render/bookHtml';
import { buildCoverHtml } from './render/coverHtml';
import type { Project } from './types';

/** Where the Paged.js polyfill is served from; see scripts/copy-vendor.mjs. */
export const PAGEDJS_SRC = '/vendor/paged.polyfill.js';

const NO_GUIDES = { margins: false, bleed: false, safe: false, gutter: false };

export type ExportOutcome = {
  ok: boolean;
  message: string;
  /** Set when the server has no Chromium and the browser must print instead. */
  needsPrintFallback?: boolean;
};

function slug(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'book';
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function postForPdf(
  endpoint: string,
  body: unknown,
  filename: string,
): Promise<ExportOutcome> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { error?: string; fallback?: string }
      | null;
    return {
      ok: false,
      message: data?.error ?? `Export failed (${response.status}).`,
      needsPrintFallback: data?.fallback === 'print',
    };
  }

  download(await response.blob(), filename);

  const pages = response.headers.get('X-Versecraft-Pages');
  const padded = Number(response.headers.get('X-Versecraft-Padded') ?? '0');
  const failedFonts = response.headers.get('X-Versecraft-Fonts-Failed');
  const cover = response.headers.get('X-Versecraft-Cover-Size');

  const parts: string[] = [];
  if (pages) parts.push(`${pages} pages`);
  if (padded > 0) parts.push(`${padded} blank page${padded === 1 ? '' : 's'} appended for parity`);
  if (cover) parts.push(cover.replace('x', ' × '));
  if (failedFonts && failedFonts !== 'none') {
    parts.push(`could not embed: ${failedFonts} (a system face was substituted)`);
  }

  return { ok: true, message: parts.join(' · ') || 'Exported.' };
}

export function exportInteriorPdf(project: Project): Promise<ExportOutcome> {
  return postForPdf('/api/export/interior', { project }, `${slug(project.meta.title)}-interior.pdf`);
}

export function exportCoverPdf(project: Project, pageCount: number): Promise<ExportOutcome> {
  return postForPdf(
    '/api/export/cover',
    { project, pageCount: padToEven(pageCount) },
    `${slug(project.meta.title)}-cover.pdf`,
  );
}

/**
 * The fallback when no Chromium is available server-side (a plain Vercel
 * deployment without @sparticuz/chromium, say). It opens the very same
 * Paged.js document in a window and prints it. Chrome's "Save as PDF" honours
 * the @page size, so the result is the same trim, the same pagination and the
 * same type — it just needs one dialog from the user.
 */
export function printInterior(project: Project, padPages: number): void {
  const html = buildBookHtml(project, {
    mode: 'export',
    fontStyle: googleFontsLinks(project),
    pagedJsSrc: PAGEDJS_SRC,
    guides: NO_GUIDES,
    padPages,
    autoPrint: true,
  });
  openForPrint(html);
}

export function printCover(project: Project, pageCount: number): void {
  const html = buildCoverHtml(project, {
    pageCount: padToEven(pageCount),
    fontStyle: googleFontsLinks(project),
    guides: false,
    autoPrint: true,
  });
  openForPrint(html);
}

function openForPrint(html: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error('The print window was blocked. Allow pop-ups for this site and try again.');
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

/** Backup and restore. The project is plain data, so this is the whole format. */
export function exportProjectJson(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  download(blob, `${slug(project.meta.title)}-versecraft.json`);
}

export async function importProjectJson(file: File): Promise<Project> {
  const parsed = JSON.parse(await file.text()) as Partial<Project>;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.poems)) {
    throw new Error('That file is not a Versecraft project.');
  }
  return parsed as Project;
}
