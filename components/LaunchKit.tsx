'use client';

import { useState } from 'react';
import { boardFor, outputSize, PRESETS, presetById } from '@/lib/presets';
import { createDesign } from '@/lib/defaults';
import { exportDesign } from '@/lib/exportClient';
import type { AnyProject, FontSpec } from '@/lib/types';
import { CoverDesigner, type CoverPicture } from './CoverDesigner';
import { Button, Notice, TextInput, cx } from './ui';

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
  const designs = project.designs ?? [];
  const [openId, setOpenId] = useState<string | null>(openDesign);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const open = designs.find((d) => d.id === openId) ?? null;
  const preset = open ? presetById(open.presetId) : null;

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

  /* ------------------------------------------------------------- editing one */

  if (open && preset) {
    const board = boardFor(preset);
    const size = outputSize(preset, {});
    const download = async (format: 'png' | 'jpg' | 'pdf', scale?: number) => {
      setBusy(true);
      setStatus(null);
      try {
        const outcome = await exportDesign(project, open, format, scale);
        setStatus({ ok: outcome.ok, text: outcome.message });
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-3 border-b border-ink-200 bg-paper px-5 py-3">
          <button
            type="button"
            onClick={() => setOpenId(null)}
            className="text-[13px] text-accent-500 underline"
          >
            ← Launch kit
          </button>
          <TextInput
            value={open.name}
            onChange={(e) =>
              update((draft) => {
                const found = draft.designs?.find((d) => d.id === open.id);
                if (found) found.name = e.target.value;
              })
            }
          />
          <span className="shrink-0 text-[12.5px] text-ink-500">
            {preset.name} · {preset.stated}
          </span>
          <div className="ml-auto flex shrink-0 gap-1.5">
            {preset.kind === 'screen' ? (
              <>
                <Button disabled={busy} onClick={() => void download('png', 1)}>
                  {busy ? 'Rendering…' : `PNG ${size.widthPx}×${size.heightPx}`}
                </Button>
                <Button disabled={busy} onClick={() => void download('png', 2)}>
                  PNG ×2
                </Button>
                <Button disabled={busy} onClick={() => void download('jpg', 1)}>
                  JPG
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" disabled={busy} onClick={() => void download('pdf')}>
                  {busy ? 'Rendering…' : 'Print PDF'}
                </Button>
                <Button disabled={busy} onClick={() => void download('png')}>
                  PNG at 300
                </Button>
              </>
            )}
          </div>
        </div>

        {status && (
          <div className="border-b border-ink-200 px-5 py-2">
            <Notice level={status.ok ? 'ok' : 'error'}>{status.text}</Notice>
          </div>
        )}

        <div className="min-h-0 flex-1">
          <CoverDesigner
            project={{ meta: project.meta, trim: project.trim, cover: open.cover }}
            update={(recipe) =>
              update((draft) => {
                const found = draft.designs?.find((d) => d.id === open.id);
                if (!found) return;
                // The recipe is handed a live draft, so what it writes to
                // `cover` lands inside this design rather than on the book's
                // own cover. `meta` and `trim` are only read.
                recipe({ meta: draft.meta, trim: draft.trim, cover: found.cover });
              })
            }
            pageCount={24}
            displayFont={displayFont}
            pictures={pictures}
            board={board}
          />
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------- the gallery */

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <h3 className="text-[16px] font-semibold">Launch kit</h3>
      <p className="mt-1 max-w-xl text-[14px] leading-snug text-ink-500">
        The things around the book: a post to announce it, a pin people find months later, a
        postcard for the signing table. Each one is already the size the platform or the printer
        asks for, and every picture in the book is waiting in the tray.
      </p>

      {designs.length > 0 && (
        <ul className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
          {designs.map((design) => {
            const p = presetById(design.presetId);
            return (
              <li key={design.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(design.id)}
                  className="w-full rounded-lg border border-ink-200 bg-paper p-3 text-left transition-colors hover:border-accent-500"
                >
                  <span className="block truncate text-[14px] font-[550]">{design.name}</span>
                  <span className="mt-0.5 block text-[12px] text-ink-500">
                    {p ? `${p.name} · ${p.stated}` : 'Unknown size'}
                  </span>
                  <span className="mt-1.5 block text-[11px] text-ink-500">
                    {design.cover.stickers.length} picture
                    {design.cover.stickers.length === 1 ? '' : 's'} ·{' '}
                    {design.cover.textBoxes.length} text
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <h4 className="mt-7 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        Start a new one
      </h4>
      <ul className="mt-2.5 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        {PRESETS.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => add(p.id)}
              className={cx(
                'w-full rounded-lg border border-dashed border-ink-300 bg-ink-50 p-3 text-left',
                'transition-colors hover:border-accent-500 hover:bg-paper',
              )}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-[550]">{p.name}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-ink-500">{p.stated}</span>
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-ink-500">{p.note}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
