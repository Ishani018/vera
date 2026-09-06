'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UnsupportedImageError, forgetAssetUrl, getAssetUrl, putAsset } from '@/lib/assets';
import { MIN_COVER_DPI, effectiveDpi, padToEven, spineWidth } from '@/lib/kdp';
import { coverLayout, spineTooThinForText } from '@/lib/render/coverLayout';
import { id } from '@/lib/defaults';
import { font } from '@/lib/defaults';
import { useStore } from '@/lib/store';
import type { CoverPanel, CoverTextBox } from '@/lib/types';
import { validateCover } from '@/lib/validate';
import { FontControls } from './FontControls';
import { Button, ColorInput, Field, Notice, NumberInput, Select, TextArea, Toggle, cx } from './ui';

const PANEL_LABELS: Record<CoverPanel, string> = {
  back: 'Back cover',
  spine: 'Spine',
  front: 'Front cover',
};

export function CoverDesigner() {
  const project = useStore((s) => s.project);
  const update = useStore((s) => s.update);
  const pageCount = useStore((s) => s.pageCount);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);

  const finalPages = padToEven(pageCount || 24);
  const layout = useMemo(
    () => (project ? coverLayout(project, finalPages) : null),
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

  const scale = layout && stageWidth ? Math.min(96, (stageWidth - 48) / layout.dimensions.width) : 0;

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

      const move = (e: PointerEvent) => {
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
    [layout, scale, update],
  );

  if (!project || !layout) return null;

  const cover = project.cover;
  const selected = cover.textBoxes.find((b) => b.id === selectedId) ?? null;
  const issues = validateCover(project, pageCount);

  const addBox = (panel: CoverPanel) => {
    const newId = id('cb');
    const panelRect = layout.panels[panel];
    update((draft) => {
      draft.cover.textBoxes.push({
        id: newId,
        panel,
        text: panel === 'spine' ? `${draft.meta.title} · ${draft.meta.author}` : draft.meta.title,
        x: panel === 'spine' ? panelRect.width / 2 : 0.6,
        y: panel === 'spine' ? 0.9 : 1.2,
        widthIn: panel === 'spine' ? panelRect.height - 1.8 : panelRect.width - 1.2,
        font: font({
          family: draft.typography.sectionTitle.family,
          fallback: draft.typography.sectionTitle.fallback,
          sizePt: panel === 'spine' ? 11 : 26,
          lineHeight: 1.2,
          align: panel === 'front' ? 'center' : 'left',
          color: '#1a1a1a',
        }),
        rotate: 0,
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
        cover.imageSpansWrap ? layout.dimensions.width : layout.panels.front.width,
      )
    : 0;

  return (
    <div className="flex h-full min-w-0">
      <div ref={stageRef} className="min-w-0 flex-1 overflow-auto bg-[#6f6f6f] p-6">
        {scale > 0 && (
          <div
            className="relative mx-auto shadow-2xl"
            style={{
              width: layout.dimensions.width * scale,
              height: layout.dimensions.height * scale,
              background: cover.backgroundColor,
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelectedId(null);
            }}
          >
            <div
              className="absolute"
              style={{
                left: 0,
                top: 0,
                width: layout.panels.spine.x * scale,
                height: layout.dimensions.height * scale,
                background: cover.backColor,
              }}
            />
            <div
              className="absolute"
              style={{
                left: layout.panels.spine.x * scale,
                top: 0,
                width: layout.panels.spine.width * scale,
                height: layout.dimensions.height * scale,
                background: cover.spineColor,
              }}
            />

            {cover.frontImage && imageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                alt=""
                src={imageUrl}
                className="pointer-events-none absolute"
                style={{
                  left: cover.imageSpansWrap ? 0 : (layout.panels.front.x - layout.bleed) * scale,
                  top: 0,
                  width: cover.imageSpansWrap
                    ? layout.dimensions.width * scale
                    : (layout.panels.front.width + layout.bleed) * scale,
                  height: layout.dimensions.height * scale,
                  objectFit: cover.frontImage.fit,
                }}
              />
            )}

            {cover.showBarcodeZone && (
              <div
                className="pointer-events-none absolute flex items-center justify-center border border-dashed border-black/45 bg-white/55 text-center text-[9px] italic text-black/60"
                style={{
                  left: layout.barcode.x * scale,
                  top: layout.barcode.y * scale,
                  width: layout.barcode.width * scale,
                  height: layout.barcode.height * scale,
                }}
              >
                Barcode area
                <br />2″ × 1.2″
              </div>
            )}

            {cover.textBoxes.map((box) => {
              const panel = layout.panels[box.panel];
              const rotate = box.panel === 'spine' ? 90 + box.rotate : box.rotate;
              return (
                <div
                  key={box.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => {
                    setSelectedId(box.id);
                    onDrag(box, e);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelectedId(box.id);
                  }}
                  className={cx(
                    'absolute cursor-move whitespace-pre-wrap outline-offset-2',
                    selectedId === box.id
                      ? 'outline-2 outline-dashed outline-sky-400'
                      : 'hover:outline-1 hover:outline-dashed hover:outline-white/50',
                  )}
                  style={{
                    left: (panel.x + box.x) * scale,
                    top: (panel.y + box.y) * scale,
                    width: box.widthIn * scale,
                    transform: rotate ? `rotate(${rotate}deg)` : undefined,
                    transformOrigin: 'left top',
                    fontFamily: `'${box.font.family}', ${box.font.fallback}`,
                    fontSize: (box.font.sizePt / 72) * scale,
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
                  }}
                >
                  {box.text}
                </div>
              );
            })}

            {/* Guides sit above everything: they are what makes the folds legible. */}
            {layout.folds.map((fold, i) => (
              <div
                key={i}
                className="pointer-events-none absolute border-l border-dashed border-sky-500/80"
                style={{ left: fold * scale, top: 0, height: layout.dimensions.height * scale }}
              />
            ))}
            <div
              className="pointer-events-none absolute border border-red-500/80"
              style={{
                left: layout.bleed * scale,
                top: layout.bleed * scale,
                width: (layout.dimensions.width - 2 * layout.bleed) * scale,
                height: (layout.dimensions.height - 2 * layout.bleed) * scale,
              }}
            />
          </div>
        )}

        <p className="mx-auto mt-4 max-w-lg text-center text-[11px] text-white/70">
          Red is the trim line — anything outside it is cut off. Blue dashes are the spine folds.
          Drag any text box to move it.
        </p>
      </div>

      <aside className="w-80 shrink-0 space-y-4 overflow-y-auto border-l border-ink-800 bg-ink-900 p-3.5">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-ink-400">
          <dt>Full cover</dt>
          <dd className="text-right tabular-nums text-ink-300">
            {layout.dimensions.width.toFixed(3)}″ × {layout.dimensions.height.toFixed(3)}″
          </dd>
          <dt>Spine at {finalPages} pages</dt>
          <dd className="text-right tabular-nums text-ink-300">
            {spineWidth(finalPages, project.trim.paper).toFixed(4)}″
          </dd>
        </dl>

        {spineTooThinForText(layout) && (
          <Notice level="warning">
            The spine is under 0.0625″, KDP's minimum for printing spine text.
          </Notice>
        )}

        <div className="space-y-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Artwork</h4>
          <label className="block cursor-pointer rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-center transition-colors hover:bg-ink-700">
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
              <p className="text-[11px] text-ink-400">
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

        <Toggle
          label="Show the barcode reserve"
          checked={cover.showBarcodeZone}
          onChange={(showBarcodeZone) =>
            update((draft) => {
              draft.cover.showBarcodeZone = showBarcodeZone;
            })
          }
        />

        <div className="space-y-2 border-t border-ink-800 pt-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Text</h4>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(PANEL_LABELS) as CoverPanel[]).map((panel) => (
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
                    selectedId === box.id ? 'bg-brass-500/15 text-brass-300' : 'hover:bg-ink-850',
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
          <div className="space-y-3 border-t border-ink-800 pt-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
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
                  value={selected.x}
                  onChange={(x) => patchBox(update, selected.id, { x })}
                  step={0.05}
                  suffix="in"
                />
              </Field>
              <Field label="Y">
                <NumberInput
                  value={selected.y}
                  onChange={(y) => patchBox(update, selected.id, { y })}
                  step={0.05}
                  suffix="in"
                />
              </Field>
              <Field label="Width">
                <NumberInput
                  value={selected.widthIn}
                  onChange={(widthIn) => patchBox(update, selected.id, { widthIn })}
                  step={0.05}
                  min={0.2}
                  suffix="in"
                />
              </Field>
            </div>
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
          <div className="space-y-1.5 border-t border-ink-800 pt-3">
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

function patchBox(
  update: (recipe: (draft: import('@/lib/types').Project) => void) => void,
  boxId: string,
  patch: Partial<CoverTextBox>,
) {
  update((draft) => {
    const found = draft.cover.textBoxes.find((b) => b.id === boxId);
    if (found) Object.assign(found, patch);
  });
}

const round = (value: number) => Math.round(value * 1000) / 1000;
