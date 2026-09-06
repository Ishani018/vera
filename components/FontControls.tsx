'use client';

import type { FontSpec, TextTransform } from '@/lib/types';
import { FontPicker } from './FontPicker';
import { Field, NumberInput, Select, Slider, cx } from './ui';

type Options = {
  showAlign?: boolean;
  showLineHeight?: boolean;
  showColor?: boolean;
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
  const { showAlign = true, showLineHeight = true, showColor = true } = options;

  return (
    <div className="space-y-2.5">
      <FontPicker
        value={spec.family}
        onChange={(family, fallback) => onChange({ family, fallback })}
      />

      <div className="grid grid-cols-2 gap-2">
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
      </div>

      <div className="flex items-center gap-2">
        {showAlign && (
          <div className="inline-flex rounded-md border border-ink-700 bg-ink-900 p-0.5">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                type="button"
                title={`Align ${align}`}
                onClick={() => onChange({ align })}
                className={cx(
                  'rounded px-2 py-1 transition-colors',
                  spec.align === align ? 'bg-ink-700 text-ink-200' : 'text-ink-400 hover:text-ink-200',
                )}
              >
                {align === 'left' ? '⯇' : align === 'center' ? '≡' : '⯈'}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => onChange({ italic: !spec.italic })}
          className={cx(
            'rounded-md border px-2.5 py-1 italic transition-colors',
            spec.italic
              ? 'border-brass-500/60 bg-brass-500/15 text-brass-300'
              : 'border-ink-700 text-ink-400 hover:text-ink-200',
          )}
        >
          I
        </button>
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
  );
}
