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
  /** Dragging one somewhere, where somewhere accepts it. */
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
}) {
  const inside = (
    <>
      <Chequerboard
        className={cx(
          'peel aspect-square w-full rounded-lg border',
          'transition-[transform,box-shadow,border-color] duration-[--motion-base] ease-[--ease-out]',
          'shadow-[--shadow-rest]',
          selected ? 'border-accent-500' : 'border-ink-200',
          onClick &&
            !disabled &&
            'group-hover:-translate-y-0.5 group-hover:rotate-[-1.5deg] group-hover:border-accent-500 group-hover:shadow-[--shadow-raised]',
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name} className="max-h-[88%] max-w-[88%] object-contain" />
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
 * A pack, as three of its stickers held like a hand of cards.
 *
 * A pack has no picture of its own, and its name in a list is not something
 * anybody recognises — "the autumn ones" is recognised by seeing two leaves and
 * an acorn. Three fanned in perspective says "a stack of these"; a grid of four
 * says "four separate things", which is the one thing a pack is not.
 *
 * Fewer than three simply fans fewer. None leaves the square empty and says so,
 * rather than stretching one picture across the card.
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
  const three = urls.slice(0, 3);

  /** Back, middle, front. The front one is the least turned, as a held hand is. */
  const laid = [
    { turn: '-9deg', shift: '-11%', lean: '14deg' },
    { turn: '0deg', shift: '0%', lean: '0deg' },
    { turn: '9deg', shift: '11%', lean: '-14deg' },
  ].slice(3 - three.length);

  return (
    <Chequerboard
      // One label for the square, not one per picture: the card beside it
      // already carries the name, and three alt texts would read it four times.
      aria-label={`${name}, ${three.length} of them`}
      className={cx('fan aspect-square w-full rounded-lg border border-ink-200', className)}
    >
      {three.length === 0 ? (
        <span className="text-[11px] text-ink-500">empty</span>
      ) : (
        three.map((url, n) => (
          <span
            key={n}
            className="fan-card grid place-items-center bg-paper"
            style={
              {
                '--turn': laid[n].turn,
                '--shift': laid[n].shift,
                '--lean': laid[n].lean,
                zIndex: n + 1,
              } as React.CSSProperties
            }
          >
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="max-h-[82%] max-w-[82%] object-contain" />
            ) : null}
          </span>
        ))
      )}
    </Chequerboard>
  );
}
