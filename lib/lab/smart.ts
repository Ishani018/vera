/**
 * Smart redraw: the Lab's optional hand-off to a helper that runs on this Mac.
 *
 * Everything here is the CLIENT. The helper is a separate local program
 * (`tools/logo-proto/server.py`) that runs three models, and none of that is in
 * this file or in the app's bundle: this is a few hundred lines of fetch.
 *
 * Three rules shape it.
 *
 * 1. It is optional and says so. The option is only offered when the helper
 *    answers, and the whole feature is behind a flag (below) that is OFF in a
 *    production build until the model licences have been read.
 * 2. It never leaves somebody with nothing. If the helper is not running, fails
 *    or takes too long, `smartOrFallback` runs the engine this app already has,
 *    and the answer carries the reason, so the page can say plainly that the
 *    fallback was used instead of passing it off as the real thing.
 * 3. It is cancellable. Cancelling closes the connection, and the helper treats
 *    a closed connection as "stop": it ends the job and frees the memory.
 */

export const SMART_STYLES = ['minimal', 'hand-drawn', 'bold logo', 'elegant', 'cute', 'technical'] as const;
export type SmartStyle = (typeof SMART_STYLES)[number];
export type SmartMode = 'standard' | 'artist';

export const DEFAULT_HELPER_URL = 'http://127.0.0.1:8765';
/** Longer than a normal run (about 90 s) by a wide margin, shorter than the helper's own limit (15 minutes). */
export const DEFAULT_TIMEOUT_MS = 6 * 60 * 1000;

export type Health = {
  ok: true;
  version: string;
  ready: boolean;
  models: Record<string, boolean>;
  busy: boolean;
  styles: string[];
  modes: string[];
  maxUploadMB: number;
};

export type SmartStats = {
  mode: SmartMode;
  style: string;
  subject: string;
  strokes: number;
  nodes: number;
  passed: boolean;
  iou: number;
  coverage: number;
  reasons: string[];
  sizes: Array<{ size: number; iou: number; passed: boolean }>;
  retried: boolean;
  timings: Record<string, number>;
};

export type SmartResult = { svg: string; stats: SmartStats };

export type SmartStage = 'queued' | 'start' | 'cutout' | 'analyse' | 'redraw' | 'vector' | 'retry';
export type SmartProgress = {
  stage: SmartStage;
  state: 'start' | 'progress' | 'done';
  /** 0 to 1, an estimate: the stages are real, how long each takes is averaged. */
  pct: number;
  /** Real step counts, from the image model, while it is redrawing. */
  step?: number;
  of?: number;
  subject?: string;
  /** Seconds since the request was sent, counted here. */
  elapsed: number;
};

export type SmartErrorKind =
  | 'unavailable' // nothing is listening
  | 'busy' // another picture is being done
  | 'too-big' // over the upload limit
  | 'rejected' // the helper refused this request (picture, style, or this page's address)
  | 'failed' // it started and went wrong
  | 'timeout' // it took too long
  | 'cancelled'; // the person pressed Cancel

export class SmartError extends Error {
  // Written out, not as a parameter property: the tests run this file with Node's strip-only TypeScript,
  // which has no way to expand `public kind` in a constructor.
  kind: SmartErrorKind;

  constructor(kind: SmartErrorKind, message: string) {
    super(message);
    this.name = 'SmartError';
    this.kind = kind;
  }
}

/**
 * Whether the page offers Smart redraw at all.
 *
 * Off by default in a production build, on by default while developing, and
 * settable either way with NEXT_PUBLIC_SMART_REDRAW. It stays off in production
 * until the model licences have been read: see docs/SMART-REDRAW.md.
 *
 * The environment is read as literal `process.env.NEXT_PUBLIC_…` expressions
 * because that is the only form Next replaces at build time.
 */
export function smartRedrawEnabled(
  env: { NEXT_PUBLIC_SMART_REDRAW?: string; NODE_ENV?: string } = {
    NEXT_PUBLIC_SMART_REDRAW: process.env.NEXT_PUBLIC_SMART_REDRAW,
    NODE_ENV: process.env.NODE_ENV,
  },
): boolean {
  const flag = (env.NEXT_PUBLIC_SMART_REDRAW ?? '').trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'on') return true;
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  return env.NODE_ENV !== 'production';
}

export function helperUrl(): string {
  return (process.env.NEXT_PUBLIC_SMART_REDRAW_URL || DEFAULT_HELPER_URL).replace(/\/+$/, '');
}

type Fetch = typeof fetch;

export type Options = {
  style?: SmartStyle;
  mode?: SmartMode;
  base?: string;
  fetchImpl?: Fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (progress: SmartProgress) => void;
  /** For tests: the clock, in milliseconds. */
  now?: () => number;
};

/** Is the helper running? Null for any kind of no: nothing listening, wrong thing listening, too slow to answer. */
export async function checkHelper(
  opts: { base?: string; fetchImpl?: Fetch; timeoutMs?: number } = {},
): Promise<Health | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 1500);
  try {
    const response = await doFetch(`${opts.base ?? helperUrl()}/health`, { signal: controller.signal });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<Health>;
    if (body?.ok !== true || !Array.isArray(body.styles)) return null;
    return body as Health;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Plain-language reason, for the notice that says the fallback was used. */
export function explain(error: SmartError): string {
  switch (error.kind) {
    case 'unavailable':
      return "The Smart redraw helper isn't running.";
    case 'busy':
      return 'The helper is busy with another picture.';
    case 'too-big':
      return error.message;
    case 'rejected':
      return error.message;
    case 'timeout':
      return 'Smart redraw took too long and was stopped.';
    case 'cancelled':
      return 'Cancelled.';
    default:
      return `Smart redraw didn't finish: ${error.message}`;
  }
}

async function failureOf(response: Response): Promise<SmartError> {
  let message = '';
  try {
    message = String(((await response.json()) as { error?: string }).error ?? '');
  } catch {
    /* no body, or not JSON */
  }
  if (response.status === 429) return new SmartError('busy', message || 'The helper is busy.');
  if (response.status === 413) return new SmartError('too-big', message || 'That picture is too big for the helper.');
  if (response.status === 403)
    return new SmartError('rejected', message || 'The helper does not accept requests from this page.');
  if (response.status >= 400 && response.status < 500) return new SmartError('rejected', message || 'The helper refused that.');
  return new SmartError('failed', message || `The helper answered ${response.status}.`);
}

/**
 * Read a stream of JSON lines, handing each parsed line over as it arrives.
 * A line split across two chunks is held until it is whole.
 */
export async function readLines(body: ReadableStream<Uint8Array>, onLine: (line: Record<string, unknown>) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let held = '';
  const flush = (text: string) => {
    if (!text.trim()) return;
    try {
      onLine(JSON.parse(text) as Record<string, unknown>);
    } catch (error) {
      if (error instanceof SmartError) throw error;
      /* a line that is not JSON is not part of the protocol; skip it */
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    held += decoder.decode(value, { stream: true });
    let at: number;
    while ((at = held.indexOf('\n')) >= 0) {
      flush(held.slice(0, at));
      held = held.slice(at + 1);
    }
  }
  flush(held + decoder.decode());
}

/**
 * Send one picture to the helper and wait for the drawing.
 *
 * Rejects with a SmartError whose `kind` says what happened. Progress arrives
 * through `onProgress` as the helper reports it.
 */
export async function runSmartRedraw(picture: Blob, opts: Options = {}): Promise<SmartResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const base = opts.base ?? helperUrl();
  const style = opts.style ?? 'minimal';
  const mode = opts.mode ?? 'standard';
  const now = opts.now ?? (() => Date.now());
  const started = now();

  const controller = new AbortController();
  let why: 'timeout' | 'cancelled' | null = null;
  const stop = (reason: 'timeout' | 'cancelled') => {
    why ??= reason;
    controller.abort();
  };
  const timer = setTimeout(() => stop('timeout'), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => stop('cancelled');
  if (opts.signal?.aborted) onAbort();
  opts.signal?.addEventListener('abort', onAbort);

  const ended = () =>
    why === 'timeout'
      ? new SmartError('timeout', 'Smart redraw took too long and was stopped.')
      : new SmartError('cancelled', 'Cancelled.');

  try {
    // Already cancelled (or already timed out): do not even send the picture.
    if (why) throw ended();
    let response: Response;
    try {
      response = await doFetch(`${base}/redraw?style=${encodeURIComponent(style)}&mode=${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': picture.type || 'image/png' },
        body: picture,
        signal: controller.signal,
      });
    } catch (error) {
      if (why) throw ended();
      throw new SmartError('unavailable', error instanceof Error ? error.message : 'Could not reach the helper.');
    }
    if (!response.ok) throw await failureOf(response);
    if (!response.body) throw new SmartError('failed', 'The helper sent nothing back.');

    let result: SmartResult | null = null;
    try {
      await readLines(response.body, (line) => {
        if (typeof line.error === 'string') {
          const message = typeof line.message === 'string' ? line.message : line.error;
          throw new SmartError(line.error === 'timeout' ? 'timeout' : 'failed', message);
        }
        if (line.done === true) {
          const svg = line.svg;
          if (typeof svg !== 'string' || !svg.trimStart().startsWith('<svg'))
            throw new SmartError('failed', 'The helper returned something that is not a drawing.');
          result = { svg, stats: line.stats as SmartStats };
          return;
        }
        if (typeof line.stage === 'string') {
          opts.onProgress?.({
            stage: line.stage as SmartStage,
            state: (line.state as SmartProgress['state']) ?? 'progress',
            pct: typeof line.pct === 'number' ? line.pct : 0,
            step: typeof line.step === 'number' ? line.step : undefined,
            of: typeof line.of === 'number' ? line.of : undefined,
            subject: typeof line.subject === 'string' ? line.subject : undefined,
            elapsed: (now() - started) / 1000,
          });
        }
      });
    } catch (error) {
      if (error instanceof SmartError) throw error;
      if (why) throw ended();
      throw new SmartError('failed', 'The connection to the helper broke before it finished.');
    }
    if (why) throw ended();
    if (!result) throw new SmartError('failed', 'The helper closed the connection before it finished.');
    return result;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
    controller.abort(); // a finished request has nothing left to close; an unfinished one is told to stop
  }
}

export type SmartOrFallback<T> =
  | { source: 'smart'; result: SmartResult }
  | { source: 'fallback'; reason: SmartError; message: string; result: T };

/**
 * Smart redraw if it works, the engine this app already has if it does not.
 *
 * A cancel is the one failure that does NOT fall back: somebody who pressed
 * Cancel asked for nothing, and quietly giving them a different drawing is the
 * opposite of that. Everything else does, and says why.
 */
export async function smartOrFallback<T>(
  picture: Blob,
  fallback: () => Promise<T>,
  opts: Options = {},
): Promise<SmartOrFallback<T>> {
  try {
    return { source: 'smart', result: await runSmartRedraw(picture, opts) };
  } catch (error) {
    if (!(error instanceof SmartError)) throw error;
    if (error.kind === 'cancelled') throw error;
    return { source: 'fallback', reason: error, message: explain(error), result: await fallback() };
  }
}
