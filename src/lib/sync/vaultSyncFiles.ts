// The room binding and delivery ledger have separate lifetimes. Neither is a cache of Markdown.
import { readVaultGeneration, writeVaultGeneration } from '../platform/durableVaultFile';
import { configFromState, configToState, sanitizeOutbox, sectionFromState, sectionToPatch } from './syncSection';

type RecordValue = Record<string, unknown>;
const CONFIG = 'sync-config.json';
const LEDGER = 'sync-ledger.json';
const queues = new Map<string, Promise<unknown>>();

function serial<T>(dir: string, action: () => Promise<T>): Promise<T> {
  const task = (queues.get(dir) ?? Promise.resolve()).then(action, action);
  queues.set(dir, task);
  const done = () => { if (queues.get(dir) === task) queues.delete(dir); };
  void task.then(done, done);
  return task;
}

function object(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid vault synchronization state');
  return value as RecordValue;
}

async function read(dir: string, file: string, id: string): Promise<RecordValue | undefined> {
  const text = await readVaultGeneration(`${dir}/${file}`);
  if (text === null) return undefined;
  const envelope = object(JSON.parse(text));
  if (envelope.version !== 1 || envelope.vaultId !== id) throw new Error('Unexpected vault synchronization scope');
  return object(envelope.value);
}

async function write(dir: string, file: string, id: string, value: RecordValue): Promise<void> {
  await writeVaultGeneration(`${dir}/${file}`, JSON.stringify({ version: 1, vaultId: id, value }));
}

export function folderFence(value: unknown): RecordValue {
  const fence = value === undefined ? {} : object(value);
  if (Object.values(fence).some((flag) => flag !== true)) throw new Error('Invalid folder projection fence');
  return fence;
}

export function validateSyncLedger(section: RecordValue): void {
  if (section.outbox !== undefined && (!Array.isArray(section.outbox) || sanitizeOutbox(section.outbox).length !== section.outbox.length)) {
    throw new Error('Invalid delivery queue');
  }
  if (section.registryRequired !== undefined && section.registryRequired !== true) throw new Error('Invalid registry checkpoint');
  const parsed = sectionToPatch(sectionFromState(section));
  for (const key of ['tombstones', 'draftTombstones', 'cursor']) {
    if (section[key] === undefined) continue;
    const actual = object(section[key]);
    const deemed = object(parsed[key]);
    if (Object.keys(actual).some((id) => !Object.hasOwn(deemed, id) || actual[id] !== deemed[id])) {
      throw new Error('Invalid synchronization checkpoint');
    }
  }
}

function normalizedConfig(value: unknown): RecordValue {
  const record = object(value);
  const config = configFromState(record);
  if (!config.deviceId || !config.serverUrl || config.enabled === undefined) throw new Error('Missing vault synchronization binding');
  const syncId = record.syncId;
  if (syncId !== undefined && (typeof syncId !== 'string' || !syncId)) throw new Error('Invalid vault synchronization ID');
  const registryOnly = record.registryOnly;
  if (registryOnly !== undefined && (registryOnly !== true || !syncId)) throw new Error('Invalid registry-only binding');
  return { ...configToState(config), ...(syncId ? { syncId } : {}), ...(registryOnly === true && { registryOnly }) };
}

/** A new recovered scope can use the verified note journal, never the old bundle transport. */
export function provisionRegistryOnly(dir: string, id: string, binding: RecordValue, registry: unknown): Promise<void> {
  return serial(dir, async () => {
    const config = normalizedConfig({ ...binding, registryOnly: true });
    if (await read(dir, LEDGER, id) || await read(dir, CONFIG, id)) throw new Error('Recovery target is not empty');
    await write(dir, CONFIG, id, config);
    await writeVaultGeneration(`${dir}/note-registry.json`, JSON.stringify(registry));
    await write(dir, LEDGER, id, { registryRequired: true, initialSync: true });
  });
}

export async function readProtectedSyncState(dir: string, id: string): Promise<{ ledger?: RecordValue; config?: RecordValue }> {
  return serial(dir, async () => {
    const [ledger, config] = await Promise.all([read(dir, LEDGER, id), read(dir, CONFIG, id)]);
    if (ledger) {
      folderFence(ledger.pendingFolderProjection);
      validateSyncLedger(ledger);
    }
    return { ledger, config: config && normalizedConfig(config) };
  });
}

/** Only called after existing legacy hydration and config verification, before opening transport. */
export function migrateVaultSyncFiles(dir: string, id: string, source: RecordValue, fence: RecordValue, syncId?: string): Promise<void> {
  return serial(dir, async () => {
    const ledger = await read(dir, LEDGER, id);
    const config = await read(dir, CONFIG, id);
    if (ledger && config) return;
    const { config: legacyConfig, ...section } = source;
    const binding = normalizedConfig({ ...object(legacyConfig), ...(syncId ? { syncId } : {}) });
    if (config && JSON.stringify(normalizedConfig(config)) !== JSON.stringify(binding)) throw new Error('Interrupted binding migration does not match its source');
    validateSyncLedger(section);
    if (!config) await write(dir, CONFIG, id, binding);
    if (!ledger) await write(dir, LEDGER, id, { ...section, pendingFolderProjection: folderFence(fence) });
    if (!await read(dir, CONFIG, id) || !await read(dir, LEDGER, id)) throw new Error('Synchronization migration was not committed');
  });
}

export function updateProtectedSyncFiles(dir: string, id: string, writeSection: (old: RecordValue) => RecordValue): Promise<boolean> {
  return serial(dir, async () => {
    const current = await read(dir, LEDGER, id);
    if (!current) return false;
    const config = await read(dir, CONFIG, id);
    if (!config) throw new Error('Missing vault synchronization binding');
    const { config: configPatch, ...next } = writeSection({ ...current, config });
    const binding = normalizedConfig({ ...config, ...object(configPatch) });
    if (JSON.stringify(normalizedConfig(config)) !== JSON.stringify(binding)) await write(dir, CONFIG, id, binding);
    folderFence(next.pendingFolderProjection);
    validateSyncLedger(next);
    if (JSON.stringify(next) !== JSON.stringify(current)) await write(dir, LEDGER, id, next);
    return true;
  });
}
