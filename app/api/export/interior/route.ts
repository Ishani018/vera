import { NextResponse } from 'next/server';
import { BrowserUnavailableError } from '@/lib/server/browser';
import { renderInteriorPdf } from '@/lib/server/renderPdf';
import type { Project } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

function filename(title: string): string {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'book'}-interior.pdf`;
}

export async function POST(request: Request) {
  let project: Project;
  let assets: Record<string, string> = {};
  try {
    ({ project, assets = {} } = (await request.json()) as {
      project: Project;
      assets?: Record<string, string>;
    });
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }
  if (!project?.contents) {
    return NextResponse.json({ error: 'No project in request body.' }, { status: 400 });
  }

  try {
    const result = await renderInteriorPdf(project, assets);
    return new NextResponse(new Uint8Array(result.pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename(project.meta.title)}"`,
        // The client shows these so the user knows what actually happened:
        // how long the book came out, whether a blank was appended, and
        // whether every font made it into the file.
        'X-Versecraft-Pages': String(result.pageCount),
        'X-Versecraft-Padded': String(result.paddedPages),
        'X-Versecraft-Fonts-Failed': result.fontsFailed.join(',') || 'none',
        'X-Versecraft-Renderer': result.via,
      },
    });
  } catch (error) {
    if (error instanceof BrowserUnavailableError) {
      return NextResponse.json({ error: error.message, fallback: 'print' }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : 'Export failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
