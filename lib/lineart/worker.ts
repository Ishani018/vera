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
import {
  backgroundMask,
  compositeSticker,
  dieCutRing,
  feather,
  makeMask,
  maskFromInk,
  padBitmap,
  padMask,
  SOLID,
  type Mask,
} from './mask';
import type { LineArtSettings, SourceKind } from '../types';

/**
 * The pipeline runs here rather than on the main thread.
 *
 * A 2600-pixel-square painting is nearly seven million pixels through six
 * passes; on the main thread that is a frozen window for a second or two every
 * time a slider moves. The whole job is done in the worker — decode, resize,
 * filter, encode — so nothing crosses the boundary but a blob each way.
 */

/** What a sticker is made of, beyond the line art the rest of this shares. */
export type StickerOptions = {
  /** Convert a painting, clean up existing line art, or leave it alone. */
  mode: 'convert' | 'cleanup' | 'asis';
  /** Only for `asis`: lift a plain background by flooding in from the border. */
  removeBackground: boolean;
  /** Lab distance. About 12 lifts a clean white scan; past 40 it eats the subject. */
  tolerance: number;
  /** Softens the cut edge, in pixels at the working size. */
  smoothing: number;
  /** The colour flat line art is painted in. Ignored for `asis`. */
  inkColour: string;
  dieCut: { width: number; colour: string; radius: number } | null;
  /** The long edge to work and export at. */
  longEdge: number;
};

export type StickerRequest = {
  id: number;
  job: 'sticker';
  blob: Blob;
  settings: LineArtSettings;
  options: StickerOptions;
};

export type StickerResponse =
  | {
      id: number;
      ok: true;
      blob: Blob;
      width: number;
      height: number;
      source: SourceKind;
      /** True where anything in the result is see-through. */
      transparent: boolean;
      /** The long edge of the original, for an honest resolution reading. */
      sourceLongEdge: number;
    }
  | { id: number; ok: false; error: string };

export type LineArtRequest = {
  id: number;
  job?: 'lineart';
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

self.onmessage = async (event: MessageEvent<LineArtRequest | StickerRequest>) => {
  if (event.data.job === 'sticker') return void (await makeSticker(event.data));
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

/**
 * One sticker: convert or clean up or leave alone, knock out the background,
 * put a die-cut edge round it, and hand back a PNG with an alpha channel.
 *
 * Everything happens at the requested long edge rather than at a working size
 * that is then enlarged. It costs a little time on export and it means the
 * feathering radius, the outline width and the corner rounding are all in the
 * pixels they will actually be seen at — which is the difference between an
 * outline that looks the same in the preview and in the file, and one that
 * does not.
 */
async function makeSticker({ id, blob, settings, options }: StickerRequest): Promise<void> {
  try {
    const decoded = await createImageBitmap(blob);
    const sourceLongEdge = Math.max(decoded.width, decoded.height);

    // Traced lines enlarge cleanly — a few hard edges that re-threshold back to
    // two colours — which is the argument the line art path already makes. A
    // photograph does not, so a kept picture is never drawn above its own size.
    const ceiling = options.mode === 'asis' ? Math.min(options.longEdge, sourceLongEdge) : options.longEdge;
    const traceAt = Math.min(sourceLongEdge, TRACE_EDGE);
    const scale = traceAt / sourceLongEdge;
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This browser cannot read image data.');
    context.drawImage(decoded, 0, 0, width, height);
    const input = context.getImageData(0, 0, width, height);
    const source: SourceKind = options.mode === 'cleanup' ? 'lineart' : 'painting';

    let subject: Mask;
    // A plain bitmap, not an ImageData: it is only ever read, and only the
    // final canvas needs the browser's own type.
    let paint: { width: number; height: number; data: Uint8ClampedArray } | null = null;
    let outWidth: number;
    let outHeight: number;

    if (options.mode === 'asis') {
      const out = Math.max(1, Math.round((ceiling / sourceLongEdge) * decoded.width));
      outWidth = out;
      outHeight = Math.max(1, Math.round((ceiling / sourceLongEdge) * decoded.height));
      const full = new OffscreenCanvas(outWidth, outHeight);
      const fullContext = full.getContext('2d', { willReadFrequently: true });
      if (!fullContext) throw new Error('This browser cannot read image data.');
      fullContext.drawImage(decoded, 0, 0, outWidth, outHeight);
      paint = fullContext.getImageData(0, 0, outWidth, outHeight);
      subject = options.removeBackground
        ? backgroundMask(paint, options.tolerance)
        : makeMask(outWidth, outHeight, SOLID);
    } else {
      let lines = options.mode === 'cleanup' ? runCleanup(input, settings) : runLineArt(input, settings);
      if (ceiling > Math.max(width, height)) {
        const by = ceiling / Math.max(width, height);
        lines = upscale(lines, Math.round(width * by), Math.round(height * by));
      }
      outWidth = lines.width;
      outHeight = lines.height;
      subject = maskFromInk(lines);
    }
    decoded.close();

    // Room for the outline, made before it is drawn, so a sticker whose artwork
    // runs to the edge does not get its edge cut off by the edge.
    const pad = options.dieCut ? Math.ceil(options.dieCut.width + options.smoothing) + 2 : 0;
    if (pad) {
      subject = padMask(subject, pad);
      if (paint) paint = padBitmap(paint, pad);
      outWidth += pad * 2;
      outHeight += pad * 2;
    }

    const ring = options.dieCut
      ? dieCutRing(subject, Math.round(options.dieCut.width), Math.round(options.dieCut.radius))
      : null;
    const softened = options.smoothing > 0 ? feather(subject, Math.round(options.smoothing)) : subject;

    const composed = compositeSticker({
      subject: softened,
      ring,
      paint,
      inkColour: options.inkColour,
      ringColour: options.dieCut?.colour ?? '#FFFFFF',
    });

    const out = new OffscreenCanvas(outWidth, outHeight);
    const outContext = out.getContext('2d');
    if (!outContext) throw new Error('This browser cannot draw the result.');
    const image = outContext.createImageData(outWidth, outHeight);
    image.data.set(composed.data);
    outContext.putImageData(image, 0, 0);

    // PNG, and only PNG. It is the one format here that carries an alpha
    // channel, and a sticker without one is a rectangle.
    const encoded = await out.convertToBlob({ type: 'image/png' });
    let transparent = false;
    for (let i = 3; i < composed.data.length; i += 4) {
      if (composed.data[i] < 255) {
        transparent = true;
        break;
      }
    }

    const response: StickerResponse = {
      id,
      ok: true,
      blob: encoded,
      width: outWidth,
      height: outHeight,
      source,
      transparent,
      sourceLongEdge,
    };
    self.postMessage(response);
  } catch (error) {
    const response: StickerResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'That picture could not be made into a sticker.',
    };
    self.postMessage(response);
  }
}
