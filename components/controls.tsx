'use client';

import { useMemo } from 'react';
import { BORDER_STYLE_LABELS, ORNAMENT_LABELS } from '@/lib/render/borders';
import {
  GUTTER_TABLE,
  PAPER_LABELS,
  TRIM_SIZES,
  getTrim,
  minInsideMargin,
  minOutsideMargin,
  padToEven,
  spineWidth,
} from '@/lib/kdp';
import { useStore } from '@/lib/store';
import type {
  BorderScope,
  BorderStyle,
  MatterPage,
  OrnamentGlyph,
  PageNumberPosition,
  PaperType,
  PoemStartMode,
  Project,
  RunningHeadContent,
  Typography,
} from '@/lib/types';
import { checkMargins } from '@/lib/kdp';
import { FontControls } from './FontControls';
import { ExportPanel } from './ExportPanel';
import {
  Accordion,
  Button,
  ColorInput,
  Field,
  Notice,
  NumberInput,
  Select,
  Slider,
  TextArea,
  TextInput,
  Toggle,
} from './ui';

const TYPOGRAPHY_SLOTS: Array<{ key: keyof Typography; label: string }> = [
  { key: 'body', label: 'Poem body' },
  { key: 'poemTitle', label: 'Poem titles' },
  { key: 'sectionTitle', label: 'Part titles' },
  { key: 'matter', label: 'Front & back matter' },
  { key: 'toc', label: 'Contents' },
  { key: 'runningHead', label: 'Running heads' },
  { key: 'pageNumber', label: 'Page numbers' },
];

function useProject(): [Project, (recipe: (draft: Project) => void) => void] {
  const project = useStore((s) => s.project)!;
  const update = useStore((s) => s.update);
  return [project, update];
}

export function MarginBadge() {
  const project = useStore((s) => s.project);
  const pageCount = useStore((s) => s.pageCount);
  if (!project || pageCount === 0) return null;
  const issues = checkMargins({
    margins: project.margins,
    pageCount: padToEven(pageCount),
    bleed: project.trim.bleed,
  });
  const errors = issues.filter((i) => i.level === 'error').length;
  if (!errors) return null;
  return (
    <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-200">
      {errors}
    </span>
  );
}

export function MetaPanel() {
  const [project, update] = useProject();
  const meta = project.meta;
  const set = (patch: Partial<typeof meta>) =>
    update((draft) => {
      Object.assign(draft.meta, patch);
      if (patch.title) draft.name = patch.title;
    });

  return (
    <>
      <Field label="Title">
        <TextInput value={meta.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Subtitle">
        <TextInput value={meta.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
      </Field>
      <Field label="Author">
        <TextInput value={meta.author} onChange={(e) => set({ author: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Year">
          <TextInput value={meta.year} onChange={(e) => set({ year: e.target.value })} />
        </Field>
        <Field label="Publisher">
          <TextInput value={meta.publisher} onChange={(e) => set({ publisher: e.target.value })} />
        </Field>
      </div>
      <Field label="ISBN" hint="Printed on the copyright page. Leave blank to use KDP's free ISBN.">
        <TextInput value={meta.isbn} onChange={(e) => set({ isbn: e.target.value })} />
      </Field>
    </>
  );
}

export function TrimPanel() {
  const [project, update] = useProject();
  const pageCount = useStore((s) => s.pageCount);
  const trim = getTrim(project.trim.trimId);
  const finalPages = padToEven(pageCount || 0);

  const minInside = minInsideMargin(finalPages || 24);
  const minOutside = minOutsideMargin(project.trim.bleed);
  const issues = finalPages
    ? checkMargins({ margins: project.margins, pageCount: finalPages, bleed: project.trim.bleed })
    : [];

  const setMargin = (key: keyof Project['margins'], value: number) =>
    update((draft) => {
      draft.margins[key] = value;
    });

  const applyMinimums = () =>
    update((draft) => {
      draft.margins.inside = Math.max(draft.margins.inside, minInside);
      draft.margins.outside = Math.max(draft.margins.outside, minOutside);
      draft.margins.top = Math.max(draft.margins.top, minOutside);
      draft.margins.bottom = Math.max(draft.margins.bottom, minOutside);
    });

  return (
    <>
      <Field label="Trim size">
        <Select
          value={project.trim.trimId}
          onChange={(trimId) =>
            update((draft) => {
              draft.trim.trimId = trimId;
            })
          }
          options={TRIM_SIZES.map((t) => ({
            value: t.id,
            label: t.recommendedForPoetry ? `${t.label} — poetry standard` : t.label,
          }))}
        />
      </Field>

      <Field label="Paper">
        <Select<PaperType>
          value={project.trim.paper}
          onChange={(paper) =>
            update((draft) => {
              draft.trim.paper = paper;
            })
          }
          options={(Object.keys(PAPER_LABELS) as PaperType[]).map((p) => ({
            value: p,
            label: PAPER_LABELS[p],
          }))}
        />
      </Field>

      <Toggle
        label="Bleed (art runs off the page edge)"
        checked={project.trim.bleed}
        onChange={(bleed) =>
          update((draft) => {
            draft.trim.bleed = bleed;
          })
        }
      />

      <div className="grid grid-cols-2 gap-2">
        <Field label="Inside (gutter)">
          <NumberInput
            value={project.margins.inside}
            onChange={(v) => setMargin('inside', v)}
            step={0.0625}
            min={0}
            max={2}
            suffix="in"
          />
        </Field>
        <Field label="Outside">
          <NumberInput
            value={project.margins.outside}
            onChange={(v) => setMargin('outside', v)}
            step={0.0625}
            min={0}
            max={2}
            suffix="in"
          />
        </Field>
        <Field label="Top">
          <NumberInput
            value={project.margins.top}
            onChange={(v) => setMargin('top', v)}
            step={0.0625}
            min={0}
            max={2}
            suffix="in"
          />
        </Field>
        <Field label="Bottom">
          <NumberInput
            value={project.margins.bottom}
            onChange={(v) => setMargin('bottom', v)}
            step={0.0625}
            min={0}
            max={2}
            suffix="in"
          />
        </Field>
      </div>

      {issues.map((issue) => (
        <Notice key={issue.id} level={issue.level === 'error' ? 'error' : 'warning'}>
          <p>{issue.message}</p>
          {issue.fix && <p className="mt-1 opacity-80">{issue.fix}</p>}
        </Notice>
      ))}
      {issues.some((i) => i.level === 'error') && (
        <Button onClick={applyMinimums}>Raise margins to the KDP minimum</Button>
      )}
      {finalPages > 0 && !issues.length && (
        <Notice level="ok">
          Margins clear the KDP minimum for {finalPages} pages (gutter {minInside}″, edges{' '}
          {minOutside}″).
        </Notice>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-ink-200 pt-3 text-[11px] text-ink-500">
        <dt>Sheet</dt>
        <dd className="text-right tabular-nums text-ink-700">
          {(trim.width + (project.trim.bleed ? 0.125 : 0)).toFixed(3)}″ ×{' '}
          {(trim.height + (project.trim.bleed ? 0.25 : 0)).toFixed(3)}″
        </dd>
        <dt>Spine at {finalPages || '—'} pages</dt>
        <dd className="text-right tabular-nums text-ink-700">
          {finalPages ? `${spineWidth(finalPages, project.trim.paper).toFixed(3)}″` : '—'}
        </dd>
        <dt>Next gutter tier</dt>
        <dd className="text-right tabular-nums text-ink-700">
          {GUTTER_TABLE.find((r) => r.minPages > (finalPages || 0))?.minPages ?? '—'} pages
        </dd>
      </dl>
    </>
  );
}

export function TypographyPanel() {
  const [project, update] = useProject();
  return (
    <div className="space-y-5">
      {TYPOGRAPHY_SLOTS.map(({ key, label }) => (
        <div key={key} className="space-y-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            {label}
          </h4>
          <FontControls
            spec={project.typography[key]}
            onChange={(patch) =>
              update((draft) => {
                Object.assign(draft.typography[key], patch);
              })
            }
            options={{ showAlign: key !== 'body' }}
          />
        </div>
      ))}
    </div>
  );
}

export function LayoutPanel() {
  const [project, update] = useProject();
  const layout = project.layout;
  const set = (patch: Partial<typeof layout>) =>
    update((draft) => {
      Object.assign(draft.layout, patch);
    });

  return (
    <>
      <Field label="Each poem starts">
        <Select<PoemStartMode>
          value={layout.poemStart}
          onChange={(poemStart) => set({ poemStart })}
          options={[
            { value: 'newPage', label: 'On a new page' },
            { value: 'recto', label: 'On a right-hand page' },
            { value: 'continuous', label: 'Wherever it falls' },
          ]}
        />
      </Field>

      <Field label="Stanza spacing">
        <Slider value={layout.stanzaSpacingEm} onChange={(v) => set({ stanzaSpacingEm: v })} min={0} max={3} step={0.05} />
      </Field>

      <Field
        label="Turnover indent"
        hint="How far a line too long for the measure is indented when it wraps."
      >
        <Slider value={layout.hangingIndentEm} onChange={(v) => set({ hangingIndentEm: v })} min={0} max={4} step={0.1} />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Space above title">
          <Slider value={layout.titleSpaceAboveEm} onChange={(v) => set({ titleSpaceAboveEm: v })} min={0} max={6} step={0.1} />
        </Field>
        <Field label="Space below title">
          <Slider value={layout.titleSpaceBelowEm} onChange={(v) => set({ titleSpaceBelowEm: v })} min={0} max={6} step={0.1} />
        </Field>
      </div>

      <Toggle
        label="Centre short poems on their page"
        checked={layout.verticalCenterShortPoems}
        onChange={(v) => set({ verticalCenterShortPoems: v })}
      />
      {layout.verticalCenterShortPoems && (
        <Field label="“Short” means at most">
          <NumberInput
            value={layout.shortPoemMaxLines}
            onChange={(v) => set({ shortPoemMaxLines: Math.round(v) })}
            min={1}
            max={60}
            step={1}
            suffix="lines"
          />
        </Field>
      )}

      <Toggle
        label="Parts open on a right-hand page"
        checked={layout.sectionStartsRecto}
        onChange={(v) => set({ sectionStartsRecto: v })}
      />

      <Toggle
        label="Mark poems that carry over"
        checked={layout.showContinuedMarker}
        onChange={(v) => set({ showContinuedMarker: v })}
      />
      {layout.showContinuedMarker && (
        <Field label="Marker" hint="Printed after the poem's title on the continuing page.">
          <TextInput value={layout.continuedMarker} onChange={(e) => set({ continuedMarker: e.target.value })} />
        </Field>
      )}
    </>
  );
}

export function BorderPanel() {
  const [project, update] = useProject();
  const border = project.border;
  const ornament = project.ornament;
  const smallestMargin = Math.min(
    project.margins.inside,
    project.margins.outside,
    project.margins.top,
    project.margins.bottom,
  );

  return (
    <>
      <Toggle
        label="Decorative page border"
        checked={border.enabled}
        onChange={(enabled) =>
          update((draft) => {
            draft.border.enabled = enabled;
          })
        }
      />

      {border.enabled && (
        <>
          <Field label="Style">
            <Select<BorderStyle>
              value={border.style}
              onChange={(style) =>
                update((draft) => {
                  draft.border.style = style;
                })
              }
              options={(Object.keys(BORDER_STYLE_LABELS) as BorderStyle[]).map((s) => ({
                value: s,
                label: BORDER_STYLE_LABELS[s],
              }))}
            />
          </Field>
          <Field label="Draw it on">
            <Select<BorderScope>
              value={border.scope}
              onChange={(scope) =>
                update((draft) => {
                  draft.border.scope = scope;
                })
              }
              options={[
                { value: 'poemOpen', label: 'Pages that open a poem' },
                { value: 'sectionOpen', label: 'Part title pages' },
                { value: 'matter', label: 'Front & back matter' },
                { value: 'all', label: 'Every page' },
              ]}
            />
          </Field>
          <Field label="Colour">
            <ColorInput
              value={border.color}
              onChange={(color) =>
                update((draft) => {
                  draft.border.color = color;
                })
              }
            />
          </Field>
          <Field label="Weight">
            <Slider
              value={border.weightPt}
              onChange={(weightPt) =>
                update((draft) => {
                  draft.border.weightPt = weightPt;
                })
              }
              min={0.25}
              max={4}
              step={0.25}
            />
          </Field>
          <Field
            label="Distance from the text"
            hint={`Clamped to ${Math.max(0, smallestMargin - 0.05).toFixed(3)}″ so the frame stays inside the trim.`}
          >
            <Slider
              value={border.insetIn}
              onChange={(insetIn) =>
                update((draft) => {
                  draft.border.insetIn = insetIn;
                })
              }
              min={0}
              max={0.6}
              step={0.01}
            />
          </Field>
        </>
      )}

      <div className="border-t border-ink-200 pt-3">
        <Toggle
          label="Ornament between poems"
          checked={ornament.betweenPoems}
          onChange={(betweenPoems) =>
            update((draft) => {
              draft.ornament.betweenPoems = betweenPoems;
            })
          }
        />
        {project.layout.poemStart !== 'continuous' && ornament.betweenPoems && (
          <Notice level="info">
            Ornaments only appear when poems flow on the same page. Set “Each poem starts” to
            “Wherever it falls” to see them.
          </Notice>
        )}
        {ornament.betweenPoems && (
          <div className="mt-2.5 space-y-2.5">
            <Field label="Ornament">
              <Select<OrnamentGlyph>
                value={ornament.glyph}
                onChange={(glyph) =>
                  update((draft) => {
                    draft.ornament.glyph = glyph;
                  })
                }
                options={(Object.keys(ORNAMENT_LABELS) as OrnamentGlyph[]).map((g) => ({
                  value: g,
                  label: ORNAMENT_LABELS[g],
                }))}
              />
            </Field>
            <Field label="Colour">
              <ColorInput
                value={ornament.color}
                onChange={(color) =>
                  update((draft) => {
                    draft.ornament.color = color;
                  })
                }
              />
            </Field>
          </div>
        )}
      </div>
    </>
  );
}

export function MatterPanel() {
  const [project, update] = useProject();

  const renderGroup = (which: 'frontMatter' | 'backMatter', label: string) => (
    <div className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{label}</h4>
      {project[which]
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((page) => (
          <MatterRow
            key={page.id}
            page={page}
            onChange={(patch) =>
              update((draft) => {
                const found = draft[which].find((p) => p.id === page.id);
                if (found) Object.assign(found, patch);
              })
            }
          />
        ))}
    </div>
  );

  return (
    <div className="space-y-5">
      {renderGroup('frontMatter', 'Front matter')}
      {renderGroup('backMatter', 'Back matter')}
      <Notice level="info">
        Front matter is numbered in roman; the body restarts at 1 in arabic.
      </Notice>
    </div>
  );
}

function MatterRow({
  page,
  onChange,
}: {
  page: MatterPage;
  onChange: (patch: Partial<MatterPage>) => void;
}) {
  const usesMeta = page.kind === 'title' || page.kind === 'halfTitle';
  return (
    <div className="rounded-md border border-ink-200 bg-ink-50 p-2.5">
      <Toggle label={page.label} checked={page.enabled} onChange={(enabled) => onChange({ enabled })} />
      {page.enabled && (
        <div className="mt-2 space-y-2">
          {page.kind !== 'title' && page.kind !== 'halfTitle' && (
            <TextInput
              value={page.heading}
              onChange={(e) => onChange({ heading: e.target.value })}
              placeholder="Heading (optional)"
            />
          )}
          {usesMeta ? (
            <p className="text-[11px] text-ink-500">
              Set from the book title and author under Book details.
            </p>
          ) : (
            <TextArea
              value={page.body}
              onChange={(e) => onChange({ body: e.target.value })}
              rows={page.kind === 'copyright' ? 7 : 3}
              className="text-[12px]"
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={page.align}
              onChange={(align) => onChange({ align })}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Centred' },
                { value: 'right', label: 'Right' },
              ]}
            />
            <Select
              value={page.verticalPosition}
              onChange={(verticalPosition) => onChange({ verticalPosition })}
              options={[
                { value: 'top', label: 'Top of page' },
                { value: 'center', label: 'Middle' },
                { value: 'bottom', label: 'Foot of page' },
              ]}
            />
          </div>
          <Toggle
            label="Right-hand page"
            checked={page.startsRecto}
            onChange={(startsRecto) => onChange({ startsRecto })}
          />
        </div>
      )}
    </div>
  );
}

export function TocPanel() {
  const [project, update] = useProject();
  const toc = project.toc;
  const set = (patch: Partial<typeof toc>) =>
    update((draft) => {
      Object.assign(draft.toc, patch);
    });

  return (
    <>
      <Toggle label="Table of contents" checked={toc.enabled} onChange={(enabled) => set({ enabled })} />
      {toc.enabled && (
        <>
          <Field label="Heading">
            <TextInput value={toc.heading} onChange={(e) => set({ heading: e.target.value })} />
          </Field>
          <Toggle
            label="List individual poems"
            checked={toc.includePoems}
            onChange={(includePoems) => set({ includePoems })}
          />
          <Toggle label="Leader dots" checked={toc.leaderDots} onChange={(leaderDots) => set({ leaderDots })} />
          <Notice level="info">
            Page numbers are resolved after the book is paginated, so they always match the folio
            printed on the page.
          </Notice>
        </>
      )}
      <div className="border-t border-ink-200 pt-3">
        <Toggle
          label="Index of first lines"
          checked={toc.firstLineIndex}
          onChange={(firstLineIndex) => set({ firstLineIndex })}
        />
        {toc.firstLineIndex && (
          <Field label="Heading">
            <TextInput
              value={toc.firstLineIndexHeading}
              onChange={(e) => set({ firstLineIndexHeading: e.target.value })}
            />
          </Field>
        )}
      </div>
    </>
  );
}

const HEAD_OPTIONS: Array<{ value: RunningHeadContent; label: string }> = [
  { value: 'none', label: 'Nothing' },
  { value: 'bookTitle', label: 'Book title' },
  { value: 'author', label: 'Author' },
  { value: 'sectionTitle', label: 'Part title' },
  { value: 'poemTitle', label: 'Poem title' },
];

export function HeadersPanel() {
  const [project, update] = useProject();
  const headers = project.headers;
  const set = (patch: Partial<typeof headers>) =>
    update((draft) => {
      Object.assign(draft.headers, patch);
    });

  return (
    <>
      <Field label="Left-hand page (verso)">
        <Select value={headers.verso} onChange={(verso) => set({ verso })} options={HEAD_OPTIONS} />
      </Field>
      <Field label="Right-hand page (recto)">
        <Select value={headers.recto} onChange={(recto) => set({ recto })} options={HEAD_OPTIONS} />
      </Field>
      <Field label="Page numbers">
        <Select<PageNumberPosition>
          value={headers.pageNumberPosition}
          onChange={(pageNumberPosition) => set({ pageNumberPosition })}
          options={[
            { value: 'bottomCenter', label: 'Foot, centred' },
            { value: 'bottomOutside', label: 'Foot, outside edge' },
            { value: 'topOutside', label: 'Head, outside edge' },
            { value: 'none', label: 'None' },
          ]}
        />
      </Field>
      <Toggle
        label="Suppress on poem-opening pages"
        checked={headers.suppressOnPoemOpen}
        onChange={(suppressOnPoemOpen) => set({ suppressOnPoemOpen })}
      />
      <Toggle
        label="Suppress on part title pages"
        checked={headers.suppressOnSectionOpen}
        onChange={(suppressOnSectionOpen) => set({ suppressOnSectionOpen })}
      />
      <Notice level="info">
        Blank pages never carry a head or a folio. Running heads sit inside the safe area, so they
        never eat into the KDP margin.
      </Notice>
    </>
  );
}
