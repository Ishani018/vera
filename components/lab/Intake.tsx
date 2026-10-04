'use client';

import { useRef, useState } from 'react';
import { Button, Notice, cx } from '../ui';
import { UploadIcon } from './icons';
import {
  ACCEPT_ATTR, MAX_PICTURE_MB, SAMPLES, helperChip, type Status,
} from '@/lib/lab/intake';

/**
 * What a first-time visitor meets, and the small parts that tell anyone what the Lab is doing.
 * The wording and the rules live in `lib/lab/intake.ts`, where they are tested.
 */

/* ------------------------------------------------------------- drag and drop */

const carriesFiles = (event: React.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

/**
 * Drop handling for one region. `over` is true while a file is held above it, however many children the pointer
 * crosses on the way (enter and leave fire for each of them, so a plain flag flickers).
 */
export function useDropTarget(onFile: (file: File) => void) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  return {
    over,
    props: {
      onDragEnter: (event: React.DragEvent) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setOver(true);
      },
      onDragOver: (event: React.DragEvent) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      },
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        depth.current = 0;
        setOver(false);
        const chosen = event.dataTransfer.files?.[0];
        if (chosen) onFile(chosen);
      },
    },
  };
}

/** The file picker, hidden, and a way to open it. The input is reset so choosing the same file twice still fires. */
function useFilePicker(onFile: (file: File) => void) {
  const input = useRef<HTMLInputElement>(null);
  const element = (
    <input
      ref={input}
      type="file"
      accept={ACCEPT_ATTR}
      aria-label="Choose a picture file"
      tabIndex={-1}
      className="sr-only"
      onChange={(event) => {
        const chosen = event.target.files?.[0];
        if (chosen) onFile(chosen);
        event.target.value = '';
      }}
    />
  );
  return { element, open: () => input.current?.click() };
}

/* ---------------------------------------------------------------- empty state */

const STEPS = [
  { title: 'Pick a picture', note: 'Drop one on the canvas, or press Choose picture.' },
  { title: 'Choose a look', note: 'Ink pen, sketch, colouring page, logo and more, each made from your picture.' },
  { title: 'Download as SVG or PNG', note: 'SVG stays sharp at any size.' },
] as const;

/** The three steps in a row, small, under the drop zone. */
export function StepsLine() {
  return (
    <ol aria-label="How it works" className="mt-3 grid shrink-0 grid-cols-3 gap-2 max-sm:gap-1.5">
      {STEPS.map((step, i) => (
        <li key={step.title} className="flex min-w-0 items-start gap-2 max-sm:flex-col max-sm:gap-1">
          <span
            aria-hidden="true"
            className="mono-label inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-ink-300 text-ink-700"
            style={{ fontSize: 11 }}
          >
            {i + 1}
          </span>
          <span className="min-w-0 text-[13px] leading-snug text-ink-700 max-sm:text-[12px]">{step.title}</span>
        </li>
      ))}
    </ol>
  );
}

/** The same three steps in the right-hand panel, with a line each. */
export function StepsList() {
  return (
    <ol aria-label="Steps" className="flex flex-col gap-3">
      {STEPS.map((step, i) => (
        <li key={step.title} className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mono-label mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-ink-300 text-ink-700"
            style={{ fontSize: 11 }}
          >
            {i + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-[570] text-ink-900">{step.title}</span>
            <span className="block text-[12.5px] leading-snug text-ink-500">{step.note}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The whole canvas, before there is a picture: one large place to drop, or choose, or try a sample. */
export function DropZone({
  onFile,
  onSample,
  problem,
  busySample,
}: {
  onFile: (file: File) => void;
  onSample: (id: string) => void;
  problem: string | null;
  busySample: string | null;
}) {
  const drop = useDropTarget(onFile);
  const picker = useFilePicker(onFile);
  return (
    <div
      data-dropzone
      data-over={drop.over ? 'true' : 'false'}
      {...drop.props}
      className={cx(
        'relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto rounded-[6px] border-2 border-dashed px-5 py-6 text-center',
        'transition-colors duration-[var(--motion-base)]',
        drop.over ? 'border-accentb-500 bg-accentb-100' : 'border-ink-300 bg-paper-100',
      )}
    >
      {picker.element}
      <span className={drop.over ? 'text-accentb-700' : 'text-ink-500'}>
        <UploadIcon size={44} />
      </span>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 24 }}>
        {drop.over ? 'Drop it to open it' : 'Drop a picture here'}
      </h2>
      <span className="mono-label text-ink-500" style={{ fontSize: 11 }}>
        or
      </span>
      <Button variant="accent" onClick={picker.open}>
        Choose picture
      </Button>
      <p className="max-w-[40ch] text-[12.5px] leading-snug text-ink-500">
        JPG, PNG or WebP, up to {MAX_PICTURE_MB} MB. Your picture stays on this computer.
      </p>

      {problem && (
        <div role="alert" className="w-full max-w-[460px] text-left">
          <Notice level="warning">{problem}</Notice>
        </div>
      )}

      <div className="mt-1 w-full max-w-[460px]" role="group" aria-label="Try a sample">
        <span className="mono-label block text-ink-500" style={{ fontSize: 10 }}>
          Try a sample
        </span>
        <ul className="mt-1.5 flex flex-wrap items-stretch justify-center gap-2">
          {SAMPLES.map((sample) => (
            <li key={sample.id}>
              <button
                type="button"
                onClick={() => onSample(sample.id)}
                disabled={busySample !== null}
                aria-label={`Try the sample: ${sample.label}`}
                className="flex w-[112px] flex-col items-center gap-1 rounded-[6px] border border-ink-300 bg-paper-50 p-1.5 transition-colors hover:bg-paper-100 disabled:opacity-60 max-sm:w-[96px]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sample.src} alt="" className="h-[56px] w-full rounded-[3px] bg-paper-100 object-contain" />
                <span className="text-[12px] text-ink-700">{busySample === sample.id ? 'Opening…' : sample.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- once it is open */

/** Replaces the thin strip that used to sit across the top. */
export function ChangePicture({ onFile }: { onFile: (file: File) => void }) {
  const picker = useFilePicker(onFile);
  return (
    <>
      {picker.element}
      <Button onClick={picker.open} className="shrink-0 !px-3 !py-1.5 !text-[13px]">
        Change picture
      </Button>
    </>
  );
}

/** What the canvas shows while a file is held over a picture that is already open. */
export function DropOverlay() {
  return (
    <div
      aria-hidden="true"
      data-drop-overlay
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-accentb-500 bg-accentb-100/90 text-accentb-700"
    >
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20 }}>Drop it to replace this picture</span>
    </div>
  );
}

/* ------------------------------------------------------------------- status */

/** One line under the picture: what is happening, and which engine is doing it. */
export function StatusLine({ status }: { status: Status }) {
  const dot =
    status.tone === 'working' ? 'bg-accenta-500 animate-pulse'
    : status.tone === 'warning' ? 'bg-accenta-500'
    : status.tone === 'done' ? 'bg-accentb-500'
    : 'bg-ink-300';
  return (
    <p
      role="status"
      aria-live="polite"
      data-status={status.tone}
      className="mono-label flex min-w-0 items-center gap-2 text-ink-700"
      style={{ fontSize: 11 }}
    >
      <span aria-hidden="true" className={cx('block size-1.5 shrink-0 rounded-full', dot)} />
      <span className="min-w-0 truncate">
        <span data-status-text>{status.text}</span>
        {status.engine && (
          <>
            <span aria-hidden="true"> · </span>
            <span data-status-engine className="text-ink-500">{status.engine}</span>
          </>
        )}
      </span>
    </p>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Not a secure context, or no permission: the old way, which needs a selected field.
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const done = document.execCommand('copy');
    field.remove();
    return done;
  }
}

/**
 * Whether the Smart redraw helper is running. Nothing at all when Smart redraw is off, so a build that ships
 * without it never shows a command for a program it does not have.
 */
export function HelperChip({ enabled, checked, running }: { enabled: boolean; checked: boolean; running: boolean }) {
  const [copied, setCopied] = useState(false);
  const chip = helperChip({ enabled, checked, running });
  if (!chip) return null;
  return (
    <div data-helper-chip data-running={String(chip.running)} className="mb-3">
      <span
        className="chip inline-flex min-h-7 items-center gap-1.5 px-2.5"
        style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}
      >
        <span
          aria-hidden="true"
          className={cx('block size-1.5 rounded-full', chip.running ? 'bg-accentb-500' : 'bg-ink-300')}
        />
        {chip.text}
      </span>
      {chip.hint && (
        <div className="mt-1.5">
          <p className="text-[12px] leading-snug text-ink-500">To use it, start the helper in a terminal:</p>
          <div className="mt-1 flex items-stretch gap-1.5">
            <code
              data-start-command
              className="min-w-0 flex-1 select-all break-words rounded-[4px] border border-ink-300 bg-paper-100 px-2 py-1.5 text-[11.5px] leading-snug text-ink-900"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {chip.hint}
            </code>
            <Button
              className="shrink-0 !px-2.5 !py-1 !text-[12px]"
              aria-label="Copy the start command"
              onClick={async () => {
                if (await copyText(chip.hint ?? '')) {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1800);
                }
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
