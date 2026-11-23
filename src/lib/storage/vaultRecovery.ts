// Recover the local vault before the normal scanner, watcher or sync engine can publish it.
import { BaseDirectory, readFile } from '@tauri-apps/plugin-fs';
import { durableVaultReplace, readVaultGeneration } from '../platform/durableVaultFile';
import { logger } from '../logger/logger';
import { enrolledNoteGeneration, loadNoteJournal } from '../sync/notes/persistence';
import { folderFence, readProtectedSyncState, validateSyncLedger } from '../sync/vaultSyncFiles';

const log = logger.scope('FS');
const options = { baseDir: BaseDirectory.AppData };
export const RECOVERY_LOCAL_ONLY = 'recovery-local-only.json';

export type VaultRecovery =
  | { kind: 'ready'; state: Record<string, unknown>; fresh: boolean; fence: Record<string, unknown> }
  | { kind: 'local-only'; state: Record<string, unknown>; fence?: Record<string, unknown> }
  | { kind: 'unavailable'; state: Record<string, unknown> };

export function isMissingVaultFile(error: unknown): boolean {
  // ENOENT is 2 on Unix/Windows; Windows also uses 3 for a missing parent.
  return /\(os error [23]\)\s*$/.test(String(error));
}

export async function readVaultBytes(path: string): Promise<Uint8Array | undefined> {
  try {
    return await readFile(path, options);
  } catch (error) {
    if (!isMissingVaultFile(error)) throw error;
  }
}

export function parseVaultObject(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid vault state');
  return value as Record<string, unknown>;
}

function validateRegistry(text: string): void {
  const value = parseVaultObject(text);
  const room = value.room;
  if (typeof room !== 'string' || !room) throw new Error('Invalid registry room');
  const generation = enrolledNoteGeneration(value, room);
  if (generation === undefined) throw new Error('Invalid registry generation');
  loadNoteJournal(value, room, generation);
}

export async function recoverVault(dir: string, vaultId: string, wasPresent: boolean): Promise<VaultRecovery> {
  const statePath = `${dir}/state.json`;
  let state: Record<string, unknown> = {};
  let reason: 'state' | 'registry' | 'previous' | undefined;
  let fence: Record<string, unknown> = {};
  try {
    const [marker, bytes, protectedState, registry] = await Promise.all([
      readVaultBytes(`${dir}/${RECOVERY_LOCAL_ONLY}`),
      readVaultBytes(statePath),
      readProtectedSyncState(dir, vaultId).then((files) => ({ files }), () => ({ files: {}, failed: true } as const)),
      readVaultGeneration(`${dir}/note-registry.json`).then(async (text) => {
        const legacy = text === null ? await readVaultBytes(`${dir}/note-registry.json`) : undefined;
        return { text: text ?? (legacy ? new TextDecoder('utf-8', { fatal: true }).decode(legacy) : null), protected: text !== null };
      }).catch(() => ({ text: null, failed: true } as const)),
    ]);
    const { ledger, config } = protectedState.files as Awaited<ReturnType<typeof readProtectedSyncState>>;
    let brokenState = false;
    if (bytes) {
      try {
        state = parseVaultObject(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

      } catch {
        brokenState = true;
      }
    }
    // One durable marker is enough to keep the relay closed. Its contents are informational.
    if (marker) reason = 'previous';
    else if ('failed' in registry || 'failed' in protectedState || !!ledger !== !!config ||
      (state.protectedSync === true && !ledger) ||
      (ledger?.registryRequired === true && (!('protected' in registry) || !registry.protected))) reason = 'registry';
    else if ((brokenState || (!bytes && wasPresent)) && !(ledger && config)) reason = 'state';
    try {
      fence = folderFence(ledger ? ledger.pendingFolderProjection : state.pendingFolderProjection);
    } catch {
      reason ??= 'state';
    }
    if (!reason) {
      try {
        if (registry.text !== null) validateRegistry(registry.text);
        if (!ledger && state.sync !== undefined) {
          if (!state.sync || typeof state.sync !== 'object' || Array.isArray(state.sync)) throw new Error('Invalid legacy sync ledger');
          validateSyncLedger(state.sync as Record<string, unknown>);
        }
      } catch {
        reason = 'registry';
      }
    }
    if (reason && !marker) {
      await durableVaultReplace(`${dir}/${RECOVERY_LOCAL_ONLY}`, JSON.stringify({ version: 1, reason }));
    }
    if (brokenState) {
      // Persist the actual bytes, not a decoded/re-encoded copy. Never overwrite earlier evidence.
      const evidence = `${statePath}.broken.${crypto.randomUUID()}`;
      await durableVaultReplace(evidence, bytes!);
    }
    if (brokenState || (!bytes && ledger && config)) {
      state = ledger && config ? { protectedSync: true } : {};
      await durableVaultReplace(statePath, JSON.stringify(state));
    }
    if (reason) {
      if (!marker) log.warn('Vault opened for local work; sync continuity is unknown', { reason });
      return { kind: 'local-only', state, fence };
    }
    return { kind: 'ready', state, fence, fresh: !wasPresent && !bytes && registry.text === null && !config && !ledger };
  } catch (error) {
    // A read failure/permission error cannot be fixed by overwriting the file. The scanner may
    // still publish intact user files, but the app must not claim it can persist a new change.
    log.warn('Could not validate vault storage', error instanceof Error ? { error: error.name } : { error: 'I/O' });
    return { kind: 'unavailable', state };
  }
}
