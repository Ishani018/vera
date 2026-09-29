'use client';

import { useEffect, useState } from 'react';
import { UnsupportedImageError, forgetAssetUrl, getAssetUrl, putAsset } from '@/lib/assets';
import { isIllustration, moveToSection, sectionOfItem, sectionsOf } from '@/lib/contents';
import { MIN_COVER_DPI, effectiveDpi, getTrim } from '@/lib/kdp';
import { useStore } from '@/lib/store';
import type { Illustration } from '@/lib/types';
import { Modal } from './Modal';
import { Button, Field, Notice, Select, TextInput, Toggle, cx } from './ui';

/**
 * A plate.
 *
 * The page exists before the picture does, so everything here tolerates an
 * empty `assetId`: the poet can put a plate in the running order while the
 * artwork is still being drawn, and the export checks are what refuse to ship
 * one empty.
 */
export function IllustrationEditor() {
  const project = useStore((s) => s.project);
  const selectedId = useStore((s) => s.selectedPoemId);
  const select = useStore((s) => s.select);
  const update = useStore((s) => s.update);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const plate = project?.contents.find(
    (item): item is Illustration => isIllustration(item) && item.id === selectedId,
  );
  const assetId = plate?.assetId ?? '';

  useEffect(() => {
    let live = true;
    if (!assetId) {
      setUrl(null);
      return;
    }
    void getAssetUrl(assetId).then((next) => {
      if (live) setUrl(next);
    });
    return () => {
      live = false;
    };
  }, [assetId]);

  if (!project || !plate) return null;

  const parts = sectionsOf(project);
  const partId = sectionOfItem(project, plate.id)?.id ?? '';

  const edit = (patch: Partial<Illustration>) =>
    update((draft) => {
      const found = draft.contents.find((item) => item.id === plate.id);
      if (found && isIllustration(found)) Object.assign(found, patch);
    });

  const onImage = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const previous = assetId;
    try {
      const record = await putAsset(file);
      edit({ assetId: record.id, naturalWidth: record.width, naturalHeight: record.height });
      // The replaced asset's object URL is stale; the bytes are swept later.
      if (previous) forgetAssetUrl(previous);
    } catch (problem) {
      setError(
        problem instanceof UnsupportedImageError || problem instanceof Error
          ? problem.message
          : 'That image could not be read.',
      );
    }
  };

  // A contained plate prints inside the margins; a bleeding one covers the
  // whole sheet. The DPI that matters is the one at the size it will print.
  const trim = getTrim(project.trim.trimId);
  const printedWidth = plate.fit === 'bleed' ? trim.width : trim.width - project.margins.inside - project.margins.outside;
  const dpi = plate.naturalWidth ? effectiveDpi(plate.naturalWidth, printedWidth) : 0;

  const remove = () => {
    update(
      (draft) => {
        draft.contents = draft.contents.filter((item) => item.id !== plate.id);
      },
      { discrete: true },
    );
    select(null);
  };

  const turnIntoPoem = () => {
    update(
      (draft) => {
        const at = draft.contents.findIndex((item) => item.id === plate.id);
        if (at < 0) return;
        draft.contents[at] = {
          kind: 'poem',
          id: plate.id,
          title: plate.title,
          body: '',
          epigraph: '',
          dedication: '',
        };
      },
      { discrete: true },
    );
  };

  return (
    <Modal
      title={plate.title.trim() || 'Illustration page'}
      onClose={() => select(null)}
      width="max-w-3xl"
      footer={
        <>
          <Button className="mr-auto" onClick={turnIntoPoem} title="Keep its place, make it a poem">
            Turn into a poem
          </Button>
          <Button variant="danger" onClick={remove}>
            Delete page
          </Button>
          <Button variant="primary" onClick={() => select(null)}>
            Done
          </Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <label className="block cursor-pointer rounded-md border border-ink-300 bg-ink-100 px-2.5 py-2 text-center transition-colors hover:bg-ink-200">
            {plate.assetId ? 'Replace the picture…' : 'Choose a picture…'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => void onImage(e.target.files?.[0])}
            />
          </label>
          {error && <Notice level="error">{error}</Notice>}

          {plate.assetId && (
            <p className="text-[11px] text-ink-500">
              {plate.naturalWidth} × {plate.naturalHeight}px ·{' '}
              <span className={dpi < MIN_COVER_DPI ? 'text-amber-700' : 'text-emerald-700'}>
                {Math.round(dpi)} DPI at print size
              </span>
            </p>
          )}

          <Field
            label="Title"
            hint="Only for the contents page. Leave it empty and the plate is not listed."
          >
            <TextInput value={plate.title} onChange={(e) => edit({ title: e.target.value })} />
          </Field>

          <Field label="Caption" hint="Printed under the picture, in italic.">
            <TextInput value={plate.caption} onChange={(e) => edit({ caption: e.target.value })} />
          </Field>

          <Field label="How it sits on the page">
            <Select<Illustration['fit']>
              value={plate.fit}
              onChange={(fit) => edit({ fit })}
              options={[
                { value: 'contain', label: 'Inside the margins' },
                { value: 'bleed', label: 'Off the trimmed edge (full bleed)' },
              ]}
            />
          </Field>

          {plate.fit === 'bleed' && !project.trim.bleed && (
            <Notice level="warning">
              The book is set up without bleed, so KDP will trim into this picture. Turn bleed on
              under Trim &amp; margins.
            </Notice>
          )}

          <Toggle
            label="Start on a right-hand page"
            checked={plate.startsRecto || plate.facingBlank}
            disabled={plate.facingBlank}
            onChange={(startsRecto) => edit({ startsRecto })}
          />
          <Toggle
            label="Keep the facing page blank"
            checked={plate.facingBlank}
            onChange={(facingBlank) => edit({ facingBlank })}
          />
          <p className="text-[11px] text-ink-500">
            A blank facing page means the plate is on a right-hand page with the page opposite it
            left empty — which is what a frontispiece is. It costs a page.
          </p>

          {parts.length > 0 && (
            <Field label="Part" hint="Moves the plate to the end of that part.">
              <Select
                value={partId}
                onChange={(value) =>
                  update((draft) => moveToSection(draft.contents, plate.id, value || null), {
                    discrete: true,
                  })
                }
                options={[
                  { value: '', label: 'Before the first part' },
                  ...parts.map((part) => ({ value: part.id, label: part.title })),
                ]}
              />
            </Field>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-500">
            The page
          </p>
          <div
            className="grid place-items-center overflow-hidden rounded border border-ink-300 bg-white p-3"
            style={{ aspectRatio: `${trim.width} / ${trim.height}` }}
          >
            {url ? (
              <img
                src={url}
                alt=""
                className={cx(
                  'max-h-full max-w-full',
                  plate.fit === 'bleed' && 'h-full w-full object-cover',
                )}
              />
            ) : (
              <span className="px-3 text-center text-[11px] italic text-ink-500">
                No picture chosen yet
              </span>
            )}
          </div>
          {plate.caption.trim() && (
            <p className="mt-1.5 text-center text-[11px] italic text-ink-500">{plate.caption}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
