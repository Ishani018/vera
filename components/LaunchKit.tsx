'use client';

import { alive } from '@/lib/deleted';
import { useMemo, useState } from 'react';
import { PRESETS, presetById } from '@/lib/presets';
import { createDesign } from '@/lib/defaults';
import { exportDesign } from '@/lib/exportClient';
import { designThumb, presetThumb, type Thumb } from '@/lib/projects';
import type { AnyProject, FontSpec } from '@/lib/types';
import type { CoverPicture } from './CoverDesigner';
import { DesignEditor } from './DesignEditor';
import { CARD, cardHover, cardStyle } from './studio/Shell';
import { ThumbArt } from './ThumbArt';
import { cx } from './ui';

/**
 * Everything made for the book that is not the book.
 *
 * The designer underneath is the one the cover uses, given a different board.
 * A post and a cover are the same problem — text and pictures placed on a
 * fixed rectangle — and the only thing that differs is the rectangle and what
 * is marked on it.
 */
export function LaunchKit<T extends AnyProject>({
  project,
  update,
  displayFont,
  pictures = [],
  openDesign = null,
}: {
  project: T;
  update: (recipe: (draft: T) => void) => void;
  displayFont: Pick<FontSpec, 'family' | 'fallback'>;
  pictures?: CoverPicture[];
  /**
   * A design to open straight away, when the front page sent someone here for
   * one. It is already in the book by the time this mounts: the front page
   * writes it before it navigates, so nothing has to be created here while the
   * book is still being read off the disk.
   */
  openDesign?: string | null;
}) {
  // The trash is not the launch kit. A design deleted from the front page
  // must not still be sitting in the book it belonged to.
  const designs = alive(project.designs ?? []);
  const [openId, setOpenId] = useState<string | null>(openDesign);
  const open = designs.find((d) => d.id === openId) ?? null;

  const add = (presetId: string) => {
    const chosen = presetById(presetId);
    if (!chosen) return;
    const design = createDesign(presetId, chosen.name);
    update((draft) => {
      draft.designs ??= [];
      draft.designs.push(design);
    });
    setOpenId(design.id);
  };

  // What each format looks like with THIS book on it. Rebuilt only when the cover changes.
  const previews = useMemo(
    () => Object.fromEntries(PRESETS.map((p) => [p.id, presetThumb(project, p.id)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.cover?.frontImage?.assetId, project.cover?.backgroundColor, project.trim?.trimId],
  );

  /* ------------------------------------------------------------- editing one */

  if (open) {
    return (
      <DesignEditor
        design={open}
        update={(recipe) =>
          update((draft) => {
            const found = draft.designs?.find((d) => d.id === open.id);
            if (!found) return;
            recipe(found);
            found.updatedAt = Date.now();
          })
        }
        displayFont={displayFont}
        pictures={pictures}
        onExport={(format, scale) => exportDesign(project, open, format, scale)}
        onBack={() => setOpenId(null)}
      />
    );
  }

  /* ------------------------------------------------------------- the gallery */

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--studio-page)' }}>
      <div className="mx-auto w-full max-w-[1120px] px-6 py-8 sm:px-8">
        <h2 className="display text-[30px] tracking-tight">Launch kit</h2>
        <p className="mt-1.5 max-w-xl text-[15px] leading-snug" style={{ color: 'var(--color-ink-500)' }}>
          Posts, pins and a postcard for the book. Each is already the size the platform or printer
          asks for, and every picture in the book is waiting in the tray.
        </p>

        {designs.length > 0 && (
          <>
            <Eyebrow>Yours</Eyebrow>
            <ul className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {designs.map((design) => {
                const p = presetById(design.presetId);
                return (
                  <li key={design.id}>
                    <Card onClick={() => setOpenId(design.id)} thumb={designThumb(design)}>
                      <span className="block truncate text-[15px] font-[600]">{design.name}</span>
                      <span className="mt-0.5 block text-[12.5px]" style={{ color: 'var(--color-ink-500)' }}>
                        {p ? `${p.name} · ${p.stated}` : 'Unknown size'}
                      </span>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <Eyebrow>Start a new one</Eyebrow>
        <ul className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-3">
          {PRESETS.map((p) => (
            <li key={p.id}>
              <Card onClick={() => add(p.id)} thumb={previews[p.id]} tall>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-[600]">{p.name}</span>
                  <span
                    className="shrink-0 text-[11.5px] tabular-nums"
                    style={{ color: 'var(--color-ink-500)' }}
                  >
                    {p.stated}
                  </span>
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: 'var(--color-ink-500)' }}>
                  {p.note}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The small mono label over a group, the way the home screen marks its sections. */
function Eyebrow({ children }: { children: string }) {
  return (
    <h3 className="mono-label mt-9" style={{ fontSize: 11, color: 'var(--color-ink-500)' }}>
      {children}
    </h3>
  );
}

/**
 * A card with a picture on top: the thing itself, in its own shape, on a quiet
 * well. A design shows what it holds; a new one shows the format with the book's
 * cover standing on it.
 */
function Card({
  onClick,
  thumb,
  tall = false,
  children,
}: {
  onClick: () => void;
  thumb: Thumb;
  /** New-format cards get a taller well so a story and a postcard both read. */
  tall?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(CARD, cardHover, 'block w-full overflow-hidden text-left')}
      style={cardStyle}
    >
      <span
        className={cx('relative block w-full', tall ? 'h-52' : 'h-40')}
        style={{ background: 'var(--studio-page)' }}
      >
        {/* Fills the well and lets the drawing fit itself, so the shadow is cast by
            the board's own edge whatever its shape. */}
        <span
          className="absolute inset-[9%] block"
          style={{
            filter:
              'drop-shadow(0 1px 1px rgb(var(--shade) / 0.12)) drop-shadow(0 6px 8px rgb(var(--shade) / 0.22))',
          }}
        >
          <ThumbArt thumb={thumb} />
        </span>
      </span>
      <span className="block border-t px-4 py-3" style={{ borderColor: 'var(--studio-line)' }}>
        {children}
      </span>
    </button>
  );
}
