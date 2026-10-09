'use client';

import type { FontSpec, TextTransform } from '@/lib/types';
import { FontPicker } from './FontPicker';
import { ControlLabel, PanelField as Field } from './panel/Panel';
import { NumberInput, Select, Slider, cx } from './ui';

type Options = {
  showAlign?: boolean;
  showLineHeight?: boolean;
  showColor?: boolean;
  /**
   * The four a floating toolbar takes over. Hidden rather than duplicated:
   * the same setting in two places is two places to look and one to be wrong.
   */
  showFamily?: boolean;
  showSize?: boolean;
  showWeight?: boolean;
  showItalic?: boolean;
};

export function FontControls({
  spec,
  onChange,
  options = {},
}: {
  spec: FontSpec;
  onChange: (patch: Partial<FontSpec>) => void;
  options?: Options;
}) {
  const {
    showAlign = true,
    showLineHeight = true,
    showColor = true,
    showFamily = true,
    showSize = true,
    showWeight = true,
    showItalic = true,
  } = options;

  return (
    <div style={{ display: 'grid', gap: 'var(--panel-gap)' }}>
      {showFamily && (
        <FontPicker
          value={spec.family}
          onChange={(family, fallback) => onChange({ family, fallback })}
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        {showSize && (
          <Field label="Size">
            <NumberInput
              value={spec.sizePt}
              onChange={(sizePt) => onChange({ sizePt })}
              step={0.25}
              min={5}
              max={72}
              suffix="pt"
            />
          </Field>
        )}
        {showLineHeight && (
          <Field label="Leading">
            <NumberInput
              value={spec.lineHeight}
              onChange={(lineHeight) => onChange({ lineHeight })}
              step={0.05}
              min={0.8}
              max={3}
            />
          </Field>
        )}
      </div>

      <Field label="Letter spacing">
        <Slider
          value={spec.letterSpacingEm}
          onChange={(letterSpacingEm) => onChange({ letterSpacingEm })}
          min={-0.05}
          max={0.3}
          step={0.005}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Case">
          <Select<TextTransform>
            value={spec.transform}
            onChange={(transform) => onChange({ transform })}
            options={[
              { value: 'none', label: 'As typed' },
              { value: 'smallcaps', label: 'Small caps' },
              { value: 'uppercase', label: 'UPPERCASE' },
              { value: 'lowercase', label: 'lowercase' },
              { value: 'capitalize', label: 'Capitalised' },
            ]}
          />
        </Field>
        {showWeight && (
        <Field label="Weight">
          <Select
            value={String(spec.weight)}
            onChange={(weight) => onChange({ weight: Number(weight) })}
            options={[
              { value: '300', label: 'Light' },
              { value: '400', label: 'Regular' },
              { value: '500', label: 'Medium' },
              { value: '600', label: 'Semibold' },
              { value: '700', label: 'Bold' },
            ]}
          />
        </Field>
        )}
      </div>

      {(showAlign || showItalic || showColor) && (
        <div data-control>
          {/* Alignment, italic and colour had no label at all, which in a panel
              where everything else is named reads as a stray row of buttons. */}
          <ControlLabel label="Style" />
          <div className="flex items-center gap-2">
            {showAlign && (
              <div
                role="group"
                aria-label="Alignment"
                className="inline-flex rounded-md border border-ink-300 bg-paper p-0.5"
              >
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    title={`Align ${align}`}
                    onClick={() => onChange({ align })}
                    className={cx(
                      'rounded px-2 py-1 transition-colors',
                      spec.align === align ? 'bg-ink-200 text-ink-900' : 'text-ink-500 hover:text-ink-900',
                    )}
                  >
                    {align === 'left' ? '⯇' : align === 'center' ? '≡' : '⯈'}
                  </button>
                ))}
              </div>
            )}
            {showItalic && (
              <button
                type="button"
                onClick={() => onChange({ italic: !spec.italic })}
                className={cx(
                  'rounded-md border px-2.5 py-1 italic transition-colors',
                  spec.italic
                    ? 'border-accent-500/60 bg-accent-500/15 text-accent-600'
                    : 'border-ink-300 text-ink-500 hover:text-ink-900',
                )}
              >
                I
              </button>
            )}
            {showColor && (
              <input
                type="color"
                value={spec.color}
                onChange={(e) => onChange({ color: e.target.value })}
                className="ml-auto h-7 w-9"
                aria-label="Text colour"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
