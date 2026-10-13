/**
 * A board: a fixed-size rectangle with things placed on it.
 *
 * A KDP cover is one of these. So is an Instagram post, a Pinterest pin, a
 * postcard and a bookmark, which is the point — the geometry, the snapping,
 * the warnings and the renderer should not have to know which they are looking
 * at. What differs between them is their size and what is marked on them, and
 * both of those are data.
 *
 * Everything is in points. See `docs/DECISIONS.md`.
 */

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Something marked on a board that is not part of the artwork.
 *
 * Each carries the words to say about it, because a board knows what its own
 * marks are for and nothing downstream should have to keep a table of names.
 * "the spine" belongs to the cover that has one.
 */
export type Guide =
  /** Keep the important things inside this. */
  | { kind: 'safe'; label: string; rect: Rect }
  /** The board is folded here, so anything crossing it is bent. */
  | { kind: 'fold'; label: string; axis: 'x' | 'y'; at: number }
  /** Something else will be printed here, so leave it clear. */
  | { kind: 'reserved'; label: string; rect: Rect };

export type Board<Panel extends string = string> = {
  width: number;
  height: number;
  /** How much of each edge is trimmed off. Zero for anything not printed. */
  bleed: number;
  /**
   * Named areas to place things against. A cover has a front, a spine and a
   * back; a social post has only itself.
   */
  panels: Record<Panel, Rect>;
  guides: Guide[];
};

/** The whole board, bleed included. */
export const wholeOf = (board: Pick<Board, 'width' | 'height'>): Rect => ({
  x: 0,
  y: 0,
  width: board.width,
  height: board.height,
});

/** What survives the guillotine: the board less its bleed on every edge. */
export const trimOf = (board: Pick<Board, 'width' | 'height' | 'bleed'>): Rect => ({
  x: board.bleed,
  y: board.bleed,
  width: board.width - 2 * board.bleed,
  height: board.height - 2 * board.bleed,
});

/**
 * Where a front-cover picture goes: the front panel, then on to the board's edge
 * on the right, and to the top and bottom edges — the bleed that gets trimmed off.
 *
 * The front is the RIGHT-hand panel, so those are its outer edges. The rule used
 * to start one bleed to the LEFT of the front, over the spine, and stop at the
 * trim line: the mirror image of what it claimed, which left a white strip down
 * the outer edge of every cover with a picture on it. One function, used by the
 * export, the designer and the thumbnails, so the three cannot disagree again.
 */
export const frontImageRect = (
  board: Pick<Board, 'width' | 'height'>,
  front: Pick<Rect, 'x'>,
): Rect => ({
  x: front.x,
  y: 0,
  width: board.width - front.x,
  height: board.height,
});

export const foldsOf = (board: Pick<Board, 'guides'>): Array<Extract<Guide, { kind: 'fold' }>> =>
  board.guides.filter((g): g is Extract<Guide, { kind: 'fold' }> => g.kind === 'fold');

export const safeOf = (board: Pick<Board, 'guides'>): Array<Extract<Guide, { kind: 'safe' }>> =>
  board.guides.filter((g): g is Extract<Guide, { kind: 'safe' }> => g.kind === 'safe');

export const reservedOf = (
  board: Pick<Board, 'guides'>,
): Array<Extract<Guide, { kind: 'reserved' }>> =>
  board.guides.filter((g): g is Extract<Guide, { kind: 'reserved' }> => g.kind === 'reserved');

/** A plain board with nothing marked on it but its own safe area. */
export function plainBoard({
  width,
  height,
  bleed = 0,
  safeInset = 0,
  safeLabel = 'the edge',
}: {
  width: number;
  height: number;
  bleed?: number;
  safeInset?: number;
  safeLabel?: string;
}): Board<'board'> {
  const whole = { x: 0, y: 0, width, height };
  const trim = trimOf({ width, height, bleed });
  return {
    width,
    height,
    bleed,
    panels: { board: whole },
    guides: safeInset
      ? [
          {
            kind: 'safe',
            label: safeLabel,
            rect: {
              x: trim.x + safeInset,
              y: trim.y + safeInset,
              width: trim.width - 2 * safeInset,
              height: trim.height - 2 * safeInset,
            },
          },
        ]
      : [],
  };
}
