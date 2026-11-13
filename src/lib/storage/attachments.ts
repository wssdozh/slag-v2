// Stores attachment bytes on disk and in IndexedDB, handing the UI blob URLs instead.
import type { SlagAttachment, SlagItem } from '../../types';
import { logger } from '../logger/logger';
import { isTauri } from '@tauri-apps/api/core';
import {
  readDir,
  readFile,
  writeFile,
  mkdir,
  exists,
  BaseDirectory,
} from '@tauri-apps/plugin-fs';
import { idbSaveAttachment, idbGetAttachment } from './indexedDb';
import { blobToDataUrl } from '../media/blobToDataUrl';
import { isSafeVaultRelativePath } from '../vault/safePath';

/**
 * The bytes of attachments, and only them.
 *
 * A note keeps ids and metadata; pictures live in `.attachments/` on disk and in
 * IndexedDB, and the UI gets a blob URL. This changes when the way we store media
 * changes — not when a note is saved, renamed or synced.
 */

const fsLog = logger.scope('FS');
const mediaLog = logger.scope('MEDIA');

export class AttachmentStore {
  private urlCache: Map<string, string> = new Map();
  /** One listing of `.attachments/`, used only when an attachment's own path misses. */
  private nameIndex: string[] | null = null;
  /**
   * Bytes for the current session, keyed by id. The note itself only keeps metadata:
   * a data URL in `localStorage` is one photo against a five-megabyte quota.
   */
  private dataUrlCache: Map<string, string> = new Map();
  private persistedIds: Set<string> = new Set();
  /**
   * IndexedDB writes, one at a time: two puts of the same id land in call order, and the queue
   * gives a caller something to await (`flush`) when the page is about to go away.
   */
  private writeQueue: Promise<void> = Promise.resolve();

  private readonly attachmentsDir: () => string;

  constructor(attachmentsDir: () => string) {
    this.attachmentsDir = attachmentsDir;
  }

  private basename(att: SlagAttachment): string {
    const parts = att.relativePath.split(/[\\/]/);
    const candidate = parts[parts.length - 1] || '';
    return isSafeVaultRelativePath(candidate) ? candidate : (isSafeVaultRelativePath(att.id) ? att.id : 'attachment');
  }

  /**
   * File name inside `.attachments/`. The id in front of it is bookkeeping; when it does not
   * match a note (a re-saved attachment gets a fresh id) the picture is still in there by name.
   * ponytail: trailing-name match, so two different pictures sharing a name can swap. Upgrade:
   * write `relativePath` from the id at persist time and never regenerate an id after that.
   */
  private async pathFor(id: string, relativePath: string): Promise<string | undefined> {
    const parts = relativePath.split(/[\\/]/);
    const raw = parts[parts.length - 1] || '';
    const basename = isSafeVaultRelativePath(raw) ? raw : (isSafeVaultRelativePath(id) ? id : 'attachment');
    const dir = this.attachmentsDir();
    if (await exists(`${dir}/${basename}`, { baseDir: BaseDirectory.AppData })) return `${dir}/${basename}`;

    try {
      if (!this.nameIndex) {
        const entries = await readDir(dir, { baseDir: BaseDirectory.AppData });
        this.nameIndex = entries.filter((entry) => entry.isFile).map((entry) => entry.name);
      }
      const name = basename.replace(/^att_[a-z0-9]+_/i, '');
      const match = this.nameIndex.find((file) => file === name || file.endsWith(`_${name}`));
      return match ? `${dir}/${match}` : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Playable url for an attachment. Lives only in memory: a blob: URL inside
   * the item would be dead after restart and would leak into localStorage/sync.
   */
  public async getUrl(id: string, relativePath: string, mimeType?: string): Promise<string | undefined> {
    const cached = this.urlCache.get(id);
    if (cached) return cached;

    // Disk first: a blob URL streams and keeps five megabytes out of a JS string. A file that
    // only lives in IndexedDB still plays, as the base64 it was stored as.
    if (isTauri()) {
      try {
        const path = await this.pathFor(id, relativePath);
        if (path) {
          const bytes = await readFile(path, { baseDir: BaseDirectory.AppData });
          const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeType || 'application/octet-stream' }));
          this.urlCache.set(id, url);
          mediaLog.debug(`Attachment url from disk: ${path.split('/').pop()} (${Math.round(bytes.length / 1024)} KB)`);
          return url;
        }
      } catch (err) {
        mediaLog.warn(`Failed to read attachment ${id} from disk`, err);
      }
    }

    const stored = await idbGetAttachment(id);
    if (stored?.dataUrl) {
      this.urlCache.set(id, stored.dataUrl);
      mediaLog.debug(`Attachment url from IndexedDB: ${id} (${Math.round(stored.dataUrl.length / 1024)} KB base64)`);
      return stored.dataUrl;
    }
    // The answer that used to be silent: nothing on this device can play this attachment.
    mediaLog.warn(`Attachment bytes are not on this device: ${relativePath} (${mimeType || 'unknown mime'})`);
    return undefined;
  }

  /**
   * Bytes as a data URL, for shipping an attachment through sync. Reuses the resolver above so
   * there is one answer to "where are this attachment's bytes" instead of two.
   */
  public async getDataUrl(att: SlagAttachment): Promise<string | undefined> {
    const url = await this.getUrl(att.id, att.relativePath, att.mimeType);
    if (!url) return undefined;
    if (url.startsWith('data:')) {
      mediaLog.debug(`Attachment ready to sync as base64: ${att.name}`);
      return url;
    }
    try {
      const blob = await (await fetch(url)).blob();
      const dataUrl = await blobToDataUrl(blob);
      mediaLog.debug(`Attachment ready to sync: ${att.name} (${Math.round(dataUrl.length / 1024)} KB base64)`);
      return dataUrl;
    } catch (err) {
      mediaLog.warn(`Failed to read attachment bytes ${att.id}`, err);
      return undefined;
    }
  }

  /** Persist base64 bytes to .attachments/ once; markdown keeps only metadata. */
  public async persistAll(item: SlagItem): Promise<void> {
    for (const att of item.attachments || []) await this.persistOne(att);
  }

  private async persistOne(att: SlagAttachment): Promise<void> {
    if (!isTauri()) return;
    if (!att.dataUrl?.startsWith('data:')) return;
    if (this.persistedIds.has(att.id)) return;

    try {
      const dir = this.attachmentsDir();
      await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });
      const path = `${dir}/${this.basename(att)}`;
      if (await exists(path, { baseDir: BaseDirectory.AppData })) {
        this.persistedIds.add(att.id);
        return;
      }

      const response = await fetch(att.dataUrl);
      const buffer = await response.arrayBuffer();
      await writeFile(path, new Uint8Array(buffer), { baseDir: BaseDirectory.AppData });
      this.persistedIds.add(att.id);
    } catch (err) {
      fsLog.warn(`Failed to persist attachment ${att.id}`, err);
    }
  }

  /**
   * Bytes that arrived through sync. Not `save`: its session cache would hold every
   * received file as base64, and on a phone that is a hundred megabytes of string per album.
   */
  public async importSynced(attachment: SlagAttachment, dataUrl: string): Promise<void> {
    this.urlCache.delete(attachment.id);
    this.nameIndex = null;
    await this.enqueueWrite({ ...attachment, dataUrl });
    await this.persistOne({ ...attachment, dataUrl });
    mediaLog.info(
      `Imported synced attachment "${attachment.name}" (${Math.round(attachment.size / 1024)} KB, ${attachment.mimeType})`,
    );
  }

  /** A note keeps attachment ids; the bytes belong in IndexedDB, once per attachment. */
  public persistNew(items: SlagItem[]): void {
    for (const item of items) {
      for (const att of item.attachments || []) {
        if (att.dataUrl && !this.dataUrlCache.has(att.id)) void this.save(att);
      }
    }
  }

  public save(attachment: SlagAttachment): Promise<void> {
    // Bytes go to IndexedDB; the note keeps only the id. `localStorage` would count every photo
    // against the same five megabytes the whole note index lives in.
    if (attachment.dataUrl) this.dataUrlCache.set(attachment.id, attachment.dataUrl);
    const write = this.enqueueWrite(attachment);
    fsLog.info(
      `Saved attachment "${attachment.name}" (${attachment.type}, ${Math.round(attachment.size / 1024)} KB)`,
    );
    return write;
  }

  /**
   * A save is not something a caller has to await: it lands in the queue, one write after
   * another, and a failure is logged instead of taking the rest of the queue down with it.
   */
  private enqueueWrite(attachment: SlagAttachment): Promise<void> {
    const write = this.writeQueue
      .then(() => idbSaveAttachment(attachment))
      .catch((err) => {
        fsLog.warn(`Failed to write attachment ${attachment.id} to IndexedDB`, err);
      });
    this.writeQueue = write;
    return write;
  }

  /** Resolves once every write queued so far has reached IndexedDB. */
  public flush(): Promise<void> {
    return this.writeQueue;
  }

  /** Put back the bytes of the session's own attachments, so the UI sees them as it always has. */
  public hydrate(items: SlagItem[]): SlagItem[] {
    if (this.dataUrlCache.size === 0) return items;
    return items.map((item) => (
      item.attachments?.some((att) => !att.dataUrl)
        ? {
          ...item,
          attachments: item.attachments.map((att) => (
            att.dataUrl ? att : { ...att, dataUrl: this.dataUrlCache.get(att.id) }
          )),
        }
        : item
    ));
  }
}
