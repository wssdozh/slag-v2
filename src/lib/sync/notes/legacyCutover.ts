import type { SyncOperation } from '../entities/types';
import type { NoteConflict } from './journal.ts';
import { equal, relayNote } from './merge.ts';
import { sameRegistryValue } from './journal.ts';
import type { RegistryValue } from './journal.ts';
import { isLegacySharedKind, isSharedRegistryId, sharedRegistryId } from './sharedBody.ts';
import { checkedSharedBody, FOLDER_TREE_ID, isLegacyNoteItem } from './wire.ts';

export const LEGACY_CUTOVER = 'legacy-cutover';

export function sameLegacyValue(a: RegistryValue, b: RegistryValue): boolean {
  if (a && b && 'shared' in a && 'shared' in b && typeof a.shared === 'object' && typeof b.shared === 'object'
      && 'content' in a.shared && 'content' in b.shared) {
    const { updatedAt: _a, ...left } = a.shared;
    const { updatedAt: _b, ...right } = b.shared;
    return equal(left, right, true);
  }
  return sameRegistryValue(a, b);
}

export class LegacyCutoverBlocked extends Error {
  constructor(types: Set<string>) {
    super(`Старая очередь требует ручной проверки (${[...types].sort().join(', ')}). Правки сохранены.`);
  }
}

export function prepareLegacyCutover(ops: SyncOperation[], folderTree: boolean, sharedRecords: boolean) {
  const alternatives: NoteConflict[] = [];
  const consumed: string[] = [];
  const blocked = new Set<string>();
  for (const op of ops) {
    if (op.kind !== 'item' && op.kind !== 'trash' && !(folderTree && op.kind === 'folder')
        && !(sharedRecords && isLegacySharedKind(op.kind))) continue;
    const entry = { intentId: op.opId, revision: 0, fields: [LEGACY_CUTOVER], at: Math.max(0, Math.trunc(op.timestamp)) };
    if (op.kind === 'item' && op.action === 'upsert' && op.id !== FOLDER_TREE_ID && !isSharedRegistryId(op.id)) {
      const raw = op.payload;
      if (isLegacyNoteItem(raw) && raw.id === op.id) {
        alternatives.push({ ...entry, noteId: op.id, kind: 'update', item: relayNote(raw) });
        consumed.push(op.opId);
        continue;
      }
    } else if (op.kind === 'draft' && (op.action === 'upsert' || op.action === 'delete')) {
      const sep = op.id.indexOf(':');
      const type = op.id.slice(0, sep);
      const key = op.id.slice(sep + 1);
      if (sep > 0 && (type === 'composer' || type === 'fullscreen') && key) {
        // A temporary fullscreen ID never belongs in a shared journal. The draft itself stays local.
        if (type === 'fullscreen' && key.startsWith('draft_')) {
          consumed.push(op.opId);
          continue;
        }
        try {
          const noteId = sharedRegistryId(type, key);
          const kind = op.action === 'delete' ? 'delete' : 'update';
          const { shared } = checkedSharedBody(noteId, kind === 'delete' ? null : op.payload, kind);
          const raw = op.payload as { attachments?: unknown } | undefined;
          if (shared && 'attachments' in (raw ?? {}) && (!Array.isArray(raw?.attachments)
              || typeof shared !== 'object' || !('attachments' in shared) || raw.attachments.length !== shared.attachments?.length)) {
            throw new Error('Incomplete legacy draft attachments');
          }
          alternatives.push({ ...entry, noteId, kind, item: shared === null ? null : { shared } });
          consumed.push(op.opId);
          continue;
        } catch (error) {
          // Keep the original payload intact when the shared format cannot represent it.
          if (!(error instanceof Error)) throw error;
        }
      }
    }
    blocked.add(`${op.kind}/${op.action}`);
  }
  if (blocked.size) throw new LegacyCutoverBlocked(blocked);
  return { alternatives, consumed };
}
