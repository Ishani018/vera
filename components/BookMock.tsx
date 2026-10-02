/**
 * A book, turning slowly, on the first screen.
 *
 * This app makes books, so the first screen shows one. Five faces and two
 * rotations, in CSS — no canvas, no WebGL, no image. It costs nothing to load,
 * it is crisp at any size, and it takes its colours from whichever theme is on,
 * which an illustration could not do.
 *
 * Decorative: `aria-hidden`, nothing in it is read out, and the hero's own words
 * say what the page is for. It does take the pointer, though — that is how it
 * knows to stop turning while somebody is looking at it, and `pointer-events:
 * none` would make that rule unreachable. It sits in its own space at the end of
 * the band with nothing behind it to click.
 */
export function BookMock({
  width = 104,
  height = 148,
  depth = 20,
  className,
}: {
  width?: number;
  height?: number;
  /** How thick. The spine, the fore edge and the top are all built from it. */
  depth?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`book select-none ${className ?? ''}`}
      style={{ width, height }}
    >
      <div className="book-float relative size-full">
        <div
          className="book-turn size-full"
          style={{ '--depth': `${depth}px` } as React.CSSProperties}
        >
          <span className="book-face book-back" />
          <span className="book-face book-spine" />
          <span className="book-face book-leaves" />
          <span className="book-face book-top" />
          <span className="book-face book-front" />
        </div>
      </div>
      <span className="book-shadow" />
    </div>
  );
}
