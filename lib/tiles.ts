import { presetById } from './presets';

/**
 * Everything the front page offers to make, in one list.
 *
 * One entry per tile, so adding a mode is adding a line here rather than
 * editing a screen. The size line is not written down twice: a tile that opens
 * a launch-kit board asks the preset what size it is, which means the front
 * page cannot drift from the board someone actually gets.
 */

export type TileCategory = 'books' | 'covers' | 'social' | 'print';

export type TileDestination =
  /** Pick a kind of interior, then open that editor. */
  | { kind: 'interior' }
  /** Open a book's cover. */
  | { kind: 'cover' }
  /** Start a launch-kit design on the named board. */
  | { kind: 'design'; presetId: string }
  /** Nothing to open yet. */
  | { kind: 'none' };

/** Which little drawing goes on the tile. Drawn in `Landing`, named here. */
export type TileArt = 'interior' | 'wrap' | 'square' | 'pin' | 'postcard' | 'bookmark';

export type Tile = {
  id: string;
  label: string;
  category: TileCategory;
  /**
   * The size line, when the tile is not a launch-kit board. A board states its
   * own size, so those tiles leave this out.
   */
  size?: string;
  /**
   * `ready` means it works today. Anything else is shown muted and cannot be
   * clicked: a tile that opens nothing is worse than no tile.
   */
  status: 'ready' | 'soon';
  destination: TileDestination;
  art: TileArt;
};

/**
 * A soft tint per category, behind each tile's drawing.
 *
 * Enough to group the tiles at a glance and not enough to shout: every one of
 * them carries ink-900 at better than fourteen to one, and sits within a fifth
 * of a stop of the card it is on.
 */
export const CATEGORY_TINT: Record<TileCategory, string> = {
  books: '#F3EDE1',
  covers: '#E6F0EE',
  social: '#E8EEF4',
  print: '#F4EAE4',
};

export const CATEGORIES: Array<{ id: TileCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'books', label: 'Books' },
  { id: 'covers', label: 'Covers' },
  { id: 'social', label: 'Social' },
  { id: 'print', label: 'Print' },
];

export const TILES: Tile[] = [
  {
    id: 'book-interior',
    label: 'Book interior',
    category: 'books',
    size: 'Any KDP trim size',
    status: 'ready',
    destination: { kind: 'interior' },
    art: 'interior',
  },
  {
    id: 'book-cover',
    label: 'Book cover',
    category: 'covers',
    size: 'KDP wrap: back, spine and front',
    status: 'ready',
    destination: { kind: 'cover' },
    art: 'wrap',
  },
  {
    id: 'instagram-post',
    label: 'Instagram post',
    category: 'social',
    status: 'ready',
    destination: { kind: 'design', presetId: 'instagram-post' },
    art: 'square',
  },
  {
    id: 'pinterest-pin',
    label: 'Pinterest pin',
    category: 'social',
    status: 'ready',
    destination: { kind: 'design', presetId: 'pinterest-pin' },
    art: 'pin',
  },
  {
    id: 'postcard',
    label: 'Postcard',
    category: 'print',
    status: 'ready',
    destination: { kind: 'design', presetId: 'postcard-a6' },
    art: 'postcard',
  },
  {
    id: 'bookmark',
    label: 'Bookmark',
    category: 'print',
    status: 'ready',
    destination: { kind: 'design', presetId: 'bookmark' },
    art: 'bookmark',
  },
];

/** What the tile says underneath its name. */
export function tileSize(tile: Tile): string {
  if (tile.destination.kind === 'design') {
    return presetById(tile.destination.presetId)?.stated ?? '';
  }
  return tile.size ?? '';
}

/** The kinds of interior, offered once a book interior is chosen. */
export const INTERIORS: Array<{
  id: 'poetry' | 'coloring' | 'activity';
  label: string;
  blurb: string;
  status: 'ready' | 'soon';
}> = [
  {
    id: 'poetry',
    label: 'Poetry',
    blurb: 'Verse set the way verse is set: long lines turned, a contents page with real page numbers.',
    status: 'ready',
  },
  {
    id: 'coloring',
    label: 'Colouring',
    blurb: 'Your own paintings and photographs turned into clean line art, and bound.',
    status: 'ready',
  },
  {
    id: 'activity',
    label: 'Activity',
    blurb: 'Puzzles, mazes and dot-to-dot. Not built yet.',
    status: 'soon',
  },
];
