import { getPref, setPref } from '../../storage/prefs.ts';
import type { NoteConflict } from './replica';

const preference = (vaultId: string) => `slag_keep_relay_note_conflicts_${vaultId}`;
export const keepRelayOnConflict = (vaultId: string) => getPref(preference(vaultId)) === 'true';
export const setKeepRelayOnConflict = (vaultId: string, value: boolean) => setPref(preference(vaultId), String(value));

export async function archiveNoteConflict(vaultId: string, conflict: NoteConflict,
  write?: (id: string, value: unknown) => Promise<void>): Promise<void> {
  if (keepRelayOnConflict(vaultId)) return;
  if (!write) throw new Error('Локальная история конфликтов недоступна; правка осталась в очереди');
  await write(conflict.intentId, conflict);
}
