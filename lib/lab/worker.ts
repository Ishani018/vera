/// <reference lib="webworker" />

/**
 * The Lab's engine, off the main thread.
 *
 * Its own worker rather than a job added to `lib/lineart/worker.ts`, for one
 * reason: the colouring book and the sticker studio already use that one, and
 * folding six looks' worth of code into it would make every one of those
 * flows download the Lab. This file is only ever fetched by `/lab`.
 *
 * Nothing here touches the network and nothing leaves the computer. Every look
 * is our own code implementing published mathematics; `docs/ALGORITHMS.md` says
 * whose. There is no model, and nothing to download before it will work.
 */

import { runClassic, type ClassicSettings } from '../lineart/xdog';
import { runColouring, type ColouringSettings } from '../lineart/colouring';
import { runInked, runInkedSvg, type InkedSettings } from '../lineart/inked';
import { SOLID, backgroundMask } from '../lineart/mask';
import { INK, type Bitmap, type Gray } from '../lineart/pipeline';
import type { LookId } from './looks';

export type LabRequest = {
  id: number;
  blob: Blob;
  look: LookId;
  classic: ClassicSettings;
  inked: InkedSettings;
  colouring: ColouringSettings;
  /** The long edge to work at. Small for a look card, full for the canvas. */
  longEdge: number;
  /** Lift the background off first, using the app's existing mask. */
  removeBackground: boolean;
  /** Also return the drawing as SVG. Only Hand-inked has one to give. */
  wantSvg?: boolean;
};

export type LabResponse =
  | {
      id: number;
      ok: true;
      blob: Blob;
      width: number;
      height: number;
      svg?: string;
      /** For the Lab's own readouts, and for the bench to tabulate. */
      stats: { ink: number; midtone: number; strokes?: number; millis: number };
    }
  | { id: number; ok: false; error: string };

/**
 * Ink on nothing.
 *
 * The Lab's output is a transparent PNG, so a drawing can go straight onto a
 * sticker or a cover without bringing a white rectangle with it. Grey levels
 * become opacity rather than lightness, which keeps the soft edge of a stroke
 * soft instead of turning it into a halo of pale grey pixels.
 */
function toTransparent(lines: Gray): ImageData {
  const image = new ImageData(lines.width, lines.height);
  for (let i = 0; i < lines.data.length; i++) {
    const value = lines.data[i];
    const at = i * 4;
    image.data[at] = INK;
    image.data[at + 1] = INK;
    image.data[at + 2] = INK;
    image.data[at + 3] = 255 - value;
  }
  return image;
}

/** How much of the page is ink, and how much is neither ink nor paper. */
function measure(lines: Gray): { ink: number; midtone: number } {
  let ink = 0;
  let midtone = 0;
  for (const value of lines.data) {
    if (value < 128) ink += 1;
    else if (value < 250) midtone += 1;
  }
  return { ink: ink / lines.data.length, midtone: midtone / lines.data.length };
}

self.onmessage = async (event: MessageEvent<LabRequest>) => {
  const { id, blob, look, longEdge, removeBackground, wantSvg } = event.data;
  const started = performance.now();
  try {
    const decoded = await createImageBitmap(blob);
    const scale = Math.min(1, longEdge / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This browser cannot read image data.');
    context.drawImage(decoded, 0, 0, width, height);
    decoded.close();

    let input: Bitmap = context.getImageData(0, 0, width, height);
    if (removeBackground) input = onlyTheSubject(input);

    let lines: Gray;
    let strokes: number | undefined;
    let svg: string | undefined;
    if (look === 'colouring') {
      lines = runColouring(input, event.data.colouring);
    } else if (look === 'hand-inked') {
      const maskLines = runClassic(input, event.data.classic);
      lines = runInked(maskLines, event.data.inked);
      if (wantSvg) svg = runInkedSvg(maskLines, event.data.inked);
      strokes = (svg?.match(/<path/g) ?? []).length || undefined;
    } else {
      lines = runClassic(input, event.data.classic);
    }

    const out = new OffscreenCanvas(lines.width, lines.height);
    const outContext = out.getContext('2d');
    if (!outContext) throw new Error('This browser cannot draw the result.');
    outContext.putImageData(toTransparent(lines), 0, 0);
    // PNG, because a drawing is hard edges and a lossy codec would put grey
    // fringes along every one of them.
    const encoded = await out.convertToBlob({ type: 'image/png' });

    const response: LabResponse = {
      id,
      ok: true,
      blob: encoded,
      width: lines.width,
      height: lines.height,
      svg,
      stats: { ...measure(lines), strokes, millis: Math.round(performance.now() - started) },
    };
    self.postMessage(response);
  } catch (error) {
    const response: LabResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Something went wrong.',
    };
    self.postMessage(response);
  }
};

/**
 * The background, painted out before any line is looked for.
 *
 * `backgroundMask` is the app's own background removal, reused rather than
 * reinvented: it is the same question, it is already tested, and two
 * implementations would eventually disagree about what a background is.
 *
 * Painted WHITE rather than made transparent, and the difference matters.
 * Transparent reads to `flattenOntoWhite` as white anyway, but a hard
 * transparent edge against the subject is itself a step in brightness — and a
 * line finder's whole job is to find steps in brightness, so it would draw the
 * cut-out's outline as though it were in the picture. Painting white and
 * letting the subject's own edge fade into it leaves nothing to find.
 */
function onlyTheSubject(source: Bitmap): Bitmap {
  const subject = backgroundMask(source, BACKGROUND_TOLERANCE);
  const data = new Uint8ClampedArray(source.data);
  for (let i = 0; i < subject.data.length; i++) {
    if (subject.data[i] === SOLID) continue;
    // Part-way out at a feathered edge: mix towards white by how far out it is.
    const keep = subject.data[i] / SOLID;
    const at = i * 4;
    for (let c = 0; c < 3; c++) data[at + c] = data[at + c] * keep + 255 * (1 - keep);
    data[at + 3] = 255;
  }
  return { width: source.width, height: source.height, data };
}

/** The same default the sticker studio opens with. */
const BACKGROUND_TOLERANCE = 42;
