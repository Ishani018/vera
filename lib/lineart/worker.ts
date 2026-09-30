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
  applyTouch,
  backgroundMask,
  compositeSticker,
  dieCutRing,
  feather,
  makeMask,
  maskFromInk,
  padBitmap,
  padMask,
  scalePaint,
  SOLID,
  type Mask,
} from './mask';
import { applySwaps } from '../stickers/recolour';
import type { Swap } from '../stickers/recolour';
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
  /**
   * The colouring, at whatever size it was painted, or null for none.
   *
   * Sent as plain arrays rather than a blob because it is already pixels on
   * this side and encoding it to a PNG only to decode it again in the worker
   * would cost a second and gain nothing.
   */
  colour?: { width: number; height: number; data: Uint8ClampedArray } | null;
  /**
   * The touch-up layer: where the background removal was corrected by hand.
   * Applied to the mask before the outline or the feathering see it, so every
   * one of them works from the shape that is actually wanted.
   */
  touch?: { width: number; height: number; data: Uint8ClampedArray } | null;
  /**
   * Colours to change, in order, on a kept picture. Nothing for traced line
   * art, where the one colour there is has its own control.
   */
  swaps?: Swap[];
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
      /**
       * The margin added round the artwork to make room for the outline, in
       * pixels of the returned picture. The colouring overlay needs it: without
       * it the colour would sit over the padding and be a few pixels adrift of
       * the drawing it was painted on.
       */
      pad: number;
    }
  | { id: number; ok: false; error: string };

/**
 * The traced lines themselves, rather than a picture of them.
 *
 * The colouring tools need to know where the ink is to decide where a fill
 * stops, and they need it as numbers, not as a PNG the main thread would have
 * to decode and re-read. One job, answered once per trace; the fills after it
 * are pure arithmetic on the main thread and need no worker at all.
 */
export type InkRequest = {
  id: number;
  job: 'ink';
  blob: Blob;
  settings: LineArtSettings;
  mode: 'convert' | 'cleanup' | 'asis';
  /** The grid the colouring will be painted on. */
  longEdge: number;
};

export type InkResponse =
  | { id: number; ok: true; width: number; height: number; ink: Uint8ClampedArray }
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

self.onmessage = async (event: MessageEvent<LineArtRequest | StickerRequest | InkRequest>) => {
  if (event.data.job === 'sticker') return void (await makeSticker(event.data));
  if (event.data.job === 'ink') return void (await traceInk(event.data));
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
      // Recoloured before the background is worked out, so replacing a colour
      // cannot quietly move the edge: the removal sees the picture the person
      // is looking at.
      if (options.swaps?.length) paint = applySwaps(paint, options.swaps);
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

    // Hand corrections first, before anything has looked at the mask: the
    // outline, the feathering and the alpha channel must all agree about where
    // the sticker's edge is, and the person who painted it is the authority.
    if (options.touch) {
      subject = applyTouch(
        subject,
        scalePaint(
          { width: options.touch.width, height: options.touch.height, data: options.touch.data },
          subject.width,
          subject.height,
        ),
      );
    }

    // The colouring was painted on its own grid, which is rarely the size being
    // exported at. Resized to match before anything is padded, so it lines up
    // with the drawing it was painted on rather than with the padding.
    let colour = options.colour
      ? scalePaint(
          { width: options.colour.width, height: options.colour.height, data: options.colour.data },
          outWidth,
          outHeight,
        )
      : null;

    // A coloured-in sticker is the drawing *and* the colour, so the die-cut has
    // to go round both; without this the outline would hug the lines and leave
    // every filled area sticking out past its own edge.
    //
    // A second mask rather than a wider `subject`, and that distinction is the
    // whole of it: `subject` is where the ink goes, so folding the colour into
    // it would have the drawing painted over every square inch that had been
    // coloured in — which is to say, the colouring would vanish.
    let outline = subject;
    if (colour) {
      const merged = new Uint8Array(subject.data);
      for (let p = 0, i = 3; p < merged.length; p++, i += 4) {
        if (colour.data[i] > merged[p]) merged[p] = colour.data[i];
      }
      outline = { width: subject.width, height: subject.height, data: merged };
    }

    // Room for the outline, made before it is drawn, so a sticker whose artwork
    // runs to the edge does not get its edge cut off by the edge.
    const pad = options.dieCut ? Math.ceil(options.dieCut.width + options.smoothing) + 2 : 0;
    if (pad) {
      const padded = padMask(subject, pad);
      outline = outline === subject ? padded : padMask(outline, pad);
      subject = padded;
      if (paint) paint = padBitmap(paint, pad);
      if (colour) colour = padBitmap(colour, pad);
      outWidth += pad * 2;
      outHeight += pad * 2;
    }

    const ring = options.dieCut
      ? dieCutRing(outline, Math.round(options.dieCut.width), Math.round(options.dieCut.radius))
      : null;
    const softened = options.smoothing > 0 ? feather(subject, Math.round(options.smoothing)) : subject;

    const composed = compositeSticker({
      subject: softened,
      ring,
      paint,
      colour,
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
      pad,
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

/**
 * The traced lines as a grey plane, on the grid the colouring will use.
 *
 * `asis` has no lines of its own — the picture is kept as it is — so it gets a
 * blank plane, and colouring it behaves like painting on glass over the top.
 * That is the honest answer: there is nothing there for a fill to stop at.
 */
async function traceInk({ id, blob, settings, mode, longEdge }: InkRequest): Promise<void> {
  try {
    const decoded = await createImageBitmap(blob);
    const sourceLongEdge = Math.max(decoded.width, decoded.height);
    const traceAt = Math.min(sourceLongEdge, TRACE_EDGE);
    const scale = traceAt / sourceLongEdge;
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This browser cannot read image data.');
    context.drawImage(decoded, 0, 0, width, height);
    const input = context.getImageData(0, 0, width, height);
    decoded.close();

    let lines =
      mode === 'asis'
        ? {
            width,
            height,
            data: new Uint8ClampedArray(width * height).fill(255),
          }
        : mode === 'cleanup'
          ? runCleanup(input, settings)
          : runLineArt(input, settings);

    if (longEdge > Math.max(lines.width, lines.height)) {
      const by = longEdge / Math.max(lines.width, lines.height);
      lines = upscale(lines, Math.round(lines.width * by), Math.round(lines.height * by));
    }

    const response: InkResponse = {
      id,
      ok: true,
      width: lines.width,
      height: lines.height,
      ink: lines.data,
    };
    self.postMessage(response, [lines.data.buffer]);
  } catch (error) {
    const response: InkResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Those lines could not be read.',
    };
    self.postMessage(response);
  }
}
