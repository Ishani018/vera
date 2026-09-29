'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  showName = true,
  bookTray,
  rail = false,
  borrow = null,
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
  /**
   * Whether the bar carries the name and the size. False where the page's own
   * header already says both, which is once.
   */
  showName?: boolean;
  /** Passed through: what the tray of borrowed pictures is called, or nothing. */
  bookTray?: { title: string; empty: string } | null;
  /** Passed through: the rail, and what goes in its Pictures panel. */
  rail?: boolean;
  borrow?: ReactNode;
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

  /**
   * What this board can be downloaded as, in the order someone wants them.
   *
   * A post is looked at on a screen, so its pixels come first and its PDF is
   * the afterthought; a postcard is printed, so the PDF is the whole point and
   * the picture is for the listing. One menu either way, because three
   * equal-weight buttons make the reader decide before they have a reason to.
   */
  const choices: Choice[] =
    preset.kind === 'screen'
      ? [
          { label: `PNG · ${size.widthPx} × ${size.heightPx}`, format: 'png', scale: 1 },
          { label: `PNG ×2 · ${size.widthPx * 2} × ${size.heightPx * 2}`, format: 'png', scale: 2 },
          { label: 'JPG', format: 'jpg', scale: 1 },
          { label: 'PDF', format: 'pdf' },
        ]
      : [
          { label: 'PDF · for printing', format: 'pdf' },
          { label: 'PNG · 300 DPI', format: 'png' },
          { label: 'JPG · 300 DPI', format: 'jpg' },
        ];

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
        {showName && (
          <>
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
          </>
        )}
        {aside}
        <div className="ml-auto shrink-0">
          <DownloadMenu busy={busy} choices={choices} onPick={download} />
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
          bookTray={bookTray}
          rail={rail}
          borrow={borrow}
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

type Choice = { label: string; format: 'png' | 'jpg' | 'pdf'; scale?: number };

/**
 * One button that downloads, and a short list of what as.
 *
 * Closed on a click anywhere else and on Escape, because a menu that only
 * closes by choosing something is a menu that has to be obeyed.
 */
function DownloadMenu({
  busy,
  choices,
  onPick,
}: {
  busy: boolean;
  choices: Choice[];
  onPick: (format: 'png' | 'jpg' | 'pdf', scale?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <Button
        variant="primary"
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((was) => !was)}
      >
        {busy ? 'Rendering…' : 'Download ▾'}
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-60 overflow-hidden rounded-xl border border-ink-200 bg-paper py-1 shadow-xl"
        >
          {choices.map((choice) => (
            <button
              key={choice.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(choice.format, choice.scale);
              }}
              className="block w-full px-3.5 py-2 text-left text-[14px] text-ink-900 transition-colors hover:bg-ink-100"
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
