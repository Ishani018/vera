import { SAMPLE_POEMS, SAMPLE_POEM_KEY_PREFIX } from '@/src/data/samplePoems';
import { isPoem, poemsOf } from './contents';
import { id } from './defaults';
import type { ContentItem, Poem, Project } from './types';

/**
 * Turns the placeholder verses in src/data/samplePoems.ts into project poems.
 * Seeded only into a brand-new project, so the preview is not empty on first
 * run. Every seeded poem carries a `sampleKey`, which is the only thing that
 * marks it as disposable.
 */
export function buildSamplePoems(): Poem[] {
  return SAMPLE_POEMS.map((sample) => ({
    kind: 'poem',
    id: id('poem'),
    title: sample.title,
    body: sample.body,
    epigraph: sample.epigraph ?? '',
    dedication: sample.dedication ?? '',
    sampleKey: `${SAMPLE_POEM_KEY_PREFIX}${sample.key}`,
  }));
}

export const isSamplePoem = (poem: Poem): boolean => Boolean(poem.sampleKey);

export const countSamplePoems = (project: Project): number =>
  poemsOf(project).filter(isSamplePoem).length;

/** Drops every seeded poem, leaving parts and real work where they were. */
export function withoutSamplePoems(project: Project): Project {
  const contents: ContentItem[] = project.contents.filter(
    (item) => !(isPoem(item) && isSamplePoem(item)),
  );
  return { ...project, contents };
}
