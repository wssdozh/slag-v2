// The app's implementation of the vault port: one adapter over StorageService, so sync never
// imports the browser store directly and the headless node can swap it out at build time.
import { storage } from './index';
import type { VaultPort } from './port';

export const browserVaultPort: VaultPort = {
  getCurrentVault: () => storage.getCurrentVault(),
  getVaults: () => storage.getVaults(),
  ensureVaultSyncId: (vaultId) => storage.ensureVaultSyncId(vaultId),

  getItems: () => storage.getItems(),
  getFolders: () => storage.getFolders(),
  getWorkspaceState: () => storage.getWorkspaceState(),
  getMemory: () => storage.getMemory(),
  saveMemory: (items, origin = 'local') => storage.saveMemory(items, origin),

  importSyncedVaultData: (data) => storage.importSyncedVaultData(data),
  importSyncedAttachment: (attachment, dataUrl) => storage.importSyncedAttachment(attachment, dataUrl),
  getAttachmentDataUrl: (attachment) => storage.getAttachmentDataUrl(attachment),

  getComposerDraft: (folderPath) => storage.getComposerDraft(folderPath),
  saveComposerDraft: (folderPath, draft, origin = 'local') => storage.saveComposerDraft(folderPath, draft, origin),
  deleteComposerDraft: (folderPath, origin = 'local') => storage.deleteComposerDraft(folderPath, origin),
  getFullscreenDraft: (itemId) => storage.getFullscreenDraft(itemId),
  saveFullscreenDraft: (itemId, draft, origin = 'local') => storage.saveFullscreenDraft(itemId, draft, origin),
  clearFullscreenDraft: (itemId, origin = 'local') => storage.clearFullscreenDraft(itemId, origin),

  subscribeChanges: (listener) => storage.subscribeChanges(listener),
};
