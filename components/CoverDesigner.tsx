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
  spineWidth,
} from '@/lib/kdp';
import type { Board } from '@/lib/board';
import { foldsOf, safeOf, trimOf } from '@/lib/board';
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
import { StickerTray, type TrayItem } from './cover/StickerTray';
import { StickerLibrary } from './cover/StickerLibrary';
import { CoverTemplates } from './cover/CoverTemplates';
import { saveToLibrary } from '@/lib/cover/library';
import { validateCover } from '@/lib/validate';
import { FontControls } from './FontControls';
import {
  Button,
  ColorInput,
  Field,
  Notice,
  NumberInput,
  Select,
  Slider,
  TextArea,
  Toggle,
  cx,
} from './ui';

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
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
  // Bumped when the library changes, so the tray reloads without a store.
  const [libraryVersion, setLibraryVersion] = useState(0);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);

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
    const observer = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width));
    observer.observe(stage);
    setStageWidth(stage.clientWidth);
    return () => observer.disconnect();
  }, []);

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

  // Pixels per *point*, because that is what the cover is measured in. The cap
  // is the old ninety-six per inch said the same way.
  const scale =
    layout && stageWidth ? Math.min(96 / PT_PER_INCH, (stageWidth - 48) / layout.width) : 0;

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

  return (
    <div className="flex h-full min-w-0">
      <div ref={stageRef} className="min-w-0 flex-1 overflow-auto bg-[#6f6f6f] p-6">
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
                      : (layout.panels.front.x - layout.bleed) * scale,
                  top: 0,
                  width:
                    cover.imageSpansWrap || !layout.panels.front
                      ? layout.width * scale
                      : (layout.panels.front.width + layout.bleed) * scale,
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

            {/* Guides sit above everything: they are what makes the folds legible.
                Read off the board, so a board with one fold draws one. */}
            {foldsOf(layout).map((fold, i) => (
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
            {layout.bleed > 0 && (
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
            {safeOf(layout).map((area, i) => (
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

        <p className="mx-auto mt-4 max-w-lg text-center text-[11px] text-white/70">
          {isCover
            ? 'Red is the trim line — anything outside it is cut off. Blue dashes are the spine folds. Drag any text box to move it.'
            : layout.bleed
              ? 'Red is the trim line — anything outside it is cut off. Green is the safe margin. Drag any text box to move it.'
              : 'Green is the safe area — feeds and overlays crop outside it. Drag any text box to move it.'}
        </p>
      </div>

      <aside className="w-80 shrink-0 space-y-4 overflow-y-auto border-l border-ink-200 bg-paper p-3.5">
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
        ) : (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-ink-500">
            <dt>Size</dt>
            <dd className="text-right tabular-nums text-ink-700">
              {Math.round(layout.width * (96 / 72))} × {Math.round(layout.height * (96 / 72))} px
            </dd>
          </dl>
        )}

        {isCover && spineTooThinForText(layout as CoverLayout) && (
          <Notice level="warning">
            The spine is under 0.0625″, KDP's minimum for printing spine text.
          </Notice>
        )}

        <div className="flex items-center gap-1.5">
          <Button onClick={coverHistory.undo} disabled={!coverHistory.canUndo} title="Undo (Cmd+Z)">
            ↺
          </Button>
          <Button onClick={coverHistory.redo} disabled={!coverHistory.canRedo} title="Redo (Cmd+Shift+Z)">
            ↻
          </Button>
          <span className="text-[11px] text-ink-500">Undo covers the {isCover ? 'cover' : 'design'}</span>
        </div>

        <StickerTray
          title="Stickers from this book"
          items={trayItems}
          empty="Nothing in the book yet. Its pictures will appear here."
          onPlace={placeSticker}
        />

        <StickerLibrary
          onPlace={placeSticker}
          reloadKey={libraryVersion}
          onChanged={() => setLibraryVersion((n) => n + 1)}
        />

        <CoverTemplates
          cover={cover}
          onApply={(spec) => {
            coverHistory.remember();
            update((draft) => void (draft.cover = spec));
            setSelectedSticker(null);
            setSelectedId(null);
          }}
        />

        {sticker && (
          <StickerInspector
            sticker={sticker}
            layout={layout}
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

        <div className="space-y-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Artwork</h4>
          <label className="block cursor-pointer rounded-md border border-ink-300 bg-ink-100 px-2.5 py-1.5 text-center transition-colors hover:bg-ink-200">
            {cover.frontImage ? 'Replace image…' : 'Upload cover image…'}
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
                <span className={imageDpi < MIN_COVER_DPI ? 'text-amber-300' : 'text-emerald-300'}>
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

        <div className="grid grid-cols-1 gap-2">
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
        </div>

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

        <div className="space-y-2 border-t border-ink-200 pt-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Text</h4>
          <div className="grid grid-cols-3 gap-1.5">
            {(isCover ? ADDABLE_PANELS : (['board'] as CoverPanel[])).map((panel) => (
              <Button key={panel} onClick={() => addBox(panel)}>
                + {panel}
              </Button>
            ))}
          </div>
          {cover.textBoxes.length === 0 && (
            <p className="text-[11px] text-ink-500">No text yet. Add a box to a panel.</p>
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
                  <span className="w-10 shrink-0 text-[10px] uppercase text-ink-500">
                    {box.panel}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{box.text || 'Empty'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

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
            <FontControls
              spec={selected.font}
              onChange={(patch) =>
                update((draft) => {
                  const found = draft.cover.textBoxes.find((b) => b.id === selected.id);
                  if (found) Object.assign(found.font, patch);
                })
              }
            />
            <Button
              variant="danger"
              onClick={() => {
                update((draft) => {
                  draft.cover.textBoxes = draft.cover.textBoxes.filter((b) => b.id !== selected.id);
                });
                setSelectedId(null);
              }}
            >
              Delete this text
            </Button>
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
      </aside>
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
}: {
  sticker: CoverSticker;
  layout: Board<string>;
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
  const warnings = stickerWarnings(sticker, layout);
  const bend = bendOf(sticker);

  return (
    <div className="space-y-2.5 rounded-md border border-ink-200 bg-ink-50 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="truncate text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          {sticker.name || 'Sticker'}
        </h4>
        <span className="shrink-0 text-[11px] tabular-nums text-ink-500">
          {Math.round(stickerDpi(sticker))} dpi
        </span>
      </div>

      {warnings.map((warning) => (
        <Notice key={warning.kind} level={warning.kind === 'soft' ? 'warning' : 'info'}>
          {warning.text}
        </Notice>
      ))}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Width">
          <NumberInput
            value={round(ptToInches(sticker.width))}
            onChange={(inches) => {
              const width = inchesToPt(inches);
              onPatch({
                width,
                // Keep the proportions: a number typed into a box is no more a
                // request to stretch something than a corner dragged is.
                height: round((width * sticker.height) / sticker.width),
              });
            }}
            step={0.1}
            min={0.2}
            suffix="in"
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

      {/* A bent picture is no longer a rectangle, so a border and rounded
          corners would frame a shape that is not there. Out of the way rather
          than sitting there doing nothing. */}
      {!bend && (
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

      <Toggle
        label="Soft shadow"
        checked={sticker.shadow}
        onChange={(shadow) => onPatch({ shadow })}
      />
      {!bend && (
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
          <Field label="Colour">
            <ColorInput
              value={sticker.border.color}
              onChange={(color) => onPatch({ border: { ...sticker.border!, color } })}
            />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <Button onClick={() => onRestack(1)}>Bring forward</Button>
        <Button onClick={() => onRestack(-1)}>Send backward</Button>
        <Button onClick={onDuplicate}>Duplicate</Button>
        <Button onClick={onDelete}>Delete</Button>
      </div>
      <Button onClick={onKeep}>{saved ? 'Kept in My stickers' : 'Save to My stickers'}</Button>
      <p className="text-[11px] leading-snug text-ink-500">
        Drag to move, corners to resize, the handle above to turn. Hold Shift while resizing to
        stretch it. Arrow keys nudge; Delete removes.
      </p>
    </div>
  );
}
