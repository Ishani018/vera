import Dexie, { type Table } from 'dexie';
import type { Project } from './types';

/**
 * Everything lives in the browser. There is no server-side store: the export
 * routes are stateless and receive the project in the request body.
 */
export class VersecraftDatabase extends Dexie {
  projects!: Table<Project, string>;

  constructor() {
    super('versecraft');
    this.version(1).stores({ projects: 'id, updatedAt, name' });
  }
}

let instance: VersecraftDatabase | null = null;

/** Returns null during SSR — IndexedDB does not exist on the server. */
export function getDb(): VersecraftDatabase | null {
  if (typeof window === 'undefined') return null;
  if (!instance) instance = new VersecraftDatabase();
  return instance;
}

export const ACTIVE_PROJECT_KEY = 'versecraft:activeProjectId';
