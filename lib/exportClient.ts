'use client';

import { assetsAsDataUrls, importAssets } from './assets';
import { illustrationsOf, looksLikeProject, migrateContents } from './contents';
import { googleFontsLinks } from './fonts';
import { padToEven } from './kdp';
import { buildBookHtml } from './render/bookHtml';
import { buildColoringHtml } from './render/coloringHtml';
import { matterArtwork } from './render/coloringLayout';
import { buildCoverHtml } from './render/coverHtml';
import type { AnyProject, ColoringBook, Project } from './types';

/** Where the Paged.js polyfill is served from; see scripts/copy-vendor.mjs. */
export const PAGEDJS_SRC = '/vendor/paged.polyfill.js';

const NO_GUIDES = { margins: false, bleed: false, safe: false, gutter: false };

export type ExportOutcome = {
  ok: boolean;
  message: string;
  /** Set when the server has no Chromium and the browser must print instead. */
  needsPrintFallback?: boolean;
};

/** Every asset a book refers to: the cover, and whatever is printed inside. */
export function projectAssetIds(project: AnyProject): string[] {
  const inside =
    project.kind === 'coloring'
      ? // The line art is what prints; the original goes too, because a page
        // that has not been converted yet falls back to it rather than to a
        // hole, and because the cover may be one of them in colour. Front
        // matter the poet drew herself is in here as well, or a backup would
        // restore a book with its title page missing.
        [...project.pages, ...matterArtwork(project)].flatMap((page) => [
          page.lineArtAssetId,
          page.sourceAssetId,
        ])
      : illustrationsOf(project).map((plate) => plate.assetId);

  return [
    project.cover.frontImage?.assetId,
    ...(project.cover.stickers ?? []).map((sticker) => sticker.assetId),
    ...inside,
  ].filter((id): id is string => Boolean(id));
}

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
  label: string,
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

  return { ok: true, message: [`${label} saved`, ...parts].join(' · ') };
}

export async function exportInteriorPdf(project: AnyProject): Promise<ExportOutcome> {
  // Assets live in IndexedDB; the server cannot reach them, so the bytes travel
  // with the request.
  const assets = await assetsAsDataUrls(projectAssetIds(project));
  return postForPdf(
    '/api/export/interior',
    { project, assets },
    `${slug(project.meta.title)}-interior.pdf`,
    'Interior',
  );
}

export async function exportCoverPdf(
  project: AnyProject,
  pageCount: number,
): Promise<ExportOutcome> {
  const assets = await assetsAsDataUrls(projectAssetIds(project));
  return postForPdf(
    '/api/export/cover',
    { project, pageCount: padToEven(pageCount), assets },
    `${slug(project.meta.title)}-cover.pdf`,
    'Cover',
  );
}

/**
 * The fallback when no Chromium is available server-side (a plain Vercel
 * deployment without @sparticuz/chromium, say). It opens the very same
 * Paged.js document in a window and prints it. Chrome's "Save as PDF" honours
 * the @page size, so the result is the same trim, the same pagination and the
 * same type — it just needs one dialog from the user.
 */
export function printInterior(project: AnyProject, padPages: number): void {
  const options = {
    mode: 'export' as const,
    fontStyle: googleFontsLinks(project),
    pagedJsSrc: PAGEDJS_SRC,
    guides: NO_GUIDES,
    padPages,
    autoPrint: true,
  };
  openForPrint(
    project.kind === 'coloring'
      ? buildColoringHtml(project, options)
      : buildBookHtml(project, options),
  );
}

export async function printCover(project: AnyProject, pageCount: number): Promise<void> {
  const html = buildCoverHtml(project, {
    pageCount: padToEven(pageCount),
    fontStyle: googleFontsLinks(project),
    guides: false,
    autoPrint: true,
    // Data URLs, not object URLs: the print window is a separate document.
    assets: await assetsAsDataUrls(projectAssetIds(project)),
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

/**
 * Backup and restore. The project is plain data; the images it refers to are
 * carried alongside it so a backup is a complete book rather than a book with
 * missing pictures.
 */
export async function exportProjectJson(project: AnyProject): Promise<void> {
  const assets = await assetsAsDataUrls(projectAssetIds(project));
  const payload = { versecraft: 1, project, assets };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  download(blob, `${slug(project.meta.title)}-versecraft.json`);
}

export async function importProjectJson(file: File): Promise<Project> {
  const parsed = JSON.parse(await file.text()) as
    | Partial<Project>
    | { versecraft?: number; project?: Project; assets?: Record<string, string> };

  // A backup made before assets were split out is the project itself.
  const project =
    'project' in parsed && parsed.project ? parsed.project : (parsed as Project);
  const assets = 'assets' in parsed && parsed.assets ? parsed.assets : {};

  if (!project || typeof project !== 'object' || !looksLikeProject(project)) {
    throw new Error('That file is not a Versecraft project.');
  }
  await importAssets(assets);
  // A file saved before poems and parts became one list still opens.
  return { ...project, contents: migrateContents(project) } as Project;
}
