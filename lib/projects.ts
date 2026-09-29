import { migrateContents } from './contents';
import { getDb } from './db';
import { listStandaloneDesigns } from './designs';
import { DEFAULT_COLORING_TYPOGRAPHY, createProject, id } from './defaults';
import { DEFAULT_COLORING_TRIM, getTrim, inchesToPt } from './kdp';
import { boardFor, presetById } from './presets';
import { coverLayout } from './render/coverLayout';
import { SCHEMA } from './schema';
import type {
  AnyProject,
  ColoringBook,
  CoverSpec,
  ColoringPage,
  Design,
  LineArtSettings,
  PoetryProject,
} from './types';

/**
 * The studio holds two kinds of book. This module is the only place that knows
 * about both: what kind a stored record is, how to make each one, and how to
 * list them for the landing page.
 */

export const isPoetry = (project: AnyProject): project is PoetryProject =>
  project.kind === 'poetry';

export const isColoring = (project: AnyProject): project is ColoringBook =>
  project.kind === 'coloring';

export const DEFAULT_LINE_ART: LineArtSettings = {
  mode: 'threshold',
  detail: 50,
  thickness: 45,
  cleanup: 40,
  smoothing: 50,
  invert: false,
};

/**
 * Brings a stored record up to date.
 *
 * Everything saved before there was a second kind of book is poetry: that is
 * the only kind that existed, so the absence of the field is not ambiguous.
 * The contents migration runs here too, so one call is enough to open anything
 * ever written to this database.
 */
/**
 * Brings a cover saved in inches up to points.
 *
 * Multiplying by seventy-two is the whole of it; what matters is doing it once.
 * A record carries the shape it is in, so a book opened twice is not converted
 * twice — which would put every sticker five thousand points off the page, and
 * would be unrecoverable because nothing in the numbers says which unit they
 * are already in.
 *
 * Inches are still what the panel shows and what KDP is told. They are just no
 * longer what gets written down: a cover has to hold a board measured in pixels
 * as readily as one measured in inches, and points are exact for both.
 */
function toPoints(record: Partial<AnyProject> & Record<string, unknown>): void {
  if ((record.schema ?? 1) >= 2) return;
  // Rounded, because multiplying by seventy-two is only exact for inches binary
  // can hold exactly: six tenths of an inch comes out as 43.199999999999996.
  // Nothing is lost at a millionth of a point, and stored numbers that read
  // like the numbers someone typed are worth having.
  const pt = (inches: number) => Math.round(inchesToPt(inches) * 1e6) / 1e6;
  const cover = record.cover as CoverSpec | undefined;
  if (cover) {
    for (const box of cover.textBoxes ?? []) {
      box.x = pt(box.x);
      box.y = pt(box.y);
      box.width = pt((box as unknown as { widthIn?: number }).widthIn ?? box.width);
      delete (box as unknown as { widthIn?: number }).widthIn;
    }
    for (const sticker of cover.stickers ?? []) {
      const old = sticker as unknown as { widthIn?: number; heightIn?: number };
      sticker.x = pt(sticker.x);
      sticker.y = pt(sticker.y);
      sticker.width = pt(old.widthIn ?? sticker.width);
      sticker.height = pt(old.heightIn ?? sticker.height);
      delete old.widthIn;
      delete old.heightIn;
    }
  }
  record.schema = SCHEMA;
}

export function migrateProject(raw: unknown): AnyProject {
  const record = (raw ?? {}) as Partial<AnyProject> & Record<string, unknown>;
  // Every book has a cover, and a cover saved before stickers existed has no
  // array for them. One line here rather than a guard at every use.
  if (record.cover && !Array.isArray((record.cover as CoverSpec).stickers)) {
    (record.cover as CoverSpec).stickers = [];
  }
  // Likewise for text written before it could be curved, and pictures stuck on
  // before they could be bent: flat, which is what they have always looked like.
  for (const box of (record.cover as CoverSpec | undefined)?.textBoxes ?? []) {
    box.curve ??= 0;
  }
  for (const sticker of (record.cover as CoverSpec | undefined)?.stickers ?? []) {
    sticker.arc ??= 0;
  }
  toPoints(record);
  // A book saved before it could have a launch kit has an empty one.
  record.designs ??= [];

  if (record.kind === 'coloring') {
    const book = record as unknown as ColoringBook;
    return {
      ...book,
      pages: (Array.isArray(book.pages) ? book.pages : []).map((page) => ({
        ...page,
        // Written before the converter recorded what it had used: treat the
        // stored art as matching, rather than re-running every page on open.
        renderedWith: page.renderedWith ?? (page.lineArtAssetId ? page.settings : null),
        source: page.source ?? 'painting',
        sourceGuessed: page.sourceGuessed ?? true,
        upscaled: page.upscaled ?? 1,
        fit: page.fit ?? 'contain',
        rotate: page.rotate ?? 0,
        settings: { ...DEFAULT_LINE_ART, ...page.settings },
      })),
      coloring: {
        lineArt: { ...DEFAULT_LINE_ART, ...(book.coloring?.lineArt ?? {}) },
        singleSided: book.coloring?.singleSided ?? true,
        titlePage: book.coloring?.titlePage ?? true,
        copyrightPage: book.coloring?.copyrightPage ?? true,
        belongsToPage: book.coloring?.belongsToPage ?? true,
        colorTestPage: book.coloring?.colorTestPage ?? true,
        titleArt: migrateMatterArt(book.coloring?.titleArt),
        belongsArt: migrateMatterArt(book.coloring?.belongsArt),
        colorTestArt: migrateMatterArt(book.coloring?.colorTestArt),
        containsAiImages: book.coloring?.containsAiImages ?? false,
      },
      typography: { ...DEFAULT_COLORING_TYPOGRAPHY, ...(book.typography ?? {}) },
      // Books made before the title was set after the fact are missing most of
      // their details. Filling them in here means an old one opens with a
      // copyright page rather than with a crash.
      meta: { ...createProject({ name: book.name }).meta, ...(book.meta ?? {}) },
    };
  }

  const poetry = record as unknown as PoetryProject & { poems?: unknown; sections?: unknown };
  const migrated: PoetryProject = { ...poetry, kind: 'poetry', contents: migrateContents(poetry) };
  // The two old arrays are dropped rather than carried along. Left in place
  // they would be re-saved on every autosave, ride around in every undo
  // snapshot, and sit there looking authoritative long after `contents` became
  // the only thing anything reads.
  delete (migrated as { poems?: unknown }).poems;
  delete (migrated as { sections?: unknown }).sections;
  return migrated;
}

/**
 * True when the stored record is in an older shape than the app writes.
 *
 * Migration is idempotent, so re-running it costs nothing — but converting in
 * place once means the database stops accumulating shapes that no code reads.
 */
export function needsRewrite(raw: unknown): boolean {
  const record = (raw ?? {}) as Record<string, unknown>;
  return (
    !record.kind ||
    'poems' in record ||
    'sections' in record ||
    ((record.schema as number | undefined) ?? 1) < SCHEMA
  );
}

export function createColoringBook(name = 'Untitled Coloring Book'): ColoringBook {
  // Built from the poetry defaults so the shared half — cover, matter pages,
  // margins — comes from one place and cannot drift between the two kinds.
  //
  // The title is set afterwards rather than passed in: createProject spreads
  // its overrides last, so handing it a partial `meta` replaced the whole of
  // the one it had just built and left a book with no year and no author in
  // it. Nothing read those fields until the copyright page did.
  const base = createProject({ name });
  const now = Date.now();

  return {
    id: id('proj'),
    kind: 'coloring',
    // As for a poetry book: born in the shape the app writes now.
    schema: SCHEMA,
    name,
    createdAt: now,
    updatedAt: now,
    meta: { ...base.meta, title: name },
    // Square is the coloring-book default, and art that runs to the edge is
    // the normal case rather than the exception.
    trim: { trimId: DEFAULT_COLORING_TRIM, bleed: true, paper: 'white' },
    margins: { inside: 0.75, outside: 0.5, top: 0.5, bottom: 0.5 },
    frontMatter: base.frontMatter,
    backMatter: base.backMatter,
    cover: base.cover,
    pages: [],
    coloring: {
      lineArt: { ...DEFAULT_LINE_ART },
      singleSided: true,
      titlePage: true,
      copyrightPage: true,
      belongsToPage: true,
      colorTestPage: true,
      titleArt: null,
      belongsArt: null,
      colorTestArt: null,
      containsAiImages: false,
    },
    typography: { ...DEFAULT_COLORING_TYPOGRAPHY },
  };
}

/** A front-matter drawing saved before a field existed still opens. */
function migrateMatterArt(art: ColoringPage | null | undefined): ColoringPage | null {
  if (!art?.sourceAssetId) return null;
  return {
    ...art,
    renderedWith: art.renderedWith ?? (art.lineArtAssetId ? art.settings : null),
    source: 'lineart',
    sourceGuessed: false,
    upscaled: art.upscaled ?? 1,
    fit: 'contain',
    rotate: 0,
    settings: { ...DEFAULT_LINE_ART, ...art.settings },
  };
}

export type ProjectSummary = {
  id: string;
  kind: AnyProject['kind'];
  name: string;
  updatedAt: number;
  /** Poems, or pictures. */
  items: number;
};

function summarise(project: AnyProject): ProjectSummary {
  return {
    id: project.id,
    kind: project.kind,
    name: project.name || project.meta.title || 'Untitled',
    updatedAt: project.updatedAt,
    items: isColoring(project)
      ? project.pages.length
      : project.contents.filter((item) => item.kind === 'poem').length,
  };
}

/** Everything saved on this computer, most recently worked on first. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.projects.toArray();
  return rows
    .map((row) => summarise(migrateProject(row)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/* --------------------------------------------------------------- the library */

/**
 * A drawn stand-in for something saved, worked out from what it holds.
 *
 * Not a render — there is no renderer on the front page, and starting one for
 * every card would be slow and would need Chromium for the ones that are
 * print boards. It is the real aspect, the real background colour and the real
 * positions of the things on it, which is enough to tell two designs apart at
 * thumbnail size, and cannot claim anything the design does not contain.
 */
export type ThumbItem =
  | {
      kind: 'picture';
      x: number;
      y: number;
      width: number;
      height: number;
      assetId: string;
      rotate: number;
      /** Points, not the 0–0.5 share the sticker stores. */
      radius: number;
      /** How it fills its box, which the designer decides per picture. */
      fit: 'cover' | 'contain';
    }
  | {
      kind: 'text';
      x: number;
      y: number;
      width: number;
      text: string;
      sizePt: number;
      color: string;
      weight: number;
      italic: boolean;
      align: 'left' | 'center' | 'right';
      rotate: number;
      family: string;
      fallback: string;
    };

export type Thumb = {
  /** Points. The ratio sets the shape; the numbers place what is on it. */
  width: number;
  height: number;
  background: string;
  items: ThumbItem[];
};

export type LibraryEntry = {
  /** Unique across every kind, so it can key a list. */
  key: string;
  /** The book it lives in, or null for a design that belongs to none. */
  projectId: string | null;
  /** Set when the entry is a design rather than a book. */
  designId?: string;
  kind: AnyProject['kind'] | 'design';
  /** Which editor an entry inside a book opens in. Null when it is on its own. */
  bookKind: AnyProject['kind'] | null;
  name: string;
  /** What it is, in the words the interface uses elsewhere. */
  type: string;
  at: number;
  thumb: Thumb;
};

/** The part of a board a thumbnail shows, in board points. */
type Region = { x: number; y: number; width: number; height: number };

/**
 * What is on a board, placed inside the part of it being shown.
 *
 * The same arithmetic the designer uses, because it is the same question:
 * where does each thing sit on this rectangle. A picture is carried by the id
 * of its bytes rather than the bytes, so the card fetches it once and the
 * list stays cheap to build.
 */
function itemsOn(
  cover: CoverSpec,
  panels: Record<string, { x: number; y: number; width: number; height: number }>,
  board: { width: number; height: number; bleed: number },
  region: Region,
): ThumbItem[] {
  const items: ThumbItem[] = [];
  const front = panels.front;

  if (cover.frontImage?.assetId) {
    // Exactly the designer's rule: a picture either fills the whole board or
    // sits on the front panel and bleeds off its three outer edges.
    const spans = cover.imageSpansWrap || !front;
    items.push({
      kind: 'picture',
      x: (spans ? 0 : front.x - board.bleed) - region.x,
      y: -region.y,
      width: spans ? board.width : front.width + board.bleed,
      height: board.height,
      assetId: cover.frontImage.assetId,
      rotate: 0,
      radius: 0,
      fit: cover.frontImage.fit,
    });
  }

  for (const sticker of cover.stickers ?? []) {
    items.push({
      kind: 'picture',
      x: sticker.x - region.x,
      y: sticker.y - region.y,
      width: sticker.width,
      height: sticker.height,
      assetId: sticker.assetId,
      rotate: sticker.rotate ?? 0,
      // A sticker is fitted inside its box in the designer, never cropped.
      fit: 'contain',
      // Stored as a share of the shorter side, which is what a corner radius
      // in points has to be worked out from.
      radius: (sticker.cornerRadius ?? 0) * Math.min(sticker.width, sticker.height),
    });
  }

  for (const box of cover.textBoxes ?? []) {
    const panel = panels[box.panel] ?? panels.board;
    if (!panel) continue;
    items.push({
      kind: 'text',
      x: panel.x + box.x - region.x,
      y: panel.y + box.y - region.y,
      width: box.width,
      // Long enough to fill a thumbnail, short enough not to carry a whole
      // poem around in a list.
      text: (box.text ?? '').slice(0, 120),
      sizePt: box.font.sizePt,
      color: box.font.color,
      weight: box.font.weight,
      italic: box.font.italic,
      align: box.font.align,
      rotate: box.panel === 'spine' ? 90 + box.rotate : box.rotate,
      family: box.font.family,
      fallback: box.font.fallback,
    });
  }

  // Anything entirely outside the part being shown is left out rather than
  // drawn and clipped: a back-cover blurb is not part of a book's face.
  return items.filter(
    (item) =>
      item.x < region.width &&
      item.y < region.height &&
      item.x + (item.kind === 'picture' ? item.width : item.width) > 0 &&
      item.y + (item.kind === 'picture' ? item.height : item.sizePt * 1.4) > 0,
  );
}

/**
 * A book, shown as its front cover.
 *
 * The front is what a book looks like; the back and the spine are not how
 * anyone recognises one on a shelf. The spine's width depends on the page
 * count, which nothing here knows without paginating the whole book, so a
 * nominal one is used: it moves the front panel by a fraction of a percent
 * of the board, which is less than one pixel at this size.
 */
const NOMINAL_PAGES = 24;

function bookThumb(project: AnyProject): Thumb {
  // A record old enough to be missing its trim still gets a card rather than
  // taking the whole front page down with it.
  const trim = getTrim(project.trim?.trimId ?? '');
  const cover = project.cover;
  if (!cover) {
    return {
      width: inchesToPt(trim.width),
      height: inchesToPt(trim.height),
      background: '#f4efe4',
      items: [],
    };
  }
  const layout = coverLayout(project, NOMINAL_PAGES);
  const front = layout.panels.front;
  const region: Region = {
    x: front.x - layout.bleed,
    y: 0,
    width: front.width + layout.bleed,
    height: layout.height,
  };
  return {
    width: region.width,
    height: region.height,
    background: cover.backgroundColor ?? '#f4efe4',
    items: itemsOn(cover, layout.panels, layout, region),
  };
}

function designThumb(design: Design): Thumb {
  const preset = presetById(design.presetId);
  const board = preset ? boardFor(preset) : null;
  if (!board) return { width: 100, height: 100, background: '#f4efe4', items: [] };
  const region: Region = { x: 0, y: 0, width: board.width, height: board.height };
  return {
    width: board.width,
    height: board.height,
    background: design.cover.backgroundColor ?? '#f4efe4',
    items: itemsOn(design.cover, board.panels, board, region),
  };
}

/**
 * Everything saved on this computer, whatever kind it is, newest first.
 *
 * Books and the designs inside them come back in one list because that is how
 * they are looked for: someone wants the thing they were working on, not the
 * category it belongs to.
 */
export async function listLibrary(): Promise<LibraryEntry[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.projects.toArray();
  const entries: LibraryEntry[] = [];
  for (const row of rows) {
    const project = migrateProject(row);
    const summary = summarise(project);
    entries.push({
      key: project.id,
      projectId: project.id,
      kind: project.kind,
      bookKind: project.kind,
      name: summary.name,
      type: `${isColoring(project) ? 'Colouring book' : 'Poetry book'} · ${summary.items} ${
        isColoring(project) ? 'picture' : 'poem'
      }${summary.items === 1 ? '' : 's'}`,
      at: project.updatedAt,
      thumb: bookThumb(project),
    });
    for (const design of project.designs ?? []) {
      entries.push({
        key: `${project.id}:${design.id}`,
        projectId: project.id,
        designId: design.id,
        kind: 'design',
        bookKind: project.kind,
        name: design.name,
        type: `${presetById(design.presetId)?.name ?? 'Design'} · in ${summary.name}`,
        at: design.updatedAt ?? design.createdAt,
        thumb: designThumb(design),
      });
    }
  }

  // And the ones that belong to nobody, listed beside the rest rather than
  // under a heading of their own: someone looking for the post they made is
  // not thinking about where it is stored.
  for (const design of await listStandaloneDesigns()) {
    entries.push({
      key: design.id,
      projectId: null,
      designId: design.id,
      kind: 'design',
      bookKind: null,
      name: design.name,
      type: presetById(design.presetId)?.name ?? 'Design',
      at: design.updatedAt,
      thumb: designThumb(design),
    });
  }

  return entries.sort((a, b) => b.at - a.at);
}

/**
 * Renames what the library calls a book, and nothing else.
 *
 * Deliberately not `meta.title`: that one is printed on the title page and set
 * on the cover, so renaming a card here would quietly change a book's
 * exported pages. The editor still has the field for that.
 */
export async function renameProject(id: string, name: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const row = await db.projects.get(id);
  if (!row) return;
  await db.projects.put({ ...migrateProject(row), name, updatedAt: Date.now() });
}

export async function deleteProject(id: string): Promise<void> {
  const db = getDb();
  await db?.projects.delete(id);
}

export async function renameDesign(
  projectId: string,
  designId: string,
  name: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  const row = await db.projects.get(projectId);
  if (!row) return;
  const project = migrateProject(row);
  const design = project.designs?.find((d) => d.id === designId);
  if (!design) return;
  design.name = name;
  await db.projects.put({ ...project, updatedAt: Date.now() });
}

export async function deleteDesign(projectId: string, designId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const row = await db.projects.get(projectId);
  if (!row) return;
  const project = migrateProject(row);
  const designs = (project.designs ?? []).filter((d) => d.id !== designId);
  await db.projects.put({ ...project, designs, updatedAt: Date.now() });
}
