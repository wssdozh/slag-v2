import { invoke } from '@tauri-apps/api/core';

export function durableVaultReplace(path: string, data: string | Uint8Array): Promise<void> {
  return invoke('vault_replace', { path, data: Array.from(typeof data === 'string' ? new TextEncoder().encode(data) : data) });
}

export function durableVaultMove(from: string, to: string): Promise<void> {
  return invoke('vault_move', { from, to });
}

export function durableVaultRemove(path: string, expectedDigest: string): Promise<void> {
  return invoke('vault_remove', { path, expectedDigest });
}

export function readVaultGeneration(path: string): Promise<string | null> {
  return invoke('vault_read_generation', { path });
}

export function writeVaultGeneration(path: string, text: string): Promise<void> {
  return invoke('vault_write_generation', { path, text });
}
