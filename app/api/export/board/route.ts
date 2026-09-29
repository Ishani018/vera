import { NextResponse } from 'next/server';
import { BrowserUnavailableError } from '@/lib/server/browser';
import { renderBoard, type BoardRequest } from '@/lib/server/renderPdf';

export const runtime = 'nodejs';
export const maxDuration = 300;

const EXTENSION = { png: 'png', jpg: 'jpg', pdf: 'pdf' } as const;

export async function POST(request: Request) {
  let body: BoardRequest & { name?: string };
  try {
    body = (await request.json()) as BoardRequest & { name?: string };
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }
  if (!body?.presetId || !body?.cover) {
    return NextResponse.json({ error: 'A size and a design are both required.' }, { status: 400 });
  }
  if (!EXTENSION[body.format]) {
    return NextResponse.json({ error: `Cannot make a ${body.format}.` }, { status: 400 });
  }

  try {
    const result = await renderBoard(body);
    const slug =
      (body.name ?? body.title ?? 'design')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'design';
    return new NextResponse(new Uint8Array(result.bytes), {
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${slug}-${body.presetId}.${EXTENSION[body.format]}"`,
        // The client shows these, so the user knows what they actually got.
        'X-Versecraft-Pixels': `${result.widthPx}x${result.heightPx}`,
        'X-Versecraft-Dpi': String(result.dpi),
        'X-Versecraft-Fonts-Failed': result.fontsFailed.join(',') || 'none',
        'X-Versecraft-Renderer': result.via,
        'X-Versecraft-Engine': result.engine,
      },
    });
  } catch (error) {
    if (error instanceof BrowserUnavailableError) {
      return NextResponse.json({ error: error.message, fallback: 'print' }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : 'Rendering failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
