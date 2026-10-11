'use client';

import { useEffect, useState } from 'react';
import {
  coverFromTemplate,
  listTemplates,
  removeTemplate,
  saveTemplate,
} from '@/lib/cover/library';
import type { CoverSpec, CoverTemplate } from '@/lib/types';
import { Button, TextInput } from '../ui';
import { SectionHeading } from '../panel/Panel';

/**
 * Saved cover layouts, so every book in a series can start from one design.
 *
 * Applying one replaces the whole cover, which is what a template is; it is
 * also the reason it asks first. The images are copied on the way in and on
 * the way out, so the template and the books made from it are independent in
 * both directions: editing either leaves the other as it was.
 */
export function CoverTemplates({
  cover,
  onApply,
}: {
  cover: CoverSpec;
  onApply: (spec: CoverSpec) => void;
}) {
  const [templates, setTemplates] = useState<CoverTemplate[]>([]);
  const [name, setName] = useState('');
  const [naming, setNaming] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () => void listTemplates().then(setTemplates);
  useEffect(reload, []);

  const save = async () => {
    setBusy(true);
    try {
      await saveTemplate(name, cover);
      setName('');
      setNaming(false);
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <SectionHeading>Cover templates</SectionHeading>
        <button
          type="button"
          onClick={() => setNaming(!naming)}
          className="text-[11px] text-accent-500 underline"
        >
          Save this cover…
        </button>
      </div>

      {naming && (
        <div className="mt-2 space-y-2">
          <TextInput
            value={name}
            placeholder="What to call it"
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex gap-2 text-[11px]">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="text-accent-500 underline disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setNaming(false)} className="text-ink-500 underline">
              Cancel
            </button>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <p className="mt-2 text-[12px] leading-snug text-ink-500">
          None saved. Once a cover looks right, save it here and the next book in the series can
          start from it with the pictures swapped.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {templates.map((template) => (
            <li
              key={template.id}
              className="rounded-md border border-ink-200 bg-ink-50 px-2.5 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12.5px] font-[550]">{template.name}</span>
                <span className="shrink-0 text-[11px] text-ink-500">
                  {template.cover.stickers.length} sticker
                  {template.cover.stickers.length === 1 ? '' : 's'}
                </span>
              </div>
              {confirming === template.id ? (
                <div className="mt-1.5 text-[11px]">
                  <p className="text-ink-700">This replaces the whole cover. Sure?</p>
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void coverFromTemplate(template).then((spec) => {
                          onApply(spec);
                          setConfirming(null);
                        })
                      }
                      className="text-accent-500 underline"
                    >
                      Replace it
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="text-ink-500 underline"
                    >
                      Keep what I have
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setConfirming(template.id)}
                    className="text-accent-500 underline"
                  >
                    Use it
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeTemplate(template.id).then(reload)}
                    className="ml-auto text-ink-500 underline hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Kept here so the designer can offer it beside the templates. */
export function SaveCoverButton({ onSave }: { onSave: () => void }) {
  return <Button onClick={onSave}>Save to My stickers</Button>;
}
