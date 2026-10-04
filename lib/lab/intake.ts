/**
 * What the Lab says before and while it works: whether a file is one it can open, what it is doing, and what a
 * disabled button is waiting for. Plain functions, so the wording is testable without a browser.
 */

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ACCEPT_ATTR = ACCEPTED_TYPES.join(',');
export const MAX_PICTURE_MB = 30;
export const MAX_PICTURE_BYTES = MAX_PICTURE_MB * 1024 * 1024;

/** Shown on every control that needs a picture first. */
export const OPEN_FIRST = 'Open a picture first';

/** Typed into a terminal to start the Smart redraw helper. Run from the project folder. */
export const START_COMMAND = 'cd tools/logo-proto && .venv/bin/python server.py';

/**
 * Small pictures to try, so nobody has to find one first. Every one was generated for this project (see
 * docs/lineartlab-log.md, "Tuning inputs"): none is a photograph of anyone or anything, and none comes from
 * elsewhere, so they are safe to ship. The files are copies of docs/lab-inputs, served from public/.
 */
export const SAMPLES = [
  { id: 'cat', label: 'Cat drawing', src: '/lab-samples/cat.png', name: 'sample cat.png', type: 'image/png' },
  { id: 'flower', label: 'Flower drawing', src: '/lab-samples/flower.png', name: 'sample flower.png', type: 'image/png' },
  { id: 'photo', label: 'Test photo', src: '/lab-samples/photo.png', name: 'sample photo.png', type: 'image/png' },
] as const;

export type PictureCheck = { ok: true } | { ok: false; message: string };

const BY_EXTENSION: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1);

/** Whether a file is one the Lab can open, and if not, what went wrong and what to do about it. */
export function checkPicture(file: { name: string; type: string; size: number }): PictureCheck {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = file.type || BY_EXTENSION[extension] || '';
  if (file.size === 0) return { ok: false, message: 'That file is empty. Choose another picture.' };
  if (type === 'image/heic' || type === 'image/heif' || extension === 'heic' || extension === 'heif') {
    return {
      ok: false,
      message: 'The Lab cannot open HEIC photos yet. Export the picture as a JPG (in Photos: File, Export), then choose that.',
    };
  }
  if (!(ACCEPTED_TYPES as readonly string[]).includes(type)) {
    return {
      ok: false,
      message: `That file is not a JPG, PNG or WebP picture${extension ? ` (it is .${extension})` : ''}. Choose a JPG, PNG or WebP file.`,
    };
  }
  if (file.size > MAX_PICTURE_BYTES) {
    return {
      ok: false,
      message: `That picture is ${megabytes(file.size)} MB and the Lab takes up to ${MAX_PICTURE_MB} MB. Save a smaller copy (a lower quality or size) and choose that.`,
    };
  }
  return { ok: true };
}

/** The engine's own error text, in words that say what to do. Used when a picture passed the check but could not be read. */
export function explainFailure(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('stopped')) return 'The Lab stopped working. Reload the page, then open the picture again.';
  if (text.includes('memory') || text.includes('too large') || text.includes('too big'))
    return 'That picture is too big for this browser to work on. Save a smaller copy and open that.';
  return 'The Lab could not read that picture. It may be damaged or not really an image. Try another file, or save it again as a JPG or PNG.';
}

/* ----------------------------------------------------------------- status */

export type Engine = 'Built-in engine' | 'Smart redraw' | 'Built-in engine (fallback)';

export type StatusInput = {
  hasPicture: boolean;
  /** The big picture has an answer on screen. */
  hasResult: boolean;
  /** The big picture is being redrawn. */
  updating: boolean;
  /** How many look previews have not come back yet. */
  cardsLeft: number;
  /** How many cards there are in all, so "some have come back" can be told from "none has". */
  cardsTotal: number;
  /** Smart redraw's look is the one chosen. */
  smartPicked: boolean;
  smart: 'idle' | 'running' | 'done' | 'failed';
  /** Where Smart redraw's answer came from, once it has one. */
  smartSource?: 'smart' | 'fallback';
  /** The step Smart redraw is on, if it has said. */
  smartStage?: string;
  smartStep?: number;
  smartOf?: number;
  failed: boolean;
};

export type Status = { text: string; engine: Engine | null; tone: 'idle' | 'working' | 'done' | 'warning' };

/** One short line about what is happening now, and which engine is making it. */
export function labStatus(s: StatusInput): Status {
  if (!s.hasPicture) return { text: 'Waiting for a picture', engine: null, tone: 'idle' };
  if (s.smartPicked) {
    if (s.smart === 'running') {
      const text =
        s.smartStage === 'cutout' ? 'Cutting out the subject'
        : s.smartStage === 'analyse' ? 'Looking at the picture'
        : s.smartStage === 'redraw' ? (s.smartStep && s.smartOf ? `Redrawing, step ${s.smartStep} of ${s.smartOf}` : 'Redrawing')
        : s.smartStage === 'vector' ? 'Tracing the lines'
        : s.smartStage === 'retry' ? 'Trying once more'
        : 'Starting Smart redraw';
      return { text, engine: 'Smart redraw', tone: 'working' };
    }
    if (s.smart === 'done') {
      return s.smartSource === 'fallback'
        ? { text: 'Done. Smart redraw did not finish', engine: 'Built-in engine (fallback)', tone: 'warning' }
        : { text: 'Done', engine: 'Smart redraw', tone: 'done' };
    }
    if (s.smart === 'failed') return { text: 'Smart redraw did not finish', engine: null, tone: 'warning' };
    return { text: 'Ready. Press Redraw', engine: 'Smart redraw', tone: 'idle' };
  }
  if (s.failed) return { text: 'Could not finish this look', engine: 'Built-in engine', tone: 'warning' };
  if (!s.hasResult) {
    // The previews come back after the picture is read, so one of them being in means it has been.
    const read = s.cardsLeft < s.cardsTotal;
    return { text: read ? 'Finding the lines' : 'Reading your picture', engine: 'Built-in engine', tone: 'working' };
  }
  if (s.updating) return { text: 'Finding the lines', engine: 'Built-in engine', tone: 'working' };
  if (s.cardsLeft > 0) return { text: 'Done. Making the other looks', engine: 'Built-in engine', tone: 'done' };
  return { text: 'Done', engine: 'Built-in engine', tone: 'done' };
}

/** Why a download is not available yet, or undefined when it is. */
export function downloadReason(s: { hasPicture: boolean; hasDrawing: boolean; smartRunning: boolean; saving: boolean }): string | undefined {
  if (!s.hasPicture) return OPEN_FIRST;
  if (s.smartRunning) return 'Smart redraw is still working';
  if (!s.hasDrawing) return 'The drawing is not ready yet';
  if (s.saving) return 'Preparing the file';
  return undefined;
}

/* ----------------------------------------------------------------- helper */

export type HelperChip = { running: boolean | null; text: string; hint: string | null };

/**
 * The Smart redraw helper's state as a chip, or null when Smart redraw is off (a production build without the
 * flag), which shows nothing at all: no chip and no command.
 */
export function helperChip(s: { enabled: boolean; checked: boolean; running: boolean }): HelperChip | null {
  if (!s.enabled) return null;
  if (!s.checked) return { running: null, text: 'Smart redraw: looking for the helper', hint: null };
  if (s.running) return { running: true, text: 'Smart redraw: helper running', hint: null };
  return { running: false, text: 'Smart redraw: helper not running', hint: START_COMMAND };
}
