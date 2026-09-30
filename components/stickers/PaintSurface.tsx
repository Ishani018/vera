'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  PaintHistory,
  Stroke,
  barrierOf,
  disc,
  fillAt,
  makePaint,
  parseColour,
  smear,
  softSmear,
  type Paint,
} from '@/lib/stickers/colour';
import { DROP, KEEP } from '@/lib/lineart/mask';
import type { InkResult } from '@/lib/lineart/client';

/**
 * The two layers a person paints on, and the pointer that paints them.
 *
 * **Colour** sits *under* the sticker picture rather than over it, which is not
 * a layering trick but the same order the export uses — the sticker PNG is
 * transparent everywhere except its lines, so colour behind it shows through
 * exactly where a fill would. What you see while painting is what comes out,
 * without re-running the whole pipeline for every brush stroke.
 *
 * **Touch-up** corrects the background removal, and cannot work that way: it
 * changes which pixels the sticker has at all, which only the pipeline can
 * decide. So it is drawn on top as a coloured wash — green for "keep this",
 * red for "drop this" — for immediate feedback, and the real picture catches up
 * a moment later when the stroke settles.
 *
 * One pointer surface serves both, above the picture, so the picture can keep
 * `pointer-events: none` and never swallow a click.
 */

export type Tool = 'fill' | 'brush' | 'eraser' | 'restore' | 'remove' | 'automatic';

/** Which layer a tool belongs to. */
export const TOUCH_TOOLS: Tool[] = ['restore', 'remove', 'automatic'];
export const isTouchTool = (tool: Tool) => TOUCH_TOOLS.includes(tool);

export type SurfaceHandle = {
  colour: () => Paint | null;
  touch: () => Paint | null;
  undo: () => void;
  redo: () => void;
  /** Clears the layer the current tool belongs to, as one undoable step. */
  clearAll: () => void;
};

export function PaintSurface({
  ink,
  tool,
  colour,
  brush,
  softness,
  gap,
  pad,
  handle,
  startColour,
  startTouch,
  onColourChange,
  onTouchChange,
  onLeak,
}: {
  ink: InkResult | null;
  tool: Tool;
  colour: string;
  /** Radius in pixels of the painting grid. */
  brush: number;
  /** How much of that radius fades, 0 to 1. Only the touch-up brushes use it. */
  softness: number;
  gap: number;
  /** The outline margin in the picture above, as a fraction of its size. */
  pad: { x: number; y: number };
  handle: React.RefObject<SurfaceHandle | null>;
  startColour: Paint | null;
  startTouch: Paint | null;
  onColourChange: (paint: Paint) => void;
  onTouchChange: (paint: Paint) => void;
  onLeak: (share: number) => void;
}) {
  const colourCanvas = useRef<HTMLCanvasElement>(null);
  const touchCanvas = useRef<HTMLCanvasElement>(null);
  const colourPaint = useRef<Paint | null>(null);
  const touchPaint = useRef<Paint | null>(null);
  const colourPast = useRef(new PaintHistory());
  const touchPast = useRef(new PaintHistory());
  const stroke = useRef<Stroke | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [depth, setDepth] = useState(0);

  const touching = isTouchTool(tool);

  /**
   * The thickened lines, worked out once per change of picture or of the
   * gap-closing control rather than once per click. It is a whole morphology
   * pass over a million pixels; doing it inside the click handler would put a
   * visible pause between pressing and seeing the colour.
   */
  const barrier = useRef<ReturnType<typeof barrierOf> | null>(null);
  useEffect(() => {
    barrier.current = ink ? barrierOf({ width: ink.width, height: ink.height, data: ink.ink }, gap) : null;
  }, [ink, gap]);

  const drawColour = useCallback(() => {
    const node = colourCanvas.current;
    const layer = colourPaint.current;
    if (!node || !layer) return;
    node.width = layer.width;
    node.height = layer.height;
    const context = node.getContext('2d');
    if (!context) return;
    const image = context.createImageData(layer.width, layer.height);
    image.data.set(layer.data);
    context.putImageData(image, 0, 0);
  }, []);

  /**
   * The touch-up layer, shown as a wash rather than as itself.
   *
   * What it stores is "become this, this strongly", which drawn literally is a
   * black and white smear that says nothing. Green for kept and red for
   * dropped says what was actually meant, and at less than half strength the
   * picture underneath stays readable while it is being corrected.
   */
  const drawTouch = useCallback(() => {
    const node = touchCanvas.current;
    const layer = touchPaint.current;
    if (!node || !layer) return;
    node.width = layer.width;
    node.height = layer.height;
    const context = node.getContext('2d');
    if (!context) return;
    const image = context.createImageData(layer.width, layer.height);
    for (let i = 0; i < layer.data.length; i += 4) {
      const weight = layer.data[i + 3];
      if (!weight) continue;
      const keep = layer.data[i] > 127;
      image.data[i] = keep ? 34 : 214;
      image.data[i + 1] = keep ? 170 : 58;
      image.data[i + 2] = keep ? 68 : 58;
      image.data[i + 3] = Math.round(weight * 0.45);
    }
    context.putImageData(image, 0, 0);
  }, []);

  /** Fresh layers whenever the grid changes, keeping a draft's work if it fits. */
  useEffect(() => {
    if (!ink) {
      colourPaint.current = null;
      touchPaint.current = null;
      return;
    }
    const fits = (p: Paint | null) => p && p.width === ink.width && p.height === ink.height;
    colourPaint.current = fits(startColour) ? startColour : makePaint(ink.width, ink.height);
    touchPaint.current = fits(startTouch) ? startTouch : makePaint(ink.width, ink.height);
    colourPast.current.clear();
    touchPast.current.clear();
    setDepth(0);
    drawColour();
    drawTouch();
    // `startColour` and `startTouch` are where to begin, not things to follow:
    // re-running this when they change identity would throw away everything
    // painted since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ink]);

  const active = () => (touching ? touchPaint.current : colourPaint.current);
  const activePast = () => (touching ? touchPast.current : colourPast.current);
  const redrawActive = () => (touching ? drawTouch() : drawColour());
  const tellActive = () => {
    const layer = active();
    if (!layer) return;
    if (touching) onTouchChange(layer);
    else onColourChange(layer);
  };

  useImperativeHandle(handle, () => ({
    colour: () => colourPaint.current,
    touch: () => touchPaint.current,
    undo: () => {
      const layer = active();
      if (!layer || !activePast().undo(layer)) return;
      redrawActive();
      setDepth((n) => n + 1);
      tellActive();
    },
    redo: () => {
      const layer = active();
      if (!layer || !activePast().redo(layer)) return;
      redrawActive();
      setDepth((n) => n + 1);
      tellActive();
    },
    clearAll: () => {
      const layer = active();
      if (!layer) return;
      const whole = new Stroke(layer);
      whole.apply(range(layer.width * layer.height), null);
      const patch = whole.commit();
      if (patch) activePast().record(patch);
      redrawActive();
      setDepth((n) => n + 1);
      tellActive();
    },
  }));

  /* --------------------------------------------------------------- pointer */

  /** Where on the painting grid a pointer event landed. */
  const gridPoint = (event: React.PointerEvent): { x: number; y: number } | null => {
    const layer = active();
    const node = touchCanvas.current;
    if (!layer || !node) return null;
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const x = ((event.clientX - box.left) / box.width) * layer.width;
    const y = ((event.clientY - box.top) / box.height) * layer.height;
    if (x < 0 || y < 0 || x >= layer.width || y >= layer.height) return null;
    return { x, y };
  };

  /** What this tool paints: a colour, or nothing at all, which means erase. */
  const target = () => {
    if (tool === 'restore') return KEEP;
    if (tool === 'remove') return DROP;
    if (tool === 'eraser' || tool === 'automatic') return null;
    return parseColour(colour);
  };

  const begin = (event: React.PointerEvent) => {
    const layer = active();
    const point = gridPoint(event);
    if (!layer || !point) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    stroke.current = new Stroke(layer);

    if (tool === 'fill') {
      const found =
        barrier.current &&
        fillAt({ barrier: barrier.current, at: ((point.y | 0) * layer.width + point.x) | 0, gap });
      if (found) {
        stroke.current.apply(found.pixels, parseColour(colour));
        if (found.leaked) onLeak(found.share);
      }
      finish();
      return;
    }

    last.current = point;
    stamp(layer, point, point);
    redrawActive();
  };

  const move = (event: React.PointerEvent) => {
    const layer = active();
    const from = last.current;
    if (!stroke.current || !layer || !from || tool === 'fill') return;
    const point = gridPoint(event);
    if (!point) return;
    stamp(layer, from, point);
    last.current = point;
    redrawActive();
  };

  /** One length of a stroke, soft-edged for the touch-up brushes and hard for the rest. */
  const stamp = (layer: Paint, from: { x: number; y: number }, to: { x: number; y: number }) => {
    if (!stroke.current) return;
    if (touching) {
      stroke.current.applyEach(
        softSmear(layer.width, layer.height, from, to, brush, softness),
        target(),
      );
    } else if (from === to) {
      stroke.current.apply(disc(layer.width, layer.height, to.x, to.y, brush), target());
    } else {
      stroke.current.apply(smear(layer.width, layer.height, from, to, brush), target());
    }
  };

  const finish = () => {
    const patch = stroke.current?.commit();
    stroke.current = null;
    last.current = null;
    if (patch) {
      activePast().record(patch);
      setDepth((n) => n + 1);
    }
    redrawActive();
    if (patch) tellActive();
  };

  /* Undo from the keyboard, the same chord as everywhere else in the app. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      const node = event.target as HTMLElement | null;
      if (node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA')) return;
      event.preventDefault();
      if (event.shiftKey) handle.current?.redo();
      else handle.current?.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handle]);

  // Inset by exactly the margin the outline added above, so what is painted
  // sits on the drawing rather than a few pixels off it.
  const inset = {
    paddingLeft: `${pad.x * 100}%`,
    paddingRight: `${pad.x * 100}%`,
    paddingTop: `${pad.y * 100}%`,
    paddingBottom: `${pad.y * 100}%`,
  };

  return (
    <>
      <div className="absolute inset-0 z-0" style={inset}>
        <canvas ref={colourCanvas} aria-label="The colouring" className="h-full w-full" />
      </div>
      <div
        className="absolute inset-0 z-20"
        style={inset}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <canvas
          ref={touchCanvas}
          aria-label="The touch-up"
          className={cx('h-full w-full touch-none', touching ? 'opacity-100' : 'opacity-0')}
          style={{ cursor: tool === 'fill' ? 'crosshair' : 'cell' }}
        />
      </div>
      <span className="sr-only" aria-live="polite">
        {depth} changes
      </span>
    </>
  );
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');
