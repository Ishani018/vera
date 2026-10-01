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
  type Paint,
} from '@/lib/stickers/colour';
import type { InkResult } from '@/lib/lineart/client';

/**
 * The colouring itself: a canvas over the drawing that takes the pointer.
 *
 * It sits *under* the sticker picture rather than over it, which is not a
 * layering trick but the same order the export uses — the sticker PNG is
 * transparent everywhere except its lines, so colour drawn behind it shows
 * through exactly where a fill would. What you see while painting is what
 * comes out, without re-running the whole pipeline for every brush stroke.
 *
 * The pointer is taken by the wrapper rather than by the canvas, so the
 * picture on top can keep `pointer-events: none` and never swallow a click.
 */

export type Tool = 'fill' | 'brush' | 'eraser';

export type ColourHandle = {
  /** The layer itself, for the export and for saving with the draft. */
  paint: () => Paint | null;
  undo: () => void;
  redo: () => void;
  /** Throws away the last gesture, for the "that leaked" warning. */
  clearAll: () => void;
};

export function ColourLayer({
  ink,
  tool,
  colour,
  brush,
  gap,
  pad,
  handle,
  initial,
  onChange,
  onLeak,
}: {
  ink: InkResult | null;
  tool: Tool;
  colour: string;
  /** Radius in pixels of the colouring grid. */
  brush: number;
  gap: number;
  /** The outline margin in the picture above, as a fraction of its width. */
  pad: { x: number; y: number };
  handle: React.RefObject<ColourHandle | null>;
  /** A colour layer read back from a draft, to start from. */
  initial: Paint | null;
  onChange: (paint: Paint) => void;
  /** A fill that covered more than half the canvas, which almost never means to. */
  onLeak: (share: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const paint = useRef<Paint | null>(null);
  const history = useRef(new PaintHistory());
  const stroke = useRef<Stroke | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [depth, setDepth] = useState({ past: 0, future: 0 });

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

  /** A fresh layer whenever the grid changes, keeping a draft's colouring if it fits. */
  useEffect(() => {
    if (!ink) {
      paint.current = null;
      return;
    }
    const fresh =
      initial && initial.width === ink.width && initial.height === ink.height
        ? initial
        : makePaint(ink.width, ink.height);
    paint.current = fresh;
    history.current.clear();
    setDepth({ past: 0, future: 0 });
    draw();
    // `initial` is the starting point, not a thing to follow: re-running this
    // when it changes identity would throw away what has been painted since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ink]);

  const draw = useCallback(() => {
    const node = canvas.current;
    const layer = paint.current;
    if (!node || !layer) return;
    node.width = layer.width;
    node.height = layer.height;
    const context = node.getContext('2d');
    if (!context) return;
    const image = context.createImageData(layer.width, layer.height);
    image.data.set(layer.data);
    context.putImageData(image, 0, 0);
  }, []);

  useImperativeHandle(handle, () => ({
    paint: () => paint.current,
    undo: () => {
      if (!paint.current || !history.current.undo(paint.current)) return;
      draw();
      setDepth(history.current.depth);
      onChange(paint.current);
    },
    redo: () => {
      if (!paint.current || !history.current.redo(paint.current)) return;
      draw();
      setDepth(history.current.depth);
      onChange(paint.current);
    },
    clearAll: () => {
      const layer = paint.current;
      if (!layer) return;
      const whole = new Stroke(layer);
      whole.apply(range(layer.width * layer.height), null);
      const patch = whole.commit();
      if (patch) history.current.record(patch);
      draw();
      setDepth(history.current.depth);
      onChange(layer);
    },
  }));

  /* --------------------------------------------------------------- pointer */

  /** Where on the colouring grid a pointer event landed. */
  const gridPoint = (event: React.PointerEvent): { x: number; y: number } | null => {
    const layer = paint.current;
    const node = canvas.current;
    if (!layer || !node) return null;
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const x = ((event.clientX - box.left) / box.width) * layer.width;
    const y = ((event.clientY - box.top) / box.height) * layer.height;
    if (x < 0 || y < 0 || x >= layer.width || y >= layer.height) return null;
    return { x, y };
  };

  const begin = (event: React.PointerEvent) => {
    const layer = paint.current;
    const point = gridPoint(event);
    if (!layer || !point) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);

    const rgb = parseColour(colour);
    stroke.current = new Stroke(layer);

    if (tool === 'fill') {
      const found =
        barrier.current &&
        fillAt({
          barrier: barrier.current,
          at: ((point.y | 0) * layer.width + point.x) | 0,
          gap,
        });
      if (found) {
        stroke.current.apply(found.pixels, rgb);
        if (found.leaked) onLeak(found.share);
      }
      finish();
      return;
    }

    last.current = point;
    stroke.current.apply(disc(layer.width, layer.height, point.x, point.y, brush), tool === 'brush' ? rgb : null);
    draw();
  };

  const move = (event: React.PointerEvent) => {
    const layer = paint.current;
    const from = last.current;
    if (!stroke.current || !layer || !from || tool === 'fill') return;
    const point = gridPoint(event);
    if (!point) return;
    stroke.current.apply(
      smear(layer.width, layer.height, from, point, brush),
      tool === 'brush' ? parseColour(colour) : null,
    );
    last.current = point;
    draw();
  };

  const finish = () => {
    const patch = stroke.current?.commit();
    stroke.current = null;
    last.current = null;
    if (patch) {
      history.current.record(patch);
      setDepth(history.current.depth);
    }
    draw();
    if (paint.current) onChange(paint.current);
  };

  /* Undo from the keyboard, the same chord as everywhere else in the app. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      event.preventDefault();
      if (event.shiftKey) handle.current?.redo();
      else handle.current?.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handle]);

  return (
    <div
      className="absolute inset-0"
      style={{
        // Inset by exactly the margin the outline added above, so the colouring
        // sits on the drawing rather than a few pixels off it.
        paddingLeft: `${pad.x * 100}%`,
        paddingRight: `${pad.x * 100}%`,
        paddingTop: `${pad.y * 100}%`,
        paddingBottom: `${pad.y * 100}%`,
      }}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <canvas
        ref={canvas}
        aria-label="The colouring"
        className="h-full w-full touch-none"
        style={{ cursor: tool === 'fill' ? 'crosshair' : 'cell' }}
      />
      <span className="sr-only" aria-live="polite">
        {depth.past} changes to undo
      </span>
    </div>
  );
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
