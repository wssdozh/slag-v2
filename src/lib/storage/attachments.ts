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
import { bytesToBase64, dataUrlToBytes } from '../media/byteCodec';
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
  /** Attachments already reported as byte-less: the feed re-renders the same broken file on every paint. */
  private missingBytes: Set<string> = new Set();
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
   * A name alone is not identity though: pasted photos are all `image.webp`, so a guess is only
   * taken when it is the single candidate. Two same-named files and no id match means the bytes
   * are simply not here yet — showing a stranger's photo is worse than showing nothing.
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
      const candidates = this.nameIndex.filter((file) => file === name || file.endsWith(`_${name}`));
      const sameId = candidates.find((file) => file.startsWith(`att_${id}_`) || file === id);
      if (sameId) return `${dir}/${sameId}`;
      return candidates.length === 1 ? `${dir}/${candidates[0]}` : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * The bytes of one attachment, wherever this build keeps them: `.attachments/` on desktop,
   * IndexedDB in the browser. Decoded in place — asking the webview for a blob: URL is a CSP
   * error in WebKitGTK, so nothing here goes back through the network stack.
   */
  private async loadBytes(id: string, relativePath: string): Promise<{ bytes: Uint8Array; mimeType: string } | undefined> {
    if (isTauri()) {
      try {
        const path = await this.pathFor(id, relativePath);
        if (path) {
          const bytes = await readFile(path, { baseDir: BaseDirectory.AppData });
          mediaLog.debug(`Attachment bytes from disk: ${path.split('/').pop()} (${Math.round(bytes.length / 1024)} KB)`);
          return { bytes, mimeType: '' };
        }
      } catch (err) {
        mediaLog.warn(`Failed to read attachment ${id} from disk`, err);
      }
    }

    const stored = await idbGetAttachment(id);
    if (stored?.dataUrl) {
      const decoded = dataUrlToBytes(stored.dataUrl);
      if (decoded) {
        mediaLog.debug(`Attachment bytes from IndexedDB: ${id} (${Math.round(decoded.bytes.length / 1024)} KB)`);
        return decoded;
      }
    }
    return undefined;
  }

  /**
   * One warning per attachment per session. A file whose bytes never arrived is missing on every
   * paint of the feed, and a hundred identical lines is not more information than one.
   */
  private warnMissingBytes(id: string, relativePath: string, mimeType?: string): void {
    if (this.missingBytes.has(id)) {
      mediaLog.debug(`Attachment bytes still missing: ${relativePath}`);
      return;
    }
    this.missingBytes.add(id);
    mediaLog.warn(`Attachment bytes are not on this device: ${relativePath} (${mimeType || 'unknown mime'})`);
  }

  /**
   * Playable url for an attachment. Lives only in memory: a blob: URL inside
   * the item would be dead after restart and would leak into localStorage/sync.
   */
  public async getUrl(id: string, relativePath: string, mimeType?: string): Promise<string | undefined> {
    const cached = this.urlCache.get(id);
    if (cached) return cached;

    // The browser has no filesystem: IndexedDB's data URL is already a usable source, so it is
    // returned as is instead of being decoded and turned back into a blob.
    if (!isTauri()) {
      const stored = await idbGetAttachment(id);
      if (stored?.dataUrl) {
        this.urlCache.set(id, stored.dataUrl);
        this.missingBytes.delete(id);
        return stored.dataUrl;
      }
      this.warnMissingBytes(id, relativePath, mimeType);
      return undefined;
    }
    // Disk first: a blob URL streams and keeps five megabytes out of a JS string.
    const loaded = await this.loadBytes(id, relativePath);
    if (loaded) {
      const type = mimeType || loaded.mimeType || 'application/octet-stream';
      const url = URL.createObjectURL(new Blob([new Uint8Array(loaded.bytes)], { type }));
      this.urlCache.set(id, url);
      this.missingBytes.delete(id);
      mediaLog.debug(`Attachment url from bytes: ${id} (${Math.round(loaded.bytes.length / 1024)} KB, ${type})`);
      return url;
    }

    // The answer that used to be silent: nothing on this device can play this attachment.
    this.warnMissingBytes(id, relativePath, mimeType);
    return undefined;
  }

  /**
   * Bytes as a data URL, for shipping an attachment through sync. Reuses the resolver above so
   * there is one answer to "where are this attachment's bytes" instead of two.
   */
  public async getDataUrl(att: SlagAttachment): Promise<string | undefined> {
    const loaded = await this.loadBytes(att.id, att.relativePath);
    if (!loaded) {
      mediaLog.warn(`Failed to read attachment bytes ${att.id}: nothing on this device`);
      return undefined;
    }
    const type = att.mimeType || loaded.mimeType || 'application/octet-stream';
    const dataUrl = `data:${type};base64,${bytesToBase64(loaded.bytes)}`;
    mediaLog.debug(`Attachment ready to sync: ${att.name} (${Math.round(dataUrl.length / 1024)} KB base64)`);
    return dataUrl;
  }

  /** Persist base64 bytes to .attachments/ once; markdown keeps only metadata. */
  public async persistAll(item: SlagItem): Promise<void> {
    for (const att of item.attachments || []) await this.persistOne(att);
  }

  /**
   * Bytes of the attachments a draft is holding. A draft stores metadata only, so they have
   * to reach IndexedDB and `.attachments/` before the first draft write strips the inline
   * copy: a photo attached a second ago has no other home, and the note saved from that draft
   * would point at a file that never existed.
   */
  public persistDrafts(attachments: SlagAttachment[]): void {
    for (const att of attachments) {
      if (!att.dataUrl || this.persistedIds.has(att.id)) continue;
      this.dataUrlCache.set(att.id, att.dataUrl);
      void this.persistOne(att);
      void this.enqueueWrite(att);
    }
  }

  private async persistOne(att: SlagAttachment): Promise<boolean> {
    if (!att.dataUrl?.startsWith('data:')) return false;
    if (this.persistedIds.has(att.id)) return true;
    // The browser keeps bytes in IndexedDB, which the write queue already owns.
    if (!isTauri()) return true;

    try {
      const dir = this.attachmentsDir();
      await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });
      const path = `${dir}/${this.basename(att)}`;
      if (await exists(path, { baseDir: BaseDirectory.AppData })) {
        this.persistedIds.add(att.id);
        return true;
      }

      const decoded = dataUrlToBytes(att.dataUrl);
      if (!decoded) {
        fsLog.warn(`Attachment ${att.id} has a non-base64 data URL; bytes were not written`);
        return false;
      }
      await writeFile(path, decoded.bytes, { baseDir: BaseDirectory.AppData });
      this.persistedIds.add(att.id);
      return true;
    } catch (err) {
      fsLog.warn(`Failed to persist attachment ${att.id}`, err);
      return false;
    }
  }

  /** Whether the bytes are readable here, without base64-ing them first. */
  public async hasBytes(id: string, relativePath: string): Promise<boolean> {
    if (isTauri()) {
      return (await this.pathFor(id, relativePath)) !== undefined;
    }
    return (await idbGetAttachment(id)) !== null;
  }

  /**
   * Bytes that arrived through sync. Not `save`: its session cache would hold every
   * received file as base64, and on a phone that is a hundred megabytes of string per album.
   */
  public async importSynced(attachment: SlagAttachment, dataUrl: string): Promise<boolean> {
    this.urlCache.delete(attachment.id);
    this.nameIndex = null;
    await this.enqueueWrite({ ...attachment, dataUrl });
    const persisted = await this.persistOne({ ...attachment, dataUrl });
    if (!persisted) {
      mediaLog.warn(`Synced attachment "${attachment.name}" did not reach the disk; bytes stay missing`);
      return false;
    }
    mediaLog.info(
      `Imported synced attachment "${attachment.name}" (${Math.round(attachment.size / 1024)} KB, ${attachment.mimeType})`,
    );
    return true;
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
