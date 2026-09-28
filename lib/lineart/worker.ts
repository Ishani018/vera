/// <reference lib="webworker" />
import {
  TRACE_EDGE,
  analyseRidges,
  analyseGrey,
  analysisKey,
  guessSource,
  runCleanup,
  runLineArt,
  toBitmap,
  upscale,
  type Analysis,
} from './pipeline';
import type { LineArtSettings, SourceKind } from '../types';

/**
 * The pipeline runs here rather than on the main thread.
 *
 * A 2600-pixel-square painting is nearly seven million pixels through six
 * passes; on the main thread that is a frozen window for a second or two every
 * time a slider moves. The whole job is done in the worker — decode, resize,
 * filter, encode — so nothing crosses the boundary but a blob each way.
 */

export type LineArtRequest = {
  id: number;
  blob: Blob;
  settings: LineArtSettings;
  /**
   * Identifies the picture, so the expensive half of tracing can be kept
   * between requests. Two different pictures must never share a key.
   */
  cacheKey?: string;
  /** Missing means: work it out from the picture and say what you decided. */
  source?: SourceKind;
  /**
   * The long edge the finished page needs, in pixels, for 300 DPI at the
   * chosen trim. The traced lines are enlarged to reach it, whichever path
   * produced them.
   */
  targetLongEdge?: number;
};

export type LineArtResponse =
  | {
      id: number;
      ok: true;
      blob: Blob;
      width: number;
      height: number;
      /** What it was treated as, whether asked for or worked out. */
      source: SourceKind;
      /** Whether that was a guess. */
      guessed: boolean;
      /** How much it was enlarged. 1 means not at all. */
      upscaled: number;
      /** The long edge of the original, for an honest resolution reading. */
      sourceLongEdge: number;
    }
  | { id: number; ok: false; error: string };

/**
 * The last picture's analysis, kept for the next request about it.
 *
 * One entry, not a table. Dragging a slider fires a request every settle, and
 * every one of them is about the same page — the one being watched. A second
 * entry would only help someone flicking between two pages mid-drag, at the
 * cost of holding two multi-megabyte gradients at once.
 */
let kept: { key: string; analysis: Analysis } | null = null;

self.onmessage = async (event: MessageEvent<LineArtRequest>) => {
  const { id, blob, settings, source: asked, targetLongEdge, cacheKey } = event.data;
  try {
    const decoded = await createImageBitmap(blob);
    const sourceLongEdge = Math.max(decoded.width, decoded.height);

    // Work at the original size where that is sensible, capped so a 60-megapixel
    // scan does not take a minute to answer a slider.
    const scale = Math.min(1, TRACE_EDGE / sourceLongEdge);
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This browser cannot read image data.');
    context.drawImage(decoded, 0, 0, width, height);
    decoded.close();

    const input = context.getImageData(0, 0, width, height);
    const guessed = asked === undefined;
    const source = asked ?? guessSource(input).kind;

    let lines: ReturnType<typeof runLineArt>;
    if (source === 'lineart') {
      // The cleanup path is cheap and shares none of this work.
      lines = runCleanup(input, settings);
    } else {
      const key = cacheKey ? `${cacheKey}|${width}x${height}|${analysisKey(settings)}` : null;
      const analysis: Analysis = key && kept?.key === key ? kept.analysis : {};
      if (settings.mode === 'edges') {
        analysis.ridges ??= analyseRidges(input, settings);
      } else {
        analysis.grey ??= analyseGrey(input, settings);
      }
      if (key) kept = { key, analysis };
      lines = runLineArt(input, settings, analysis);
    }

    // Both paths are enlarged, because by this point neither is a photograph
    // any more: what is being resized is a two-colour drawing, a few hard edges
    // that interpolate cleanly and re-threshold back to two colours. Enlarging
    // the painting itself would indeed be inventing detail — this is enlarging
    // the lines that were traced from it, which is the same operation a vector
    // would do for free. The reading still says by how much it stretched.
    let upscaled = 1;
    if (targetLongEdge && targetLongEdge > Math.max(width, height)) {
      upscaled = targetLongEdge / Math.max(width, height);
      lines = upscale(lines, Math.round(width * upscaled), Math.round(height * upscaled));
    }

    const out = new OffscreenCanvas(lines.width, lines.height);
    const outContext = out.getContext('2d');
    if (!outContext) throw new Error('This browser cannot draw the result.');
    const image = outContext.createImageData(lines.width, lines.height);
    image.data.set(toBitmap(lines).data);
    outContext.putImageData(image, 0, 0);

    // PNG, not JPEG: line art is two colours and a lossy codec would put grey
    // fringes along every stroke, which is exactly what must not be there.
    const encoded = await out.convertToBlob({ type: 'image/png' });
    const response: LineArtResponse = {
      id,
      ok: true,
      blob: encoded,
      width: lines.width,
      height: lines.height,
      source,
      guessed,
      upscaled,
      sourceLongEdge,
    };
    self.postMessage(response);
  } catch (error) {
    const response: LineArtResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'That picture could not be processed.',
    };
    self.postMessage(response);
  }
};
