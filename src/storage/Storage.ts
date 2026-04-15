import { openDB, type IDBPDatabase } from 'idb';
import type { Pattern, ProjectState, SampleMeta } from '../types';

/**
 * IndexedDB-backed persistence.
 *
 * Stores:
 *   - samples_meta : SampleMeta keyed by id
 *   - samples_pcm  : raw Float32Array PCM keyed by id
 *   - patterns     : Pattern keyed by id
 *   - kv           : misc key/value (project state, settings)
 *
 * iPhone Safari notes:
 *  - Safari may evict storage under pressure or after long inactivity.
 *    The UI surfaces a warning on first run.
 *  - We store PCM as Float32Array directly; structured clone handles it.
 */

const DB_NAME = 'smplr-db';
const DB_VERSION = 1;

export const STORE = {
  SAMPLES_META: 'samples_meta',
  SAMPLES_PCM: 'samples_pcm',
  PATTERNS: 'patterns',
  KV: 'kv',
} as const;

const KV_KEY = {
  PROJECT: 'project',
} as const;

let dbp: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE.SAMPLES_META))
          d.createObjectStore(STORE.SAMPLES_META, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STORE.SAMPLES_PCM))
          d.createObjectStore(STORE.SAMPLES_PCM); // key supplied separately
        if (!d.objectStoreNames.contains(STORE.PATTERNS))
          d.createObjectStore(STORE.PATTERNS, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STORE.KV)) d.createObjectStore(STORE.KV);
      },
    });
  }
  return dbp;
}

export const Storage = {
  async putSample(meta: SampleMeta, pcm: Float32Array): Promise<void> {
    const d = await db();
    const tx = d.transaction([STORE.SAMPLES_META, STORE.SAMPLES_PCM], 'readwrite');
    await tx.objectStore(STORE.SAMPLES_META).put(meta);
    // Store the underlying ArrayBuffer to maximize cross-engine compatibility.
    await tx.objectStore(STORE.SAMPLES_PCM).put(pcm.buffer.slice(0), meta.id);
    await tx.done;
  },

  async getAllSampleMeta(): Promise<SampleMeta[]> {
    const d = await db();
    return (await d.getAll(STORE.SAMPLES_META)) as SampleMeta[];
  },

  async getSampleMeta(id: string): Promise<SampleMeta | undefined> {
    const d = await db();
    return (await d.get(STORE.SAMPLES_META, id)) as SampleMeta | undefined;
  },

  async getSamplePCM(id: string): Promise<Float32Array | null> {
    const d = await db();
    const buf = (await d.get(STORE.SAMPLES_PCM, id)) as ArrayBuffer | undefined;
    return buf ? new Float32Array(buf) : null;
  },

  async deleteSample(id: string): Promise<void> {
    const d = await db();
    const tx = d.transaction([STORE.SAMPLES_META, STORE.SAMPLES_PCM], 'readwrite');
    await tx.objectStore(STORE.SAMPLES_META).delete(id);
    await tx.objectStore(STORE.SAMPLES_PCM).delete(id);
    await tx.done;
  },

  async updateSampleMeta(meta: SampleMeta): Promise<void> {
    const d = await db();
    await d.put(STORE.SAMPLES_META, meta);
  },

  async putPattern(p: Pattern): Promise<void> {
    const d = await db();
    await d.put(STORE.PATTERNS, p);
  },

  async getAllPatterns(): Promise<Pattern[]> {
    const d = await db();
    return (await d.getAll(STORE.PATTERNS)) as Pattern[];
  },

  async deletePattern(id: string): Promise<void> {
    const d = await db();
    await d.delete(STORE.PATTERNS, id);
  },

  async saveProject(project: ProjectState): Promise<void> {
    const d = await db();
    await d.put(STORE.KV, project, KV_KEY.PROJECT);
  },

  async loadProject(): Promise<ProjectState | null> {
    const d = await db();
    return ((await d.get(STORE.KV, KV_KEY.PROJECT)) as ProjectState | undefined) ?? null;
  },

  /** Best-effort persistent storage request — survives Safari eviction better. */
  async requestPersistence(): Promise<boolean> {
    if (navigator.storage?.persist) {
      try {
        return await navigator.storage.persist();
      } catch {
        return false;
      }
    }
    return false;
  },
};
