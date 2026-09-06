'use client';

import { useEffect, useState } from 'react';
import { Modal } from './Modal';

/**
 * The keyboard shortcuts, in one place.
 *
 * Modifier glyphs are chosen from the platform rather than hardcoded to a Mac,
 * because a Windows user reading ⌘Z learns nothing.
 */
const GROUPS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: 'Reading the proof',
    rows: [
      ['←  →', 'Previous / next spread'],
      ['Page Up / Page Down', 'Previous / next spread'],
      ['Home / End', 'First / last spread'],
    ],
  },
  {
    title: 'Editing',
    rows: [
      ['MOD Z', 'Undo'],
      ['MOD ⇧ Z', 'Redo'],
      ['MOD Y', 'Redo (also)'],
      ['Esc', 'Close a dialog'],
    ],
  },
  {
    title: 'Help',
    rows: [
      ['?', 'These shortcuts'],
      ['Guide', 'Reopen the getting-started walkthrough'],
    ],
  },
];

function useModifierLabel(): string {
  const [label, setLabel] = useState('Ctrl');
  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      '';
    if (/mac|iphone|ipad/i.test(platform)) setLabel('⌘');
  }, []);
  return label;
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const mod = useModifierLabel();

  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width="max-w-lg">
      <div className="space-y-5">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              {group.title}
            </h3>
            <dl className="space-y-1">
              {group.rows.map(([keys, what]) => (
                <div key={keys} className="flex items-baseline gap-3">
                  <dt className="w-40 shrink-0">
                    {keys
                      .replace('MOD', mod)
                      .split(' ')
                      .filter(Boolean)
                      .map((key, i) => (
                        <kbd
                          key={`${key}-${i}`}
                          className="mr-1 inline-block rounded border border-ink-700 bg-ink-850 px-1.5 py-0.5 text-[11px] text-ink-200"
                        >
                          {key}
                        </kbd>
                      ))}
                  </dt>
                  <dd className="min-w-0 flex-1 text-ink-300">{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <p className="border-t border-ink-800 pt-3 text-[11px] leading-relaxed text-ink-500">
          Undo covers the whole project — poems, order, settings, cover — not just the field you are
          typing in. Everything is saved locally as you go; there is no save button.
        </p>
      </div>
    </Modal>
  );
}
