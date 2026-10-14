import type { ReactNode } from 'react';

/**
 * What each format actually looks like, at its real proportions.
 *
 * A row of seven identical rounded squares with icons in them tells you nothing
 * about the difference between a bookmark and a postcard. These are the shapes
 * themselves — 54×81 for a book page, 27×81 for a bookmark, 100×71 for a
 * postcard — so the row reads as a set of paper sizes, which is what it is.
 *
 * Every one is a sheet-white fill with a 1.5px ink outline and crop marks 5px
 * outside its corners, because that is how a proof of it would arrive from a
 * printer. The marks are drawn here rather than by the `.crop-marks` class: a
 * silhouette is not its plate, and the marks have to sit around the *paper*.
 *
 * All of it is inline SVG using the palette's own tokens, so it costs nothing
 * to load and follows whichever palette is on.
 */

/** 1px lines, 9px long, 5px outside each corner of the given box. */
function CropMarks({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  const gap = 5;
  const len = 9;
  const corners: [number, number, number, number][] = [
    [x - gap - len, y - gap, len, 1],
    [x - gap, y - gap - len, 1, len],
    [x + width + gap, y - gap, len, 1],
    [x + width + gap, y - gap - len, 1, len],
    [x - gap - len, y + height + gap, len, 1],
    [x - gap, y + height + gap, 1, len],
    [x + width + gap, y + height + gap, len, 1],
    [x + width + gap, y + height + gap, 1, len],
  ];
  return (
    <g fill="var(--color-ink-500)">
      {corners.map(([cx, cy, w, h], n) => (
        <rect key={n} x={cx} y={cy} width={w} height={h} />
      ))}
    </g>
  );
}

/** A sheet of paper: white fill, ink outline. */
function Sheet({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill="var(--color-sheet)"
      stroke="var(--color-outline)"
      strokeWidth={1.5}
    />
  );
}

/** The lines that stand for text on a page. */
function Lines({
  x,
  y,
  width,
  count,
  gap = 7,
  last = 0.6,
}: {
  x: number;
  y: number;
  width: number;
  count: number;
  gap?: number;
  /** How much of the width the final line runs to, the way a paragraph ends. */
  last?: number;
}) {
  return (
    <g fill="var(--color-ink-300)">
      {Array.from({ length: count }, (_, n) => (
        <rect
          key={n}
          x={x}
          y={y + n * gap}
          width={n === count - 1 ? width * last : width}
          height={2}
        />
      ))}
    </g>
  );
}

const BOX = { width: 144, height: 150 };

/** Centres a shape of this size in the plate. */
const at = (width: number, height: number) => ({
  x: Math.round((BOX.width - width) / 2),
  y: Math.round((BOX.height - height) / 2),
  width,
  height,
});

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${BOX.width} ${BOX.height}`}
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** A book's inside page: tall, with four lines of type on it. */
export function BookInterior() {
  const page = at(54, 81);
  return (
    <Frame>
      <CropMarks {...page} />
      <Sheet {...page} />
      <Lines x={page.x + 8} y={page.y + 16} width={page.width - 16} count={4} />
    </Frame>
  );
}

/** A cover, opened flat: back, spine, front — which is why it is twice as wide. */
export function BookCover() {
  const page = at(108, 81);
  const half = page.width / 2;
  return (
    <Frame>
      <CropMarks {...page} />
      <Sheet {...page} />
      <rect
        x={page.x + half}
        y={page.y}
        width={half}
        height={page.height}
        fill="var(--color-accenta-500)"
      />
      <rect
        x={page.x + half - 3}
        y={page.y}
        width={6}
        height={page.height}
        fill="var(--color-paper-200)"
      />
      <g fill="var(--color-sheet)">
        <rect x={page.x + half + 10} y={page.y + 22} width={half - 22} height={3} />
        <rect x={page.x + half + 10} y={page.y + 31} width={half - 32} height={3} />
      </g>
      <rect
        x={page.x}
        y={page.y}
        width={page.width}
        height={page.height}
        fill="none"
        stroke="var(--color-outline)"
        strokeWidth={1.5}
      />
    </Frame>
  );
}

/** A square post, with the one round thing in the set. */
export function InstagramPost() {
  const page = at(72, 72);
  return (
    <Frame>
      <CropMarks {...page} />
      <Sheet {...page} />
      <circle cx={page.x + page.width / 2} cy={page.y + 28} r={14} fill="var(--color-accentb-500)" />
      <Lines x={page.x + 14} y={page.y + 50} width={page.width - 28} count={2} />
    </Frame>
  );
}

/** A pin: the same tall page a book has, which is the point of the format. */
export function PinterestPin() {
  const page = at(54, 81);
  return (
    <Frame>
      <CropMarks {...page} />
      <Sheet {...page} />
      <rect
        x={page.x + 8}
        y={page.y + 8}
        width={page.width - 16}
        height={34}
        fill="var(--color-accentb-100)"
      />
      <Lines x={page.x + 8} y={page.y + 52} width={page.width - 16} count={3} />
    </Frame>
  );
}

/** A postcard: the one landscape sheet. */
export function Postcard() {
  const page = at(100, 71);
  return (
    <Frame>
      <CropMarks {...page} />
      <Sheet {...page} />
      <Lines x={page.x + 12} y={page.y + 20} width={page.width - 42} count={3} />
      <rect
        x={page.x + page.width - 24}
        y={page.y + 12}
        width={14}
        height={14}
        fill="none"
        stroke="var(--color-ink-300)"
      />
    </Frame>
  );
}

/** A bookmark: tall and narrow, with a tassel square at the top. */
export function Bookmark() {
  const page = at(27, 81);
  return (
    <Frame>
      <CropMarks {...page} />
      <Sheet {...page} />
      <rect x={page.x + 8} y={page.y + 8} width={11} height={11} fill="var(--color-accenta-500)" />
      <rect x={page.x + 8} y={page.y + 28} width={11} height={38} fill="var(--color-ink-300)" />
    </Frame>
  );
}

/** Stickers: the one thing in the set cut round rather than square. */
export function Stickers() {
  const size = 76;
  const page = at(size, size);
  const cx = page.x + size / 2;
  const cy = page.y + size / 2;
  return (
    <Frame>
      <CropMarks {...page} />
      {/* The die line, dashed, because it is a cut rather than an edge. */}
      <circle
        cx={cx}
        cy={cy}
        r={size / 2}
        fill="var(--color-sheet)"
        stroke="var(--color-outline)"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
      <circle cx={cx} cy={cy} r={size / 2 - 13} fill="var(--color-accentc-400)" />
    </Frame>
  );
}

/** Video editor: widescreen sheet with play button and timeline track. */
export function VideoEditor() {
  const page = at(96, 54);
  return (
    <Frame>
      <CropMarks {...page} />
      <Sheet {...page} />
      {/* Screen canvas */}
      <rect
        x={page.x + 5}
        y={page.y + 5}
        width={page.width - 10}
        height={page.height - 10}
        fill="var(--color-accentb-100)"
        rx={2}
      />
      {/* Center play triangle */}
      <polygon
        points={`${page.x + page.width / 2 - 4},${page.y + page.height / 2 - 10} ${page.x + page.width / 2 + 8},${page.y + page.height / 2 - 2} ${page.x + page.width / 2 - 4},${page.y + page.height / 2 + 6}`}
        fill="var(--color-accentb-500)"
      />
      {/* Timeline track and playhead */}
      <rect
        x={page.x + 8}
        y={page.y + page.height - 13}
        width={page.width - 16}
        height={2}
        fill="var(--color-ink-300)"
      />
      <rect
        x={page.x + 8}
        y={page.y + page.height - 13}
        width={26}
        height={2}
        fill="var(--color-accentb-500)"
      />
      <circle
        cx={page.x + 34}
        cy={page.y + page.height - 12}
        r={2.5}
        fill="var(--color-accentb-500)"
      />
    </Frame>
  );
}

export const SILHOUETTES: Record<string, () => React.ReactElement> = {
  'book-interior': BookInterior,
  'book-cover': BookCover,
  'instagram-post': InstagramPost,
  'pinterest-pin': PinterestPin,
  postcard: Postcard,
  bookmark: Bookmark,
  'sticker-studio': Stickers,
  'video-studio': VideoEditor,
};
