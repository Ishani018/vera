'use client';

import type { Board } from '@/lib/board';
import {
  BROWSE_HEIGHT_PX,
  judgeCover,
  type Legibility,
} from '@/lib/legibility';
import { frontThumb } from '@/lib/projects';
import type { CoverSpec } from '@/lib/types';
import { ThumbArt } from '../ThumbArt';
import { Notice, cx } from '../ui';
import { SectionHeading } from '../panel/Panel';

/**
 * The cover at the size people actually meet it.
 *
 * A cover is designed at nine inches and sold at about one. Almost nobody sees
 * it full size before deciding whether to click, so the only honest test of a
 * cover is to look at it small — and the way to make someone do that is to put
 * it small, next to the big one, where they cannot avoid it.
 *
 * The picture is the point; the note underneath is the part that can be argued
 * with. Both are shown, because a number without the thing it describes is
 * easy to dismiss and a thing without a number is easy to rationalise.
 */
export function BrowseSize({
  cover,
  layout,
  /** True where a picture covers the part of the cover the title sits on. */
  overPicture,
}: {
  cover: CoverSpec;
  layout: Board<string> & { bleed: number };
  overPicture: boolean;
}) {
  const thumb = frontThumb(cover, layout as never);
  const judged = judgeCover(cover, layout.height, { overPicture });
  const width = thumb.height ? (thumb.width / thumb.height) * BROWSE_HEIGHT_PX : BROWSE_HEIGHT_PX;

  return (
    <div className="space-y-2">
      <SectionHeading>At a search result&rsquo;s size</SectionHeading>

      <div className="flex items-start gap-3">
        <span
          className="shrink-0 overflow-hidden rounded-sm bg-ink-100 shadow-md ring-1 ring-black/10"
          style={{ width: Math.round(width), height: BROWSE_HEIGHT_PX }}
        >
          <ThumbArt thumb={thumb} />
        </span>
        <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-ink-500">
          {Math.round(width)} × {BROWSE_HEIGHT_PX} px — about what a shopper sees before they
          decide whether to look closer.
          {judged.title && (
            <span className="mt-1.5 block">
              Judging: <span className="text-ink-700">&ldquo;{clip(judged.title)}&rdquo;</span>
            </span>
          )}
        </span>
      </div>

      <Notice level={levelOf(judged)}>
        <span className="block font-[570]">{headline(judged)}</span>
        {judged.notes.map((note) => (
          <span key={note} className="mt-1 block">
            {note}
          </span>
        ))}
      </Notice>

      <details className="text-[11px] text-ink-500">
        <summary className={cx('cursor-pointer select-none', 'hover:text-ink-700')}>
          How this is decided
        </summary>
        <p className="mt-1.5 leading-snug">
          The biggest piece of text on the front is taken as the title. Its type size is scaled
          down by the same amount the cover is, and read in pixels: under 9 the letters stop being
          distinguishable, and 14 is where a title is read at a glance rather than squinted at.
          Contrast is the WCAG ratio against the colour behind it, held to the 4.5:1 that small
          text needs — a title is large type when printed and small type when browsed, and it is
          the browsing that decides whether anyone ever prints it. Over a picture there is no one
          colour behind the words, so that half is left to your eye rather than guessed at.
        </p>
      </details>
    </div>
  );
}

const clip = (text: string) => (text.length > 40 ? `${text.slice(0, 39)}…` : text);

function levelOf(judged: Legibility): 'ok' | 'warning' | 'info' {
  if (judged.verdict === 'unreadable') return 'warning';
  if (judged.verdict === 'tight') return 'warning';
  if (judged.verdict === 'nothing-to-judge') return 'info';
  return 'ok';
}

function headline(judged: Legibility): string {
  switch (judged.verdict) {
    case 'unreadable':
      return 'The title will not read at this size';
    case 'tight':
      return 'The title is readable, but only just';
    case 'nothing-to-judge':
      return 'Nothing on the front to judge yet';
    default:
      return 'The title reads at this size';
  }
}
