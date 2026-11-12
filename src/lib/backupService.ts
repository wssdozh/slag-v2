import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type {
  SlagItem,
  FolderMeta,
  VaultMeta,
  SlagAttachment,
  BackupSnapshotMeta,
  BackupSettings,
  WorkspaceState,
  ChatMessage,
  ComposerDraft,
} from '../types';
import { storage, getSafeNoteFilename } from './storage';
import { serializeItemToMarkdown, parseMarkdownToItem } from './vault/markdownSerializer';
import {
  idbGetAllAttachments,
  idbSaveAttachment,
  idbSaveSnapshot,
  idbGetSnapshots,
  idbGetSnapshotData,
  idbDeleteSnapshot,
} from './storage/indexedDb';
import { logger } from './logger/logger';
import { isTauri } from '@tauri-apps/api/core';
import {
  writeFile,
  mkdir,
  remove,
  exists,
  BaseDirectory,
} from '@tauri-apps/plugin-fs';

import {
  DEFAULT_INBOX_FOLDER,
  DEFAULT_BACKUP_SETTINGS,
  STORAGE_KEYS,
} from '../config';

export { DEFAULT_BACKUP_SETTINGS };

const backupLog = logger.scope('FS');

const BACKUP_SETTINGS_KEY = STORAGE_KEYS.BACKUP_SETTINGS;

export interface SlagManifest {
  version: 2;
  exportedAt: string;
  vault: VaultMeta;
  folders: FolderMeta[];
  itemsCount: number;
  attachmentsCount: number;
  workspaceState?: WorkspaceState;
  assistantHistory?: ChatMessage[];
  composerDrafts?: Record<string, ComposerDraft>;
  items?: SlagItem[];
  attachmentsMeta?: Array<Omit<SlagAttachment, 'dataUrl'>>;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  try {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return new Uint8Array(0);
  }
}

function uint8ArrayToDataUrl(bytes: Uint8Array, mimeType: string): string {
  const CHUNK_SZ = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SZ) {
    const sub = bytes.subarray(i, i + CHUNK_SZ);
    chunks.push(String.fromCharCode.apply(null, sub as unknown as number[]));
  }
  return `data:${mimeType};base64,${btoa(chunks.join(''))}`;
}

function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'svg': return 'image/svg+xml';
    case 'webm': return 'video/webm';
    case 'mp4': return 'video/mp4';
    case 'mp3': return 'audio/mp3';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    case 'm4a': return 'audio/m4a';
    case 'pdf': return 'application/pdf';
    case 'json': return 'application/json';
    case 'md': return 'text/markdown';
    default: return 'application/octet-stream';
  }
}

export class BackupService {
  private inFlightBackup: Promise<BackupSnapshotMeta> | null = null;

  public getSettings(): BackupSettings {
    try {
      const raw = localStorage.getItem(BACKUP_SETTINGS_KEY);
      if (raw) {
        return { ...DEFAULT_BACKUP_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      // fallback
    }
    return { ...DEFAULT_BACKUP_SETTINGS };
  }

  public saveSettings(settings: Partial<BackupSettings>): BackupSettings {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    try {
      localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(updated));
    } catch (err) {
      backupLog.warn('Failed to save backup settings:', err);
    }
    return updated;
  }

  /**
   * Bundles the current vault into a self-contained ZIP archive with:
   * 1. notes/<folder>/<filename>.md (Clean Markdown with YAML frontmatter)
   * 2. .attachments/<filename> (All images, audio, video, files)
   * 3. slag-manifest.json (Metadata, folders, tags, assistant history, workspace state)
   */
  public async createVaultZip(vault: VaultMeta = storage.getCurrentVault()): Promise<{
    bytes: Uint8Array;
    filename: string;
    meta: BackupSnapshotMeta;
  }> {
    const items = storage.getItems();
    const folders = storage.getFolders();
    const workspaceState = storage.getWorkspaceState();
    const assistantHistory = storage.getAssistantHistory();
    const composerDrafts = storage.getAllComposerDrafts();

    // Collect all attachments from IndexedDB + items
    const idbAttachments = await idbGetAllAttachments();
    const attachmentMap = new Map<string, SlagAttachment>();
    idbAttachments.forEach(att => attachmentMap.set(att.id, att));

    // Also collect attachments embedded in items in case any are memory-only
    items.forEach(item => {
      (item.attachments || []).forEach(att => {
        if (!attachmentMap.has(att.id) || (att.dataUrl && !attachmentMap.get(att.id)?.dataUrl)) {
          attachmentMap.set(att.id, att);
        }
      });
    });

    const attachmentsList = Array.from(attachmentMap.values());
    const zippable: Record<string, Uint8Array> = {};

    // 1. Pack notes
    for (const item of items) {
      const filename = item.filename || getSafeNoteFilename(item.title, item.id);
      const folderPath = item.folder ? item.folder.replace(/\\/g, '/') : DEFAULT_INBOX_FOLDER;
      const archivePath = `notes/${folderPath}/${filename}`;
      const mdContent = serializeItemToMarkdown(item);
      zippable[archivePath] = strToU8(mdContent);
    }

    // 2. Pack attachments
    for (const att of attachmentsList) {
      if (att.dataUrl) {
        const rawBytes = dataUrlToUint8Array(att.dataUrl);
        if (rawBytes.length > 0) {
          const cleanRel = att.relativePath.replace(/^(\.attachments[\\/])/, '');
          const attName = cleanRel || `${att.id}_${att.name}`;
          zippable[`.attachments/${attName}`] = rawBytes;
        }
      }
    }

    // 3. Pack slag-manifest.json
    const manifest: SlagManifest = {
      version: 2,
      exportedAt: new Date().toISOString(),
      vault,
      folders,
      itemsCount: items.length,
      attachmentsCount: attachmentsList.length,
      workspaceState,
      assistantHistory,
      composerDrafts,
      items,
      attachmentsMeta: attachmentsList.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        mimeType: a.mimeType,
        size: a.size,
        relativePath: a.relativePath,
        duration: a.duration,
        waveform: a.waveform,
        extractedText: a.extractedText,
        summary: a.summary,
        enrichmentStatus: a.enrichmentStatus,
      })),
    };
    zippable['slag-manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

    const zipBytes = zipSync(zippable, { level: 6 });
    const nowIso = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeVaultName = (vault.name || 'vault').replace(/[\\/:*?"<>|\s]/g, '_');
    const zipFilename = `slag_${safeVaultName}_backup_${nowIso}.zip`;

    const meta: BackupSnapshotMeta = {
      id: `snap_${Date.now()}`,
      vaultId: vault.id,
      vaultName: vault.name,
      createdAt: Date.now(),
      notesCount: items.length,
      attachmentsCount: attachmentsList.length,
      sizeBytes: zipBytes.byteLength,
      trigger: 'manual',
      filename: zipFilename,
    };

    return { bytes: zipBytes, filename: zipFilename, meta };
  }

  private async cleanupDesktopFile(target: BackupSnapshotMeta): Promise<void> {
    if (isTauri() && target.filename) {
      try {
        const vaultDir = target.vaultId === 'default_vault' ? 'main' : target.vaultId;
        const filePath = `backups/${vaultDir}/${target.filename}`;
        if (await exists(filePath, { baseDir: BaseDirectory.AppData })) {
          await remove(filePath, { baseDir: BaseDirectory.AppData });
        }
      } catch {
        // ignore cleanup failure
      }
    }
  }

  /**
   * Creates an auto or manual snapshot, saves it to IndexedDB (and disk in Tauri),
   * applies retention policy pruning, and updates lastBackupAt.
   */
  public async createSnapshot(trigger: 'auto' | 'manual' = 'manual'): Promise<BackupSnapshotMeta> {
    if (this.inFlightBackup) {
      backupLog.info('Backup snapshot already in progress, returning active task');
      return this.inFlightBackup;
    }

    this.inFlightBackup = (async () => {
      try {
        const vault = storage.getCurrentVault();
        const { bytes, filename, meta: baseMeta } = await this.createVaultZip(vault);
        const meta: BackupSnapshotMeta = { ...baseMeta, trigger };

        // 1. Save to IndexedDB
        await idbSaveSnapshot(meta, bytes);

        // 2. If in Tauri desktop, also write to AppData/backups/<vaultDir>/<filename>
        if (isTauri()) {
          try {
            const vaultDir = vault.id === 'default_vault' ? 'main' : vault.id;
            const backupDir = `backups/${vaultDir}`;
            await mkdir(backupDir, { baseDir: BaseDirectory.AppData, recursive: true });
            await writeFile(`${backupDir}/${filename}`, bytes, { baseDir: BaseDirectory.AppData });
            backupLog.info(`Saved desktop backup snapshot to AppData/${backupDir}/${filename}`);
          } catch (err) {
            backupLog.warn('Failed writing backup snapshot to desktop disk:', err);
          }
        }

        // 3. Update lastBackupAt
        this.saveSettings({ lastBackupAt: Date.now() });

        // 4. Prune old snapshots & duplicates according to retentionCount
        await this.pruneSnapshots();

        backupLog.info(`Backup snapshot created (${trigger}): ${meta.notesCount} notes, ${Math.round(meta.sizeBytes / 1024)} KB`);
        return meta;
      } finally {
        this.inFlightBackup = null;
      }
    })();

    return this.inFlightBackup;
  }

  /**
   * Retrieves all snapshots sorted newest first, transparently deduplicating twin snapshots.
   */
  public async getSnapshots(): Promise<BackupSnapshotMeta[]> {
    const raw = await idbGetSnapshots();
    const unique: BackupSnapshotMeta[] = [];
    const duplicates: BackupSnapshotMeta[] = [];

    for (const snap of raw) {
      const isDup = unique.some(existing =>
        existing.vaultId === snap.vaultId &&
        existing.notesCount === snap.notesCount &&
        existing.attachmentsCount === snap.attachmentsCount &&
        Math.abs(existing.createdAt - snap.createdAt) <= 120_000
      );
      if (isDup) {
        duplicates.push(snap);
      } else {
        unique.push(snap);
      }
    }

    if (duplicates.length > 0) {
      void Promise.all(duplicates.map(dup => this.deleteSnapshot(dup.id))).catch(() => {});
    }

    return unique;
  }

  /**
   * Enforces retention policy: removes duplicate twins and keeps at most retentionCount snapshots.
   */
  public async pruneSnapshots(): Promise<void> {
    const settings = this.getSettings();
    const snapshots = await idbGetSnapshots();
    const max = Math.max(1, settings.retentionCount || 7);

    const unique: BackupSnapshotMeta[] = [];
    const duplicates: BackupSnapshotMeta[] = [];

    for (const snap of snapshots) {
      const isDup = unique.some(existing =>
        existing.vaultId === snap.vaultId &&
        existing.notesCount === snap.notesCount &&
        existing.attachmentsCount === snap.attachmentsCount &&
        Math.abs(existing.createdAt - snap.createdAt) <= 120_000
      );
      if (isDup) {
        duplicates.push(snap);
      } else {
        unique.push(snap);
      }
    }

    for (const dup of duplicates) {
      await idbDeleteSnapshot(dup.id);
      await this.cleanupDesktopFile(dup);
    }

    if (unique.length > max) {
      const toDelete = unique.slice(max);
      for (const snap of toDelete) {
        await idbDeleteSnapshot(snap.id);
        await this.cleanupDesktopFile(snap);
      }
      backupLog.info(`Pruned ${toDelete.length} old backup snapshots`);
    }
  }

  /**
   * Deletes a specific snapshot by id.
   */
  public async deleteSnapshot(snapshotId: string): Promise<void> {
    const snapshots = await idbGetSnapshots();
    const target = snapshots.find(s => s.id === snapshotId);
    await idbDeleteSnapshot(snapshotId);

    if (target) {
      await this.cleanupDesktopFile(target);
    }
  }

  /**
   * Triggers a browser download of the current vault as a ZIP file.
   */
  public async downloadCurrentVaultZip(): Promise<string> {
    const { bytes, filename } = await this.createVaultZip();
    this.triggerBrowserDownload(bytes, filename);
    return filename;
  }

  /**
   * Downloads a specific stored snapshot as a ZIP file.
   */
  public async downloadSnapshot(snapshotId: string): Promise<boolean> {
    const snapshots = await idbGetSnapshots();
    const meta = snapshots.find(s => s.id === snapshotId);
    if (!meta) return false;

    const data = await idbGetSnapshotData(snapshotId);
    if (!data) return false;

    const filename = meta.filename || `${meta.id}.zip`;
    this.triggerBrowserDownload(data, filename);
    return true;
  }

  /**
   * Restores the vault from a stored snapshot id.
   */
  public async restoreSnapshot(snapshotId: string): Promise<boolean> {
    const data = await idbGetSnapshotData(snapshotId);
    if (!data) {
      backupLog.error(`Snapshot ${snapshotId} data not found`);
      return false;
    }
    const res = await this.restoreFromZip(data);
    return res.itemsCount >= 0;
  }

  /**
   * Restores vault contents from a ZIP buffer or File.
   * Handles both native SLAG archives (with slag-manifest.json)
   * and clean Obsidian Vault ZIPs.
   */
  public async restoreFromZip(
    fileOrBuffer: File | Blob | Uint8Array
  ): Promise<{ itemsCount: number; attachmentsCount: number }> {
    let zipBytes: Uint8Array;
    if (fileOrBuffer instanceof Uint8Array) {
      zipBytes = fileOrBuffer;
    } else {
      const arrayBuf = await fileOrBuffer.arrayBuffer();
      zipBytes = new Uint8Array(arrayBuf);
    }

    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(zipBytes);
    } catch (err) {
      backupLog.error('Failed to unpack ZIP archive:', err);
      throw new Error('Архив повреждён или имеет неверный формат');
    }

    const fileKeys = Object.keys(unzipped);
    if (fileKeys.length === 0) {
      throw new Error('Архив пуст');
    }

    let itemsToRestore: SlagItem[] = [];
    let foldersToRestore: FolderMeta[] = [];
    let restoredAttachmentsCount = 0;

    // Check for SLAG manifest
    const manifestKey = fileKeys.find(k => k.endsWith('slag-manifest.json'));
    if (manifestKey) {
      try {
        const manifestStr = strFromU8(unzipped[manifestKey]);
        const manifest: SlagManifest = JSON.parse(manifestStr);

        if (Array.isArray(manifest.folders)) {
          foldersToRestore = manifest.folders;
        }
        if (Array.isArray(manifest.items)) {
          itemsToRestore = manifest.items;
        }
        if (manifest.assistantHistory) {
          storage.saveAssistantHistory(manifest.assistantHistory);
        }
        if (manifest.workspaceState) {
          storage.saveWorkspaceState(manifest.workspaceState);
        }
        if (manifest.composerDrafts) {
          try {
            localStorage.setItem(`slag_drafts_${storage.getCurrentVault().id}`, JSON.stringify(manifest.composerDrafts));
          } catch {
            // ignore
          }
        }
      } catch (err) {
        backupLog.warn('Could not parse slag-manifest.json, falling back to file scan:', err);
      }
    }

    // Restore attachments from .attachments/ directory in ZIP
    const attachmentKeys = fileKeys.filter(k => k.includes('.attachments/'));
    for (const key of attachmentKeys) {
      const bytes = unzipped[key];
      if (!bytes || bytes.length === 0) continue;

      const filename = key.split('.attachments/').pop() || 'attachment';
      const idMatch = filename.match(/^(att_[0-9a-z_]+?)_(.+)$/i);
      const id = idMatch ? idMatch[1] : `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const name = idMatch ? idMatch[2] : filename;
      const mimeType = guessMimeType(filename);

      let attType: SlagAttachment['type'] = 'file';
      if (mimeType.startsWith('image/')) attType = 'image';
      else if (mimeType.startsWith('audio/')) attType = 'audio';
      else if (mimeType.startsWith('video/')) attType = 'video';

      const dataUrl = uint8ArrayToDataUrl(bytes, mimeType);
      const attachment: SlagAttachment = {
        id,
        name,
        type: attType,
        mimeType,
        size: bytes.byteLength,
        relativePath: `.attachments/${filename}`,
        dataUrl,
      };

      await idbSaveAttachment(attachment);
      storage.saveAttachment(attachment);
      restoredAttachmentsCount++;
    }

    // If no items from manifest, scan all Markdown files
    if (itemsToRestore.length === 0) {
      const mdKeys = fileKeys.filter(k => k.endsWith('.md'));
      const folderSet = new Set<string>();

      for (const mdKey of mdKeys) {
        const mdText = strFromU8(unzipped[mdKey]);
        const cleanPath = mdKey.replace(/\\/g, '/').replace(/^notes\//, '');
        const parts = cleanPath.split('/');
        const filename = parts.pop() || 'untitled.md';
        const folder = parts.length > 0 ? parts.join('/') : DEFAULT_INBOX_FOLDER;
        folderSet.add(folder);

        const fallbackId = filename.replace(/\.md$/, '');
        const item = parseMarkdownToItem(mdText, fallbackId, folder);
        item.filename = filename;
        itemsToRestore.push(item);
      }

      if (foldersToRestore.length === 0) {
        foldersToRestore = Array.from(folderSet).map(f => ({
          path: f,
          name: f.split('/').pop() || f,
          description: '',
          isSystem: f === DEFAULT_INBOX_FOLDER,
        }));
      }
    }

    // Persist restored items and folders
    storage.importVaultData({
      folders: foldersToRestore,
      items: itemsToRestore,
    });

    // In Tauri, flush to disk
    if (isTauri()) {
      await storage.syncCurrentVaultFs();
    }

    backupLog.info(`Vault restored from ZIP: ${itemsToRestore.length} notes, ${restoredAttachmentsCount} attachments`);
    return {
      itemsCount: itemsToRestore.length,
      attachmentsCount: restoredAttachmentsCount,
    };
  }

  /**
   * Quietly checks if an automatic backup is due and runs it if so.
   */
  public async checkAndRunAutoBackup(): Promise<boolean> {
    const settings = this.getSettings();
    if (!settings.autoBackupEnabled) return false;
    if (this.inFlightBackup) return false;

    const intervalMs = (settings.intervalHours || 24) * 60 * 60 * 1000;
    const last = settings.lastBackupAt || 0;
    const now = Date.now();

    if (now - last >= intervalMs) {
      // Optimistically record attempt timestamp so fast double-mounts/tabs don't double-trigger
      this.saveSettings({ lastBackupAt: now });
      try {
        backupLog.info('Running scheduled automatic backup snapshot...');
        await this.createSnapshot('auto');
        return true;
      } catch (err) {
        // Rollback on failure so it can retry next time
        this.saveSettings({ lastBackupAt: last });
        backupLog.error('Auto backup snapshot failed:', err);
      }
    }
    return false;
  }

  private triggerBrowserDownload(bytes: Uint8Array, filename: string): void {
    const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
  }
}

export const backupService = new BackupService();
