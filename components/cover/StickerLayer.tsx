'use client';

import { useEffect, useState } from 'react';
import { getAssetUrl } from '@/lib/assets';
import {
  angleTo,
  resizeFromCorner,
  snapAngle,
  snapLines,
  snapMove,
  type Corner,
  type Guide,
} from '@/lib/cover/stickerEdit';
import type { CoverLayout } from '@/lib/render/coverLayout';
import { stickerDpi } from '@/lib/render/stickers';
import { MIN_COVER_DPI } from '@/lib/kdp';
import type { CoverSticker } from '@/lib/types';
import { cx } from '../ui';

/**
 * The stickers on the cover, and the handles for moving them.
 *
 * Everything is positioned in inches scaled to the stage, so what is dragged
 * here is what lands in the PDF — the same numbers, through the same layout.
 * The handles live inside the rotated box rather than outside it, so that a
 * turned sticker's corners are still its corners.
 */
export function StickerLayer({
  stickers,
  layout,
  scale,
  selectedId,
  onSelect,
  onChange,
  onCommit,
}: {
  stickers: CoverSticker[];
  layout: CoverLayout;
  scale: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** During a drag. Called many times; must not touch the history. */
  onChange: (id: string, patch: Partial<CoverSticker>) => void;
  /** Once, at the start of a gesture, so one undo puts back the whole of it. */
  onCommit: () => void;
}) {
  const [guides, setGuides] = useState<Guide[]>([]);

  /**
   * Turns a pointer gesture into inches.
   *
   * The pointer is captured so a fast drag that leaves the sticker behind
   * keeps moving it, which is the difference between a control that feels
   * attached to the hand and one that keeps slipping out of it.
   */
  const gesture = (
    event: React.PointerEvent,
    onMove: (inchesX: number, inchesY: number, shift: boolean) => void,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onCommit();
    const startX = event.clientX;
    const startY = event.clientY;
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);

    const move = (e: PointerEvent) =>
      onMove((e.clientX - startX) / scale, (e.clientY - startY) / scale, e.shiftKey);
    const up = () => {
      element.releasePointerCapture(event.pointerId);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      setGuides([]);
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
  };

  const startMove = (sticker: CoverSticker, event: React.PointerEvent) => {
    const origin = { x: sticker.x, y: sticker.y };
    const lines = snapLines(layout, stickers.filter((s) => s.id !== sticker.id));
    gesture(event, (dx, dy) => {
      const moved = { ...sticker, x: origin.x + dx, y: origin.y + dy };
      const snapped = snapMove(moved, lines);
      setGuides(snapped.guides);
      onChange(sticker.id, { x: snapped.x, y: snapped.y });
    });
  };

  const startResize = (sticker: CoverSticker, corner: Corner, event: React.PointerEvent) => {
    gesture(event, (dx, dy, shift) => {
      onChange(sticker.id, resizeFromCorner(sticker, corner, dx, dy, { free: shift }));
    });
  };

  const startRotate = (sticker: CoverSticker, event: React.PointerEvent) => {
    const rect = (event.currentTarget as HTMLElement)
      .closest('[data-cover-stage]')!
      .getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();
    onCommit();
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);

    const move = (e: PointerEvent) => {
      const pointX = (e.clientX - rect.left) / scale;
      const pointY = (e.clientY - rect.top) / scale;
      const angle = angleTo(sticker, pointX, pointY);
      onChange(sticker.id, { rotate: e.shiftKey ? angle : snapAngle(angle) });
    };
    const up = () => {
      element.releasePointerCapture(event.pointerId);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
  };

  return (
    <>
      {stickers.map((sticker) => (
        <Sticker
          key={sticker.id}
          sticker={sticker}
          scale={scale}
          selected={sticker.id === selectedId}
          onSelect={() => onSelect(sticker.id)}
          onMove={(e) => startMove(sticker, e)}
          onResize={(corner, e) => startResize(sticker, corner, e)}
          onRotate={(e) => startRotate(sticker, e)}
        />
      ))}

      {/* Drawn last so a guide is never hidden under the thing it is guiding. */}
      {guides.map((guide, i) => (
        <div
          key={i}
          className={cx(
            'pointer-events-none absolute bg-fuchsia-500',
            guide.axis === 'x' ? 'top-0 w-px' : 'left-0 h-px',
          )}
          style={
            guide.axis === 'x'
              ? { left: guide.at * scale, height: layout.dimensions.height * scale }
              : { top: guide.at * scale, width: layout.dimensions.width * scale }
          }
        />
      ))}
    </>
  );
}

const CORNERS: Array<{ corner: Corner; style: string }> = [
  { corner: 'nw', style: '-left-1.5 -top-1.5 cursor-nwse-resize' },
  { corner: 'ne', style: '-right-1.5 -top-1.5 cursor-nesw-resize' },
  { corner: 'se', style: '-right-1.5 -bottom-1.5 cursor-nwse-resize' },
  { corner: 'sw', style: '-left-1.5 -bottom-1.5 cursor-nesw-resize' },
];

function Sticker({
  sticker,
  scale,
  selected,
  onSelect,
  onMove,
  onResize,
  onRotate,
}: {
  sticker: CoverSticker;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (event: React.PointerEvent) => void;
  onResize: (corner: Corner, event: React.PointerEvent) => void;
  onRotate: (event: React.PointerEvent) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getAssetUrl(sticker.assetId).then((next) => live && setUrl(next));
    return () => {
      live = false;
    };
  }, [sticker.assetId]);

  const shorter = Math.min(sticker.widthIn, sticker.heightIn);
  const soft = stickerDpi(sticker) < MIN_COVER_DPI;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={sticker.name || 'Sticker'}
      onPointerDown={(e) => {
        onSelect();
        onMove(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
      className={cx(
        'absolute cursor-move',
        selected ? 'outline outline-2 outline-sky-400' : 'hover:outline hover:outline-1 hover:outline-white/60',
      )}
      style={{
        left: sticker.x * scale,
        top: sticker.y * scale,
        width: sticker.widthIn * scale,
        height: sticker.heightIn * scale,
        transform: sticker.rotate ? `rotate(${sticker.rotate}deg)` : undefined,
        borderRadius: sticker.cornerRadius * shorter * scale,
        boxShadow: sticker.shadow ? '0 0.04in 0.09in rgba(0,0,0,0.33)' : undefined,
        border: sticker.border
          ? `${(sticker.border.widthPt / 72) * scale}px solid ${sticker.border.color}`
          : undefined,
        overflow: 'hidden',
      }}
    >
      {url && (
        <img
          src={url}
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full object-contain"
        />
      )}

      {selected && (
        <>
          {CORNERS.map(({ corner, style }) => (
            <span
              key={corner}
              onPointerDown={(e) => onResize(corner, e)}
              className={cx(
                'absolute h-3 w-3 rounded-sm border border-sky-700 bg-white shadow',
                style,
              )}
            />
          ))}
          {/* Above the top edge, where a handle for turning something belongs. */}
          <span
            onPointerDown={onRotate}
            title="Turn it"
            className="absolute -top-7 left-1/2 h-4 w-4 -translate-x-1/2 cursor-grab rounded-full border border-sky-700 bg-white shadow"
          />
          <span className="pointer-events-none absolute -top-7 left-1/2 h-7 w-px -translate-x-1/2 bg-sky-400" />
          {soft && (
            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-amber-200/90 py-0.5 text-center text-[10px] font-semibold text-amber-900">
              {Math.round(stickerDpi(sticker))} dpi
            </span>
          )}
        </>
      )}
    </div>
  );
}
