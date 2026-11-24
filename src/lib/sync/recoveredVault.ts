// Make a new local replica of the same enrolled room; the damaged vault is never re-enabled.
import { BaseDirectory, mkdir, readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { storage } from '../storage';
import { saveVaultMeta } from '../storage/vaultRegistry';
import { parseVaultObject, isMissingVaultFile } from '../storage/vaultRecovery';
import { durableVaultReplace, readVaultGeneration } from '../platform/durableVaultFile';
import { getSecret, SECRET_KEYS, setSecret } from '../platform/secretStore';
import { requirePrefFlushed } from '../storage/prefs';
import { STORAGE_KEYS } from '../../config';
import type { VaultMeta } from '../../types';
import { accountClient } from './account';
import { apiBase } from './apiBase';
import { deriveAccountRoomId, deriveRoomId } from './crypto';
import { NoteChannel } from './notes/channel';
import { readRecoveryRegistry, planRecoveredJournal } from './notes/recoveryJournal';
import { provisionRegistryOnly, readProtectedSyncState } from './vaultSyncFiles';

const fsOptions = { baseDir: BaseDirectory.AppData };
let inProgress = false;

export async function createRecoveredVault(source: VaultMeta): Promise<string> {
  if (inProgress) throw new Error('Восстановление уже идёт');
  inProgress = true;
  try {
    const selection = storage.getCurrentVaultRead();
    const assertSelected = () => {
      const current = storage.getCurrentVault();
      if (current.id !== source.id || current.syncId !== source.syncId || storage.getCurrentVaultRead() !== selection) {
        throw new Error('Хранилище изменилось во время проверки');
      }
    };
    assertSelected();
    const recovery = await storage.getCurrentVaultRecovery();
    if (recovery.kind !== 'local-only' || recovery.reason !== 'state' || !source.syncId) {
      throw new Error('Создание копии доступно только для остановленного старого журнала');
    }
    const session = accountClient.getSession();
    const seed = await getSecret(SECRET_KEYS.vaultSeed(source.id));
    if (!session?.serverUrl || !seed) throw new Error('Для копии нужны существующий ключ хранилища и вход в SLAG ID');
    const { serverUrl } = session;
    const legacyRoom = await deriveRoomId(seed);
    const room = await deriveAccountRoomId(source.syncId, legacyRoom);
    const path = `${storage.getVaultDir(source)}/note-registry.json`;
    const active = await readVaultGeneration(path);
    const stored = parseVaultObject(active ?? await readTextFile(path, fsOptions));
    const registry = readRecoveryRegistry(stored, room);
    const server = apiBase(serverUrl);
    await accountClient.refresh();
    const grant = accountClient.getState().vaults.find(({ id }) => id === source.syncId)?.grants
      .find(({ deviceId }) => deviceId === session.deviceId);
    const currentToken = () => accountClient.getSession()?.deviceId === session.deviceId && accountClient.getToken(serverUrl);
    if (!currentToken() || grant?.status !== 'accepted') throw new Error('Релей не подтвердил доступ этого устройства');
    const channel = new NoteChannel({ serverUrl: server, roomId: room, vaultId: source.syncId,
      atomicGroups: true, registryMedia: true, sharedRecords: true, signal: AbortSignal.timeout(60_000),
      headers: () => {
        const token = currentToken();
        if (!token) throw new Error('Сессия изменилась во время проверки');
        return { Authorization: `Bearer ${token}` };
      } });
    const live = await channel.status();
    const copies = await storage.files.readRecoveryNoteCopies(source);
    const journal = planRecoveredJournal(registry, live, copies);
    assertSelected();
    const existing = storage.getVaults().filter((vault) => vault.id !== source.id && (vault.syncId ?? vault.id) === source.syncId);
    if (existing.length === 1) {
      const target = existing[0];
      const { config, ledger } = await readProtectedSyncState(storage.getVaultDir(target), target.id);
      if (config?.registryOnly === true && config.deviceId === session.deviceId && config.syncId === source.syncId
          && config.serverUrl === serverUrl && ledger?.registryRequired === true) return target.id;
    }
    if (existing.length) throw new Error('Для этой комнаты уже существует другая локальная копия');
    const target: VaultMeta = { id: `vault_${crypto.randomUUID()}`, syncId: source.syncId, name: `${source.name} (реестр)`, mode: 'tauri' };
    const dir = storage.getVaultDir(target);
    try {
      await readDir(dir, fsOptions);
      throw new Error('Папка для восстановленной копии уже есть');
    } catch (error) {
      if (!isMissingVaultFile(error)) throw error;
    }
    // Provision native generations before publishing the selector. A partial directory has no
    // binding + ledger pair and remains fenced; no operation here writes to the source vault.
    await setSecret(SECRET_KEYS.vaultSeed(target.id), seed);
    await provisionRegistryOnly(dir, target.id, {
      syncId: target.syncId, serverUrl, deviceId: session.deviceId, enabled: true, autoSync: true, canRunAiLease: false,
    }, { ...stored, journal });
    await mkdir(storage.getVaultNotesPath(target), { ...fsOptions, recursive: true });
    await durableVaultReplace(storage.getVaultStatePath(target), '{"protectedSync":true}');
    assertSelected();
    saveVaultMeta(storage, target);
    await requirePrefFlushed(STORAGE_KEYS.VAULTS);
    return target.id;
  } finally {
    inProgress = false;
  }
}
