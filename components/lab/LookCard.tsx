'use client';

import { cx } from '../ui';
import { Chequerboard } from '../stickers/Thumb';

/**
 * One look, shown on the picture somebody actually brought.
 *
 * A row of generic samples would be prettier and would tell you nothing: the
 * whole question is what YOUR photograph looks like as a pen drawing, and no
 * stock example answers it. So each card runs the real engine on the real
 * picture, once, small.
 *
 * The backdrop is the app's neutral transparency chequer, not the red and teal
 * checker — that motif belongs to the sidebar footer and nowhere else, and as a
 * backdrop it both shouts over the drawing and, being a fixed 200 by 50, used
 * to hold the canvas to 200 pixels wide.
 */
export function LookCard({
  label,
  blurb,
  src,
  busy,
  selected,
  onSelect,
}: {
  label: string;
  blurb: string;
  src: string | null;
  busy: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={blurb}
      className="proof block w-[128px] text-left"
    >
      <span
        className={cx(
          'plate block rounded-[6px] bg-paper-100 p-[3px]',
          /*
            The chosen one is ringed in the brand teal, the same teal as the
            rail's pill and the download button — so "this is the one you are
            looking at" is one colour across the screen rather than three.
          */
          selected && 'ring-2 ring-accentb-500',
        )}
      >
        <Chequerboard className="relative !block h-[90px] w-full rounded-[3px]">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="absolute inset-0 h-full w-full object-contain" />
          ) : null}
          {busy && <span className="skeleton absolute inset-0 block" aria-hidden="true" />}
        </Chequerboard>
        <span
          className="mt-[3px] block truncate px-0.5 leading-tight"
          style={{ fontSize: 11.5, fontWeight: 560 }}
        >
          {label}
        </span>
      </span>
    </button>
  );
}
