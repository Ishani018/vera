'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { UnsupportedImageError, putAsset } from '@/lib/assets';
import { saveToLibrary, parseTags } from '@/lib/cover/library';
import { renderSticker } from '@/lib/lineart/client';
import type { StickerOptions } from '@/lib/lineart/worker';
import { DEFAULT_LINE_ART } from '@/lib/projects';
import type { LineArtSettings } from '@/lib/types';
import { ColourField } from '../cover/ColourField';
import { Control, ModeChoice } from '../coloring/LineArtControls';
import { StudioHeader } from '../StudioHeader';
import { Button, Notice, TextInput, Toggle, cx } from '../ui';

/**
 * Any picture, into a sticker.
 *
 * The one screen here that can be finished in thirty seconds without learning
 * an editor: drop a drawing in, and a transparent PNG with a die-cut edge comes
 * out. Nothing about it is new machinery — the conversion is the colouring
 * book's pipeline, the clean-up is its clean-up path, the morphology behind the
 * outline is the same `dilate` the tracer uses, and the only genuinely new
 * piece is an alpha channel, which lives in `lib/lineart/mask.ts`.
 *
 * The working session is held in memory, deliberately. Nothing is written to
 * the database until "Save to My stickers" is pressed, and what is written then
 * is a sticker in the existing library table with its picture in the existing
 * assets table. There is no new table and nothing of anyone's is touched.
 *
 * The cost of that is honest and worth saying: reloading the page loses the
 * session. Slice 1 buys the whole feature without a schema change; keeping a
 * half-finished sticker across a reload needs somewhere to keep it.
 */

type Mode = 'convert' | 'cleanup' | 'asis';

/** What the exported PNG's long edge can be. */
const SIZES = [
  { px: 500, label: '500 px', note: 'Small — for a screen' },
  { px: 1000, label: '1000 px', note: 'The usual sticker size' },
  { px: 2000, label: '2000 px', note: 'Large — prints at 300 DPI to about 6 inches' },
];

/** Big enough to judge by, small enough to answer a slider quickly. */
const PREVIEW_EDGE = 800;

export function StickerStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('convert');
  const [settings, setSettings] = useState<LineArtSettings>({ ...DEFAULT_LINE_ART });
  const [removeBackground, setRemoveBackground] = useState(true);
  const [tolerance, setTolerance] = useState(14);
  const [smoothing, setSmoothing] = useState(1);
  const [inkColour, setInkColour] = useState('#1B1815');
  const [dieCutOn, setDieCutOn] = useState(false);
  const [dieCutWidth, setDieCutWidth] = useState(10);
  const [dieCutColour, setDieCutColour] = useState('#FFFFFF');
  const [dieCutRadius, setDieCutRadius] = useState(6);
  const [size, setSize] = useState(1000);

  const [preview, setPreview] = useState<{ url: string; width: number; height: number; transparent: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [said, setSaid] = useState<string | null>(null);

  /* ------------------------------------------------------------- the upload */

  const take = async (chosen: File | undefined) => {
    if (!chosen) return;
    setProblem(null);
    setSaid(null);
    try {
      // The same checks the rest of the app makes, and the same store. The
      // original goes in untouched and at full resolution; everything below
      // works from it and never writes over it.
      await putAsset(chosen);
      setFile(chosen);
      setName(chosen.name.replace(/\.[^.]+$/, ''));
    } catch (error) {
      setProblem(
        error instanceof UnsupportedImageError
          ? error.message
          : 'That picture could not be read. PNG, JPEG and WebP work.',
      );
    }
  };

  /* ------------------------------------------------------------ the preview */

  const options = useCallback(
    (longEdge: number): StickerOptions => ({
      mode,
      removeBackground: mode === 'asis' && removeBackground,
      tolerance,
      smoothing,
      inkColour,
      dieCut: dieCutOn
        ? { width: dieCutWidth, colour: dieCutColour, radius: dieCutRadius }
        : null,
      longEdge,
    }),
    [mode, removeBackground, tolerance, smoothing, inkColour, dieCutOn, dieCutWidth, dieCutColour, dieCutRadius],
  );

  // One render in flight at a time, and the newest wins: the worker numbers its
  // answers, so an old one arriving late cannot replace a newer picture.
  const latest = useRef(0);
  useEffect(() => {
    if (!file) return;
    const mine = ++latest.current;
    setBusy(true);
    let url: string | null = null;
    renderSticker(file, settings, options(PREVIEW_EDGE))
      .then((result) => {
        if (mine !== latest.current) return;
        url = URL.createObjectURL(result.blob);
        setPreview((was) => {
          if (was) URL.revokeObjectURL(was.url);
          return { url: url!, width: result.width, height: result.height, transparent: result.transparent };
        });
        setProblem(null);
      })
      .catch((error: Error) => {
        if (mine === latest.current) setProblem(error.message);
      })
      .finally(() => {
        if (mine === latest.current) setBusy(false);
      });
  }, [file, settings, options]);

  // The last preview's object URL, let go of on the way out. Every earlier one
  // was already released as it was replaced.
  const showing = preview?.url;
  useEffect(
    () => () => {
      if (showing) URL.revokeObjectURL(showing);
    },
    [showing],
  );

  /* ------------------------------------------------------------- the output */

  const makeAtSize = async () => {
    if (!file) return null;
    return renderSticker(file, settings, options(size));
  };

  const download = async () => {
    setBusy(true);
    setSaid(null);
    try {
      const result = await makeAtSize();
      if (!result) return;
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${slug(name)}-${result.width}x${result.height}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSaid(`Saved a ${result.width} × ${result.height} PNG to your downloads.`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That could not be exported.');
    } finally {
      setBusy(false);
    }
  };

  const keep = async () => {
    setBusy(true);
    setSaid(null);
    try {
      const result = await makeAtSize();
      if (!result) return;
      const asFile = new File([result.blob], `${slug(name)}.png`, { type: 'image/png' });
      const record = await putAsset(asFile);
      await saveToLibrary({
        name: name.trim() || 'Sticker',
        assetId: record.id,
        width: result.width,
        height: result.height,
        tags: parseTags(tags),
      });
      setSaid('Kept in My stickers — it is in every book and every design now.');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  /* --------------------------------------------------------------- the page */

  return (
    <main className="flex h-dvh flex-col">
      <StudioHeader>
        <span className="text-[16px] font-[560]">Sticker Studio</span>
        <span className="ml-auto shrink-0 text-[13px] text-ink-500">saved on this computer</span>
      </StudioHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
          <Link href="/" className="text-[13px] text-accent-500 underline">
            ← Everything
          </Link>

          {!file ? (
            <div className="mt-6">
              <h1 className="text-[26px] font-semibold tracking-tight">Make a sticker</h1>
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-500">
                A drawing, a painting or a photograph on plain paper. It comes back with the
                background knocked out and, if you want one, a die-cut edge round it.
              </p>
              <label className="mt-5 block max-w-md cursor-pointer rounded-2xl border-2 border-dashed border-ink-300 px-6 py-10 text-center transition-colors hover:border-accent-500">
                <span className="block text-[16px] font-[570]">Choose a picture…</span>
                <span className="mt-1 block text-[13.5px] text-ink-500">PNG, JPEG or WebP</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => void take(e.target.files?.[0])}
                />
              </label>
              {problem && (
                <div className="mt-4 max-w-md">
                  <Notice level="error">{problem}</Notice>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5 grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
              {/* ------------------------------------------------ the picture */}
              <div>
                <Checkerboard>
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview.url}
                      alt="The sticker"
                      className="max-h-[54vh] w-auto max-w-full object-contain"
                    />
                  ) : (
                    <span className="px-6 py-16 text-[14px] text-ink-500">Working…</span>
                  )}
                </Checkerboard>

                <p className="mt-2 text-[12.5px] text-ink-500">
                  The squares are not part of the sticker — they show where it is see-through.
                  {preview && (
                    <>
                      {' '}
                      Preview {preview.width} × {preview.height} px.
                      {!preview.transparent && ' Nothing in this one is transparent yet.'}
                    </>
                  )}
                </p>

                {busy && <p className="mt-1 text-[12.5px] text-ink-500">Working…</p>}
                {problem && (
                  <div className="mt-3">
                    <Notice level="error">{problem}</Notice>
                  </div>
                )}
                {said && (
                  <div className="mt-3">
                    <Notice level="ok">{said}</Notice>
                  </div>
                )}
              </div>

              {/* ----------------------------------------------- the controls */}
              <div className="flex flex-col gap-6">
                <ModeChoice<Mode>
                  title="What kind of picture is this?"
                  hint="It decides what happens to it, and the three are quite different."
                  value={mode}
                  columns={3}
                  onChange={setMode}
                  choices={[
                    { value: 'convert', label: 'Painting or photo', note: 'Traced into line art' },
                    { value: 'cleanup', label: 'Already line art', note: 'Cleaned up, never traced' },
                    { value: 'asis', label: 'Keep as is', note: 'Colours kept exactly' },
                  ]}
                >
                  {mode === 'cleanup' && (
                    <p className="mt-3 rounded-xl bg-ink-100 px-4 py-3 text-[13.5px] leading-relaxed text-ink-700">
                      Nothing is traced on this one — tracing a drawing would find both sides of
                      every stroke and give a hollow, doubled outline.
                    </p>
                  )}
                </ModeChoice>

                {mode !== 'asis' && (
                  <>
                    <Control
                      label="Detail"
                      hint="Bigger keeps finer marks. Too far and the paper's texture comes with them."
                      value={settings.detail}
                      onChange={(detail) => setSettings((s) => ({ ...s, detail }))}
                    />
                    <Control
                      label="Line weight"
                      hint="How heavy the strokes come out."
                      value={settings.thickness}
                      onChange={(thickness) => setSettings((s) => ({ ...s, thickness }))}
                    />
                    <Control
                      label="Tidying"
                      hint="Removes specks and softens ragged edges."
                      value={settings.cleanup}
                      onChange={(cleanup) => setSettings((s) => ({ ...s, cleanup }))}
                    />
                    <div>
                      <span className="block font-[570]">Line colour</span>
                      <span className="mt-0.5 mb-2 block text-[14px] text-ink-500">
                        The sticker is this colour and everything else is see-through.
                      </span>
                      <ColourField label="Line colour" value={inkColour} onChange={setInkColour} />
                    </div>
                  </>
                )}

                {mode === 'asis' && (
                  <>
                    <Toggle
                      label="Remove the plain background"
                      checked={removeBackground}
                      onChange={setRemoveBackground}
                    />
                    <p className="-mt-3 text-[13px] leading-snug text-ink-500">
                      Works inward from the edges, so an enclosed white — the inside of an eye, the
                      hole in a letter O — is never punched out. It does well on a drawing on white
                      paper or a flat-colour image, and badly on a busy photograph, on hair or fur,
                      and on anything see-through.
                    </p>
                    {removeBackground && (
                      <Control
                        label="How close a match counts as background"
                        hint="Bigger lifts more of a shaded or off-white paper, and eventually starts eating the picture."
                        value={tolerance}
                        min={2}
                        max={50}
                        onChange={setTolerance}
                      />
                    )}
                  </>
                )}

                <Control
                  label="Edge smoothing"
                  hint="Softens the cut edge so it is not a staircase."
                  value={smoothing}
                  min={0}
                  max={6}
                  onChange={setSmoothing}
                />

                <div>
                  <Toggle label="Die-cut outline" checked={dieCutOn} onChange={setDieCutOn} />
                  {dieCutOn && (
                    <div className="mt-4 flex flex-col gap-5">
                      <Control
                        label="Outline width"
                        hint="Drawn outside the artwork, never over it."
                        value={dieCutWidth}
                        min={1}
                        max={40}
                        onChange={setDieCutWidth}
                      />
                      <Control
                        label="Rounded corners"
                        hint="Far enough and separate parts merge into one shape — usually what a die-cut should do."
                        value={dieCutRadius}
                        min={0}
                        max={30}
                        onChange={setDieCutRadius}
                      />
                      <div>
                        <span className="mb-2 block font-[570]">Outline colour</span>
                        <ColourField
                          label="Outline colour"
                          value={dieCutColour}
                          onChange={setDieCutColour}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* ------------------------------------------------- the exit */}
                <div className="border-t border-ink-200 pt-5">
                  <span className="block font-[570]">Size</span>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {SIZES.map((choice) => (
                      <button
                        key={choice.px}
                        type="button"
                        aria-pressed={size === choice.px}
                        onClick={() => setSize(choice.px)}
                        className={cx(
                          'rounded-lg border px-3 py-2 text-left text-[13.5px] transition-colors',
                          size === choice.px
                            ? 'border-accent-500 bg-accent-50'
                            : 'border-ink-200 hover:border-ink-300',
                        )}
                      >
                        <span className="font-[560]">{choice.label}</span>
                        <span className="ml-2 text-ink-500">{choice.note}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <TextInput
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      aria-label="Sticker name"
                      placeholder="Name"
                    />
                    <TextInput
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      aria-label="Tags"
                      placeholder="Tags, separated by commas"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="primary" disabled={busy} onClick={() => void download()}>
                      Download PNG
                    </Button>
                    <Button disabled={busy} onClick={() => void keep()}>
                      Save to My stickers
                    </Button>
                  </div>
                  <p className="mt-2 text-[12px] leading-snug text-ink-500">
                    Your original is kept whole and at full resolution either way.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * The squares behind a transparent picture.
 *
 * Drawn in CSS rather than as an image, so it is crisp at any zoom and costs
 * nothing to load. Without it a white sticker on a white page looks like a
 * sticker with a white background, and the one thing this screen has to
 * communicate is which parts are not there.
 */
function Checkerboard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid min-h-[280px] place-items-center overflow-hidden rounded-2xl border border-ink-200 p-4"
      style={{
        // Both squares are off-white rather than one of them being white. The
        // commonest die-cut outline there is, is white, and on a checkerboard
        // with a white square in it a white outline is invisible — which would
        // hide the one thing this preview exists to show.
        backgroundColor: '#efece6',
        backgroundImage:
          'linear-gradient(45deg, #cdc7bd 25%, transparent 25%), ' +
          'linear-gradient(-45deg, #cdc7bd 25%, transparent 25%), ' +
          'linear-gradient(45deg, transparent 75%, #cdc7bd 75%), ' +
          'linear-gradient(-45deg, transparent 75%, #cdc7bd 75%)',
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
      }}
    >
      {children}
    </div>
  );
}

const slug = (text: string) =>
  text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sticker';
