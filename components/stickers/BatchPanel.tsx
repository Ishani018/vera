'use client';

import { useEffect, useRef, useState } from 'react';
import { UnsupportedImageError, putAsset } from '@/lib/assets';
import { parseTags, saveToLibrary } from '@/lib/cover/library';
import { Button, Info, Notice, ProgressRing, TextInput, cx } from '../ui';
import { progressFraction, progressLine } from '@/lib/busy';

/**
 * The same settings, over a folder full of pictures.
 *
 * One at a time, and deliberately: a dozen pictures at once means a dozen
 * decoded bitmaps in memory alongside a dozen results, and a phone browser
 * quietly kills the tab rather than telling anybody why. Sequential is a little
 * slower and finishes.
 *
 * **A failure belongs to its picture, not to the batch.** One file that turns
 * out to be a PDF renamed to .png must not throw away the eleven that worked,
 * so each is caught on its own and the grid says which one went wrong and why.
 */

/** As many as one go will take. Beyond this, do it twice. */
export const BATCH_LIMIT = 60;

export type BatchItem = {
  id: string;
  name: string;
  state: 'waiting' | 'working' | 'done' | 'failed';
  url: string | null;
  blob: Blob | null;
  width: number;
  height: number;
  problem: string | null;
};

export function BatchPanel({
  make,
  disabled,
}: {
  /** Makes one sticker with whatever settings are on screen now. */
  make: (file: File) => Promise<{ blob: Blob; width: number; height: number }>;
  disabled: boolean;
}) {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const [tag, setTag] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const [tooMany, setTooMany] = useState(0);
  const stop = useRef(false);

  // Every preview let go of on the way out, so a long session in this panel
  // does not hold on to sixty pictures' worth of memory.
  const urls = items.map((item) => item.url).filter(Boolean) as string[];
  const held = useRef<string[]>([]);
  held.current = urls;
  useEffect(
    () => () => {
      for (const url of held.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const take = async (files: FileList | null) => {
    if (!files?.length) return;
    setSaid(null);
    const chosen = [...files];
    setTooMany(Math.max(0, chosen.length - BATCH_LIMIT));
    const batch: BatchItem[] = chosen.slice(0, BATCH_LIMIT).map((file, n) => ({
      id: `${Date.now()}-${n}`,
      name: file.name.replace(/\.[^.]+$/, ''),
      state: 'waiting',
      url: null,
      blob: null,
      width: 0,
      height: 0,
      problem: null,
    }));
    setItems(batch);
    setRunning(true);
    stop.current = false;

    for (const [n, file] of chosen.slice(0, BATCH_LIMIT).entries()) {
      if (stop.current) break;
      const id = batch[n].id;
      setItems((was) => was.map((item) => (item.id === id ? { ...item, state: 'working' } : item)));
      try {
        // The original goes into the store whole, exactly as a single one does.
        await putAsset(file);
        const made = await make(file);
        const url = URL.createObjectURL(made.blob);
        setItems((was) =>
          was.map((item) =>
            item.id === id
              ? { ...item, state: 'done', url, blob: made.blob, width: made.width, height: made.height }
              : item,
          ),
        );
      } catch (error) {
        // This picture's problem, and only this picture's.
        const problem =
          error instanceof UnsupportedImageError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'That picture could not be made into a sticker.';
        setItems((was) =>
          was.map((item) => (item.id === id ? { ...item, state: 'failed', problem } : item)),
        );
      }
    }
    setRunning(false);
  };

  const keepAll = async () => {
    const ready = items.filter((item) => item.state === 'done' && item.blob);
    if (!ready.length) return;
    setSaid(null);
    let kept = 0;
    const failed: string[] = [];
    for (const item of ready) {
      try {
        const asFile = new File([item.blob!], `${item.name || 'sticker'}.png`, { type: 'image/png' });
        const record = await putAsset(asFile);
        await saveToLibrary({
          name: item.name || 'Sticker',
          assetId: record.id,
          width: item.width,
          height: item.height,
          tags: parseTags(tag),
        });
        kept++;
      } catch {
        failed.push(item.name);
      }
    }
    setSaid(
      `Kept ${kept} in My stickers${tag.trim() ? ` tagged ${parseTags(tag).join(', ')}` : ''}.` +
        (failed.length ? ` ${failed.length} could not be saved: ${failed.join(', ')}.` : ''),
    );
  };

  const done = items.filter((i) => i.state === 'done').length;
  const failedCount = items.filter((i) => i.state === 'failed').length;

  return (
    <div className="border-t border-ink-200 pt-5">
      <span className="mb-3 block font-[570]">
        Many at once
        <Info label="Many at once">
          {'Choose a stack of pictures and every one of them gets the settings on this screen. ' +
            'They go through one at a time, so a big batch does not run the browser out of ' +
            'memory, and a picture that fails fails on its own.'}
        </Info>
      </span>

      <label
        className={cx(
          'block cursor-pointer rounded-xl border-2 border-dashed border-ink-300 px-4 py-6 text-center transition-colors hover:border-accent-500',
          (disabled || running) && 'pointer-events-none opacity-50',
        )}
      >
        <span className="block text-[14px] font-[560]">
          {running ? 'Working through them…' : 'Choose pictures…'}
        </span>
        <span className="mt-1 block text-[12.5px] text-ink-500">
          PNG, JPEG or WebP — {BATCH_LIMIT} at a time
        </span>
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => void take(e.target.files)}
        />
      </label>

      {tooMany > 0 && (
        <p className="mt-2 text-[12.5px] text-ink-500">
          {tooMany} more were left out — {BATCH_LIMIT} is as many as one go will take.
        </p>
      )}

      {items.length > 0 && (
        <>
          {/* A batch is slow by definition, so it says so in words and draws
              how far along it is: sixty pictures is minutes, and a row of
              thumbnails filling in one at a time is not a progress bar. */}
          {running ? (
            <div className="mt-3 flex items-center gap-2.5">
              {/* A ring rather than a bar: it carries the number inside itself,
                  so it needs no width of its own and sits next to the words
                  instead of under them. */}
              <span className="text-accent-500">
                <ProgressRing
                  fraction={progressFraction(done, items.length)}
                  label="How far through the batch"
                />
              </span>
              <p className="text-[12.5px] text-ink-700">
                {progressLine('Working through them', done, items.length)}
                {failedCount > 0 && ` · ${failedCount} could not be read`}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-[12.5px] text-ink-500">
              {done} of {items.length} done{failedCount > 0 && `, ${failedCount} could not be read`}.
            </p>
          )}

          <div className="mt-3 grid grid-cols-3 gap-2">
            {items.map((item) => (
              <div
                key={item.id}
                title={item.problem ?? item.name}
                className={cx(
                  'grid aspect-square place-items-center overflow-hidden rounded-lg border p-1',
                  item.state === 'failed' ? 'border-red-300 bg-red-50' : 'border-ink-200 bg-ink-100',
                )}
              >
                {item.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt={item.name} className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="px-1 text-center text-[10.5px] leading-tight text-ink-500">
                    {item.state === 'failed' ? 'could not be read' : item.state === 'working' ? '…' : item.name}
                  </span>
                )}
              </div>
            ))}
          </div>

          {failedCount > 0 && (
            <div className="mt-3">
              <Notice level="warning">
                {items
                  .filter((i) => i.state === 'failed')
                  .map((i) => `${i.name}: ${i.problem}`)
                  .join(' · ')}
              </Notice>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2">
            <TextInput
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              aria-label="A tag for all of them"
              placeholder="A tag for all of them, like autumn"
            />
            <div className="flex flex-wrap gap-2">
              <Button disabled={running || !done} onClick={() => void keepAll()}>
                Save {done} to My stickers
              </Button>
              {running ? (
                <Button onClick={() => (stop.current = true)}>Stop</Button>
              ) : (
                <Button onClick={() => setItems([])}>Clear</Button>
              )}
            </div>
          </div>

          {said && (
            <div className="mt-3">
              <Notice level="ok">{said}</Notice>
            </div>
          )}
        </>
      )}
    </div>
  );
}
