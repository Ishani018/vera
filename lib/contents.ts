import type { ContentItem, Poem, Project, Section } from './types';

export const isPoem = (item: ContentItem): item is Poem => item.kind === 'poem';
export const isSection = (item: ContentItem): item is Section => item.kind === 'section';

/** Every poem, in printed order. */
export const poemsOf = (project: Project): Poem[] => project.contents.filter(isPoem);

/** Every part opener, in printed order. */
export const sectionsOf = (project: Project): Section[] => project.contents.filter(isSection);

export const findPoem = (project: Project, id: string): Poem | undefined =>
  project.contents.find((item): item is Poem => isPoem(item) && item.id === id);

/**
 * The part a poem is printed under: the last one before it in the list.
 *
 * Membership is a consequence of position rather than a field, so there is no
 * such thing as a poem pointing at a part that was deleted, and dragging a poem
 * past a part heading is the whole of moving it between parts.
 */
export function sectionOfPoem(project: Project, poemId: string): Section | null {
  let current: Section | null = null;
  for (const item of project.contents) {
    if (isSection(item)) current = item;
    else if (item.id === poemId) return current;
  }
  return null;
}

/** A project as it was stored before the two arrays became one. */
type LegacyProject = {
  contents?: unknown;
  poems?: Array<Record<string, unknown>>;
  sections?: Array<Record<string, unknown>>;
};

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const num = (value: unknown): number => (typeof value === 'number' ? value : 0);

function asPoem(raw: Record<string, unknown>): Poem {
  const poem: Poem = {
    kind: 'poem',
    id: str(raw.id) || `poem_${Math.random().toString(36).slice(2, 10)}`,
    title: str(raw.title),
    body: str(raw.body),
    epigraph: str(raw.epigraph),
    dedication: str(raw.dedication),
  };
  if (raw.align === 'left' || raw.align === 'center' || raw.align === 'right') {
    poem.align = raw.align;
  }
  if (typeof raw.sampleKey === 'string') poem.sampleKey = raw.sampleKey;
  return poem;
}

function asSection(raw: Record<string, unknown>): Section {
  return {
    kind: 'section',
    id: str(raw.id) || `sec_${Math.random().toString(36).slice(2, 10)}`,
    title: str(raw.title),
    subtitle: str(raw.subtitle),
  };
}

/**
 * Brings any stored project up to the single ordered list.
 *
 * The old reading order was: poems with no part, then each part followed by its
 * own poems, everything sorted by its `order` field. Flattening in exactly that
 * sequence means a book laid out yesterday lays out identically today, which
 * matters more here than a tidier result — the poet has already read the proof.
 *
 * Also used on project files, so it has to survive a hand-edited JSON: anything
 * that is not recognisably a poem or a part is dropped rather than trusted.
 */
export function migrateContents(raw: unknown): ContentItem[] {
  const project = (raw ?? {}) as LegacyProject;

  if (Array.isArray(project.contents)) {
    return project.contents
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => (item.kind === 'section' ? asSection(item) : asPoem(item)));
  }

  const rows = (list: unknown): Array<Record<string, unknown>> =>
    Array.isArray(list)
      ? (list.filter((v) => Boolean(v) && typeof v === 'object') as Array<Record<string, unknown>>)
      : [];

  const byOrder = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    num(a.order) - num(b.order);
  const sections = rows(project.sections).sort(byOrder);
  const poems = rows(project.poems).sort(byOrder);
  const known = new Set(sections.map((s) => str(s.id)));

  const items: ContentItem[] = [];
  // A poem whose part no longer existed used to be typeset before the first
  // part, so that is where it goes now.
  for (const poem of poems) {
    const sectionId = str(poem.sectionId);
    if (!sectionId || !known.has(sectionId)) items.push(asPoem(poem));
  }
  for (const section of sections) {
    items.push(asSection(section));
    for (const poem of poems) {
      if (str(poem.sectionId) === str(section.id)) items.push(asPoem(poem));
    }
  }
  return items;
}

/** True when the value looks like a project this app can open. */
export const looksLikeProject = (raw: unknown): boolean => {
  const project = (raw ?? {}) as LegacyProject;
  return Array.isArray(project.contents) || Array.isArray(project.poems);
};

/**
 * Where a part's run ends: the index just past its last poem.
 *
 * `null` means the run before the first part — the poems a reader meets before
 * any part heading. A part that is not in the list puts things at the very end,
 * which is where an unplaceable poem belongs rather than silently at the front.
 */
export function endOfSection(contents: ContentItem[], sectionId: string | null): number {
  if (sectionId === null) {
    const first = contents.findIndex(isSection);
    return first === -1 ? contents.length : first;
  }
  const start = contents.findIndex((item) => isSection(item) && item.id === sectionId);
  if (start === -1) return contents.length;
  let end = start + 1;
  while (end < contents.length && !isSection(contents[end])) end += 1;
  return end;
}

/** Adds items to the end of a part's run, keeping their own order. */
export function insertIntoSection(
  contents: ContentItem[],
  items: ContentItem[],
  sectionId: string | null,
): void {
  contents.splice(endOfSection(contents, sectionId), 0, ...items);
}

/** Moves one poem to the end of another part's run. */
export function movePoemToSection(
  contents: ContentItem[],
  poemId: string,
  sectionId: string | null,
): void {
  const from = contents.findIndex((item) => isPoem(item) && item.id === poemId);
  if (from === -1) return;
  const [poem] = contents.splice(from, 1);
  contents.splice(endOfSection(contents, sectionId), 0, poem);
}
