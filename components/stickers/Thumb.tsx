'use client';

import type { ReactNode } from 'react';
import { cx } from '../ui';

/**
 * A sticker, shown as a picture rather than listed as a name.
 *
 * The one rule this enforces everywhere it is used: the picture is big and the
 * name is small underneath it. A sticker is chosen by eye — nobody remembers
 * which of forty things they called "Leaf 2" — so a list of names with
 * thumbnails beside them is a list nobody can use.
 *
 * The chequerboard is the backdrop rather than a border, and both its squares
 * are off-white, because a white sticker on a white card is an empty card and
 * the commonest die-cut outline there is, is white.
 */

export const CHEQUER = {
  backgroundColor: 'var(--chequer-light)',
  backgroundImage:
    'linear-gradient(45deg, var(--chequer-dark) 25%, transparent 25%), ' +
    'linear-gradient(-45deg, var(--chequer-dark) 25%, transparent 25%), ' +
    'linear-gradient(45deg, transparent 75%, var(--chequer-dark) 75%), ' +
    'linear-gradient(-45deg, transparent 75%, var(--chequer-dark) 75%)',
  backgroundSize: '14px 14px',
  backgroundPosition: '0 0, 0 7px, 7px -7px, -7px 0px',
} as const;

export function Chequerboard({
  children,
  className,
  style,
  'aria-label': label,
}: {
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
}) {
  return (
    <span
      aria-label={label}
      role={label ? 'img' : undefined}
      className={cx('grid place-items-center overflow-hidden', className)}
      style={{ ...CHEQUER, ...style }}
    >
      {children}
    </span>
  );
}

export function Thumb({
  url,
  name,
  note,
  title,
  onClick,
  selected = false,
  disabled = false,
  badge,
  corner,
  className,
  style,
  draggable,
  onDragStart,
}: {
  url: string | null | undefined;
  name: string;
  /** A second line under the name — a pack, a size, a count. */
  note?: string;
  /** The tooltip. The full name by default, since the label is truncated. */
  title?: string;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  /** Shown over the top-right of the picture: a count, usually. */
  badge?: ReactNode;
  /** Shown over the top-left: an action that belongs to this one. */
  corner?: ReactNode;
  className?: string;
  /** For the custom properties an animation reads, such as a stagger's `--n`. */
  style?: React.CSSProperties;
  /** Dragging one somewhere, where somewhere accepts it. */
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
}) {
  const inside = (
    <>
      <Chequerboard
        className={cx(
          'peel aspect-square w-full rounded-lg border',
          'transition-[transform,box-shadow,border-color] duration-[var(--motion-base)] ease-[var(--ease-out)]',
          'shadow-[var(--shadow-rest)]',
          selected ? 'border-accent-500' : 'border-ink-200',
          onClick &&
            !disabled &&
            'group-hover:-translate-y-0.5 group-hover:rotate-[-1.5deg] group-hover:border-accent-500 group-hover:shadow-[var(--shadow-raised)]',
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name} className="max-h-[88%] max-w-[88%] object-contain [filter:drop-shadow(0_3px_5px_rgba(0,0,0,0.18))]" />
        ) : (
          <span className="text-[11px] text-ink-500">no picture</span>
        )}
      </Chequerboard>
      <span className="mt-1 block truncate text-[12px] leading-tight text-ink-700">{name}</span>
      {note && <span className="block truncate text-[11px] leading-tight text-ink-500">{note}</span>}
    </>
  );

  const shell = 'block min-w-0 text-left w-full';
  return (
    /*
      The badge and the corner button live *beside* the tile, not inside it: a
      button inside a button is invalid HTML, and a browser is free to do
      whatever it likes with the inner one — which here is the control that
      takes a sticker back off.
    */
    <span
      className={cx('group relative block min-w-0', className)}
      style={style}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      {onClick ? (
        <button
          type="button"
          title={title ?? name}
          onClick={onClick}
          disabled={disabled}
          className={cx(shell, disabled && 'opacity-50')}
        >
          {inside}
        </button>
      ) : (
        <span title={title ?? name} className={shell}>
          {inside}
        </span>
      )}
      {badge}
      {corner}
    </span>
  );
}

/**
 * A pack, as the first four of its stickers in one square.
 *
 * A pack has no picture of its own, and its name in a list is not something
 * anybody recognises — "the autumn ones" is recognised by seeing two leaves and
 * an acorn. Four tiles with a hairline between them, flat, in the order they
 * were installed.
 *
 * It replaced a 3D fan that spread on hover. A pack is a thing you open, not a
 * hand of cards you riffle, and the fan was motion for its own sake.
 */
export function Fan({
  urls,
  name,
  className,
}: {
  urls: (string | null | undefined)[];
  name: string;
  className?: string;
}) {
  const four = urls.slice(0, 4);

  return (
    <Chequerboard
      // One label for the square, not one per picture: the card beside it
      // already carries the name, and four alt texts would read it five times.
      aria-label={`${name}, ${four.length} of them`}
      className={cx('collage aspect-square w-full rounded-[6px] border border-ink-300', className)}
    >
      {four.length === 0 ? (
        <span className="col-span-2 row-span-2 grid place-items-center bg-sheet text-[11px] text-ink-500">
          empty
        </span>
      ) : (
        Array.from({ length: 4 }, (_, n) => (
          <span key={n} className="collage-card grid place-items-center">
            {four[n] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={four[n] as string} alt="" className="max-h-[78%] max-w-[78%] object-contain" />
            ) : null}
          </span>
        ))
      )}
    </Chequerboard>
  );
}
