'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoverSpec } from '../types';

/**
 * Undo and redo for the cover, one gesture at a time.
 *
 * Its own small history rather than the poetry store's, because the cover
 * designer now serves both kinds of book and a coloring book has no undo of
 * its own. It is also the right size: a cover is a few dozen objects, so a
 * stack of whole snapshots costs nothing and cannot drift out of step with the
 * thing it describes the way a stack of reversible operations can.
 *
 * A snapshot is taken at the start of a gesture rather than the end, so one
 * undo puts back what was there before the drag — not some frame in the middle
 * of it.
 */
const LIMIT = 60;

/** Input types someone types into, which therefore have an undo of their own. */
const TYPED = /^(text|search|url|tel|email|password|number|date|time|datetime-local|month|week)$/;

export function useCoverHistory(cover: CoverSpec, apply: (spec: CoverSpec) => void) {
  const latest = useRef(cover);
  latest.current = cover;

  const past = useRef<CoverSpec[]>([]);
  const future = useRef<CoverSpec[]>([]);
  // Only so the buttons can go grey; the stacks themselves live in refs.
  const [depth, setDepth] = useState({ past: 0, future: 0 });
  const sync = () => setDepth({ past: past.current.length, future: future.current.length });

  /** Call once, before a change. Repeated calls during one drag are the caller's to avoid. */
  const remember = useCallback(() => {
    past.current.push(structuredClone(latest.current));
    if (past.current.length > LIMIT) past.current.shift();
    future.current = [];
    sync();
  }, []);

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(structuredClone(latest.current));
    apply(previous);
    sync();
  }, [apply]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(structuredClone(latest.current));
    apply(next);
    sync();
  }, [apply]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      // Let a text field have its own undo; it is the more specific thing. A
      // slider or a checkbox has no undo of its own, though, so leaving the
      // focus on one must not swallow the cover's — which is exactly where the
      // focus is left after dragging the curve slider.
      if (target?.tagName === 'TEXTAREA') return;
      if (target?.tagName === 'INPUT' && TYPED.test((target as HTMLInputElement).type)) return;
      if (target?.isContentEditable) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return { remember, undo, redo, canUndo: depth.past > 0, canRedo: depth.future > 0 };
}
