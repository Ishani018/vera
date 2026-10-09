'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Info, Spinner, cx } from '../ui';

/**
 * The furniture of a studio: a stage that does not scroll away, a strip of
 * tools beside it, and a way of asking for a picture.
 *
 * All of it is layout. Nothing here knows what a sticker is, what the pipeline
 * does, or what any control means — it arranges things and gets out of the way.
 * The same shape as the design editor on purpose: a bar across the top, a rail
 * down the side, and the thing you are working on in the middle, always there.
 */

/** Far enough out to see a whole sticker, far enough in to place a pixel. */
const clampZoom = (zoom: number) => Math.min(4, Math.max(0.1, zoom));

/** What the zoom control offers, besides fit. */
const ZOOM_STEPS = [0.5, 1, 2];

/** Room left round the sticker so it is never flush against the pane. */
const BREATHING = 32;

export type Zoom = 'fit' | number;

/**
 * True once something has been going on for a while.
 *
 * Both of the waiting marks need this and they need different numbers: the
 * sheen appears almost at once so a control feels answered, the sentence waits
 * a second so it never flashes up for work that was over before it was read.
 */
export function useAfter(active: boolean, ms: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return shown;
}

/**
 * The picture, on a neutral grey, centred, and never scrolled out of view.
 *
 * Grey rather than white because the sticker is the only thing on this screen
 * with a colour of its own, and a warm page argues with a warm drawing. The
 * chequerboard is the stage itself rather than a frame round it, so what is
 * see-through reads as see-through at any zoom.
 */
export function Stage({
  width,
  height,
  children,
  overlay,
  tools,
  caption,
  working = false,
  rough = false,
}: {
  /** The picture's own size in pixels. Zero while there is nothing yet. */
  width: number;
  height: number;
  children: ReactNode;
  /** Notices and warnings, floated over the bottom of the stage. */
  overlay?: ReactNode;
  /** A vertical strip down the left of the stage, when a tool is in hand. */
  tools?: ReactNode;
  caption?: ReactNode;
  /** A new picture is being made. The old one stays up while it is. */
  working?: boolean;
  /** What is showing is the quick version, made while a control was moving. */
  rough?: boolean;
}) {
  const pane = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<Zoom>('fit');

  useEffect(() => {
    const node = pane.current;
    if (!node) return;
    const measure = (w: number, h: number) => setBox({ width: w, height: h });
    const observer = new ResizeObserver(([entry]) =>
      measure(entry.contentRect.width, entry.contentRect.height),
    );
    observer.observe(node);
    measure(node.clientWidth, node.clientHeight);
    return () => observer.disconnect();
  }, []);

  /**
   * Fit is whichever direction runs out first, never magnified past actual
   * size — the whole sticker on screen without scrolling for it, which is the
   * only sensible thing to open on.
   */
  const fit =
    width && height && box.width && box.height
      ? Math.min(1, (box.width - BREATHING) / width, (box.height - BREATHING) / height)
      : 0;
  const scale = zoom === 'fit' ? fit : zoom;

  /**
   * Ctrl or Cmd with the wheel zooms, as it does in every other canvas.
   *
   * Listened for rather than handed to React, because the default has to be
   * prevented and React attaches wheel handlers passively, where preventing it
   * does nothing and the whole page zooms instead.
   */
  useEffect(() => {
    const node = pane.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((current) => clampZoom((current === 'fit' ? fit : current) * Math.exp(-event.deltaY / 400)));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [fit]);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        {tools && (
          <div className="flex shrink-0 flex-col items-center gap-1 border-r border-black/20 bg-ground-rail px-1.5 py-2">
            {tools}
          </div>
        )}
        <div
          ref={pane}
          className="min-w-0 flex-1 overflow-auto bg-ground p-4"
          // Safe centring: centred while it fits, pinned to the corner rather
          // than cut off at both ends once it does not.
          style={{ display: 'flex', alignItems: 'safe center', justifyContent: 'safe center' }}
        >
          {scale > 0 ? (
            <div
              data-sticker-stage
              className="relative shrink-0 shadow-2xl"
              style={{
                width: Math.max(1, Math.round(width * scale)),
                height: Math.max(1, Math.round(height * scale)),
                // Both squares off-white rather than one of them white: the
                // commonest die-cut outline there is, is white, and on a board
                // with a white square a white outline is invisible — which is
                // the one thing this is here to show.
                backgroundColor: 'var(--chequer-light)',
                backgroundImage:
                  'linear-gradient(45deg, var(--chequer-dark) 25%, transparent 25%), ' +
                  'linear-gradient(-45deg, var(--chequer-dark) 25%, transparent 25%), ' +
                  'linear-gradient(45deg, transparent 75%, var(--chequer-dark) 75%), ' +
                  'linear-gradient(-45deg, transparent 75%, var(--chequer-dark) 75%)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
              }}
            >
              {children}
              {working && (
                /*
                  Over the picture, never in place of it. Replacing the picture
                  with a spinner would throw away the one thing somebody needs
                  to compare the new version against — and for a change that
                  takes 200 ms it would be a flash of nothing.
                */
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                >
                  <div className="working-sheen absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
                </div>
              )}
            </div>
          ) : (
            <span className="text-[14px] text-white/80">Working…</span>
          )}
        </div>
      </div>

      {/* Floated, so a long notice never pushes the picture off the screen. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3">
        {overlay && <div className="pointer-events-auto w-full max-w-xl">{overlay}</div>}
        <div className="flex w-full items-end justify-between gap-3">
          <p className="max-w-[46ch] text-[11.5px] leading-snug text-white/75">{caption}</p>
          {(working || rough) && (
            <span
              // Beside the zoom control, where the eye already goes for the
              // state of the picture, and in words as well as a spinner so it
              // is readable with motion turned down.
              role="status"
              title={
                rough
                  ? 'A quick version while the control is moving. The full-size one follows when you let go.'
                  : 'A new version is being made. What you can see is the last one.'
              }
              className="pointer-events-auto ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-ink-200 bg-paper/95 px-2.5 py-1 text-[11.5px] text-ink-700 shadow-lg"
            >
              {working && <Spinner size={12} />}
              {working ? 'Working…' : 'Quick preview'}
            </span>
          )}
          <div className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-full border border-ink-200 bg-paper/95 px-1.5 py-1 shadow-lg">
            <button
              type="button"
              title="Fit the whole sticker in the window"
              onClick={() => setZoom('fit')}
              aria-pressed={zoom === 'fit'}
              className={cx(
                // min-h-8: a 26px pill in a floating bar is a thing you aim at twice.
                'inline-flex min-h-8 items-center rounded-full px-2.5 text-[12px] transition-colors',
                zoom === 'fit' ? 'bg-ink-900 text-paper' : 'text-ink-700 hover:bg-ink-100',
              )}
            >
              Fit
            </button>
            {ZOOM_STEPS.map((step) => (
              <button
                key={step}
                type="button"
                title={step === 1 ? 'Actual size' : `Zoom to ${step * 100}%`}
                onClick={() => setZoom(step)}
                aria-pressed={zoom === step}
                className={cx(
                  'inline-flex min-h-8 items-center rounded-full px-2.5 text-[12px] tabular-nums',
                  'transition-colors',
                  zoom === step ? 'bg-ink-900 text-paper' : 'text-ink-700 hover:bg-ink-100',
                )}
              >
                {step * 100}
              </button>
            ))}
            <span
              title="How big the sticker is on screen now"
              className="pl-1 pr-1.5 text-[11px] tabular-nums text-ink-500"
            >
              {Math.round(scale * 100)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One tool in the strip beside the stage.
 *
 * A glyph, a tooltip and a clear sign of which one is in hand. Labels are in
 * the tooltip rather than under the glyph: the strip sits over a grey pane
 * where small text is hard to read, and the panel beside it already names what
 * each one does.
 */
export function ToolButton({
  glyph,
  label,
  active,
  onClick,
}: {
  glyph: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'grid h-10 w-10 place-items-center rounded-lg text-[17px] leading-none transition-colors',
        active ? 'bg-paper text-ink-900 shadow' : 'text-white/80 hover:bg-white/15 hover:text-white',
      )}
    >
      <span aria-hidden>{glyph}</span>
    </button>
  );
}

/** A thin rule between groups of tools. */
export const ToolRule = () => <span className="my-1 h-px w-6 bg-white/25" />;

/**
 * One named thing in a panel: a title, a line of help, and the control itself.
 *
 * The help is one short line. Anything longer belongs in a tooltip on the
 * control it is about — a panel of paragraphs is a panel nobody reads, and the
 * old screen had four of them before the first slider.
 */
export function Field({
  title,
  help,
  children,
}: {
  title?: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-ink-200 px-4 py-4 last:border-b-0">
      {/* The title stays; the sentence under it moves into the (i). */}
      {title && (
        <h4 className="text-[13.5px] font-[600] tracking-tight">
          {title}
          {help && <Info label={title}>{help}</Info>}
        </h4>
      )}
      <div className={cx(title || help ? 'mt-3' : '', 'flex flex-col gap-4')}>{children}</div>
    </div>
  );
}

/**
 * A section that starts closed.
 *
 * For the controls somebody sets once and then never looks at again. They are
 * not hidden — the heading says what is in there and one press opens it — but
 * they are not in the way of the three controls that get used every time, and
 * a panel that fits on the screen is a panel nobody has to scroll.
 *
 * `<details>` rather than state of our own: it is open to the keyboard, it is
 * found by the browser's own find-on-page, and it needs no JavaScript at all.
 */
export function Advanced({ title = 'Advanced', children }: { title?: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-ink-200 bg-ink-50/60">
      <summary
        className={cx(
          'flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[13px] font-[570]',
          'transition-colors duration-[var(--motion-fast)] hover:text-accent-600',
        )}
      >
        <span
          aria-hidden
          className="inline-block text-[10px] text-ink-500 transition-transform duration-[var(--motion-base)] ease-[var(--ease-out)] group-open:rotate-90"
        >
          ▶
        </span>
        {title}
      </summary>
      <div className="flex flex-col gap-4 px-3 pb-3 pt-1">{children}</div>
    </details>
  );
}

/**
 * Where a picture comes in: a target you can drop one on as well as press.
 *
 * Dropping is what anyone tries first with a file and a big dashed rectangle,
 * and until now it did nothing at all.
 */
export function DropZone({
  onFiles,
  busy,
  compact = false,
}: {
  onFiles: (files: FileList | null) => void;
  busy: boolean;
  /**
   * One row with a button, instead of a box you could park a car in.
   *
   * On the hub the drop zone is not the screen — what you have already made is
   * — so it says the same thing in 56 pixels and gets out of the way. The
   * marching dashes and the drop behaviour are identical; only the padding and
   * the arrangement change.
   */
  compact?: boolean;
}) {
  const [over, setOver] = useState(false);

  const drop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setOver(false);
      onFiles(event.dataTransfer.files);
    },
    [onFiles],
  );

  return (
    <label
      onDragOver={(event) => {
        // Both, and on every move: a dragover that is not prevented tells the
        // browser to open the file instead, and it asks again continuously.
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      data-over={over}
      className={cx(
        // The dashes travel slowly round the box, which says "put something
        // here" without a word. The border is drawn as four repeating
        // gradients rather than as a dashed border, because a border cannot be
        // animated without the browser laying the box out again.
        'cursor-pointer',
        /*
          The marching dashes are drawn as four repeating gradients sized to
          200% of the box, which needs a box tall enough to show a cycle. At 56
          pixels the two uprights come out as a tick each, so the compact one
          takes a plain dashed border instead — the same border the Lab's strip
          wears, which is where somebody meets this pattern next.
        */
        compact
          ? cx(
              // 113.6 tall on the mockup's 1738px window, so 76 here.
              'flex h-[76px] items-center gap-3 rounded-[8px] border border-dashed px-4',
              // `.dropzone[data-over]` carries the tint for the big one; the
              // compact one is not that class, so it says so itself.
              over ? 'border-ink-900 bg-paper-100' : 'border-ink-300',
            )
          : 'dropzone block px-8 py-14 text-center',
        busy && 'pointer-events-none opacity-50',
      )}
    >
      {compact ? (
        <>
          <span
            className="min-w-0 flex-1 truncate"
            style={{ fontSize: 'var(--studio-text-body)', color: 'var(--color-ink-500)' }}
          >
            {over ? 'Let go to open it' : 'Drop a picture or choose a file'}
          </span>
          <span
            className="btn btn-accent shrink-0 px-5 py-2.5"
            style={{ fontSize: 'var(--studio-text-body)' }}
          >
            Choose file
          </span>
        </>
      ) : (
        <>
          <span aria-hidden className="hop block text-[30px] leading-none">
            ⬚
          </span>
          <span className="mt-3 block text-[16.5px] font-[570]">
            {over ? 'Let go to open it' : 'Drop a picture here'}
          </span>
          <span className="mt-1 block text-[13.5px] text-ink-500">
            or press to choose one — PNG, JPEG or WebP
          </span>
        </>
      )}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => onFiles(event.target.files)}
      />
    </label>
  );
}
