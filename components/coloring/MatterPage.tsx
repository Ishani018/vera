'use client';

import { useEffect, useRef, useState } from 'react';
import { UnsupportedImageError, getAssetUrl } from '@/lib/assets';
import { useColoring } from '@/lib/coloring/store';
import { pageQuality } from '@/lib/coloring/quality';
import { ACCEPTED_TYPES } from './PageGrid';
import { matterArt } from '@/lib/render/coloringLayout';
import type { MatterSlot } from '@/lib/types';
import { Notice, Toggle, cx } from '../ui';

/**
 * One generated front-matter page: whether it prints at all, and whether it is
 * the built-in design or a drawing of your own.
 *
 * A drawing supplied here goes through exactly what a coloring page goes
 * through — the same cleanup, the same enlargement to 300 DPI, the same
 * placement inside the margins — because it is the same kind of thing. What it
 * never gets is a crop: a title page with its corner cut off is a mistake
 * rather than a choice.
 */
export function MatterPage({
  slot,
  label,
  hint,
  on,
  onToggle,
}: {
  slot: MatterSlot;
  label: string;
  hint: string;
  on: boolean;
  onToggle: (value: boolean) => void;
}) {
  const book = useColoring((s) => s.book);
  const setMatterArt = useColoring((s) => s.setMatterArt);
  const clearMatterArt = useColoring((s) => s.clearMatterArt);
  const busy = useColoring((s) => s.busy);
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const art = book ? matterArt(book, slot) : null;
  const shown = art?.lineArtAssetId ?? art?.sourceAssetId ?? null;

  useEffect(() => {
    let live = true;
    if (!shown) return setUrl(null);
    void getAssetUrl(shown).then((next) => live && setUrl(next));
    return () => {
      live = false;
    };
  }, [shown]);

  if (!book) return null;

  const take = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only JPG, PNG and WebP come in. Export an HEIC as JPEG first.');
      return;
    }
    try {
      await setMatterArt(slot, file);
    } catch (failure) {
      setError(
        failure instanceof UnsupportedImageError || failure instanceof Error
          ? failure.message
          : 'That image could not be read.',
      );
    }
  };

  const quality = art ? pageQuality(art, book) : null;

  return (
    <div>
      <Toggle label={label} hint={hint} checked={on} onChange={onToggle} />

      {on && (
        <div className="mt-2.5 rounded-xl border border-ink-200 bg-ink-100 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Choice selected={!art} onClick={() => clearMatterArt(slot)}>
              Built-in design
            </Choice>
            <Choice selected={Boolean(art)} onClick={() => fileRef.current?.click()}>
              {art ? 'My own image' : 'Use my own image…'}
            </Choice>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              void take(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          {art && (
            <div className="mt-3 flex items-start gap-3">
              <span className="grid h-[68px] w-[68px] shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-200 bg-paper">
                {url ? (
                  <img src={url} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[13px] text-ink-500">…</span>
                )}
              </span>
              <div className="min-w-0 flex-1 text-[13.5px] leading-snug">
                {busy.has(art.id) ? (
                  <p className="text-ink-500">Cleaning it up…</p>
                ) : (
                  <p className={cx(quality?.soft || quality?.stretched ? 'text-amber-800' : 'text-ink-500')}>
                    {art.naturalWidth}px
                    {quality && quality.factor > 1.01
                      ? `, enlarged ${quality.factor.toFixed(1)}×`
                      : ''}{' '}
                    — about {Math.round(quality?.dpi ?? 0)} DPI on the page.
                  </p>
                )}
                <p className="mt-1 text-ink-500">
                  Shown whole, inside the margins. Never cropped.
                </p>
                <div className="mt-1.5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="text-accent-500 underline"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => clearMatterArt(slot)}
                    className="text-ink-500 underline hover:text-ink-900"
                  >
                    Back to the built-in design
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* The app has one way of saying something went wrong; this used to
              have a second. */}
          {error && (
            <div className="mt-2">
              <Notice level="error">{error}</Notice>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-lg border-2 px-3 py-2 text-[14px] font-[550] transition-colors',
        selected ? 'border-accent-500 bg-accent-50 text-accent-500' : 'border-ink-200 bg-paper hover:border-ink-300',
      )}
    >
      {children}
    </button>
  );
}
