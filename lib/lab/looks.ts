/**
 * The six looks the Lab offers, in one list.
 *
 * Shared by the page, the worker and the bench, so a look cannot exist in one
 * and not the others, and so the order on screen is the order everywhere.
 *
 * Every one of them is our own code implementing a published algorithm. There
 * is no model here and nothing is downloaded — see `docs/ALGORITHMS.md`.
 */

import { CLASSIC_LOOKS, settingsFor, type ClassicLook, type ClassicSettings } from '../lineart/xdog';
import { COLOURING_DEFAULTS, type ColouringSettings } from '../lineart/colouring';
import { INKED_DEFAULTS, type InkedSettings } from '../lineart/inked';

export type LookId = ClassicLook | 'hand-inked' | 'colouring';

export type LookSettings =
  | { kind: 'classic'; classic: ClassicSettings }
  | { kind: 'inked'; classic: ClassicSettings; inked: InkedSettings }
  | { kind: 'colouring'; colouring: ColouringSettings };

export const LOOKS: Array<{ id: LookId; label: string; blurb: string }> = [
  { id: 'ink-pen', label: CLASSIC_LOOKS['ink-pen'].label, blurb: CLASSIC_LOOKS['ink-pen'].blurb },
  { id: 'fine', label: CLASSIC_LOOKS.fine.label, blurb: CLASSIC_LOOKS.fine.blurb },
  { id: 'bold', label: CLASSIC_LOOKS.bold.label, blurb: CLASSIC_LOOKS.bold.blurb },
  { id: 'sketch', label: CLASSIC_LOOKS.sketch.label, blurb: CLASSIC_LOOKS.sketch.blurb },
  {
    id: 'hand-inked',
    label: 'Hand-inked',
    blurb: 'Drawn as strokes that thin at the ends and drift a little. Exports as real curves.',
  },
  {
    id: 'colouring',
    label: 'Colouring page',
    blurb: 'Areas instead of lines, with every outline closed so a fill cannot leak.',
  },
];

/** What a look starts at before anybody touches a slider. */
export function defaultsFor(look: LookId): LookSettings {
  if (look === 'colouring') return { kind: 'colouring', colouring: { ...COLOURING_DEFAULTS } };
  if (look === 'hand-inked') {
    // Hand-inked draws from a line mask, and Ink pen is the one that gives it
    // the most to work with: Fine leaves gaps the tracer has to bridge and Bold
    // has already thickened everything it is about to thin again.
    return { kind: 'inked', classic: settingsFor('ink-pen'), inked: { ...INKED_DEFAULTS } };
  }
  return { kind: 'classic', classic: settingsFor(look) };
}

/** Which controls a look actually has, so the panel can show only those. */
export function controlsFor(look: LookId): Array<'thickness' | 'detail' | 'softness' | 'cleanup' | 'smoothing' | 'taper' | 'wobble' | 'complexity' | 'minRegion'> {
  if (look === 'colouring') return ['complexity', 'minRegion', 'thickness', 'smoothing'];
  if (look === 'hand-inked') return ['thickness', 'taper', 'wobble', 'detail'];
  return ['thickness', 'detail', 'softness', 'cleanup', 'smoothing'];
}
