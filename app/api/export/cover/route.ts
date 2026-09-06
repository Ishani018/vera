import { NextResponse } from 'next/server';
import { BrowserUnavailableError } from '@/lib/server/browser';
import { renderCoverPdf } from '@/lib/server/renderPdf';
import type { Project } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  let project: Project;
  let pageCount: number;
  let assets: Record<string, string> = {};
  try {
    ({ project, pageCount, assets = {} } = (await request.json()) as {
      project: Project;
      pageCount: number;
      assets?: Record<string, string>;
    });
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }
  if (!project?.cover) {
    return NextResponse.json({ error: 'No project in request body.' }, { status: 400 });
  }
  if (!Number.isFinite(pageCount) || pageCount <= 0) {
    return NextResponse.json(
      { error: 'A page count is required — the spine width is derived from it.' },
      { status: 400 },
    );
  }

  try {
    const result = await renderCoverPdf(project, pageCount, assets);
    const slug =
      project.meta.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
      'book';
    return new NextResponse(new Uint8Array(result.pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${slug}-cover.pdf"`,
        'X-Versecraft-Cover-Size': `${result.widthIn.toFixed(4)}x${result.heightIn.toFixed(4)}in`,
        'X-Versecraft-Spine': `${result.spineIn.toFixed(4)}in`,
        'X-Versecraft-Renderer': result.via,
      },
    });
  } catch (error) {
    if (error instanceof BrowserUnavailableError) {
      return NextResponse.json({ error: error.message, fallback: 'print' }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : 'Cover export failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
