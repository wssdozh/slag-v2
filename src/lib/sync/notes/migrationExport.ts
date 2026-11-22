// Local-only evidence: preserve physical copies, including duplicate IDs and trash, without exporting secrets.
import { BaseDirectory, exists, readDir, readFile } from '@tauri-apps/plugin-fs';
import { strToU8, zip } from 'fflate';
import { showSaveFilePicker, writeFile } from 'tauri-plugin-android-fs-api';
import { storage } from '../../storage';
import { isAndroidApp } from '../../platform/deviceAccess';
import { safeVaultRelativePath } from '../../vault/safePath';
import { loadCursor, loadTombstones, requireSyncSectionFlushed } from '../localBookkeeping';
import { syncEngine } from '../syncEngine';

export { isAndroidApp as canExportMigrationSnapshot };

export async function exportMigrationSnapshot(): Promise<boolean> {
  const vault = storage.getCurrentVault();
  const generation = syncEngine.initGeneration;
  const scope = syncEngine.bookkeeping;
  if (!isAndroidApp() || !scope.roomId || scope.vaultId !== vault.id || syncEngine.noteGeneration || !storage.isHydrated()) {
    throw new Error('Откройте загруженное синхронизируемое хранилище до включения реестра');
  }
  const checkpoint = async () => {
    const drafts = await storage.files.readStateSection('drafts', vault, true);
    if (storage.getCurrentVault() !== vault || syncEngine.initGeneration !== generation || syncEngine.activeRoomId !== scope.roomId
      || syncEngine.noteGeneration || syncEngine.isProcessingSync || syncEngine.importBuffer || syncEngine.pendingPushes.size) {
      throw new Error('Хранилище изменилось или ещё синхронизируется. Повторите экспорт после завершения синхронизации.');
    }
    const { profile, notifyRoutes, notifyPrefs, aiPrompt, aiPersona, aiPersonaEnabled, aiPromptAt, aiPersonaAt } = storage.getWorkspaceState();
    return JSON.stringify({
      version: 1,
      room: scope.roomId,
      vaultId: vault.syncId ?? vault.id,
      deviceId: syncEngine.getConfig().deviceId,
      cursor: loadCursor(scope),
      pendingIds: syncEngine.getOutbox().pending().map(({ id }) => id),
      tombstones: loadTombstones(scope),
      folders: storage.getFolders(),
      composerDrafts: storage.getAllComposerDrafts(),
      fullscreenDrafts: drafts.fullscreen,
      memory: storage.getMemory(),
      workspace: { profile, notifyRoutes, notifyPrefs, aiPrompt, aiPersona, aiPersonaEnabled, aiPromptAt, aiPersonaAt },
    });
  };

  const options = { baseDir: BaseDirectory.AppData };
  const roots = [
    ['notes', storage.getVaultNotesPath(vault)],
    ['.trash', storage.files.getVaultTrashPath(vault)],
    ['.attachments', storage.getVaultAttachmentsPath(vault)],
  ] as const;
  // Store exact bytes. Read a second time to reject a mixed snapshot after an edit or incoming batch.
  const walk = async (root: string, prefix: string, visit: (name: string, data: Uint8Array) => void) => {
    for (const entry of await readDir(root, options)) {
      const part = safeVaultRelativePath(entry.name);
      if (part !== entry.name || part.includes('/') || entry.isSymlink) throw new Error('Небезопасный путь в хранилище');
      const file = `${root}/${part}`;
      const name = `${prefix}/${part}`;
      if (entry.isDirectory) await walk(file, name, visit);
      else if (entry.isFile && (prefix.startsWith('.attachments') || part.endsWith('.md'))) visit(name, await readFile(file, options));
    }
  };
  const visitRoots = async (visit: Parameters<typeof walk>[2]) => {
    for (const [prefix, root] of roots) {
      if (prefix === '.attachments' && !await exists(root, options)) continue;
      await walk(root, prefix, visit);
    }
  };
  await requireSyncSectionFlushed();
  const before = await checkpoint();
  const entries: Record<string, Uint8Array> = { 'slag-migration.json': strToU8(before) };
  await visitRoots((name, bytes) => { entries[name] = bytes; });
  const seen = new Set<string>();
  await visitRoots((name, bytes) => {
    const old = entries[name];
    if (!old || old.length !== bytes.length || bytes.some((byte, i) => byte !== old[i])) throw new Error('Файлы изменились во время экспорта');
    seen.add(name);
  });
  if (seen.size !== Object.keys(entries).length - 1 || before !== await checkpoint()) throw new Error('Хранилище изменилось во время экспорта');
  const bytes = await new Promise<Uint8Array>((resolve, reject) => zip(entries, { level: 1 }, (err, data) => err ? reject(err) : resolve(data)));
  const filename = `slag-migration-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.zip`;
  const destination = await showSaveFilePicker(filename, 'application/zip', { localOnly: true });
  if (!destination) return false;
  await writeFile(destination, bytes);
  return true;
}
