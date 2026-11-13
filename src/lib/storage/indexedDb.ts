// IndexedDB blob store for attachment bytes and backup snapshots, keyed by id.
import type { SlagAttachment, BackupSnapshotMeta } from '../../types';
import { logger } from '../logger/logger';

const dbLog = logger.scope('FS');

const DB_NAME = 'slag_v2_blobs';
const ATTACHMENTS_STORE = 'attachments';
const SNAPSHOTS_STORE = 'snapshots';
const DB_VERSION = 2;

/** One connection for the whole session: hundreds of `open` calls on a big folder is the cost. */
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    const opened = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB not supported'));
      }
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(ATTACHMENTS_STORE)) {
          db.createObjectStore(ATTACHMENTS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
          db.createObjectStore(SNAPSHOTS_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // A failure must not stick: the next call retries the open instead of reusing a dead promise.
    opened.catch(() => {
      dbPromise = null;
    });
    dbPromise = opened;
  }
  return dbPromise;
}

export async function idbSaveAttachment(attachment: SlagAttachment): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(ATTACHMENTS_STORE, 'readwrite');
    const store = tx.objectStore(ATTACHMENTS_STORE);
    store.put(attachment);
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch (err) {
    dbLog.warn('[IDB] Failed to save attachment to IndexedDB:', err);
  }
}

export async function idbGetAttachment(id: string): Promise<SlagAttachment | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(ATTACHMENTS_STORE, 'readonly');
    const store = tx.objectStore(ATTACHMENTS_STORE);
    const req = store.get(id);
    return await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result || null);
      req.onerror = rej;
    });
  } catch {
    return null;
  }
}

export async function idbGetAllAttachments(): Promise<SlagAttachment[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(ATTACHMENTS_STORE, 'readonly');
    const store = tx.objectStore(ATTACHMENTS_STORE);
    const req = store.getAll();
    return await new Promise((res, rej) => {
      req.onsuccess = () => res((req.result as SlagAttachment[]) || []);
      req.onerror = rej;
    });
  } catch {
    return [];
  }
}

export interface StoredSnapshotRecord {
  id: string;
  meta: BackupSnapshotMeta;
  data: Uint8Array;
}

export async function idbSaveSnapshot(meta: BackupSnapshotMeta, data: Uint8Array): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(SNAPSHOTS_STORE, 'readwrite');
    const store = tx.objectStore(SNAPSHOTS_STORE);
    store.put({ id: meta.id, meta, data });
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch (err) {
    dbLog.warn('[IDB] Failed to save snapshot:', err);
  }
}

export async function idbGetSnapshots(): Promise<BackupSnapshotMeta[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(SNAPSHOTS_STORE, 'readonly');
    const store = tx.objectStore(SNAPSHOTS_STORE);
    const req = store.getAll();
    const records = await new Promise<StoredSnapshotRecord[]>((res, rej) => {
      req.onsuccess = () => res((req.result as StoredSnapshotRecord[]) || []);
      req.onerror = rej;
    });
    return records
      .map(r => r.meta)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function idbGetSnapshotData(id: string): Promise<Uint8Array | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(SNAPSHOTS_STORE, 'readonly');
    const store = tx.objectStore(SNAPSHOTS_STORE);
    const req = store.get(id);
    const record = await new Promise<StoredSnapshotRecord | null>((res, rej) => {
      req.onsuccess = () => res((req.result as StoredSnapshotRecord) || null);
      req.onerror = rej;
    });
    return record?.data || null;
  } catch {
    return null;
  }
}

export async function idbDeleteSnapshot(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(SNAPSHOTS_STORE, 'readwrite');
    const store = tx.objectStore(SNAPSHOTS_STORE);
    store.delete(id);
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch (err) {
    dbLog.warn('[IDB] Failed to delete snapshot:', err);
  }
}

