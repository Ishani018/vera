'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UnsupportedImageError, getAsset, putAsset } from '@/lib/assets';
import { saveToLibrary, parseTags } from '@/lib/cover/library';
import { renderSticker, traceInk, type InkResult } from '@/lib/lineart/client';
import type { StickerOptions } from '@/lib/lineart/worker';
import { DEFAULT_LINE_ART } from '@/lib/projects';
import type { Paint } from '@/lib/stickers/colour';
import { blobToPaint, paintToBlob, putLayer } from '@/lib/stickers/layer';
import { SEND_TO, sendStickerToDesign } from '@/lib/stickers/sendToDesign';
import {
  deleteDraft,
  latestDraft,
  newDraft,
  saveDraft,
} from '@/lib/stickers/drafts';
import type { LineArtSettings, StickerDraft } from '@/lib/types';
import { ColourField } from '../cover/ColourField';
import { Control, ModeChoice } from '../coloring/LineArtControls';
import { StudioHeader } from '../StudioHeader';
import { Button, Notice, TextInput, Toggle, cx } from '../ui';
import { PaintSurface, isTouchTool, type SurfaceHandle, type Tool } from './PaintSurface';

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
 * The working session is kept in its own small table, `stickerDrafts`, so
 * closing the tab halfway through does not throw the work away. A draft is not
 * a sticker: nothing lists one, nothing backs one up, and it becomes a sticker
 * only by being finished, which writes into the existing library table the
 * ordinary way. See `lib/stickers/drafts.ts` for the rule and why it is there.
 *
 * The colouring sits under the picture rather than over it — the sticker PNG is
 * transparent everywhere but its lines, so colour behind it shows through
 * exactly where the export will put it, and a brush stroke needs no trip
 * through the pipeline to be seen.
 */

type Mode = 'convert' | 'cleanup' | 'asis';

/** What the exported PNG's long edge can be. */
const SIZES = [
  { px: 500, label: '500 px', note: 'Small — for a screen' },
  { px: 1000, label: '1000 px', note: 'The usual sticker size' },
  { px: 2000, label: '2000 px', note: 'Large — prints at 300 DPI to about 6 inches' },
];

const TOUCH: { value: Tool; label: string; note: string }[] = [
  { value: 'restore', label: 'Restore', note: 'Paints back pixels the removal took away.' },
  { value: 'remove', label: 'Remove', note: 'Takes away more — a shadow, a speck, a stray edge.' },
  {
    value: 'automatic',
    label: 'Automatic',
    note: 'Rubs out your correction and lets the removal decide again.',
  },
];

const TOOLS: { value: Tool; label: string; note: string }[] = [
  {
    value: 'fill',
    label: 'Fill',
    note: 'Click inside a shape and it fills to the lines around it.',
  },
  { value: 'brush', label: 'Brush', note: 'Paint by hand, for anything a fill cannot reach.' },
  { value: 'eraser', label: 'Eraser', note: 'Takes colour off again. The drawing underneath is never touched.' },
];

/** Big enough to judge by, small enough to answer a slider quickly. */
const PREVIEW_EDGE = 800;

/**
 * The grid the colouring is painted on, whatever size it is exported at.
 *
 * Fixed rather than following the export size, so changing from 1000 px to
 * 2000 px does not throw away an afternoon's colouring and start again. It is
 * above the usual export size, so the commonest case loses nothing at all, and
 * a layer is 1200 × 1200 × 4 bytes — about six megabytes, which is a sensible
 * thing to hold and a sensible thing to store.
 */
const COLOUR_EDGE = 1200;

/** How long after the last change the draft is written. */
const SAVE_AFTER_MS = 700;

export function StickerStudio() {
  const router = useRouter();
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

  const [preview, setPreview] = useState<{
    url: string;
    width: number;
    height: number;
    transparent: boolean;
    pad: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [said, setSaid] = useState<string | null>(null);

  /* --------------------------------------------------------- the colouring */

  const [colouring, setColouring] = useState(false);
  const [touchUp, setTouchUp] = useState(false);
  const [tool, setTool] = useState<Tool>('fill');
  const [brushColour, setBrushColour] = useState('#E8B4B8');
  const [brush, setBrush] = useState(14);
  const [gapClosing, setGapClosing] = useState(2);
  const [softness, setSoftness] = useState(0.4);
  const [ink, setInk] = useState<InkResult | null>(null);
  const [leak, setLeak] = useState<number | null>(null);
  const surface = useRef<SurfaceHandle>(null);
  const startColour = useRef<Paint | null>(null);
  const startTouch = useRef<Paint | null>(null);

  // The layers waiting to be written, and two counters: one that ticks on every
  // gesture and drives the save timer, one that ticks when the timer fires and
  // tells the preview it is worth making again.
  const pendingColour = useRef<Paint | null>(null);
  const pendingTouch = useRef<Paint | null>(null);
  const [layerTick, setLayerTick] = useState(0);
  const [settled, setSettled] = useState(0);

  const colourChanged = useCallback((layer: Paint) => {
    pendingColour.current = layer;
    setLayerTick((n) => n + 1);
  }, []);

  const touchChanged = useCallback((layer: Paint) => {
    pendingTouch.current = layer;
    setLayerTick((n) => n + 1);
  }, []);

  // One surface serves both layers, so it exists as soon as either tool does.
  const painting = colouring || touchUp;

  // The tool always belongs to a panel that is open, so nobody is left holding
  // a brush that paints on a layer they have just put away.
  useEffect(() => {
    if (touchUp && !colouring && !isTouchTool(tool)) setTool('restore');
    if (colouring && !touchUp && isTouchTool(tool)) setTool('fill');
  }, [colouring, touchUp, tool]);

  /* ------------------------------------------------------------ the draft */

  // Held in a ref rather than in state: it is written on a timer and read on
  // demand, and keeping it in state would make every save a render and every
  // render a save. What the screen needs to know about it is `drafted`.
  const row = useRef<StickerDraft | null>(null);
  const [drafted, setDrafted] = useState(false);
  const [resumable, setResumable] = useState<StickerDraft | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  /* ------------------------------------------------------------- the upload */

  const take = async (chosen: File | undefined) => {
    if (!chosen) return;
    setProblem(null);
    setSaid(null);
    try {
      // The same checks the rest of the app makes, and the same store. The
      // original goes in untouched and at full resolution; everything below
      // works from it and never writes over it.
      const record = await putAsset(chosen);
      // A new picture starts with nothing painted on it: the last draft's
      // layers must not be handed to the surface as a starting point.
      startColour.current = null;
      startTouch.current = null;
      const started = newDraft(record.id, chosen.name.replace(/\.[^.]+$/, ''));
      await saveDraft(started);
      row.current = started;
      setDrafted(true);
      setSavedAt(Date.now());
      setResumable(null);
      setFile(chosen);
      setName(started.name);
    } catch (error) {
      setProblem(
        error instanceof UnsupportedImageError
          ? error.message
          : 'That picture could not be read. PNG, JPEG and WebP work.',
      );
    }
  };

  /* ------------------------------------------------------------- resuming */

  // Whatever was last being worked on, offered rather than forced: opening the
  // studio to somebody else's half-finished fox would be worse than losing it.
  useEffect(() => {
    void latestDraft().then(setResumable);
  }, []);

  const resume = async (saved: StickerDraft) => {
    setProblem(null);
    setBusy(true);
    try {
      const source = await getAsset(saved.sourceAssetId);
      if (!source) throw new Error('The picture this was made from is no longer here.');

      // The colouring is loaded before anything asks to see it, so the canvas
      // is built from it rather than blank and then replaced.
      const layerOf = async (id: string | null) =>
        id ? ((await getAsset(id).then((a) => (a ? blobToPaint(a.blob) : null))) ?? null) : null;
      startColour.current = await layerOf(saved.colourAssetId);
      startTouch.current = await layerOf(saved.touchAssetId);

      setMode(saved.mode);
      setSettings(saved.settings);
      setRemoveBackground(saved.removeBackground);
      setTolerance(saved.tolerance);
      setSmoothing(saved.smoothing);
      setInkColour(saved.inkColour);
      setDieCutOn(Boolean(saved.dieCut));
      if (saved.dieCut) {
        setDieCutWidth(saved.dieCut.width);
        setDieCutColour(saved.dieCut.colour);
        setDieCutRadius(saved.dieCut.radius);
      }
      setSize(saved.size);
      setGapClosing(saved.gapClosing);
      setName(saved.name);
      setTags(saved.tags);
      row.current = saved;
      setDrafted(true);
      setSavedAt(saved.updatedAt);
      setResumable(null);
      setFile(new File([source.blob], source.name || 'picture', { type: source.mime }));
      // Whichever panels have work in them open again, so a reopened draft
      // shows what was being done rather than an apparently untouched picture.
      setColouring(Boolean(saved.colourAssetId));
      setTouchUp(Boolean(saved.touchAssetId));
      if (saved.touchAssetId && !saved.colourAssetId) setTool('restore');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That could not be reopened.');
    } finally {
      setBusy(false);
    }
  };

  const discard = async (saved: StickerDraft) => {
    // Into the trash, not out of existence: the same thirty days as everything
    // else, and the same Restore.
    await deleteDraft(saved.id);
    setResumable(await latestDraft());
  };

  /* ------------------------------------------------------------ the preview */

  const options = useCallback(
    (longEdge: number, withColour: Paint | null = null, withTouch: Paint | null = null): StickerOptions => ({
      mode,
      removeBackground: mode === 'asis' && removeBackground,
      tolerance,
      smoothing,
      inkColour,
      dieCut: dieCutOn
        ? { width: dieCutWidth, colour: dieCutColour, radius: dieCutRadius }
        : null,
      longEdge,
      colour: withColour,
      touch: withTouch,
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
    // The colouring is drawn live on its own canvas behind the picture, which
    // is exactly where the export puts it — so the preview needs to carry it
    // only when the die-cut does, because the outline has to go round it.
    const ringed = colouring && dieCutOn ? surface.current?.colour() ?? null : null;
    // The touch-up always goes in: unlike the colouring it decides which pixels
    // the sticker has at all, so there is no drawing it on top afterwards.
    renderSticker(file, settings, options(PREVIEW_EDGE, ringed, surface.current?.touch() ?? null))
      .then((result) => {
        if (mine !== latest.current) return;
        url = URL.createObjectURL(result.blob);
        setPreview((was) => {
          if (was) URL.revokeObjectURL(was.url);
          return {
            url: url!,
            width: result.width,
            height: result.height,
            transparent: result.transparent,
            pad: result.pad,
          };
        });
        setProblem(null);
      })
      .catch((error: Error) => {
        if (mine === latest.current) setProblem(error.message);
      })
      .finally(() => {
        if (mine === latest.current) setBusy(false);
      });
  }, [file, settings, options, colouring, dieCutOn, settled]);

  /**
   * The traced lines as numbers, asked for once per trace.
   *
   * Only while colouring: it is a second pass over the picture, and somebody
   * who just wants a die-cut PNG should not pay for a tool they never opened.
   */
  useEffect(() => {
    if (!file || !painting) {
      setInk(null);
      return;
    }
    let dropped = false;
    void traceInk(file, settings, mode, COLOUR_EDGE)
      .then((result) => {
        if (!dropped) setInk(result);
      })
      .catch((error: Error) => {
        if (!dropped) setProblem(error.message);
      });
    return () => {
      dropped = true;
    };
  }, [file, settings, mode, painting]);

  // The last preview's object URL, let go of on the way out. Every earlier one
  // was already released as it was replaced.
  const showing = preview?.url;
  useEffect(
    () => () => {
      if (showing) URL.revokeObjectURL(showing);
    },
    [showing],
  );

  /* ---------------------------------------------------------- keeping it */

  /**
   * Everything on this screen, written to the draft once the changes stop.
   *
   * On a timer rather than on every keystroke, because dragging a slider fires
   * a dozen changes a second and a database write for each of them would be
   * felt. Seven hundred milliseconds is long enough to cover a drag and short
   * enough that closing the tab after a pause loses nothing.
   */
  useEffect(() => {
    if (!row.current) return;
    const timer = setTimeout(() => {
      const current = row.current;
      if (!current) return;
      const next: StickerDraft = {
        ...current,
        name,
        tags,
        mode,
        settings,
        removeBackground,
        tolerance,
        smoothing,
        inkColour,
        dieCut: dieCutOn ? { width: dieCutWidth, colour: dieCutColour, radius: dieCutRadius } : null,
        size,
        gapClosing,
        updatedAt: Date.now(),
      };
      row.current = next;
      void saveDraft(next).then(() => setSavedAt(next.updatedAt));
    }, SAVE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [
    name,
    tags,
    mode,
    settings,
    removeBackground,
    tolerance,
    smoothing,
    inkColour,
    dieCutOn,
    dieCutWidth,
    dieCutColour,
    dieCutRadius,
    size,
    gapClosing,
    drafted,
  ]);

  /**
   * The colouring, stored beside the draft as a lossless PNG.
   *
   * Written over the top of the last one rather than beside it — see
   * `putLayer` — and on the same timer as everything else, so a long stroke is
   * one write and not four hundred.
   */
  useEffect(() => {
    if (!layerTick) return;
    const timer = setTimeout(() => {
      const current = row.current;
      if (!current) return;
      void (async () => {
        let next = row.current!;
        const store = async (layer: Paint | null, existing: string | null) => {
          if (!layer) return existing;
          const blob = await paintToBlob(layer);
          // Nothing painted at all: the draft keeps no layer rather than an
          // empty one, so a sticker never carries a megabyte of nothing.
          return blob ? ((await putLayer(existing, blob, layer.width, layer.height)) ?? existing) : existing;
        };
        const painted = pendingColour.current ?? pendingTouch.current;
        next = {
          ...next,
          colourAssetId: await store(pendingColour.current, next.colourAssetId),
          touchAssetId: await store(pendingTouch.current, next.touchAssetId),
          colourAt: painted ? { width: painted.width, height: painted.height } : next.colourAt,
          updatedAt: Date.now(),
        };
        row.current = next;
        await saveDraft(next);
        setSavedAt(next.updatedAt);
      })();
      // The outline goes round the colour as well as round the drawing, and the
      // touch-up changes the shape itself, so once a layer settles the preview
      // is worth making again. Only then: doing it per stroke would put the
      // whole pipeline between the brush and the screen.
      setSettled((n) => n + 1);
    }, SAVE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [layerTick]);

  /* ------------------------------------------------------------- the output */

  const makeAtSize = async () => {
    if (!file) return null;
    return renderSticker(
      file,
      settings,
      options(size, colouring ? surface.current?.colour() ?? null : null, surface.current?.touch() ?? null),
    );
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

  /* ----------------------------------------------------------- onto a board */

  const [sending, setSending] = useState(false);

  const send = async (presetId: string) => {
    setBusy(true);
    setSaid(null);
    try {
      const result = await makeAtSize();
      if (!result) return;
      const sent = await sendStickerToDesign({
        presetId,
        blob: result.blob,
        width: result.width,
        height: result.height,
        name: name.trim() || 'Sticker',
      });
      if (!sent) throw new Error('That board could not be made.');
      setSending(false);
      router.push(`/design?id=${encodeURIComponent(sent.design.id)}`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That could not be sent to a design.');
    } finally {
      setBusy(false);
    }
  };

  /* --------------------------------------------------------------- the page */

  return (
    <main className="flex h-dvh flex-col">
      <StudioHeader>
        <span className="text-[16px] font-[560]">Sticker Studio</span>
        <span className="ml-auto shrink-0 text-[13px] text-ink-500">
          {drafted && savedAt ? 'kept on this computer — a reload will not lose it' : 'saved on this computer'}
        </span>
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
              {resumable && (
                <div className="mt-5 max-w-md rounded-2xl border border-ink-200 bg-paper-0 px-4 py-3.5">
                  <p className="text-[14px] leading-snug">
                    You were in the middle of{' '}
                    <span className="font-[570]">{resumable.name || 'a sticker'}</span>.
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-ink-500">
                    Last changed {when(resumable.updatedAt)}. Nothing has been added to My stickers.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="primary" disabled={busy} onClick={() => void resume(resumable)}>
                      Carry on with it
                    </Button>
                    <Button disabled={busy} onClick={() => void discard(resumable)}>
                      Throw it away
                    </Button>
                  </div>
                  <p className="mt-2 text-[12px] text-ink-500">
                    Throwing it away puts it in the trash for thirty days, like everything else.
                  </p>
                </div>
              )}

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
                    <div className="relative inline-block">
                      {painting && ink && (
                        <PaintSurface
                          ink={ink}
                          tool={tool}
                          colour={brushColour}
                          brush={brush}
                          softness={softness}
                          gap={gapClosing}
                          pad={{
                            x: preview.pad / preview.width,
                            y: preview.pad / preview.height,
                          }}
                          handle={surface}
                          startColour={startColour.current}
                          startTouch={startTouch.current}
                          onColourChange={colourChanged}
                          onTouchChange={touchChanged}
                          onLeak={setLeak}
                        />
                      )}
                      {/* On top of the colouring and deaf to the pointer, so a
                          click goes to the canvas underneath rather than to a
                          picture that has nothing to do with it. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview.url}
                        alt="The sticker"
                        className="pointer-events-none relative z-10 max-h-[54vh] w-auto max-w-full object-contain"
                      />
                    </div>
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

                {leak !== null && (
                  <div className="mt-3">
                    <Notice level="warning">
                      That fill covered {Math.round(leak * 100)}% of the picture, which usually means
                      it escaped through a gap in the outline rather than filling one shape. Undo it
                      and raise gap closing, then try again.
                      <span className="mt-2 flex flex-wrap gap-2">
                        <Button
                          onClick={() => {
                            surface.current?.undo();
                            setLeak(null);
                          }}
                        >
                          Undo that fill
                        </Button>
                        <Button
                          onClick={() => {
                            surface.current?.undo();
                            setGapClosing((g) => Math.min(12, g + 2));
                            setLeak(null);
                          }}
                        >
                          Undo and raise gap closing
                        </Button>
                        <Button onClick={() => setLeak(null)}>Keep it</Button>
                      </span>
                    </Notice>
                  </div>
                )}

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
                      hole in a letter O — is never punched out. It follows uneven lighting across
                      a photographed page, ignores paper grain, and cuts a soft edge rather than a
                      staircase.
                    </p>
                    <div className="-mt-1 rounded-xl bg-ink-100 px-4 py-3 text-[13px] leading-relaxed text-ink-700">
                      <span className="block font-[570]">What it cannot do</span>
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                        <li>Busy photographs, where there is no one background to find.</li>
                        <li>Hair and fur — thousands of strands thinner than the cut.</li>
                        <li>Glass and anything see-through: it can keep it or drop it, not both.</li>
                        <li>
                          A soft shadow touching the object, which runs smoothly into the edge and
                          takes a bite out of it.
                        </li>
                        <li>
                          A background that fades from one colour to a different one, rather than
                          the same colour lit unevenly.
                        </li>
                      </ul>
                      <p className="mt-2">
                        Every one of these is what <span className="font-[560]">Touch up the
                        cut-out</span> is for: paint the edge back by hand and the outline follows
                        it.
                      </p>
                    </div>
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

                {/* ---------------------------------------- the touch-up */}
                <div className="border-t border-ink-200 pt-5">
                  <Toggle label="Touch up the cut-out" checked={touchUp} onChange={setTouchUp} />
                  {!touchUp ? (
                    <p className="mt-2 text-[13px] leading-snug text-ink-500">
                      Paint back anything the background removal took by mistake, or take away
                      anything it left behind. What you paint decides the sticker&rsquo;s edge, so
                      the die-cut outline follows it too.
                    </p>
                  ) : !ink ? (
                    <p className="mt-3 text-[13px] text-ink-500">Reading the picture…</p>
                  ) : (
                    <div className="mt-4 flex flex-col gap-5">
                      <div>
                        <span className="mb-2 block font-[570]">Brush</span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {TOUCH.map((choice) => (
                            <button
                              key={choice.value}
                              type="button"
                              aria-pressed={tool === choice.value}
                              title={choice.note}
                              onClick={() => setTool(choice.value)}
                              className={cx(
                                'rounded-lg border px-2 py-2 text-[13px] font-[560] transition-colors',
                                tool === choice.value
                                  ? 'border-accent-500 bg-accent-50'
                                  : 'border-ink-200 hover:border-ink-300',
                              )}
                            >
                              {choice.label}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-[13px] leading-snug text-ink-500">
                          {TOUCH.find((t) => t.value === tool)?.note ??
                            'Pick one of these to paint on the cut-out.'}
                        </p>
                        <p className="mt-1.5 text-[12.5px] leading-snug text-ink-500">
                          Green is kept, red is dropped. The picture itself catches up a moment
                          after you stop.
                        </p>
                      </div>

                      {isTouchTool(tool) && (
                        <>
                          <Control
                            label="Brush size"
                            hint="The radius, in pixels of the picture."
                            value={brush}
                            min={2}
                            max={120}
                            onChange={setBrush}
                          />
                          <Control
                            label="Softness"
                            hint="How much of the brush fades at its edge. Soft is for hair-fine edges and shadows; hard is for a clean cut."
                            value={Math.round(softness * 100)}
                            min={0}
                            max={100}
                            onChange={(n) => setSoftness(n / 100)}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button onClick={() => surface.current?.undo()}>Undo</Button>
                            <Button onClick={() => surface.current?.redo()}>Redo</Button>
                            <Button onClick={() => surface.current?.clearAll()}>
                              Clear touch-ups
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* ------------------------------------------- the colouring */}
                <div className="border-t border-ink-200 pt-5">
                  <Toggle label="Colour it in" checked={colouring} onChange={setColouring} />
                  {!colouring ? (
                    <p className="mt-2 text-[13px] leading-snug text-ink-500">
                      Fill the shapes with a bucket, or paint by hand. The colour goes under the
                      lines, so it never paints over the drawing.
                    </p>
                  ) : !ink ? (
                    <p className="mt-3 text-[13px] text-ink-500">Reading the lines…</p>
                  ) : (
                    <div className="mt-4 flex flex-col gap-5">
                      <div>
                        <span className="mb-2 block font-[570]">Tool</span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {TOOLS.map((choice) => (
                            <button
                              key={choice.value}
                              type="button"
                              aria-pressed={tool === choice.value}
                              title={choice.note}
                              onClick={() => setTool(choice.value)}
                              className={cx(
                                'rounded-lg border px-2 py-2 text-[13.5px] font-[560] transition-colors',
                                tool === choice.value
                                  ? 'border-accent-500 bg-accent-50'
                                  : 'border-ink-200 hover:border-ink-300',
                              )}
                            >
                              {choice.label}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-[13px] leading-snug text-ink-500">
                          {TOOLS.find((t) => t.value === tool)?.note ??
                            'Pick one of these to paint colour.'}
                        </p>
                      </div>

                      {tool !== 'eraser' && !isTouchTool(tool) && (
                        <div>
                          <span className="mb-2 block font-[570]">Colour</span>
                          <ColourField
                            label="Colour"
                            value={brushColour}
                            onChange={setBrushColour}
                          />
                        </div>
                      )}

                      {isTouchTool(tool) ? null : tool === 'fill' ? (
                        <Control
                          label="Gap closing"
                          hint="Fattens the lines while it works out where the fill stops, then throws the fattening away. Raise it when colour leaks out through a break in an outline."
                          value={gapClosing}
                          min={0}
                          max={12}
                          onChange={setGapClosing}
                        />
                      ) : (
                        <Control
                          label="Brush size"
                          hint="The radius, in pixels of the picture."
                          value={brush}
                          min={2}
                          max={80}
                          onChange={setBrush}
                        />
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => surface.current?.undo()}>Undo</Button>
                        <Button onClick={() => surface.current?.redo()}>Redo</Button>
                        <Button
                          onClick={() => {
                            surface.current?.clearAll();
                            setLeak(null);
                          }}
                        >
                          Clear colouring
                        </Button>
                      </div>
                      <p className="-mt-3 text-[12px] leading-snug text-ink-500">
                        ⌘Z and ⇧⌘Z work too. Clearing is one undo away, like anything else.
                      </p>
                    </div>
                  )}
                </div>

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
                    <Button disabled={busy} onClick={() => setSending((was) => !was)}>
                      Send to a design…
                    </Button>
                  </div>

                  {sending && (
                    <div className="mt-3 rounded-xl border border-ink-200 bg-paper-0 p-3">
                      <span className="block text-[13.5px] font-[570]">Put it on a board</span>
                      <p className="mt-0.5 mb-2 text-[12.5px] leading-snug text-ink-500">
                        It is placed in the middle at this size, with its own copy of the picture —
                        so changing or deleting the sticker later cannot reach the design.
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {SEND_TO.map((board) => (
                          <button
                            key={board.presetId}
                            type="button"
                            disabled={busy}
                            onClick={() => void send(board.presetId)}
                            className="rounded-lg border border-ink-200 px-3 py-2 text-left text-[13.5px] transition-colors hover:border-accent-500 disabled:opacity-50"
                          >
                            <span className="font-[560]">{board.label}</span>
                            <span className="ml-2 text-ink-500">{board.note}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
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

/** "four minutes ago", for a draft that was open a moment before a reload. */
function when(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 90) return 'a moment ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
