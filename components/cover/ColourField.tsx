'use client';

import { useEffect, useRef, useState } from 'react';
import {
  PALETTE,
  isHex,
  normaliseHex,
  readRecentColours,
  rememberColour,
} from '@/lib/palette';
import { cx } from '../ui';

/**
 * One colour, chosen.
 *
 * A swatch to press, twenty-four to choose from, the ones just used along the
 * top, and a picker underneath for when none of them is the colour. The point
 * of the palette is that most choices are made in one press: a picker with a
 * gradient in it is where you go when you know exactly what you want, not
 * where anyone should have to start.
 *
 * Typing into the hex box changes nothing until it is a colour, so half a hex
 * code on the way to a whole one does not repaint the board six times.
 */
export function ColourField({
  value,
  onChange,
  label,
  compact = false,
  sampled,
}: {
  value: string;
  onChange: (hex: string) => void;
  label: string;
  /** In a toolbar: the swatch alone, without the hex beside it. */
  compact?: boolean;
  /**
   * Colours read off the picture being worked on.
   *
   * Shown as a row that is always there, not only inside the popover, because
   * these are the colours the next press almost certainly wants: somebody
   * colouring their own drawing of their own cat is reaching for the cat's
   * ginger, and matching it by eye in a colour wheel takes four goes.
   */
  sampled?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [typed, setTyped] = useState(value);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setTyped(value), [value]);

  useEffect(() => {
    if (!open) return;
    setRecent(readRecentColours());
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

  const pick = (hex: string, keep = true) => {
    const colour = normaliseHex(hex);
    onChange(colour);
    if (keep) setRecent(rememberColour(colour));
  };

  const row = sampled?.length ? sampled.slice(0, 7) : null;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className={cx(
          'flex items-center gap-2 rounded-lg border border-ink-200 bg-paper transition-colors hover:border-ink-400',
          compact ? 'h-8 px-1.5' : 'w-full px-2 py-1.5',
        )}
      >
        <span
          className="h-5 w-5 shrink-0 rounded border border-black/15"
          style={{ background: value }}
        />
        {!compact && (
          <span className="font-mono text-[11px] uppercase text-ink-700">{value}</span>
        )}
      </button>

      {row && !compact && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="mr-0.5 text-[11px] text-ink-500">In your picture</span>
          {row.map((hex) => (
            <Swatch key={`in-${hex}`} hex={hex} name={`${hex}, from your picture`} current={value} onPick={pick} />
          ))}
        </div>
      )}

      {open && (
        <div className="absolute left-0 z-40 mt-1.5 w-[248px] rounded-xl border border-ink-200 bg-paper p-3 shadow-xl">
          {row && (
            <>
              <h5 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
                In your picture
              </h5>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {sampled!.map((hex) => (
                  <Swatch key={`from-${hex}`} hex={hex} name={hex} current={value} onPick={pick} />
                ))}
              </div>
            </>
          )}

          {recent.length > 0 && (
            <>
              <h5 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
                Just used
              </h5>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {recent.map((hex) => (
                  <Swatch key={`recent-${hex}`} hex={hex} name={hex} current={value} onPick={pick} />
                ))}
              </div>
            </>
          )}

          <h5 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
            Palette
          </h5>
          <div className="grid grid-cols-6 gap-1.5">
            {PALETTE.map((colour) => (
              <Swatch
                key={colour.hex}
                hex={colour.hex}
                name={colour.name}
                current={value}
                onPick={pick}
              />
            ))}
          </div>

          <h5 className="mb-1.5 mt-3 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
            Anything else
          </h5>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`${label}: pick a colour`}
              value={isHex(value) ? normaliseHex(value) : '#000000'}
              // Dragging around a colour wheel sends hundreds of these; the
              // last one is the one worth remembering.
              onChange={(e) => pick(e.target.value, false)}
              onBlur={(e) => pick(e.target.value)}
              className="h-8 w-10 shrink-0 cursor-pointer rounded border border-ink-200 bg-paper"
            />
            <input
              value={typed}
              aria-label={`${label} as a hex code`}
              spellCheck={false}
              onChange={(e) => {
                setTyped(e.target.value);
                if (isHex(e.target.value)) pick(e.target.value, false);
              }}
              onBlur={() => (isHex(typed) ? pick(typed) : setTyped(value))}
              className="h-8 w-full rounded-lg border border-ink-200 px-2 font-mono text-[12px] uppercase"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Swatch({
  hex,
  name,
  current,
  onPick,
}: {
  hex: string;
  name: string;
  current: string;
  onPick: (hex: string) => void;
}) {
  const chosen = normaliseHex(current) === normaliseHex(hex);
  return (
    <button
      type="button"
      title={name}
      aria-label={name}
      aria-pressed={chosen}
      onClick={() => onPick(hex)}
      className={cx(
        'pop-chosen h-7 w-7 rounded-md border transition-transform hover:scale-110',
        chosen ? 'border-ink-900 ring-2 ring-ink-900/20' : 'border-black/15',
      )}
      style={{ background: hex }}
    />
  );
}
