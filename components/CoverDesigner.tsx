'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UnsupportedImageError, forgetAssetUrl, getAssetUrl, putAsset } from '@/lib/assets';
import {
  MIN_COVER_DPI,
  PT_PER_INCH,
  effectiveDpi,
  inchesToPt,
  padToEven,
  ptToInches,
  ptToPx,
  pxToPt,
  spineWidth,
} from '@/lib/kdp';
import type { ReactNode } from 'react';
import type { Board } from '@/lib/board';
import { foldsOf, frontImageRect, safeOf, trimOf } from '@/lib/board';
import { coverLayout, spineTooThinForText, type CoverLayout } from '@/lib/render/coverLayout';
import { id } from '@/lib/defaults';
import { font } from '@/lib/defaults';
import { useCoverHistory } from '@/lib/cover/history';
import { restack } from '@/lib/cover/stickerEdit';
import { stickerDpi, stickerWarnings } from '@/lib/render/stickers';
import { MAX_SWEEP_DEGREES, curvedText } from '@/lib/cover/curve';
import { bendOf } from '@/lib/cover/bend';
import type {
  CoverPanel,
  CoverSticker,
  CoverTextBox,
  CoverableBook,
  FontSpec,
} from '@/lib/types';
import { StickerLayer } from './cover/StickerLayer';
import {
  TEXT_PRESETS,
  presetBox,
  presetByKind,
  presetSizePt,
  type TextPresetKind,
} from '@/lib/textPresets';
import { ColourField } from './cover/ColourField';
import { BrowseSize } from './cover/BrowseSize';
import { Rail } from './cover/Rail';
import {
  SelectionToolbar,
  ToolButton,
  ToolDivider,
  ToolSlider,
  type SelectionBox,
} from './cover/SelectionToolbar';
import { StickerTray, type TrayItem } from './cover/StickerTray';
import { StickerLibrary } from './cover/StickerLibrary';
import { CoverTemplates } from './cover/CoverTemplates';
import { saveToLibrary } from '@/lib/cover/library';
import { validateCover } from '@/lib/validate';
import { FontControls } from './FontControls';
import { FontPicker } from './FontPicker';
import {
  Button,
  ColorInput,
  Notice,
  NumberInput,
  Select,
  Slider,
  TextArea,
  Toggle,
  cx,
} from './ui';
/* The panel's own field, under the name the fourteen call sites already use. */
import { PanelField as Field } from './panel/Panel';

const PANEL_LABELS: Record<CoverPanel, string> = {
  back: 'Back cover',
  spine: 'Spine',
  front: 'Front cover',
  board: 'Whole cover',
};

/**
 * The panels a cover offers to put text on.
 *
 * Not every panel: a cover measures from its three faces, and `board` exists so
 * that a board without faces has something to measure from. Offering it here
 * would be a fourth button that does the same as the back cover with worse
 * arithmetic.
 */
const ADDABLE_PANELS: CoverPanel[] = ['back', 'spine', 'front'];

/** What each face is called when you are putting words on it. */
const PANEL_LABEL: Record<string, string> = {
  back: 'Add to back',
  spine: 'Add to spine',
  front: 'Add to front',
  board: 'Add text',
};

/** Pixels per point at a hundred per cent: ninety-six to the inch. */
const ACTUAL_SIZE = 96 / PT_PER_INCH;

/** Far enough out to see a whole wrap cover, far enough in to place a hairline. */
const clampZoom = (zoom: number) => Math.min(4, Math.max(0.1, zoom));

/** What the zoom control offers, besides fit. */
const ZOOM_STEPS = [0.5, 1, 2];

/**
 * The wraparound cover, for either kind of book.
 *
 * It takes its book as a prop rather than reading the poetry store, because a
 * cover is about the outside of a book and the outside of a book of verse and
 * of a book of pictures are the same thing: a back, a spine whose width comes
 * from the page count, and a front.
 */
export type CoverPicture = {
  key: string;
  name: string;
  assetId: string;
  width: number;
  height: number;
};

/** A cover, or any other board, which has none of a cover's particulars. */
type DesignBoard = Board<string> & Partial<Pick<CoverLayout, 'dimensions' | 'barcode' | 'folds'>>;

export function CoverDesigner<T extends CoverableBook>({
  project,
  update,
  pageCount,
  displayFont,
  pictures = [],
  board,
  bookTray = { title: 'Stickers from this book', empty: 'Nothing in the book yet. Its pictures will appear here.' },
  rail = false,
  units = 'in',
  borrow = null,
}: {
  project: T | null;
  update: (recipe: (draft: T) => void) => void;
  pageCount: number;
  /** The face new text boxes start in — the book's own display face. */
  displayFont: Pick<FontSpec, 'family' | 'fallback'>;
  /** What is already inside the book, offered as stickers for the outside. */
  pictures?: CoverPicture[];
  /**
   * A board to lay out on instead of the book's cover.
   *
   * Given one, this is a design of some other size — a post, a pin, a postcard
   * — and the parts that are only true of a wraparound cover, the spine
   * reading, the barcode reserve and the three faces, go away with it.
   */
  board?: Board<string> | null;
  /**
   * The tray of pictures that came from somewhere else, and what to call it.
   *
   * A book's cover says "from this book" because there is one. A design that
   * belongs to no book is given null until it borrows from one, because a
   * tray labelled after a book nobody chose is furniture pretending to be a
   * feature.
   */
  bookTray?: { title: string; empty: string } | null;
  /**
   * The rail: a column of doors down the left, one panel open at a time,
   * instead of one strip holding everything down the right.
   *
   * Opt-in per caller, and off by default, so the cover editor keeps the
   * arrangement it has until it has been looked at rather than as a side
   * effect of a design that was for boards.
   */
  rail?: boolean;
  /**
   * What sizes on this board are said in.
   *
   * A board stated in pixels is measured in pixels: asking someone to place a
   * sticker on a 1080-pixel square by typing 2.4 inches is asking them to do
   * the arithmetic the board already did. Points remain what is stored either
   * way, and dots per inch are only offered where there are inches to have
   * them — a post is never printed, so its DPI is a number about nothing.
   */
  units?: 'in' | 'px';
  /** Offered inside the Pictures panel: where a board borrows from a book. */
  borrow?: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
  // Bumped when the library changes, so the tray reloads without a store.
  const [libraryVersion, setLibraryVersion] = useState(0);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState({ width: 0, height: 0 });
  /** 'fit' or a multiple of actual size, where 1 is a hundred per cent. */
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  /**
   * Guides are on for anything that gets printed and off for anything that
   * does not. A trim line matters when a guillotine is involved; on a post it
   * is a dashed rectangle over the thing you are trying to look at.
   */
  const [guidesOn, setGuidesOn] = useState(() => !board || board.bleed > 0);
  /** Which door is open. Text first: a blank board most often wants words. */
  const [openPanel, setOpenPanel] = useState<string | null>('text');
  /**
   * Where the board sits inside the canvas, and how big the canvas is.
   *
   * Both are needed to put the floating toolbar over the selected thing: the
   * board moves when the pane is scrolled, when the window changes and when
   * the zoom does, and the toolbar has to move with it.
   */
  const [stageAt, setStageAt] = useState({ x: 0, y: 0 });
  const [paneBox, setPaneBox] = useState({ width: 0, height: 0 });

  // Undo covers the cover only, and a snapshot is taken at the start of each
  // gesture, so one undo puts back what was there before a drag rather than
  // some frame in the middle of it.
  const coverHistory = useCoverHistory(
    project?.cover ?? EMPTY_COVER,
    useCallback(
      (spec) => update((draft) => void (draft.cover = structuredClone(spec))),
      [update],
    ),
  );

  const finalPages = padToEven(pageCount || 24);
  // A cover carries three named faces, a spine reading and a barcode reserve;
  // any other board carries none of them. Everything below that touches one
  // asks first.
  const layout: DesignBoard | null = useMemo(
    () => board ?? (project ? coverLayout(project, finalPages) : null),
    [project, finalPages],
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = (width: number, height: number) => setPane({ width, height });
    const observer = new ResizeObserver(([entry]) =>
      measure(entry.contentRect.width, entry.contentRect.height),
    );
    observer.observe(stage);
    measure(stage.clientWidth, stage.clientHeight);
    return () => observer.disconnect();
  }, []);

  /**
   * Kept up to date on every render, and on scroll and resize.
   *
   * No dependency list on purpose: the board moves when anything moves it —
   * a zoom, a scroll, a panel opening, the window — and a list of the reasons
   * is a list to be wrong about. The setters bail out when nothing changed,
   * so this settles rather than loops.
   */
  useEffect(() => {
    const pane = stageRef.current;
    if (!pane) return;
    const same = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
    const measure = () => {
      const box = pane.getBoundingClientRect();
      setPaneBox((was) =>
        was.width === pane.clientWidth && was.height === pane.clientHeight
          ? was
          : { width: pane.clientWidth, height: pane.clientHeight },
      );
      const stage = pane.querySelector('[data-cover-stage]');
      if (!stage) return;
      const at = stage.getBoundingClientRect();
      const next = { x: at.left - box.left, y: at.top - box.top };
      setStageAt((was) => (same(was, next) ? was : next));
    };
    measure();
    pane.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    const stage = pane.querySelector('[data-cover-stage]');
    if (stage) observer.observe(stage);
    return () => {
      pane.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  });

  // The project holds an asset id; the canvas needs a URL for it.
  const assetId = project?.cover.frontImage?.assetId ?? null;
  useEffect(() => {
    let live = true;
    if (!assetId) {
      setImageUrl(null);
      return;
    }
    void getAssetUrl(assetId).then((url) => {
      if (live) setImageUrl(url);
    });
    return () => {
      live = false;
    };
  }, [assetId]);

  /**
   * Pixels per *point*, because that is what a board is measured in.
   *
   * Actual size is ninety-six pixels to the inch, which is what a hundred per
   * cent means here. Fit is whichever of the two directions runs out first,
   * never magnified past actual size — the whole board on screen without
   * scrolling for it, which is the only sensible thing to open on.
   */
  const fit =
    layout && pane.width && pane.height
      ? Math.min(
          ACTUAL_SIZE,
          (pane.width - 16) / layout.width,
          (pane.height - 16) / layout.height,
        )
      : 0;
  const scale = zoom === 'fit' ? fit : ACTUAL_SIZE * zoom;

  /**
   * Ctrl or Cmd with the wheel zooms, as it does in every other canvas.
   *
   * Listened for rather than handed to React, because the default has to be
   * prevented and React attaches wheel handlers passively, where preventing
   * it does nothing and the page zooms instead.
   */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((current) => {
        const from = current === 'fit' ? fit / ACTUAL_SIZE : current;
        // A wheel notch is about 100, and a tenth per notch is a step you can
        // aim with rather than a jump you have to undo.
        return clampZoom(from * Math.exp(-event.deltaY / 400));
      });
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [fit]);

  /**
   * Arrow keys nudge the selected sticker, and Delete removes it.
   *
   * A nudge is a hundredth of an inch, or a tenth with Shift: small enough to
   * settle something by eye, large enough to cross a cover before anyone gives
   * up. Each burst of nudges is one undo, so holding an arrow down does not
   * fill the history with a hundred entries.
   */
  useEffect(() => {
    if (!selectedSticker) return;
    let nudging = false;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        coverHistory.remember();
        update((draft) => {
          draft.cover.stickers = draft.cover.stickers.filter((s) => s.id !== selectedSticker);
        });
        setSelectedSticker(null);
        return;
      }

      const step = event.shiftKey ? 0.1 : 0.01;
      const shift = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }[event.key];
      if (!shift) return;

      event.preventDefault();
      if (!nudging) {
        coverHistory.remember();
        nudging = true;
      }
      update((draft) => {
        const found = draft.cover.stickers.find((s) => s.id === selectedSticker);
        if (!found) return;
        found.x = round(found.x + shift[0]);
        found.y = round(found.y + shift[1]);
      });
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key.startsWith('Arrow')) nudging = false;
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [selectedSticker, update, coverHistory]);

  const onDrag = useCallback(
    (box: CoverTextBox, event: React.PointerEvent) => {
      if (!layout || !scale) return;
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = box.x;
      const originY = box.y;
      const element = event.currentTarget as HTMLElement;
      element.setPointerCapture(event.pointerId);
      // Once, here, rather than on every frame of the drag: one undo should put
      // the text back where it started, not somewhere along the way.
      let noted = false;

      const move = (e: PointerEvent) => {
        if (!noted) {
          noted = true;
          coverHistory.remember();
        }
        update((draft) => {
          const found = draft.cover.textBoxes.find((b) => b.id === box.id);
          if (!found) return;
          found.x = round(originX + (e.clientX - startX) / scale);
          found.y = round(originY + (e.clientY - startY) / scale);
        });
      };
      const up = () => {
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', up);
      };
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerup', up);
    },
    [layout, scale, update, coverHistory],
  );

  if (!project || !layout) return null;

  const cover = project.cover;
  /** Whether this board is a wraparound cover, with the particulars one has. */
  const isCover = Boolean(layout.dimensions);
  const selected = cover.textBoxes.find((b) => b.id === selectedId) ?? null;
  const sticker = cover.stickers.find((s) => s.id === selectedSticker) ?? null;
  const issues = isCover ? validateCover(project, pageCount) : [];

  /** Everything in the book, offered as something to stick on the cover. */
  const trayItems: TrayItem[] = pictures.map((picture) => ({
    key: picture.key,
    name: picture.name,
    assetId: picture.assetId,
    width: picture.width,
    height: picture.height,
  }));

  const patchSticker = (id: string, patch: Partial<CoverSticker>) =>
    update((draft) => {
      const found = draft.cover.stickers.find((s) => s.id === id);
      if (found) Object.assign(found, patch);
    });

  /**
   * Puts a picture on the cover at a natural size.
   *
   * Two and a half inches across is big enough to see and small enough that
   * nothing lands half off the page; the height follows the picture's own
   * proportions, so nothing arrives stretched.
   */
  const placeSticker = (item: TrayItem, at: { x: number; y: number } | null) => {
    const width = inchesToPt(2.5);
    const height = item.width ? (width * item.height) / item.width : width;
    const back = layout.panels.back ?? layout.panels.board;
    const point = at ?? {
      x: back.x + back.width / 2 - width / 2,
      y: back.y + back.height / 2 - height / 2,
    };
    const newId = id('cs');
    coverHistory.remember();
    update((draft) => {
      draft.cover.stickers.push({
        id: newId,
        assetId: item.assetId,
        naturalWidth: item.width,
        naturalHeight: item.height,
        x: point.x,
        y: point.y,
        width,
        height,
        rotate: 0,
        cornerRadius: 0,
        border: null,
        shadow: false,
        arc: 0,
        name: item.name,
      });
    });
    setSelectedSticker(newId);
    setSelectedId(null);
  };

  /**
   * A line of type at one of three sizes, placed for the board it is on.
   *
   * Only offered on a board: a cover's three faces each want their own
   * position, which is what `addBox` below already works out.
   */
  const addPreset = (kind: TextPresetKind) => {
    const preset = presetByKind(kind);
    const newId = id('cb');
    const where = presetBox(preset, layout);
    update((draft) => {
      draft.cover.textBoxes.push({
        id: newId,
        panel: 'board' as CoverPanel,
        text: preset.text,
        x: where.x,
        y: where.y,
        width: where.width,
        font: font({
          family: displayFont.family,
          fallback: displayFont.fallback,
          sizePt: presetSizePt(preset, layout),
          weight: preset.weight,
          lineHeight: preset.lineHeight,
          align: 'center',
          color: '#1a1a1a',
        }),
        rotate: 0,
        curve: 0,
      });
    });
    setSelectedId(newId);
  };

  const addBox = (panel: CoverPanel) => {
    const newId = id('cb');
    const panelRect = layout.panels[panel];
    update((draft) => {
      draft.cover.textBoxes.push({
        id: newId,
        panel,
        text: panel === 'spine' ? `${draft.meta.title} · ${draft.meta.author}` : draft.meta.title,
        x: panel === 'spine' ? panelRect.width / 2 : inchesToPt(0.6),
        y: inchesToPt(panel === 'spine' ? 0.9 : 1.2),
        width:
          panel === 'spine'
            ? panelRect.height - inchesToPt(1.8)
            : panelRect.width - inchesToPt(1.2),
        font: font({
          family: displayFont.family,
          fallback: displayFont.fallback,
          sizePt: panel === 'spine' ? 11 : 26,
          lineHeight: 1.2,
          align: panel === 'front' ? 'center' : 'left',
          color: '#1a1a1a',
        }),
        rotate: 0,
        curve: 0,
      });
    });
    setSelectedId(newId);
  };

  const onImage = async (file: File | undefined) => {
    if (!file) return;
    setImageError(null);
    const previous = assetId;
    try {
      const record = await putAsset(file);
      update((draft) => {
        draft.cover.frontImage = {
          assetId: record.id,
          naturalWidth: record.width,
          naturalHeight: record.height,
          fit: draft.cover.frontImage?.fit ?? 'cover',
        };
      });
      // The replaced asset's object URL is stale; the bytes are swept later.
      if (previous) forgetAssetUrl(previous);
    } catch (error) {
      setImageError(
        error instanceof UnsupportedImageError || error instanceof Error
          ? error.message
          : 'That image could not be read.',
      );
    }
  };

  const imageDpi = cover.frontImage
    ? effectiveDpi(
        cover.frontImage.naturalWidth,
        // Dots per inch, so the width it covers has to be in inches. The
        // wrap figure is KDP's own and already is; the panel is points.
        cover.imageSpansWrap || !layout.panels.front
          ? ptToInches(layout.width)
          : ptToInches(layout.panels.front.width),
      )
    : 0;

  /**
   * The panel's contents, named.
   *
   * One list, two arrangements: a cover stacks them all down the right-hand
   * side exactly as it always has, and a board deals them into the panels
   * behind its rail. Naming them rather than copying them is what keeps the
   * two from drifting — there is one Artwork section, not two.
   */
  const sections = {
    /**
     * The cover at the size it is browsed at.
     *
     * Only for a cover, because only a cover is sold from a search result. A
     * post is met at whatever size the feed gives it and a bookmark is held in
     * a hand, and neither is improved by being told how it looks at 160px.
     */
    browseSize: isCover ? (
      <BrowseSize
        cover={cover}
        layout={layout}
        // A picture spanning the wrap, or covering the front, sits under the
        // words — so what is behind them is not a colour anything can measure.
        overPicture={Boolean(cover.frontImage)}
      />
    ) : null,
    measurements: (
      <>
        {isCover ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-ink-500">
            <dt>Full cover</dt>
            <dd className="text-right tabular-nums text-ink-700">
              {layout.dimensions!.width.toFixed(3)}″ × {layout.dimensions!.height.toFixed(3)}″
            </dd>
            <dt>Spine at {finalPages} pages</dt>
            <dd className="text-right tabular-nums text-ink-700">
              {spineWidth(finalPages, project.trim.paper).toFixed(4)}″
            </dd>
          </dl>
        ) : null}

        {isCover && spineTooThinForText(layout as CoverLayout) && (
          <Notice level="warning">
            The spine is under 0.0625″, KDP's minimum for printing spine text.
          </Notice>
        )}
      </>
    ),
    history: (
      <>
        {/*
          A column in the rail, a row in the bar.

          This lives in the rail's footer, and the rail is 78px wide because the
          board's size is worked out from it — so it may not be widened. Two
          buttons and a caption side by side came to 147px and poked 69px out of
          it. Below `lg` the rail becomes a horizontal bar and a row is right
          again, which is the one place this needs to know about the breakpoint.
        */}
        <div className="flex flex-col items-center gap-1.5 max-lg:flex-row">
          <Button
            onClick={coverHistory.undo}
            disabled={!coverHistory.canUndo}
            title="Undo (Cmd+Z)"
            aria-label="Undo"
          >
            ↺
          </Button>
          <Button
            onClick={coverHistory.redo}
            disabled={!coverHistory.canRedo}
            title="Redo (Cmd+Shift+Z)"
            aria-label="Redo"
          >
            ↻
          </Button>
          <span className="text-[11px] text-ink-500">Undo</span>
        </div>
      </>
    ),
    bookPictures: (
      <>
        {bookTray && (
          <StickerTray
            title={bookTray.title}
            items={trayItems}
            empty={bookTray.empty}
            onPlace={placeSticker}
          />
        )}
      </>
    ),
    library: (
      <>
        <StickerLibrary
          onPlace={placeSticker}
          reloadKey={libraryVersion}
          onChanged={() => setLibraryVersion((n) => n + 1)}
        />
      </>
    ),
    templates: (
      <>
        {/* A saved cover layout is a cover's business. Offering it on a post
            is offering to make the post into somebody's back cover. */}
        {isCover && (
        <CoverTemplates
          cover={cover}
          onApply={(spec) => {
            coverHistory.remember();
            update((draft) => void (draft.cover = spec));
            setSelectedSticker(null);
            setSelectedId(null);
          }}
        />
        )}
      </>
    ),
    stickerInspector: (
      <>
        {sticker && (
          <StickerInspector
            sticker={sticker}
            layout={layout}
            compact={rail}
            units={units}
            onPatch={(patch) => {
              coverHistory.remember();
              patchSticker(sticker.id, patch);
            }}
            onSlide={(patch) => patchSticker(sticker.id, patch)}
            onCommit={coverHistory.remember}
            onRestack={(direction) => {
              coverHistory.remember();
              update((draft) => {
                draft.cover.stickers = restack(draft.cover.stickers, sticker.id, direction);
              });
            }}
            onDuplicate={() => {
              const newId = id('cs');
              coverHistory.remember();
              update((draft) => {
                const source = draft.cover.stickers.find((s) => s.id === sticker.id);
                if (!source) return;
                // Offset a little, or the copy hides exactly behind the original
                // and looks like nothing happened.
                draft.cover.stickers.push({ ...source, id: newId, x: source.x + 0.2, y: source.y + 0.2 });
              });
              setSelectedSticker(newId);
            }}
            onDelete={() => {
              coverHistory.remember();
              update((draft) => {
                draft.cover.stickers = draft.cover.stickers.filter((s) => s.id !== sticker.id);
              });
              setSelectedSticker(null);
            }}
            saved={savedToLibrary}
            onKeep={() => {
              void saveToLibrary({
                name: sticker.name,
                assetId: sticker.assetId,
                width: sticker.naturalWidth,
                height: sticker.naturalHeight,
              }).then(() => {
                setLibraryVersion((n) => n + 1);
                setSavedToLibrary(true);
                setTimeout(() => setSavedToLibrary(false), 2200);
              });
            }}
          />
        )}
      </>
    ),
    artwork: (
      <>
        <div className="space-y-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Artwork</h4>
          <label className="block cursor-pointer rounded-md border border-ink-300 bg-ink-100 px-2.5 py-1.5 text-center transition-colors hover:bg-ink-200">
            {cover.frontImage
              ? 'Replace image…'
              : isCover
                ? 'Upload cover image…'
                : 'Upload a picture…'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => void onImage(e.target.files?.[0])}
            />
          </label>
          {imageError && <Notice level="error">{imageError}</Notice>}
          {cover.frontImage && (
            <>
              <p className="text-[11px] text-ink-500">
                {cover.frontImage.naturalWidth} × {cover.frontImage.naturalHeight}px ·{' '}
                <span className={imageDpi < MIN_COVER_DPI ? 'text-amber-700' : 'text-emerald-700'}>
                  {Math.round(imageDpi)} DPI at print size
                </span>
              </p>
              <Toggle
                label="Stretch across back, spine and front"
                checked={cover.imageSpansWrap}
                onChange={(imageSpansWrap) =>
                  update((draft) => {
                    draft.cover.imageSpansWrap = imageSpansWrap;
                  })
                }
              />
              <Field label="Fit">
                <Select
                  value={cover.frontImage.fit}
                  onChange={(fit) =>
                    update((draft) => {
                      if (draft.cover.frontImage) draft.cover.frontImage.fit = fit;
                    })
                  }
                  options={[
                    { value: 'cover', label: 'Fill the panel (crop)' },
                    { value: 'contain', label: 'Fit inside (letterbox)' },
                  ]}
                />
              </Field>
              <Button
                variant="danger"
                onClick={() => {
                  if (assetId) forgetAssetUrl(assetId);
                  update((draft) => {
                    draft.cover.frontImage = null;
                  });
                }}
              >
                Remove image
              </Button>
            </>
          )}
        </div>
      </>
    ),
    colours: (
      <>
        <div className="grid grid-cols-1 gap-2">
          {isCover ? (
            <>
              <Field label="Back cover colour">
                <ColorInput
                  value={cover.backColor}
                  onChange={(backColor) =>
                    update((draft) => {
                      draft.cover.backColor = backColor;
                    })
                  }
                />
              </Field>
              <Field label="Spine colour">
                <ColorInput
                  value={cover.spineColor}
                  onChange={(spineColor) =>
                    update((draft) => {
                      draft.cover.spineColor = spineColor;
                    })
                  }
                />
              </Field>
            </>
          ) : (
            <Field label="Background">
              {/* The palette on a board, the old input on a cover: the cover
                  editor is not being redesigned tonight, and a control that
                  changes under someone mid-book is its own kind of bug. */}
              {rail ? (
                <ColourField
                  label="Background colour"
                  value={cover.backgroundColor}
                  onChange={(backgroundColor) =>
                    update((draft) => {
                      draft.cover.backgroundColor = backgroundColor;
                    })
                  }
                />
              ) : (
                <ColorInput
                  value={cover.backgroundColor}
                  onChange={(backgroundColor) =>
                    update((draft) => {
                      draft.cover.backgroundColor = backgroundColor;
                    })
                  }
                />
              )}
            </Field>
          )}
        </div>
      </>
    ),
    barcode: (
      <>
        {isCover && (
        <Toggle
          label="Show the barcode reserve"
          checked={cover.showBarcodeZone}
          onChange={(showBarcodeZone) =>
            update((draft) => {
              draft.cover.showBarcodeZone = showBarcodeZone;
            })
          }
        />
        )}
      </>
    ),
    text: (
      <>
        <div className="space-y-2 border-t border-ink-200 pt-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Text</h4>
          {rail ? (
            /*
              Three sizes rather than one button, because the first thing
              anyone does after adding a text box is make it bigger or smaller,
              and each of these is already the size it should be for this
              board.
            */
            <div className="grid gap-2">
              {TEXT_PRESETS.map((preset) => (
                <button
                  key={preset.kind}
                  type="button"
                  onClick={() => addPreset(preset.kind)}
                  className="rounded-xl border border-ink-200 bg-ink-50 px-3 py-3 text-left transition-colors hover:border-accent-500 hover:bg-paper"
                >
                  <span
                    className="block truncate text-ink-900"
                    style={{
                      fontSize: preset.kind === 'heading' ? 22 : preset.kind === 'subheading' ? 16 : 13,
                      fontWeight: preset.weight,
                    }}
                  >
                    {preset.label}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-500">
                    {presetSizePt(preset, layout)} pt on this board
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {ADDABLE_PANELS.map((panel) => (
                <Button key={panel} onClick={() => addBox(panel)}>
                  {PANEL_LABEL[panel] ?? panel}
                </Button>
              ))}
            </div>
          )}
          {cover.textBoxes.length === 0 && (
            <p className="text-[11px] text-ink-500">
              {isCover ? 'No text yet. Add a box to a panel.' : 'No text yet.'}
            </p>
          )}
          <ul className="space-y-1">
            {cover.textBoxes.map((box) => (
              <li key={box.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(box.id)}
                  className={cx(
                    'flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors',
                    selectedId === box.id ? 'bg-accent-500/15 text-accent-600' : 'hover:bg-ink-50',
                  )}
                >
                  <span className="w-10 shrink-0 text-[10px] uppercase text-ink-700">
                    {box.panel}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{box.text || 'Empty'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </>
    ),
    textInspector: (
      <>
        {selected && (
          <div className="space-y-3 border-t border-ink-200 pt-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              {PANEL_LABELS[selected.panel]} text
            </h4>
            <TextArea
              value={selected.text}
              rows={3}
              onChange={(e) =>
                update((draft) => {
                  const found = draft.cover.textBoxes.find((b) => b.id === selected.id);
                  if (found) found.text = e.target.value;
                })
              }
            />
            <div className="grid grid-cols-3 gap-2">
              <Field label="X">
                <NumberInput
                  value={round(ptToInches(selected.x))}
                  onChange={(x) => patchBox(update, selected.id, { x: inchesToPt(x) })}
                  step={0.05}
                  suffix="in"
                />
              </Field>
              <Field label="Y">
                <NumberInput
                  value={round(ptToInches(selected.y))}
                  onChange={(y) => patchBox(update, selected.id, { y: inchesToPt(y) })}
                  step={0.05}
                  suffix="in"
                />
              </Field>
              <Field label="Width">
                <NumberInput
                  value={round(ptToInches(selected.width))}
                  onChange={(width) => patchBox(update, selected.id, { width: inchesToPt(width) })}
                  step={0.05}
                  min={0.2}
                  suffix="in"
                />
              </Field>
            </div>
            {/* On a board, curve and the face of the type are in the floating
                toolbar over the words themselves. Hidden here rather than
                repeated. */}
            {!rail && (
            <Field
              label="Curve"
              hint={
                selected.curve
                  ? `Bent through ${Math.round((Math.abs(selected.curve) / 100) * MAX_SWEEP_DEGREES)}° — ${
                      selected.curve > 0 ? 'arching up' : 'hanging down'
                    }`
                  : 'Straight. Drag right to arch the words up, left to hang them down.'
              }
            >
              {/* One snapshot per go at the slider: taking hold of it is the
                  start of a gesture, and every step after that is the same
                  gesture. A key press is a gesture of its own. */}
              <div onPointerDown={coverHistory.remember} onKeyDown={coverHistory.remember}>
                <Slider
                  value={selected.curve}
                  onChange={(curve) => patchBox(update, selected.id, { curve })}
                  min={-100}
                  max={100}
                  step={1}
                />
              </div>
            </Field>
            )}
            <FontControls
              spec={selected.font}
              onChange={(patch) =>
                update((draft) => {
                  const found = draft.cover.textBoxes.find((b) => b.id === selected.id);
                  if (found) Object.assign(found.font, patch);
                })
              }
              // What the toolbar has taken: the face, the size, the weight,
              // italic, the colour and the alignment. What is left here is the
              // fine work — leading, letter spacing, case — which nobody wants
              // in a bar over their words.
              options={
                rail
                  ? {
                      showFamily: false,
                      showSize: false,
                      showWeight: false,
                      showItalic: false,
                      showColor: false,
                      showAlign: false,
                    }
                  : {}
              }
            />
            {!rail && (
              <Button
                variant="danger"
                onClick={() => {
                  update((draft) => {
                    draft.cover.textBoxes = draft.cover.textBoxes.filter(
                      (b) => b.id !== selected.id,
                    );
                  });
                  setSelectedId(null);
                }}
              >
                Delete this text
              </Button>
            )}
          </div>
        )}

        {issues.length > 0 && (
          <div className="space-y-1.5 border-t border-ink-200 pt-3">
            {issues.map((issue) => (
              <Notice
                key={issue.id}
                level={issue.level === 'warning' ? 'warning' : issue.level === 'error' ? 'error' : 'info'}
              >
                <p>{issue.message}</p>
                {issue.fix && <p className="mt-1 opacity-80">{issue.fix}</p>}
              </Notice>
            ))}
          </div>
        )}
      </>
    ),
  };

  /**
   * Zooming keeps what you were looking at in the middle.
   *
   * A zoom that anchors on the top-left corner throws the thing being worked
   * on off the screen, and at two hundred per cent that means the selection
   * and its toolbar both vanish. The selection is the anchor when there is
   * one, the middle of the board when there is not.
   */
  const lastScale = useRef(scale);
  useEffect(() => {
    const pane = stageRef.current;
    if (!pane || lastScale.current === scale || scale <= 0) {
      lastScale.current = scale;
      return;
    }
    lastScale.current = scale;
    const frame = requestAnimationFrame(() => {
      const stage = pane.querySelector('[data-cover-stage]');
      if (!stage || !layout) return;
      const paneRect = pane.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const panel = selected ? layout.panels[selected.panel] ?? layout.panels.board : null;
      const focus = sticker
        ? { x: sticker.x + sticker.width / 2, y: sticker.y + sticker.height / 2 }
        : selected && panel
          ? { x: panel.x + selected.x + selected.width / 2, y: panel.y + selected.y }
          : { x: layout.width / 2, y: layout.height / 2 };
      pane.scrollLeft += stageRect.left - paneRect.left + focus.x * scale - pane.clientWidth / 2;
      pane.scrollTop += stageRect.top - paneRect.top + focus.y * scale - pane.clientHeight / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, [scale, layout, selected, sticker]);

  /**
   * Where the selected thing is on the canvas, in pane pixels.
   *
   * Worked out from the same numbers the board is drawn from rather than by
   * measuring the DOM: the model is what moves during a drag, and reading it
   * means the toolbar arrives with the picture rather than a frame behind it.
   */
  const selectionBox: SelectionBox | null = (() => {
    if (!rail || scale <= 0) return null;
    if (sticker) {
      return {
        x: stageAt.x + sticker.x * scale,
        y: stageAt.y + sticker.y * scale,
        width: sticker.width * scale,
        height: sticker.height * scale,
      };
    }
    if (selected) {
      const panel = layout.panels[selected.panel] ?? layout.panels.board;
      if (!panel) return null;
      const arc = curvedText(selected);
      return {
        x: stageAt.x + (panel.x + selected.x + (arc?.offsetX ?? 0)) * scale,
        y: stageAt.y + (panel.y + selected.y + (arc?.offsetY ?? 0)) * scale,
        width: (arc?.width ?? selected.width) * scale,
        // A straight box is as tall as one line of its own type; a curved one
        // knows its own height, because the arc worked it out.
        height: (arc?.height ?? selected.font.sizePt * selected.font.lineHeight) * scale,
      };
    }
    return null;
  })();

  const patchFont = (patch: Partial<FontSpec>) =>
    update((draft) => {
      const found = draft.cover.textBoxes.find((b) => b.id === selected?.id);
      if (found) Object.assign(found.font, patch);
    });

  const empty =
    !cover.frontImage && !cover.stickers.length && !cover.textBoxes.length;

  return (
    /*
      A column below `lg`, a row above it.

      `Rail` has always known how to be a bar along the bottom with its panel as
      a drawer above it — `max-lg:order-last`, `max-lg:w-full` — and this wrapper
      never let it. In a row, `w-full` means the whole row, so at 800px the rail
      and the panel each claimed 800px, the page grew an 800px horizontal
      scrollbar, and the canvas pane was squeezed to nothing: `scale` never
      became positive and the board was not drawn at all. The sticker studio has
      stacked like this all along; the designer was the one that did not.
    */
    <div className="flex h-full min-w-0 max-lg:flex-col">
      {rail && (
        <Rail
          panels={[
            { id: 'text', label: 'Text', glyph: 'T', node: <>{sections.text}{sections.textInspector}</> },
            {
              id: 'pictures',
              label: 'Pictures',
              glyph: '▣',
              node: (
                <>
                  {sections.artwork}
                  {borrow}
                  {sections.bookPictures}
                </>
              ),
            },
            {
              id: 'stickers',
              label: 'Stickers',
              glyph: '☺',
              node: <>{sections.library}{sections.stickerInspector}</>,
            },
            { id: 'background', label: 'Background', glyph: '▦', node: sections.colours },
          ]}
          soon={[
            { label: 'Elements', glyph: '◇' },
            { label: 'Templates', glyph: '▤' },
          ]}
          footer={sections.history}
          open={openPanel}
          onOpen={setOpenPanel}
        />
      )}

      <div className="relative min-w-0 flex-1">
        <div
          ref={stageRef}
          // A calm neutral grey: the board is the only thing on this screen
          // with a colour of its own, and a warm canvas argues with a warm cover.
          className="flex h-full overflow-auto bg-ground px-3 pb-12 pt-3"
          // Safe centring: centred while it fits, and pinned to the top-left
          // rather than cut off at both ends once it does not.
          style={{ alignItems: 'safe center', justifyContent: 'safe center' }}
        >
          <div className="shrink-0">
        {scale > 0 && (
          <div
            data-cover-stage
            className="relative mx-auto shadow-2xl"
            style={{
              width: layout.width * scale,
              height: layout.height * scale,
              background: cover.backgroundColor,
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedId(null);
                setSelectedSticker(null);
              }
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('application/x-versecraft-sticker')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={(e) => {
              const raw = e.dataTransfer.getData('application/x-versecraft-sticker');
              if (!raw) return;
              e.preventDefault();
              const item = JSON.parse(raw) as TrayItem;
              // Where it was dropped, less half its own size, so the picture
              // lands under the pointer rather than hanging off it.
              const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const width = inchesToPt(2.5);
              const height = item.width ? (width * item.height) / item.width : width;
              placeSticker(item, {
                x: (e.clientX - box.left) / scale - width / 2,
                y: (e.clientY - box.top) / scale - height / 2,
              });
            }}
          >
            {/* A cover paints everything left of the spine one colour and the
                spine another. A board with neither paints neither, and shows
                the background it already has. */}
            {layout.panels.spine && (
              <>
                <div
                  className="absolute"
                  style={{
                    left: 0,
                    top: 0,
                    width: layout.panels.spine.x * scale,
                    height: layout.height * scale,
                    background: cover.backColor,
                  }}
                />
                <div
                  className="absolute"
                  style={{
                    left: layout.panels.spine.x * scale,
                    top: 0,
                    width: layout.panels.spine.width * scale,
                    height: layout.height * scale,
                    background: cover.spineColor,
                  }}
                />
              </>
            )}

            {cover.frontImage && imageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                alt=""
                src={imageUrl}
                className="pointer-events-none absolute"
                style={{
                  // With no front panel to sit on, a picture fills the board.
                  left:
                    cover.imageSpansWrap || !layout.panels.front
                      ? 0
                      : frontImageRect(layout, layout.panels.front).x * scale,
                  top: 0,
                  width:
                    cover.imageSpansWrap || !layout.panels.front
                      ? layout.width * scale
                      : frontImageRect(layout, layout.panels.front).width * scale,
                  height: layout.height * scale,
                  objectFit: cover.frontImage.fit,
                }}
              />
            )}

            {cover.showBarcodeZone && (
              <div
                className="pointer-events-none absolute flex items-center justify-center border border-dashed border-black/45 bg-white/55 text-center text-[9px] italic text-black/60"
                style={{
                  left: layout.barcode!.x * scale,
                  top: layout.barcode!.y * scale,
                  width: layout.barcode!.width * scale,
                  height: layout.barcode!.height * scale,
                }}
              >
                Barcode area
                <br />2″ × 1.2″
              </div>
            )}

            <StickerLayer
              showDpi={units === 'in'}
              stickers={cover.stickers}
              layout={layout}
              scale={scale}
              selectedId={selectedSticker}
              onSelect={(stickerId) => {
                setSelectedSticker(stickerId);
                setSelectedId(null);
              }}
              onChange={patchSticker}
              onCommit={coverHistory.remember}
            />

            {cover.textBoxes.map((box) => {
              const panel = layout.panels[box.panel];
              const rotate = box.panel === 'spine' ? 90 + box.rotate : box.rotate;
              // The same arithmetic the PDF uses, so what is dragged around here
              // is what gets printed.
              const arc = curvedText(box);
              const grab = (e: React.PointerEvent) => {
                setSelectedId(box.id);
                setSelectedSticker(null);
                onDrag(box, e);
              };
              const shared = {
                role: 'button',
                tabIndex: 0,
                onPointerDown: grab,
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelectedId(box.id);
                },
                className: cx(
                  'absolute cursor-move whitespace-pre-wrap outline-offset-2',
                  selectedId === box.id
                    ? 'outline-2 outline-dashed outline-sky-400'
                    : 'hover:outline-1 hover:outline-dashed hover:outline-white/50',
                ),
              };
              const type: React.CSSProperties = {
                left: (panel.x + box.x + (arc?.offsetX ?? 0)) * scale,
                top: (panel.y + box.y + (arc?.offsetY ?? 0)) * scale,
                width: (arc?.width ?? box.width) * scale,
                transform: rotate ? `rotate(${rotate}deg)` : undefined,
                transformOrigin: 'left top',
                fontFamily: `'${box.font.family}', ${box.font.fallback}`,
                // Points times pixels-per-point. It was divided by 72 first,
                // from when the scale was per inch, which put every text box on
                // the stage at a seventy-second of its size.
                fontSize: box.font.sizePt * scale,
                lineHeight: box.font.lineHeight,
                letterSpacing: `${box.font.letterSpacingEm}em`,
                fontWeight: box.font.weight,
                fontStyle: box.font.italic ? 'italic' : 'normal',
                color: box.font.color,
                textAlign: box.font.align,
                fontVariantCaps: box.font.transform === 'smallcaps' ? 'small-caps' : undefined,
                textTransform:
                  box.font.transform === 'uppercase'
                    ? 'uppercase'
                    : box.font.transform === 'lowercase'
                      ? 'lowercase'
                      : box.font.transform === 'capitalize'
                        ? 'capitalize'
                        : undefined,
              };

              if (arc) {
                return (
                  <svg
                    key={box.id}
                    {...shared}
                    viewBox={arc.viewBox}
                    style={{ ...type, height: arc.height * scale, overflow: 'visible' }}
                  >
                    <defs>
                      {arc.lines.map((line, i) => (
                        <path key={i} id={`d-${box.id}-${i}`} d={line.path} fill="none" />
                      ))}
                    </defs>
                    {/* Fat, invisible, and only as long as the words: something
                        to take hold of that is not the inside of an arch. */}
                    <path
                      d={arc.grabPath}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={box.font.sizePt * 1.4}
                    />
                    {arc.lines.map((line, i) => (
                      <text key={i} textAnchor={line.anchor} fill="currentColor">
                        <textPath href={`#d-${box.id}-${i}`} startOffset={line.startOffset}>
                          {line.text}
                        </textPath>
                      </text>
                    ))}
                  </svg>
                );
              }

              return (
                <div key={box.id} {...shared} style={type}>
                  {box.text}
                </div>
              );
            })}

            {empty && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="rounded-full bg-black/60 px-4 py-2 text-[13px] text-white">
                  Add text, or drag a picture here
                </span>
              </div>
            )}

            {/* Guides sit above everything: they are what makes the folds legible.
                Read off the board, so a board with one fold draws one. */}
            {guidesOn &&
              foldsOf(layout).map((fold, i) => (
              <div
                key={i}
                className={cx(
                  'pointer-events-none absolute border-dashed border-sky-500/80',
                  fold.axis === 'x' ? 'border-l' : 'border-t',
                )}
                style={
                  fold.axis === 'x'
                    ? { left: fold.at * scale, top: 0, height: layout.height * scale }
                    : { top: fold.at * scale, left: 0, width: layout.width * scale }
                }
              />
              ))}
            {/* The trim is where the guillotine goes, so it is drawn only on
                something that gets cut. Nothing trims a screen. */}
            {guidesOn && layout.bleed > 0 && (
              <div
                className="pointer-events-none absolute border border-red-500/80"
                style={{
                  left: trimOf(layout).x * scale,
                  top: trimOf(layout).y * scale,
                  width: trimOf(layout).width * scale,
                  height: trimOf(layout).height * scale,
                }}
              />
            )}

            {/* And the safe area, which every board has and a story badly needs:
                its top and bottom are under the controls. */}
            {guidesOn &&
              safeOf(layout).map((area, i) => (
              <div
                key={`safe-${i}`}
                className="pointer-events-none absolute border border-dashed border-emerald-500/70"
                style={{
                  left: area.rect.x * scale,
                  top: area.rect.y * scale,
                  width: area.rect.width * scale,
                  height: area.rect.height * scale,
                }}
              />
              ))}
          </div>
        )}

          </div>
        </div>

        {/*
          The controls for what is selected, over the thing they belong to.
          Only on a board: a cover keeps its sidebar, where these have always
          been, and having both would be two places to look.
        */}
        {rail && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <SelectionToolbar box={selectionBox} pane={paneBox} of={selected?.id ?? sticker?.id ?? null}>
              {selected && (
                <>
                  <div className="w-[136px]">
                    <FontPicker
                      value={selected.font.family}
                      onChange={(family, fallback) => patchFont({ family, fallback })}
                    />
                  </div>
                  <input
                    type="number"
                    title="Type size, in points"
                    aria-label="Type size, in points"
                    value={selected.font.sizePt}
                    min={5}
                    max={200}
                    step={1}
                    onChange={(e) => patchFont({ sizePt: Number(e.target.value) || 1 })}
                    className="h-8 w-[58px] rounded-lg border border-ink-200 px-1.5 text-[13px] tabular-nums"
                  />
                  <ColourField
                    compact
                    label="Text colour"
                    value={selected.font.color}
                    onChange={(color) => patchFont({ color })}
                  />
                  <ToolButton
                    label="Bold"
                    active={selected.font.weight >= 600}
                    onClick={() => patchFont({ weight: selected.font.weight >= 600 ? 400 : 700 })}
                  >
                    <span className="font-bold">B</span>
                  </ToolButton>
                  <ToolButton
                    label="Italic"
                    active={selected.font.italic}
                    onClick={() => patchFont({ italic: !selected.font.italic })}
                  >
                    <span className="italic">I</span>
                  </ToolButton>
                  <ToolDivider />
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <ToolButton
                      key={align}
                      label={`Align ${align}`}
                      active={selected.font.align === align}
                      onClick={() => patchFont({ align })}
                    >
                      {align === 'left' ? '⯇' : align === 'center' ? '≡' : '⯈'}
                    </ToolButton>
                  ))}
                  <ToolDivider />
                  <ToolSlider
                    label="Curve"
                    value={selected.curve}
                    min={-100}
                    max={100}
                    onStart={coverHistory.remember}
                    onChange={(curve) => patchBox(update, selected.id, { curve })}
                  />
                  <ToolDivider />
                  <ToolButton
                    label="Duplicate"
                    onClick={() => {
                      const newId = id('cb');
                      coverHistory.remember();
                      update((draft) => {
                        const source = draft.cover.textBoxes.find((b) => b.id === selected.id);
                        if (source) {
                          draft.cover.textBoxes.push({
                            ...structuredClone(source),
                            id: newId,
                            x: source.x + 12,
                            y: source.y + 12,
                          });
                        }
                      });
                      setSelectedId(newId);
                    }}
                  >
                    ⧉
                  </ToolButton>
                  <ToolButton
                    label="Delete"
                    onClick={() => {
                      coverHistory.remember();
                      update((draft) => {
                        draft.cover.textBoxes = draft.cover.textBoxes.filter(
                          (b) => b.id !== selected.id,
                        );
                      });
                      setSelectedId(null);
                    }}
                  >
                    🗑
                  </ToolButton>
                  <ToolButton
                    label="Bring forward"
                    onClick={() => {
                      coverHistory.remember();
                      update((draft) => {
                        draft.cover.textBoxes = restack(draft.cover.textBoxes, selected.id, 1);
                      });
                    }}
                  >
                    ↑
                  </ToolButton>
                  <ToolButton
                    label="Send backward"
                    onClick={() => {
                      coverHistory.remember();
                      update((draft) => {
                        draft.cover.textBoxes = restack(draft.cover.textBoxes, selected.id, -1);
                      });
                    }}
                  >
                    ↓
                  </ToolButton>
                </>
              )}

              {sticker && (
                <>
                  <ToolSlider
                    label="Arc"
                    value={sticker.arc}
                    min={-100}
                    max={100}
                    onStart={coverHistory.remember}
                    onChange={(arc) => patchSticker(sticker.id, { arc })}
                  />
                  <ToolSlider
                    label="Corners"
                    value={Math.round(sticker.cornerRadius * 100)}
                    min={0}
                    max={50}
                    onStart={coverHistory.remember}
                    onChange={(value) => patchSticker(sticker.id, { cornerRadius: value / 100 })}
                  />
                  <ToolDivider />
                  <ToolButton
                    label="Border"
                    active={Boolean(sticker.border)}
                    onClick={() => {
                      coverHistory.remember();
                      patchSticker(sticker.id, {
                        border: sticker.border ? null : { widthPt: 2, color: '#1a1a1a' },
                      });
                    }}
                  >
                    ▢
                  </ToolButton>
                  {sticker.border && (
                    <ColourField
                      compact
                      label="Border colour"
                      value={sticker.border.color}
                      onChange={(color) =>
                        patchSticker(sticker.id, { border: { ...sticker.border!, color } })
                      }
                    />
                  )}
                  <ToolButton
                    label="Shadow"
                    active={sticker.shadow}
                    onClick={() => {
                      coverHistory.remember();
                      patchSticker(sticker.id, { shadow: !sticker.shadow });
                    }}
                  >
                    ◗
                  </ToolButton>
                  <ToolDivider />
                  <ToolButton
                    label="Duplicate"
                    onClick={() => {
                      const newId = id('cs');
                      coverHistory.remember();
                      update((draft) => {
                        const source = draft.cover.stickers.find((s) => s.id === sticker.id);
                        if (source) {
                          draft.cover.stickers.push({
                            ...source,
                            id: newId,
                            x: source.x + 12,
                            y: source.y + 12,
                          });
                        }
                      });
                      setSelectedSticker(newId);
                    }}
                  >
                    ⧉
                  </ToolButton>
                  <ToolButton
                    label="Delete"
                    onClick={() => {
                      coverHistory.remember();
                      update((draft) => {
                        draft.cover.stickers = draft.cover.stickers.filter(
                          (s) => s.id !== sticker.id,
                        );
                      });
                      setSelectedSticker(null);
                    }}
                  >
                    🗑
                  </ToolButton>
                  <ToolButton
                    label="Bring forward"
                    onClick={() => {
                      coverHistory.remember();
                      update((draft) => {
                        draft.cover.stickers = restack(draft.cover.stickers, sticker.id, 1);
                      });
                    }}
                  >
                    ↑
                  </ToolButton>
                  <ToolButton
                    label="Send backward"
                    onClick={() => {
                      coverHistory.remember();
                      update((draft) => {
                        draft.cover.stickers = restack(draft.cover.stickers, sticker.id, -1);
                      });
                    }}
                  >
                    ↓
                  </ToolButton>
                </>
              )}
            </SelectionToolbar>
          </div>
        )}

        {/*
          The view controls, over the canvas rather than in the panel: they are
          about looking at the board, not about changing it.
        */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-3">
          {/* On a pill rather than straight onto the canvas: white on this
              grey is 3.5:1 at best, which is under AA for a line this size. */}
          <p className="max-w-sm rounded-lg bg-black/55 px-2 py-1 text-[11px] leading-snug text-white">
            {!guidesOn
              ? 'Drag any text box to move it.'
              : isCover
                ? 'Red is the trim line — anything outside it is cut off. Blue dashes are the spine folds.'
                : layout.bleed
                  ? 'Red is the trim line — anything outside it is cut off. Green is the safe margin.'
                  : 'Green is the safe area — feeds and overlays crop outside it.'}
          </p>
          {/*
            The studio card, not `bg-paper`. `--color-paper` is the printed sheet
            and is white in every palette, so in Night this pill stayed white
            while its ink turned cream: 1.39:1 for the buttons, 1.16:1 for the
            pressed one. The card and its edge flip with the palette, and the
            pressed state reads as `text-paper-50` on `bg-ink-900` — the same
            inverse the shared `.tip` uses.
          */}
          <div
            className="pointer-events-auto flex items-center gap-1 rounded-full border px-1.5 py-1 shadow-lg"
            style={{ background: 'var(--studio-card)', borderColor: 'var(--studio-line)' }}
          >
            <button
              type="button"
              title={guidesOn ? 'Hide the guides' : 'Show the guides'}
              onClick={() => setGuidesOn((on) => !on)}
              aria-pressed={guidesOn}
              className={cx(
                'inline-flex min-h-8 items-center rounded-full px-2.5 text-[12px] transition-colors',
                guidesOn ? 'bg-ink-900 text-paper-50' : 'text-ink-700 hover:bg-ink-200',
              )}
            >
              Guides
            </button>
            <span className="h-4 w-px" style={{ background: 'var(--studio-line)' }} />
            <button
              type="button"
              title="Fit the whole board in the window"
              onClick={() => setZoom('fit')}
              aria-pressed={zoom === 'fit'}
              className={cx(
                'inline-flex min-h-8 items-center rounded-full px-2.5 text-[12px] transition-colors',
                zoom === 'fit' ? 'bg-ink-900 text-paper-50' : 'text-ink-700 hover:bg-ink-200',
              )}
            >
              Fit
            </button>
            {ZOOM_STEPS.map((step) => (
              <button
                key={step}
                type="button"
                title={step === 1 ? 'Actual size' : `Zoom to ${step * 100}%`}
                onClick={() => setZoom(step)}
                aria-pressed={zoom === step}
                className={cx(
                  'inline-flex min-h-8 items-center rounded-full px-2.5 text-[12px] tabular-nums',
                  'transition-colors',
                  zoom === step ? 'bg-ink-900 text-paper-50' : 'text-ink-700 hover:bg-ink-200',
                )}
              >
                {step * 100}%
              </button>
            ))}
            <span
              title="How big the board is on screen now"
              className="pl-1 pr-1.5 text-[11px] tabular-nums text-ink-500"
            >
              {Math.round((scale / ACTUAL_SIZE) * 100)}%
            </span>
          </div>
        </div>
      </div>

      {!rail && (
        /*
          The fallback aside, for the book cover designer, which stacks every
          section rather than opening one door at a time. Its padding is the
          shared panel's, but its WIDTH stays 320px (`--panel-stackedWidth`):
          the cover's screen golden records the stage that width leaves the
          board, and 312 moved it 8px.
        */
        <aside
          className="shrink-0 space-y-4 overflow-y-auto border-l lg:w-[var(--panel-stackedWidth)]"
          style={{
            padding: 'var(--panel-pad)',
            background: 'var(--studio-card)',
            borderColor: 'var(--studio-line)',
          }}
        >
          {sections.browseSize}
          {sections.measurements}
          {sections.history}
          {sections.bookPictures}
          {sections.library}
          {sections.templates}
          {sections.stickerInspector}
          {sections.artwork}
          {sections.colours}
          {sections.barcode}
          {sections.text}
          {sections.textInspector}
        </aside>
      )}
    </div>
  );
}

function patchBox<T extends CoverableBook>(
  update: (recipe: (draft: T) => void) => void,
  boxId: string,
  patch: Partial<CoverTextBox>,
) {
  update((draft) => {
    const found = draft.cover.textBoxes.find((b) => b.id === boxId);
    if (found) Object.assign(found, patch);
  });
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** A stand-in while no book is open, so the history hook has something to hold. */
const EMPTY_COVER: CoverableBook['cover'] = {
  backgroundColor: '#ffffff',
  backColor: '#ffffff',
  spineColor: '#ffffff',
  frontImage: null,
  imageSpansWrap: false,
  textBoxes: [],
  stickers: [],
  showBarcodeZone: true,
};

/**
 * What can be done to the sticker currently selected.
 *
 * The warnings come first because they are the reason to look at this panel at
 * all: a picture that is about to be cut in half by the spine is worth knowing
 * about before the rounded corners are.
 */
function StickerInspector({
  sticker,
  layout,
  onPatch,
  onSlide,
  onCommit,
  onRestack,
  onDuplicate,
  onDelete,
  onKeep,
  saved,
  compact = false,
  units = 'in',
}: {
  sticker: CoverSticker;
  layout: Board<string>;
  /** True where a floating toolbar already carries the frequent controls. */
  compact?: boolean;
  /** Inches and dots per inch, or pixels. See `CoverDesigner`. */
  units?: 'in' | 'px';
  onPatch: (patch: Partial<CoverSticker>) => void;
  /**
   * The same, without touching the history. A slider sends a few hundred of
   * these on the way past; remembering each one would bury everything that
   * came before it under one drag.
   */
  onSlide: (patch: Partial<CoverSticker>) => void;
  onRestack: (direction: 1 | -1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Keeps a copy in the library, for every book rather than only this one. */
  onKeep: () => void;
  saved: boolean;
  /** Once, at the start of a gesture, so one undo puts back the whole of it. */
  onCommit: () => void;
}) {
  // How sharp something will print is a fact about a print. On a board
  // measured in pixels there is not going to be one, so the reading and the
  // warning that goes with it are both answers to a question nobody asked.
  const warnings = stickerWarnings(sticker, layout).filter(
    (warning) => units === 'in' || warning.kind !== 'soft',
  );
  const bend = bendOf(sticker);

  return (
    <div className="space-y-2.5 rounded-md border border-ink-200 bg-ink-50 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="truncate text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          {sticker.name || 'Sticker'}
        </h4>
        {/* Only where it means something. A post is looked at on a screen at
            whatever size the screen is; dots per inch on it is a measurement
            of a print nobody is going to make. */}
        {units === 'in' && (
          <span className="shrink-0 text-[11px] tabular-nums text-ink-500">
            {Math.round(stickerDpi(sticker))} dpi
          </span>
        )}
      </div>

      {warnings.map((warning) => (
        <Notice key={warning.kind} level={warning.kind === 'soft' ? 'warning' : 'info'}>
          {warning.text}
        </Notice>
      ))}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Width">
          <NumberInput
            value={
              units === 'px'
                ? Math.round(ptToPx(sticker.width))
                : round(ptToInches(sticker.width))
            }
            onChange={(typed) => {
              const width = units === 'px' ? pxToPt(typed) : inchesToPt(typed);
              onPatch({
                width,
                // Keep the proportions: a number typed into a box is no more a
                // request to stretch something than a corner dragged is.
                height: round((width * sticker.height) / sticker.width),
              });
            }}
            step={units === 'px' ? 1 : 0.1}
            min={units === 'px' ? 8 : 0.2}
            suffix={units}
          />
        </Field>
        <Field label="Turn">
          <NumberInput
            value={Math.round(sticker.rotate)}
            onChange={(rotate) => onPatch({ rotate })}
            step={15}
            suffix="°"
          />
        </Field>
      </div>

      {/*
        Everything from here to the buttons is in the floating toolbar on a
        board, so it is hidden rather than repeated: the same setting in two
        places is two places to look and one to be wrong about. A cover has no
        toolbar and keeps all of it.
      */}
      {!compact && (
        <Field
          label="Arc"
          hint={
            bend
              ? `Bent through ${Math.round((bend.sweep * 180) / Math.PI)}° — ${
                  bend.up ? 'arching up' : 'hanging down'
                }`
              : 'Flat. Drag right to bend the picture up, left to bend it down.'
          }
        >
          <div onPointerDown={onCommit} onKeyDown={onCommit}>
            <Slider
              value={sticker.arc}
              onChange={(arc) => onSlide({ arc })}
              min={-100}
              max={100}
              step={1}
            />
          </div>
        </Field>
      )}

      {/* A bent picture is no longer a rectangle, so a border and rounded
          corners would frame a shape that is not there. Out of the way rather
          than sitting there doing nothing. */}
      {!compact && !bend && (
        <Field label="Rounded corners">
          <div onPointerDown={onCommit} onKeyDown={onCommit}>
            <Slider
              value={Math.round(sticker.cornerRadius * 200)}
              onChange={(value) => onSlide({ cornerRadius: value / 200 })}
              min={0}
              max={100}
              step={1}
            />
          </div>
        </Field>
      )}

      {!compact && (
        <Toggle
          label="Soft shadow"
          checked={sticker.shadow}
          onChange={(shadow) => onPatch({ shadow })}
        />
      )}
      {!compact && !bend && (
        <Toggle
          label="Border"
          checked={Boolean(sticker.border)}
          onChange={(on) => onPatch({ border: on ? { widthPt: 2, color: '#1a1a1a' } : null })}
        />
      )}
      {!bend && sticker.border && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Weight">
            <NumberInput
              value={sticker.border.widthPt}
              onChange={(widthPt) => onPatch({ border: { ...sticker.border!, widthPt } })}
              step={0.5}
              min={0.25}
              suffix="pt"
            />
          </Field>
          {!compact && (
            <Field label="Colour">
              <ColorInput
                value={sticker.border.color}
                onChange={(color) => onPatch({ border: { ...sticker.border!, color } })}
              />
            </Field>
          )}
        </div>
      )}

      {!compact && (
        <div className="grid grid-cols-2 gap-1.5">
          <Button onClick={() => onRestack(1)}>Bring forward</Button>
          <Button onClick={() => onRestack(-1)}>Send backward</Button>
          <Button onClick={onDuplicate}>Duplicate</Button>
          <Button onClick={onDelete}>Delete</Button>
        </div>
      )}
      <Button onClick={onKeep}>{saved ? 'Kept in My stickers' : 'Save to My stickers'}</Button>
      <p className="text-[11px] leading-snug text-ink-500">
        Drag to move, corners to resize, the handle above to turn. Hold Shift while resizing to
        stretch it. Arrow keys nudge; Delete removes.
      </p>
    </div>
  );
}
