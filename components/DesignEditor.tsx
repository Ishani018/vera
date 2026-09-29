'use client';

import { useState, type ReactNode } from 'react';
import { boardFor, outputSize, presetById } from '@/lib/presets';
import type { Design, FontSpec } from '@/lib/types';
import { CoverDesigner, type CoverPicture } from './CoverDesigner';
import { Button, Notice, TextInput } from './ui';

/**
 * One design, open.
 *
 * The same screen whether the design lives inside a book or on its own: a bar
 * with its name and the sizes it can be exported at, and the cover designer
 * underneath on that design's board. Neither caller knows how the other
 * stores what it is editing — this takes a design, a way to change it, and a
 * way to export it, and nothing else.
 */
export function DesignEditor({
  design,
  update,
  displayFont,
  pictures = [],
  onExport,
  onBack,
  backLabel = '← Launch kit',
  aside,
}: {
  design: Design;
  /** Changes the design in place, wherever it is stored. */
  update: (recipe: (draft: Design) => void) => void;
  displayFont: Pick<FontSpec, 'family' | 'fallback'>;
  pictures?: CoverPicture[];
  onExport: (format: 'png' | 'jpg' | 'pdf', scale?: number) => Promise<{ ok: boolean; message: string }>;
  onBack: () => void;
  backLabel?: string;
  /** Anything the caller wants in the bar — the button for borrowing pictures. */
  aside?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const preset = presetById(design.presetId);
  if (!preset) {
    return (
      <div className="p-6">
        <Notice level="error">
          This design was made on a size the app no longer offers, so it cannot be opened.
        </Notice>
      </div>
    );
  }

  const board = boardFor(preset);
  const size = outputSize(preset, {});

  const download = async (format: 'png' | 'jpg' | 'pdf', scale?: number) => {
    setBusy(true);
    setStatus(null);
    try {
      const outcome = await onExport(format, scale);
      setStatus({ ok: outcome.ok, text: outcome.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-ink-200 bg-paper px-5 py-3">
        <button type="button" onClick={onBack} className="shrink-0 text-[13px] text-accent-500 underline">
          {backLabel}
        </button>
        <TextInput
          value={design.name}
          onChange={(e) => {
            const name = e.target.value;
            update((draft) => void (draft.name = name));
          }}
        />
        <span className="shrink-0 text-[12.5px] text-ink-500">
          {preset.name} · {preset.stated}
        </span>
        {aside}
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
          project={{ meta: DESIGN_META, trim: DESIGN_TRIM, cover: design.cover }}
          update={(recipe) =>
            update((draft) => {
              // The recipe is handed a live draft, so what it writes to `cover`
              // lands inside this design. `meta` and `trim` are only read, and
              // only by the parts of the designer a plain board does not use.
              recipe({ meta: DESIGN_META, trim: DESIGN_TRIM, cover: draft.cover });
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

/**
 * What a board has instead of a book's particulars.
 *
 * A board has no title, no trim size and no spine, and the designer only
 * reads these where it has already established that it is drawing a cover —
 * which a board never is. They exist so the shape matches; nothing reads them.
 */
const DESIGN_META = {
  title: '',
  subtitle: '',
  author: '',
  publisher: '',
  isbn: '',
  year: '',
  copyrightExtra: '',
};

const DESIGN_TRIM = { trimId: '6x9', bleed: false, paper: 'white' as const };
