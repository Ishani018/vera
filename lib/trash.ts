import { forgetAssetUrl } from './assets';
import { getDb } from './db';
import { designAssets, projectAssets, stickerAssets, templateAssets } from './assetRefs';
import { daysLeft, isDeleted, TRASH_DAYS, DAY_MS, withoutMark } from './deleted';
import { migrateProject } from './projects';
import { migrateDesign } from './designs';
import type { CoverTemplate, Design, LibrarySticker } from './types';

/**
 * The trash itself: what is in it, putting things in, taking them out again,
 * and letting go of the pictures nothing wants any more.
 *
 * What "deleted" means is `lib/deleted.ts`, which knows nothing about the
 * database — so the lists that have to respect it can do so without depending
 * on this file, and this file can depend on them.
 */

/* ------------------------------------------------------------------ rows */

export type TrashKind = 'book' | 'design' | 'sticker' | 'template';

export type TrashEntry = {
  /** Unique across kinds, so it can key a list. */
  key: string;
  kind: TrashKind;
  id: string;
  /** Set when the entry is a design that lives inside a book. */
  projectId?: string;
  name: string;
  /** What it is, in the words the rest of the interface uses. */
  what: string;
  deletedAt: number;
  daysLeft: number;
  /** Bytes that would come back if this alone were thrown away. */
  bytes: number;
};

/**
 * What is in the trash, newest first, and what each one is costing.
 *
 * The size is the part worth being careful about. A picture can be referred to
 * by several things at once, so the bytes an entry is "costing" are only those
 * of the assets **nothing else refers to** — throwing away one of two books
 * that share a photograph frees nothing, and saying otherwise would be a
 * number that never comes true.
 */
export async function listTrash(): Promise<TrashEntry[]> {
  const db = getDb();
  if (!db) return [];

  const [projectRows, designRows, stickerRows, templateRows, assetRows] = await Promise.all([
    db.projects.toArray(),
    db.designs.toArray(),
    db.stickers.toArray(),
    db.coverTemplates.toArray(),
    db.assets.toArray(),
  ]);

  const projects = projectRows.map(migrateProject);
  const designs = designRows.map(migrateDesign);
  const sizes = new Map(assetRows.map((asset) => [asset.id, asset.bytes ?? 0]));

  /** How many of the things still in the database refer to each asset. */
  const refs = new Map<string, number>();
  const count = (ids: string[]) => {
    for (const id of ids) refs.set(id, (refs.get(id) ?? 0) + 1);
  };
  for (const project of projects) count(projectAssets(project));
  for (const design of designs) count(designAssets(design));
  for (const sticker of stickerRows) count(stickerAssets(sticker));
  for (const template of templateRows) count(templateAssets(template));

  /** The bytes this one holds alone. */
  const soleBytes = (ids: string[]): number => {
    let total = 0;
    for (const id of new Set(ids)) {
      if ((refs.get(id) ?? 0) <= 1) total += sizes.get(id) ?? 0;
    }
    return total;
  };

  const now = Date.now();
  const entries: TrashEntry[] = [];

  for (const project of projects) {
    if (isDeleted(project)) {
      entries.push({
        key: project.id,
        kind: 'book',
        id: project.id,
        name: project.name || 'Untitled',
        what: project.kind === 'coloring' ? 'Colouring book' : 'Poetry book',
        deletedAt: project.deletedAt!,
        daysLeft: daysLeft(project, now),
        bytes: soleBytes(projectAssets(project)),
      });
      // A deleted book takes its launch kit with it; those designs are not
      // listed separately or they would be restorable on their own, into a
      // book that is not there.
      continue;
    }
    for (const design of project.designs ?? []) {
      if (!isDeleted(design)) continue;
      entries.push({
        key: `${project.id}:${design.id}`,
        kind: 'design',
        id: design.id,
        projectId: project.id,
        name: design.name || 'Untitled',
        what: `Design in ${project.name || 'Untitled'}`,
        deletedAt: design.deletedAt!,
        daysLeft: daysLeft(design, now),
        bytes: soleBytes(designAssets(design)),
      });
    }
  }

  for (const design of designs) {
    if (!isDeleted(design)) continue;
    entries.push({
      key: design.id,
      kind: 'design',
      id: design.id,
      name: design.name || 'Untitled',
      what: 'Design',
      deletedAt: design.deletedAt!,
      daysLeft: daysLeft(design, now),
      bytes: soleBytes(designAssets(design)),
    });
  }

  for (const sticker of stickerRows) {
    if (!isDeleted(sticker)) continue;
    entries.push({
      key: sticker.id,
      kind: 'sticker',
      id: sticker.id,
      name: sticker.name || 'Sticker',
      what: 'Sticker',
      deletedAt: sticker.deletedAt!,
      daysLeft: daysLeft(sticker, now),
      bytes: soleBytes(stickerAssets(sticker)),
    });
  }

  for (const template of templateRows) {
    if (!isDeleted(template)) continue;
    entries.push({
      key: template.id,
      kind: 'template',
      id: template.id,
      name: template.name || 'Cover template',
      what: 'Cover template',
      deletedAt: template.deletedAt!,
      daysLeft: daysLeft(template, now),
      bytes: soleBytes(templateAssets(template)),
    });
  }

  return entries.sort((a, b) => b.deletedAt - a.deletedAt);
}

/* --------------------------------------------------------------- putting */

const stamp = () => Date.now();

export async function trashProject(id: string): Promise<void> {
  const db = getDb();
  const row = await db?.projects.get(id);
  if (!db || !row) return;
  await db.projects.put({ ...row, deletedAt: stamp() });
}

export async function trashStandaloneDesign(id: string): Promise<void> {
  const db = getDb();
  const row = await db?.designs.get(id);
  if (!db || !row) return;
  await db.designs.put({ ...row, deletedAt: stamp() });
}

export async function trashDesignInProject(projectId: string, designId: string): Promise<void> {
  const db = getDb();
  const row = await db?.projects.get(projectId);
  if (!db || !row) return;
  const project = migrateProject(row);
  const designs = (project.designs ?? []).map((design: Design) =>
    design.id === designId ? { ...design, deletedAt: stamp() } : design,
  );
  await db.projects.put({ ...project, designs, updatedAt: Date.now() });
}

export async function trashSticker(id: string): Promise<void> {
  const db = getDb();
  const row = await db?.stickers.get(id);
  if (!db || !row) return;
  await db.stickers.put({ ...row, deletedAt: stamp() });
}

export async function trashTemplate(id: string): Promise<void> {
  const db = getDb();
  const row = await db?.coverTemplates.get(id);
  if (!db || !row) return;
  await db.coverTemplates.put({ ...row, deletedAt: stamp() });
}

/* -------------------------------------------------------------- taking out */

/** Puts one back exactly as it was. The mark is removed and nothing else. */
export async function restore(entry: Pick<TrashEntry, 'kind' | 'id' | 'projectId'>): Promise<void> {
  const db = getDb();
  if (!db) return;

  if (entry.kind === 'book') {
    const row = await db.projects.get(entry.id);
    if (row) await db.projects.put(withoutMark(row));
    return;
  }
  if (entry.kind === 'sticker') {
    const row = await db.stickers.get(entry.id);
    if (row) await db.stickers.put(withoutMark(row));
    return;
  }
  if (entry.kind === 'template') {
    const row = await db.coverTemplates.get(entry.id);
    if (row) await db.coverTemplates.put(withoutMark(row));
    return;
  }
  if (entry.projectId) {
    const row = await db.projects.get(entry.projectId);
    if (!row) return;
    const project = migrateProject(row);
    const designs = (project.designs ?? []).map((design: Design) =>
      design.id === entry.id ? withoutMark(design) : design,
    );
    await db.projects.put({ ...project, designs, updatedAt: Date.now() });
    return;
  }
  const row = await db.designs.get(entry.id);
  if (row) await db.designs.put(withoutMark(row));
}

/**
 * Throws one away for good, and lets go of any pictures nothing else wants.
 *
 * The sweep is over what is left *after* the row has gone, and it counts both
 * live things and things still in the trash — a photograph shared with a book
 * that is only in the trash has to survive, or restoring that book later would
 * give back a cover with a hole in it.
 */
export async function purge(entry: Pick<TrashEntry, 'kind' | 'id' | 'projectId'>): Promise<void> {
  const db = getDb();
  if (!db) return;

  if (entry.kind === 'book') await db.projects.delete(entry.id);
  else if (entry.kind === 'sticker') await db.stickers.delete(entry.id);
  else if (entry.kind === 'template') await db.coverTemplates.delete(entry.id);
  else if (entry.projectId) {
    const row = await db.projects.get(entry.projectId);
    if (row) {
      const project = migrateProject(row);
      const designs = (project.designs ?? []).filter((d: Design) => d.id !== entry.id);
      await db.projects.put({ ...project, designs, updatedAt: Date.now() });
    }
  } else await db.designs.delete(entry.id);

  await sweepAssets();
}

/** Throws away everything in the trash. */
export async function emptyTrash(): Promise<number> {
  const entries = await listTrash();
  for (const entry of entries) await purge(entry);
  return entries.length;
}

/**
 * Throws away whatever has been in the trash longer than thirty days.
 *
 * Run when the front page opens, which is the only moment this app reliably
 * gets. Nothing depends on it being punctual — a thing that outstays its
 * welcome by a week costs some disk and no correctness.
 */
export async function purgeExpired(now = Date.now()): Promise<number> {
  const entries = await listTrash();
  const due = entries.filter((entry) => now - entry.deletedAt >= TRASH_DAYS * DAY_MS);
  for (const entry of due) await purge(entry);
  return due.length;
}

/**
 * Deletes every asset nothing in the database refers to any more.
 *
 * Deliberately written as "what is still referenced" rather than "what this
 * deletion released": the second needs the graph to have been right, and the
 * first only needs the graph as it is now.
 */
async function sweepAssets(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const [projectRows, designRows, stickerRows, templateRows] = await Promise.all([
    db.projects.toArray(),
    db.designs.toArray(),
    db.stickers.toArray(),
    db.coverTemplates.toArray(),
  ]);

  const used = new Set<string>([
    ...projectRows.map(migrateProject).flatMap(projectAssets),
    ...designRows.map(migrateDesign).flatMap(designAssets),
    ...stickerRows.flatMap(stickerAssets),
    ...templateRows.flatMap((template: CoverTemplate) => templateAssets(template)),
  ]);

  const all = await db.assets.toArray();
  const orphans = all.filter((asset) => !used.has(asset.id));
  for (const orphan of orphans) {
    forgetAssetUrl(orphan.id);
    await db.assets.delete(orphan.id);
  }
  return orphans.length;
}

