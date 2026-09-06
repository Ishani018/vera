import { SAMPLE_POEMS, SAMPLE_POEM_KEY_PREFIX } from '@/src/data/samplePoems';
import { id } from './defaults';
import type { Poem, Project } from './types';

/**
 * Turns the placeholder verses in src/data/samplePoems.ts into project poems.
 * Seeded only into a brand-new project, so the preview is not empty on first
 * run. Every seeded poem carries a `sampleKey`, which is the only thing that
 * marks it as disposable.
 */
export function buildSamplePoems(startOrder = 0): Poem[] {
  return SAMPLE_POEMS.map((sample, i) => ({
    id: id('poem'),
    title: sample.title,
    body: sample.body,
    epigraph: sample.epigraph ?? '',
    dedication: sample.dedication ?? '',
    sectionId: null,
    order: startOrder + i,
    sampleKey: `${SAMPLE_POEM_KEY_PREFIX}${sample.key}`,
  }));
}

export const isSamplePoem = (poem: Poem): boolean => Boolean(poem.sampleKey);

export const countSamplePoems = (project: Project): number =>
  project.poems.filter(isSamplePoem).length;

/** Drops every seeded poem and closes the gaps in the ordering. */
export function withoutSamplePoems(project: Project): Project {
  const poems = project.poems
    .filter((p) => !isSamplePoem(p))
    .map((p, i) => ({ ...p, order: i }));
  return { ...project, poems };
}
