'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { render, type LabResult } from '@/lib/lab/client';
import { LOGO_GROUNDS, LOOKS, controlsFor, defaultsFor, type LookId } from '@/lib/lab/looks';
import { CLASSIC_WORKING_EDGE, type ClassicSettings } from '@/lib/lineart/xdog';
import type { ColouringSettings } from '@/lib/lineart/colouring';
import type { LogoSettings } from '@/lib/lab/logo';
import type { InkedSettings } from '@/lib/lineart/inked';
import { Accordion, Button, Info, Notice, Slider, Toggle, cx } from '../ui';
import { LookCard } from './LookCard';
import { Chequerboard } from '../stickers/Thumb';
import { StudioHeader } from '../StudioHeader';
import { ExportIcon, LookIcon, PictureIcon, TuneIcon } from './icons';

/** The look cards are previews, so they run small and once. */
const CARD_EDGE = 300;

/**
 * The Line Art Lab.
 *
 * Six ways to turn a picture into line art, all of them our own code
 * implementing published algorithms. No model, nothing downloaded, nothing
 * sent anywhere: the picture is decoded, worked on in a worker and drawn, all
 * inside this browser.
 *
 * The layout is built to fit 1280 by 720 without scrolling, because the whole
 * point is comparing things side by side and a comparison you have to scroll
 * between is not one. A strip across the top for the picture, four tabs down
 * the left, the drawing in the middle, and whichever panel the tabs chose on
 * the right.
 *
 * The tall dashed drop box that used to fill the screen is gone. It took the
 * whole window to say one sentence, and it said it again every time somebody
 * wanted a different picture. The strip says the same thing in one row and
 * stays there, so changing picture is where opening one was.
 */
export function Lab() {
  const [file, setFile] = useState<{ blob: Blob; url: string; name: string } | null>(null);
  const [look, setLook] = useState<LookId>('ink-pen');
  const [classic, setClassic] = useState<ClassicSettings>(
    () => (defaultsFor('ink-pen') as { classic: ClassicSettings }).classic,
  );
  const [inked, setInked] = useState<InkedSettings>(
    () => (defaultsFor('hand-inked') as { inked: InkedSettings }).inked,
  );
  const [colouring, setColouring] = useState<ColouringSettings>(
    () => (defaultsFor('colouring') as { colouring: ColouringSettings }).colouring,
  );
  const [logo, setLogo] = useState<LogoSettings>(
    () => (defaultsFor('logo') as { logo: LogoSettings }).logo,
  );
  const [cutOut, setCutOut] = useState(false);
  /** Which ground to judge a mark against. A logo has to work on all three. */
  const [ground, setGround] = useState<'chequer' | 'light' | 'dark'>('chequer');

  const [cards, setCards] = useState<Partial<Record<LookId, string>>>({});
  const [result, setResult] = useState<{ url: string; svg?: string; stats: LabResult['stats'] } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [compare, setCompare] = useState(0.5);
  const [holding, setHolding] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  /*
    Asked once, the first time a picture is opened, and not stored anywhere —
    so it is asked again next session, which for a question about rights is the
    right way round. It is also why this needs no storage key.
  */
  const [agreed, setAgreed] = useState(false);

  /** Every object URL this page has made, so none of them leaks. */
  const urls = useRef<string[]>([]);
  const keep = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    return url;
  };
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const take = useCallback((chosen: File) => {
    setProblem(null);
    setSaid(null);
    setCards({});
    setResult(null);
    const url = URL.createObjectURL(chosen);
    urls.current.push(url);
    setFile({ blob: chosen, url, name: chosen.name });
  }, []);

  /* The look cards: the real engine on the real picture, once, small. */
  useEffect(() => {
    if (!file) return;
    let alive = true;
    const jobs = LOOKS.map((one) => {
      const defaults = defaultsFor(one.id);
      return render({
        blob: file.blob,
        look: one.id,
        classic: 'classic' in defaults ? defaults.classic : classicOf(defaults),
        inked: 'inked' in defaults ? defaults.inked : inked,
        colouring: 'colouring' in defaults ? defaults.colouring : colouring,
        logo: 'logo' in defaults ? defaults.logo : logo,
        longEdge: CARD_EDGE,
        removeBackground: cutOut,
      });
    });
    void Promise.allSettled(
      jobs.map((job, i) =>
        job.done.then((answer) => {
          if (!alive) return;
          setCards((was) => ({ ...was, [LOOKS[i].id]: keep(answer.blob) }));
        }),
      ),
    );
    return () => {
      alive = false;
      for (const job of jobs) job.cancel();
    };
    // Deliberately not re-run when a slider moves: the cards show each look as
    // it comes, so that choosing between them is a choice between looks rather
    // than between one look and five copies of the settings you are editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, cutOut]);

  /* The big picture, re-run whenever anything it depends on moves. */
  useEffect(() => {
    if (!file) return;
    setUpdating(true);
    const job = render({
      blob: file.blob,
      look,
      classic,
      inked,
      colouring,
      logo,
      longEdge: CLASSIC_WORKING_EDGE,
      removeBackground: cutOut,
      wantSvg: look === 'hand-inked' || look === 'logo',
    });
    let alive = true;
    job.done
      .then((answer) => {
        if (!alive) return;
        setResult({ url: keep(answer.blob), svg: answer.svg, stats: answer.stats });
        setProblem(null);
        setUpdating(false);
      })
      .catch((error: Error) => {
        if (!alive) return;
        setProblem(error.message);
        setUpdating(false);
      });
    return () => {
      alive = false;
      job.cancel();
    };
  }, [file, look, classic, inked, colouring, logo, cutOut]);

  const controls = useMemo(() => controlsFor(look), [look]);
  /*
    One slider out, the rest behind Advanced.

    A panel where everything is equally prominent is a panel where nothing is,
    and in practice people reach for how much survives and then stop. `detail`
    is that control wherever a look has one; the two looks that do not — a
    colouring page is about how many areas, a logo about how closely the curves
    follow — take the first of their own instead, so there is always exactly one
    and it is always the one that matters most to what you are looking at.
  */
  const main = controls.filter((id) => id === (controls.includes('detail') ? 'detail' : controls[0]));
  const advanced = controls.filter((id) => !main.includes(id));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Holding shows the picture you started with, whole.
  const showing = holding ? 1 : compare;

  /** Which panel the rail is showing. */
  const [tab, setTab] = useState<TabId>('look');

  /*
    The waiting mark is on while ANY of the engine is running, not just the big
    picture. The eight cards take the longest and used to run in silence, so the
    one moment the Lab looks broken — eight grey rectangles, nothing moving —
    was the one moment it had nothing to say.
  */
  const cardsLeft = file ? LOOKS.length - Object.keys(cards).length : 0;
  const working = updating || cardsLeft > 0;

  const svgUrl = useMemo(
    () => (result?.svg ? keep(new Blob([result.svg], { type: 'image/svg+xml' })) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result?.svg],
  );
  const stem = file ? baseName(file.name) : 'drawing';

  return (
    <main data-lab className="flex h-dvh flex-col bg-paper-50">
      {/* The bar from the home screen, unchanged: wordmark, title, links. */}
      <StudioHeader>
        {/*
          The title and the file name are what a narrow window gives up, the
          same way the Sticker Studio's bar does: the wordmark already says
          where you are, and the links are what the bar is for.
        */}
        <h1
          className="hidden shrink-0 sm:inline"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19 }}
        >
          Line Art Lab
        </h1>
        {file && (
          <span className="mono-label hidden min-w-0 truncate text-ink-500 lg:inline" style={{ fontSize: 10 }}>
            {file.name}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <Link href="/stickers" className="btn btn-ghost min-h-9 px-2.5 text-[14px]">
            Stickers
          </Link>
          <Link href="/stickers/packs" className="btn btn-ghost min-h-9 px-2.5 text-[14px]">
            Packs
          </Link>
          <Link href="/?trash=1" className="btn btn-ghost min-h-9 px-2.5 text-[14px]">
            Trash
          </Link>
        </span>
      </StudioHeader>

      {!agreed ? (
        <Rights onAgree={() => setAgreed(true)} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-5 pt-3">
          <DropStrip has={Boolean(file)} onPick={take} />

          {/*
            Three columns where there is room, one stack where there is not.
            On a phone the drawing goes first, the tabs under it where a thumb
            reaches, and the panel below that — so the order on the screen is
            still look, choose, tune.
          */}
          <div className="flex min-h-0 flex-1 gap-4 max-lg:flex-col max-lg:gap-3 max-lg:overflow-y-auto">
            <Rail tab={tab} onTab={setTab} />

            {/* The drawing */}
            <section
              className="flex min-w-0 flex-1 flex-col max-lg:order-1 max-lg:h-[46vh] max-lg:flex-none"
              aria-label="The drawing"
            >
              <Canvas
                before={file?.url ?? null}
                after={result?.url ?? null}
                at={showing}
                ground={ground}
                working={working}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  aria-label="Before and after"
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={compare}
                  disabled={!file}
                  onChange={(event) => setCompare(Number(event.target.value))}
                  className="h-1 min-w-[180px] flex-1 accent-ink-900"
                />
                <Button
                  disabled={!file}
                  onMouseDown={() => setHolding(true)}
                  onMouseUp={() => setHolding(false)}
                  onMouseLeave={() => setHolding(false)}
                  onKeyDown={(event) => event.key === ' ' && setHolding(true)}
                  onKeyUp={() => setHolding(false)}
                  onBlur={() => setHolding(false)}
                >
                  Hold to compare
                </Button>
              </div>
            </section>

            {/* Whichever panel the rail chose */}
            {/*
              The panel does not scroll; its middle does. The two downloads are
              pinned below it, so they are in the same place whatever the rail
              is showing and whatever the panel above them is long enough to do.
            */}
            <section
              className="flex w-[300px] shrink-0 flex-col max-lg:order-3 max-lg:w-full"
              aria-label="Controls"
            >
              <h2
                className="shrink-0"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 21 }}
              >
                {TABS.find((one) => one.id === tab)?.label}
              </h2>

              <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto pr-0.5 max-lg:overflow-visible">
                {problem && (
                  <div className="mb-3">
                    <Notice level="warning">{problem}</Notice>
                  </div>
                )}

                {!file ? (
                  <p className="text-[13px] leading-snug text-ink-500">Open a picture to begin.</p>
                ) : tab === 'picture' ? (
                  <>
                    <Dial name="Background" hint="Lift the background off before any line is looked for.">
                      <Toggle checked={cutOut} onChange={setCutOut} label="Remove it" />
                    </Dial>
                    <Dial name="Ground" hint="What to judge the drawing against. A mark has to work on all three.">
                      <span className="flex items-center gap-1">
                        {(['chequer', 'light', 'dark'] as const).map((one) => (
                          <button
                            key={one}
                            type="button"
                            aria-pressed={ground === one}
                            onClick={() => setGround(one)}
                            className="chip inline-flex min-h-7 items-center px-2.5"
                            style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                          >
                            {one}
                          </button>
                        ))}
                      </span>
                    </Dial>
                  </>
                ) : tab === 'look' ? (
                  <div
                    className="grid grid-cols-2 content-start gap-x-3 gap-y-2.5"
                    aria-label="Looks"
                    role="group"
                  >
                    {/*
                      The picture itself, first. Without it the row of seven is
                      seven answers to a question nobody can see any more — and
                      pressing it is the quickest way back to what you started
                      with.
                    */}
                    <LookCard
                      label="Original"
                      blurb="The picture you brought"
                      src={file.url}
                      busy={false}
                      selected={compare > 0.999}
                      onSelect={() => setCompare(1)}
                    />
                    {LOOKS.map((one) => (
                      <LookCard
                        key={one.id}
                        label={one.label}
                        blurb={one.blurb}
                        src={cards[one.id] ?? null}
                        busy={!cards[one.id]}
                        selected={look === one.id && compare <= 0.999}
                        onSelect={() => {
                          setLook(one.id);
                          if (compare > 0.999) setCompare(0);
                        }}
                      />
                    ))}
                  </div>
                ) : tab === 'tune' ? (
                  <>
                    {main.map((id) => (
                      <Dial key={id} name={LABELS[id]} hint={HINTS[id]}>
                        <Slider
                          value={valueOf(id, { classic, inked, colouring, logo })}
                          onChange={(next) =>
                            setFrom(id, next, { classic, setClassic, inked, setInked, colouring, setColouring, logo, setLogo })
                          }
                          min={0}
                          max={100}
                          step={1}
                          format={(n) => String(Math.round(n))}
                        />
                      </Dial>
                    ))}

                    {advanced.length > 0 && (
                      <div className="-mx-1 mt-1">
                        <Accordion
                          title="Advanced"
                          open={advancedOpen}
                          onToggle={() => setAdvancedOpen((was) => !was)}
                        >
                          <div className="px-3.5 pb-3 pt-1">
                            {advanced.map((id) => (
                              <Dial key={id} name={LABELS[id]} hint={HINTS[id]}>
                                <Slider
                                  value={valueOf(id, { classic, inked, colouring, logo })}
                                  onChange={(next) =>
                                    setFrom(id, next, {
                                      classic,
                                      setClassic,
                                      inked,
                                      setInked,
                                      colouring,
                                      setColouring,
                                      logo,
                                      setLogo,
                                    })
                                  }
                                  min={0}
                                  max={100}
                                  step={1}
                                  format={(n) => String(Math.round(n))}
                                />
                              </Dial>
                            ))}
                          </div>
                        </Accordion>
                      </div>
                    )}

                    {look === 'logo' && (
                      <div className="mb-3 mt-3">
                        <span data-dial className="mono-label mb-1 block text-ink-900" style={{ fontSize: 10 }}>
                          At small sizes
                          <Info label="At small sizes">
                            A mark has to survive being a favicon and a stamp on the back of a book. If
                            it turns to mush here, it is too detailed to be a logo.
                          </Info>
                        </span>
                        <div className="flex items-end gap-3">
                          {[48, 24, 16].map((size) => (
                            <Chequerboard
                              key={size}
                              className="shrink-0 rounded-[3px] border border-ink-300"
                              style={{ width: size, height: size }}
                            >
                              {result?.url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={result.url} alt="" className="h-full w-full object-contain" />
                              ) : null}
                            </Chequerboard>
                          ))}
                        </div>
                        {result?.stats.busy && (
                          <p className="mt-2 text-[11.5px] leading-snug text-ink-700">
                            {result.stats.strokes} curves. A logo is a handful of shapes, so this will
                            not shrink well.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {said && <p className="mb-2 text-[12px] leading-snug text-ink-700">{said}</p>}
                    <Hand
                      what="Save to My stickers"
                      note={`Tagged lab and ${look}`}
                      onPick={async () => {
                        if (!result || !file) return;
                        const { saveToMyStickers } = await handoff();
                        await saveToMyStickers(await blobOf(result.url), stem, look);
                        setSaid('Saved to My stickers.');
                      }}
                    />
                    <Hand
                      what="Send to Sticker Studio"
                      note="Arrives as an ordinary sticker"
                      onPick={async () => {
                        if (!result || !file) return;
                        const { sendToStickerStudio } = await handoff();
                        await sendToStickerStudio(await blobOf(result.url), stem, look);
                        setSaid('In your library. Open Stickers to use it.');
                      }}
                    />
                    <Hand
                      what="Add to colouring book"
                      note="The book you have open"
                      onPick={async () => {
                        if (!result || !file) return;
                        const { addToColouringBook } = await handoff();
                        const done = await addToColouringBook(await blobOf(result.url), stem);
                        setSaid(done ? 'Added as a page.' : 'No colouring book is open. Open one first.');
                      }}
                    />
                  </>
                )}
              </div>

              {/*
                The two downloads, at the bottom whichever tab is showing. They
                are what the Lab is for, and a primary action that moves when
                you change panel is one you have to find again each time.
              */}
              <div className="mt-4 shrink-0">
                {result && (
                  <p className="mono-label mb-2 text-ink-500" style={{ fontSize: 10 }}>
                    {/* Ink on a page means nothing for a logo, which is curves. */}
                    {look === 'logo'
                      ? `${result.stats.strokes ?? 0} curves`
                      : `${(result.stats.ink * 100).toFixed(1)}% ink${
                          result.stats.strokes ? ` · ${result.stats.strokes} strokes` : ''
                        }`}
                    {` · ${result.stats.millis} ms`}
                  </p>
                )}
                <a
                  href={result?.url ?? undefined}
                  download={`${stem} ${look}.png`}
                  aria-disabled={!result}
                  className={cx(
                    'btn btn-accent w-full px-4 py-2.5 text-[15px]',
                    !result && 'pointer-events-none opacity-40',
                  )}
                >
                  Download PNG
                </a>
                <a
                  href={svgUrl ?? undefined}
                  download={`${stem} ${look}.svg`}
                  aria-disabled={!svgUrl}
                  title={
                    svgUrl
                      ? 'Real curves, any size'
                      : 'Hand-inked and Logo export as curves. The others are pixels.'
                  }
                  className={cx(
                    'btn btn-accent-outline mt-2 w-full px-4 py-2.5 text-[15px]',
                    !svgUrl && 'pointer-events-none opacity-40',
                  )}
                >
                  Download SVG
                </a>
                <p className="mono-label mt-3 text-ink-500" style={{ fontSize: 10 }}>
                  Made with algorithms, no AI model
                </p>
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}

/* --------------------------------------------------------------- the rail */

type TabId = 'picture' | 'look' | 'tune' | 'export';

const TABS: { id: TabId; label: string; Icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: 'picture', label: 'Picture', Icon: PictureIcon },
  { id: 'look', label: 'Look', Icon: LookIcon },
  { id: 'tune', label: 'Tune', Icon: TuneIcon },
  { id: 'export', label: 'Export', Icon: ExportIcon },
];

/**
 * Four tabs down the left, the current one in a pale teal pill.
 *
 * The pill rather than an underline because this rail is vertical and an
 * underline under a stacked label reads as a divider between it and the next.
 * The fill is `accentb-100` with `accentb-700` letters, which is the pair the
 * contrast sweep already checks as "a teal chip" in all six palettes.
 */
function Rail({ tab, onTab }: { tab: TabId; onTab: (id: TabId) => void }) {
  return (
    <nav aria-label="Lab sections" className="shrink-0 max-lg:order-2">
      <ul className="flex w-[84px] flex-col gap-1 max-lg:w-full max-lg:flex-row">
        {TABS.map(({ id, label, Icon }) => {
          const here = tab === id;
          return (
            <li key={id} className="max-lg:flex-1">
              <button
                type="button"
                aria-current={here ? 'true' : undefined}
                onClick={() => onTab(id)}
                className={cx(
                  'flex w-full flex-col items-center gap-1.5 rounded-[8px] px-2 py-3 max-lg:py-2',
                  'transition-colors duration-[var(--motion-base)]',
                  !here && 'text-ink-500 hover:text-ink-900',
                )}
                style={
                  here
                    ? { background: 'var(--color-accentb-100)', color: 'var(--color-accentb-700)' }
                    : undefined
                }
              >
                <Icon size={20} />
                <span className="text-[12.5px]" style={{ fontWeight: here ? 600 : 500 }}>
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * One row across the top: what to do with a picture, and the picture's name.
 *
 * Under 64 pixels, and a drop target across its whole width. The tall dashed
 * box it replaces took the entire window to say one sentence, and said it again
 * every time somebody wanted to try a different photograph.
 */
function DropStrip({ has, onPick }: { has: boolean; onPick: (file: File) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const chosen = event.dataTransfer.files?.[0];
        if (chosen) onPick(chosen);
      }}
      className={cx(
        'flex h-[56px] shrink-0 items-center gap-3 rounded-[6px] border border-dashed px-3',
        over ? 'border-ink-900 bg-paper-100' : 'border-ink-300',
      )}
    >
      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-500">
        {has ? 'Drop another picture, or choose a file' : 'Drop a picture here or choose a file'}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) onPick(chosen);
          event.target.value = '';
        }}
      />
      <Button variant="accent" className="shrink-0" onClick={() => input.current?.click()}>
        Choose picture
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

/**
 * The one question worth asking before anything else.
 *
 * Short, once a session, and not stored: a promise about rights that was made
 * in March does not cover a picture opened in June, and keeping a flag would
 * imply it did. It costs one press and it is the only thing standing between
 * this tool and somebody tracing a photograph they found.
 */
function Rights({ onAgree }: { onAgree: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-5">
      <div className="max-w-[46ch] text-center">
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22 }}>
          Before you start
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
          Use pictures you took or drew, or that you are allowed to use. The Lab works on this
          computer and never uploads anything, which means nobody but you is checking.
        </p>
        <div className="mt-4">
          <Button variant="primary" onClick={onAgree}>
            I have the right to use my pictures
          </Button>
        </div>
        <p className="mono-label mt-4 text-ink-500" style={{ fontSize: 10 }}>
          Made with algorithms, no AI model
        </p>
      </div>
    </div>
  );
}

function Hand({ what, note, onPick }: { what: string; note: string; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="block w-full rounded-[6px] px-2 py-2 text-left transition-colors hover:bg-paper-100"
    >
      <span className="block text-[13px] font-[560]">{what}</span>
      <span className="mono-label block text-ink-500" style={{ fontSize: 10 }}>
        {note}
      </span>
    </button>
  );
}

/**
 * Before and after, one on top of the other with a wipe between them.
 *
 * The drawing sits on a chequerboard because it is transparent, and a
 * transparent drawing on white looks exactly like an opaque one until you put
 * it somewhere that is not white.
 */
function Canvas({
  before,
  after,
  at,
  ground,
  working,
}: {
  /** Null until a picture is opened: the stage is there either way. */
  before: string | null;
  after: string | null;
  at: number;
  /** What to judge the drawing against. A mark has to work on all three. */
  ground: 'chequer' | 'light' | 'dark';
  /** Any of the engine is running — the big picture or any of the cards. */
  working: boolean;
}) {
  /*
    The drawing underneath, the photograph clipped on top of it.

    The obvious way round — photograph underneath, drawing clipped over it —
    looks right until you notice what it is actually showing: the drawing is a
    transparent PNG, so everywhere it is not ink the photograph shows through,
    and the "after" half is the drawing composited onto the picture rather than
    the drawing. Which is a nice effect and the wrong answer to the question
    somebody is asking when they drag a compare slider.

    `at` is how much of the ORIGINAL is showing, from the left: 0 is all
    drawing, 1 is all photograph.
  */
  const body = (
    <>
      {after && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={after} alt="The drawing" className="absolute inset-0 h-full w-full object-contain" />
      )}
      {before && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={before}
          alt="The picture you brought"
          className="absolute inset-0 h-full w-full object-contain"
          style={{ clipPath: `inset(0 ${(1 - at) * 100}% 0 0)` }}
        />
      )}
      {after && at > 0.001 && at < 0.999 && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-ink-900"
          style={{ left: `${at * 100}%` }}
        />
      )}
      {/*
        The waiting mark, top right, over the stage.

        It used to sit in the row of controls under the picture, at the end of a
        wrapping line, which is the one place on this screen nobody is looking:
        the eye is on the drawing, waiting for it to change. Here it is in the
        corner of the thing being waited for.
      */}
      {working && (
        <span
          className="absolute right-2.5 top-2.5 z-10 inline-flex min-h-7 items-center gap-1.5 rounded-[4px] border px-2.5"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            background: 'var(--color-paper-50)',
            borderColor: 'var(--color-ink-300)',
            color: 'var(--color-ink-700)',
          }}
        >
          <span className="block size-1.5 animate-pulse rounded-full bg-accenta-500" />
          Updating
        </span>
      )}
    </>
  );

  const shell = 'relative min-h-0 flex-1 overflow-hidden rounded-[6px] border border-ink-300';
  if (ground === 'chequer') {
    return (
      <Chequerboard className={`${shell} !block`} aria-label="The picture and the drawing made from it">
        {body}
      </Chequerboard>
    );
  }
  return (
    <div
      className={shell}
      aria-label="The picture and the drawing made from it"
      style={{ background: ground === 'dark' ? LOGO_GROUNDS.dark : LOGO_GROUNDS.light }}
    >
      {body}
    </div>
  );
}

/**
 * One control: a short label, an (i) for the explanation, and the control.
 *
 * The explanation used to sit under every label as a line of grey text, which
 * made a panel of five controls a wall of prose nobody reads twice. It is one
 * press away instead, and the title attribute still carries it for a hover.
 */
function Dial({ name, hint, children }: { name: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <span data-dial className="mono-label mb-1 block text-ink-900" style={{ fontSize: 10 }}>
        {name}
        <Info label={name}>{hint}</Info>
      </span>
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------- wiring */

const LABELS: Record<string, string> = {
  thickness: 'Thickness',
  detail: 'Detail',
  softness: 'Softness',
  cleanup: 'Clean-up',
  smoothing: 'Smoothing',
  smoothness: 'Smoothness',
  minShape: 'Smallest shape',
  taper: 'Taper',
  wobble: 'Wobble',
  complexity: 'Complexity',
  minRegion: 'Smallest area',
};

const HINTS: Record<string, string> = {
  thickness: 'How heavy the line is.',
  detail: 'How much fine texture survives.',
  softness: 'How feathered the edge of a line is.',
  cleanup: 'Blur first, and lift off the specks after.',
  smoothing: 'Takes the grain out without taking the edges with it.',
  taper: 'How far the ends thin away, the way a nib unloads.',
  wobble: 'How far the line drifts off true. The same drift every time.',
  complexity: 'How many areas to aim for.',
  smoothness: 'How far the curves may stray from the traced edge.',
  minShape: 'Shapes smaller than this are dropped.',
  minRegion: 'Anything smaller is absorbed into its neighbour.',
};

type Bag = {
  classic: ClassicSettings;
  inked: InkedSettings;
  colouring: ColouringSettings;
  logo: LogoSettings;
};

function valueOf(id: string, bag: Bag): number {
  if (id === 'smoothness' || id === 'minShape') return bag.logo[id];
  if (id === 'complexity' || id === 'minRegion') return bag.colouring[id];
  if (id === 'taper' || id === 'wobble') return bag.inked[id];
  if (id === 'smoothing') return bag.classic.smoothing;
  if (id === 'thickness') return bag.classic.thickness;
  if (id === 'detail') return bag.classic.detail;
  return bag.classic[id as 'softness' | 'cleanup'];
}

function setFrom(
  id: string,
  next: number,
  bag: Bag & {
    setClassic: (s: ClassicSettings) => void;
    setInked: (s: InkedSettings) => void;
    setColouring: (s: ColouringSettings) => void;
    setLogo: (s: LogoSettings) => void;
  },
) {
  const value = Math.round(next);
  if (id === 'smoothness' || id === 'minShape') {
    bag.setLogo({ ...bag.logo, [id]: value });
    return;
  }
  if (id === 'complexity' || id === 'minRegion') {
    bag.setColouring({ ...bag.colouring, [id]: value });
    return;
  }
  if (id === 'taper' || id === 'wobble') {
    bag.setInked({ ...bag.inked, [id]: value });
    return;
  }
  // Thickness and detail belong to both the pen and the nib; the Lab shows one
  // slider and moves both, because two sliders with one label is a riddle.
  if (id === 'thickness' || id === 'detail') {
    bag.setInked({ ...bag.inked, [id]: value });
    bag.setColouring({ ...bag.colouring, thickness: id === 'thickness' ? value : bag.colouring.thickness });
  }
  if (id === 'smoothing') {
    bag.setColouring({ ...bag.colouring, smoothing: value });
  }
  bag.setClassic({ ...bag.classic, [id]: value });
}

function classicOf(defaults: ReturnType<typeof defaultsFor>): ClassicSettings {
  return 'classic' in defaults ? defaults.classic : (defaultsFor('ink-pen') as { classic: ClassicSettings }).classic;
}

/**
 * The hand-offs, fetched on the press rather than on the page.
 *
 * They reach into the sticker library and the colouring editor's store, which
 * between them pull in the database layer: importing them at the top cost this
 * route 46 kB that nobody who only wants a PNG ever uses.
 */
const handoff = () => import('@/lib/lab/handoff');

const blobOf = async (url: string) => (await fetch(url)).blob();

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'drawing';
}
