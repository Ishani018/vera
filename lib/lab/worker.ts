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
import { pathDataFor, runLogo, type LogoSettings } from './logo';
import { traceInk } from './trace';
import { FULL_DECODE_PIXELS, MOST_PIXELS, sizeOfBlob, targetSize } from './measure';
import type { LookId } from './looks';

export type LabRequest = {
  id: number;
  blob: Blob;
  look: LookId;
  classic: ClassicSettings;
  inked: InkedSettings;
  colouring: ColouringSettings;
  logo: LogoSettings;
  /** The long edge to work at. Small for a look card, full for the canvas. */
  longEdge: number;
  /** Lift the background off first, using the app's existing mask. */
  removeBackground: boolean;
  /** Also return the drawing as SVG: native curves for Hand-inked and Logo, traced from the pixels for the rest. */
  wantSvg?: boolean;
};

/** Told to stop. The run ends at the next stage boundary and answers nothing. */
export type LabCancel = { id: number; cancel: true };

/** Where a run has got to. Coarse on purpose: these are real boundaries, not a guess. */
export type LabStage = 'reading' | 'background' | 'drawing' | 'curves' | 'encoding';

export type LabResponse =
  | { id: number; ok: 'progress'; stage: LabStage }
  | {
      id: number;
      ok: true;
      blob: Blob;
      width: number;
      height: number;
      svg?: string;
      /** For the Lab's own readouts, and for the bench to tabulate. */
      stats: {
        ink: number;
        midtone: number;
        strokes?: number;
        busy?: boolean;
        /** The picture was too large to decode whole, so the decoder shrank it. */
        resampled?: boolean;
        millis: number;
      };
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

/**
 * Runs told to stop, by id.
 *
 * The heavy pass is synchronous, so a cancel message cannot interrupt it. What
 * makes this work is `breathe()` below: between stages the worker yields to the
 * event loop for one turn, which is the only moment a queued message can be
 * read. So cancelling takes effect at the next stage boundary rather than
 * instantly — real, bounded, and honest about which.
 */
const stopped = new Set<number>();

/**
 * Hand the event loop one turn, then say whether this run was cancelled.
 *
 * `setTimeout` rather than a resolved promise: a microtask does not let queued
 * messages in, so the cancel would not be seen until the run had finished,
 * which is the thing being fixed.
 */
async function breathe(id: number, stage: LabStage): Promise<boolean> {
  const progress: LabResponse = { id, ok: 'progress', stage };
  self.postMessage(progress);
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (!stopped.has(id)) return false;
  stopped.delete(id);
  return true;
}

/**
 * Read the picture in, at a size the rest of the run can afford.
 *
 * Two paths, and which one is taken is a quality decision — see
 * `FULL_DECODE_PIXELS` in `./measure` for the measurements behind it.
 *
 * - Under the budget (almost every photograph): decode at full size and shrink
 *   with `drawImage`, exactly as the Lab always has. Bit-identical output.
 * - Over it: ask the decoder to shrink as it goes, because a 100-megapixel
 *   picture decoded whole is 400 MB and the alternative is not a worse drawing
 *   but no drawing at all. The caller is told, so the page can say so.
 */
async function readPicture(
  blob: Blob,
  longEdge: number,
): Promise<{ bitmap: ImageBitmap; resampled: boolean }> {
  const source = await sizeOfBlob(blob);

  if (source && source.width * source.height > FULL_DECODE_PIXELS) {
    const want = targetSize(source, longEdge);
    try {
      const bitmap = await createImageBitmap(blob, {
        resizeWidth: want.width,
        resizeHeight: want.height,
        resizeQuality: 'high',
      });
      return { bitmap, resampled: true };
    } catch {
      // Some decoders refuse the resize options for some files. Falling through
      // is heavier, not wrong — and the cap below still applies.
    }
  }

  const bitmap = await createImageBitmap(blob);
  if (bitmap.width * bitmap.height > MOST_PIXELS) {
    bitmap.close();
    throw new Error('That picture is too large to open here. Try one under about 80 megapixels.');
  }
  return { bitmap, resampled: false };
}

self.onmessage = async (event: MessageEvent<LabRequest | LabCancel>) => {
  if ('cancel' in event.data) {
    stopped.add(event.data.id);
    return;
  }
  const { id, blob, look, longEdge, removeBackground, wantSvg } = event.data;
  const started = performance.now();
  try {
    if (await breathe(id, 'reading')) return;
    const { bitmap: decoded, resampled } = await readPicture(blob, longEdge);
    // A no-op when the decoder already shrank it, and the usual path otherwise.
    const scale = Math.min(1, longEdge / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This browser cannot read image data.');
    context.drawImage(decoded, 0, 0, width, height);
    decoded.close();

    let input: Bitmap = context.getImageData(0, 0, width, height);
    /*
      The canvas has handed over its pixels and will not be read again. Shrinking
      it to nothing lets the backing store go now rather than whenever the
      collector next looks, which on a long slider drag is the difference
      between one working buffer and a dozen.
    */
    canvas.width = 0;
    canvas.height = 0;

    if (removeBackground) {
      if (await breathe(id, 'background')) return;
      input = onlyTheSubject(input);
    }

    let lines: Gray;
    let strokes: number | undefined;
    let svg: string | undefined;
    let busy: boolean | undefined;

    if (await breathe(id, 'drawing')) return;

    if (look === 'logo') {
      /*
        Drawn from the very path data the SVG carries, through Path2D, rather
        than rasterised by a second code path. The canvas and the download are
        then the same picture by construction, which is the only way to keep a
        promise that what you see is what exports.
      */
      const logo = runLogo(input, event.data.logo);
      svg = logo.svg;
      strokes = logo.verdict.curves;
      busy = logo.verdict.busy;
      if (await breathe(id, 'encoding')) return;
      const out = new OffscreenCanvas(logo.width, logo.height);
      const paint = out.getContext('2d');
      if (!paint) throw new Error('This browser cannot draw the result.');
      for (const shape of logo.shapes) {
        paint.fillStyle = shape.fill;
        // One path for all of the shape's rings, filled once, even-odd — the
        // very string the SVG carries. Filling ring by ring fills the holes.
        paint.fill(new Path2D(pathDataFor(shape)), 'evenodd');
      }
      const encoded = await out.convertToBlob({ type: 'image/png' });
      out.width = 0;
      out.height = 0;
      const answer: LabResponse = {
        id,
        ok: true,
        blob: encoded,
        width: logo.width,
        height: logo.height,
        svg,
        stats: { ink: 0, midtone: 0, strokes, busy, resampled, millis: Math.round(performance.now() - started) },
      };
      self.postMessage(answer);
      return;
    }
    if (look === 'colouring') {
      lines = runColouring(input, event.data.colouring);
    } else if (look === 'hand-inked') {
      const maskLines = runClassic(input, event.data.classic);
      lines = runInked(maskLines, event.data.inked);
      if (wantSvg) {
        if (await breathe(id, 'curves')) return;
        svg = runInkedSvg(maskLines, event.data.inked);
      }
      strokes = (svg?.match(/<path/g) ?? []).length || undefined;
    } else {
      lines = runClassic(input, event.data.classic);
    }
    // Every look can export an SVG. Hand-inked and Logo have curves of their own; the rest are drawn in pixels,
    // so their ink is traced. Only when asked for: tracing is not free and a slider drag must not pay for it.
    if (wantSvg && !svg) {
      if (await breathe(id, 'curves')) return;
      svg = traceInk(lines);
    }

    if (await breathe(id, 'encoding')) return;
    const out = new OffscreenCanvas(lines.width, lines.height);
    const outContext = out.getContext('2d');
    if (!outContext) throw new Error('This browser cannot draw the result.');
    outContext.putImageData(toTransparent(lines), 0, 0);
    // PNG, because a drawing is hard edges and a lossy codec would put grey
    // fringes along every one of them.
    const encoded = await out.convertToBlob({ type: 'image/png' });
    out.width = 0;
    out.height = 0;

    const response: LabResponse = {
      id,
      ok: true,
      blob: encoded,
      width: lines.width,
      height: lines.height,
      svg,
      stats: { ...measure(lines), strokes, resampled, millis: Math.round(performance.now() - started) },
    };
    self.postMessage(response);
  } catch (error) {
    stopped.delete(id);
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
