// Internal ownership of a composer draft expanded into the editor; never infer it from edited text.
import type { ComposerDraft, SlagItem } from '../../../types';
import { storage } from '../../../lib/storage';

const owners = new WeakMap<SlagItem, { vaultId: string; folder: string; snapshot: string }>();

export function rememberComposerDraft(item: SlagItem, folder: string, draft: ComposerDraft): void {
  storage.saveComposerDraft(folder, draft);
  storage.flushDrafts();
  owners.set(item, { vaultId: storage.getCurrentVault().id, folder, snapshot: JSON.stringify(storage.getComposerDraft(folder)) });
}

export function restoreComposerDraft(item: SlagItem, draft: ComposerDraft): boolean {
  const owner = owners.get(item);
  if (!owner) return false;
  if (storage.getCurrentVault().id === owner.vaultId && JSON.stringify(storage.getComposerDraft(owner.folder)) === owner.snapshot) {
    rememberComposerDraft(item, owner.folder, draft);
  }
  return true;
}

export function consumeComposerDraft(item: SlagItem): void {
  const owner = owners.get(item);
  if (owner && storage.getCurrentVault().id === owner.vaultId && JSON.stringify(storage.getComposerDraft(owner.folder)) === owner.snapshot) {
    storage.deleteComposerDraft(owner.folder);
  }
  owners.delete(item);
}
