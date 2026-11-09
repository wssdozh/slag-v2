import type { ComposerDraft, FullscreenDraft, ChatMessage, WorkspaceState, FolderViewSettings } from '../../types';
import { DEFAULT_FOLDER_VIEW_SETTINGS } from '../../types';
import { DEFAULT_WORKSPACE_STATE } from '../../config';
import { STORAGE_KEYS } from '../../config';
import { logger } from '../logger';
import { stripAttachmentList } from './attachmentData';
import type { StorageChangeEvent } from '.';

const fsLog = logger.scope('FS');

interface DraftStoreDeps {
  getVaultId: () => string;
  emitChange: (event: StorageChangeEvent) => void;
  getChannel: () => BroadcastChannel | null;
  instanceId: string;
}

export class DraftStore {
  private readonly deps: DraftStoreDeps;

  constructor(deps: DraftStoreDeps) {
    this.deps = deps;
  }

  private get vaultId(): string {
    return this.deps.getVaultId();
  }

  private get channel(): BroadcastChannel | null {
    return this.deps.getChannel();
  }

  private getDraftsKey(): string {
    return `${STORAGE_KEYS.DRAFTS_PREFIX}${this.vaultId}`;
  }

  private getFullscreenDraftsKey(): string {
    return `${STORAGE_KEYS.FULLSCREEN_DRAFTS_PREFIX}${this.vaultId}`;
  }

  private getAssistantKey(): string {
    return `${STORAGE_KEYS.ASSISTANT_PREFIX}${this.vaultId}`;
  }

  private getWorkspaceStateKey(): string {
    return `${STORAGE_KEYS.WORKSPACE_STATE_PREFIX}${this.vaultId}`;
  }

  // Composer Drafts
  public getAllComposerDrafts(): Record<string, ComposerDraft> {
    const raw = localStorage.getItem(this.getDraftsKey());
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  public getComposerDraft(folderPath: string): ComposerDraft | null {
    const all = this.getAllComposerDrafts();
    return all[folderPath] || null;
  }

  public saveComposerDraft(folderPath: string, draft: ComposerDraft, origin: 'local' | 'remote' = 'local'): void {
    try {
      const all = this.getAllComposerDrafts();
      all[folderPath] = { ...draft, attachments: stripAttachmentList(draft.attachments || []) };
      localStorage.setItem(this.getDraftsKey(), JSON.stringify(all));
      this.deps.emitChange({
        kind: 'draft',
        action: 'upsert',
        id: `composer:${folderPath}`,
        payload: draft,
        origin,
      });
      if (origin === 'local' && this.channel) {
        try {
          this.channel.postMessage({
            type: 'DRAFT_CHANGED',
            senderId: this.deps.instanceId,
            folderPath,
            draft,
            action: 'upsert',
          });
        } catch {}
      }
    } catch (err) {
      fsLog.warn('Failed to save composer draft to localStorage', { folderPath, err });
    }
  }

  public deleteComposerDraft(folderPath: string, origin: 'local' | 'remote' = 'local'): void {
    try {
      const all = this.getAllComposerDrafts();
      const had = folderPath in all;
      if (had) {
        delete all[folderPath];
        localStorage.setItem(this.getDraftsKey(), JSON.stringify(all));
      }
      const draftTombKey = `slag_sync_draft_tomb_${this.vaultId}_composer:${folderPath}`;
      localStorage.setItem(draftTombKey, String(Date.now()));
      this.deps.emitChange({
        kind: 'draft',
        action: 'delete',
        id: `composer:${folderPath}`,
        origin,
      });
      if (origin === 'local' && this.channel) {
        try {
          this.channel.postMessage({
            type: 'DRAFT_CHANGED',
            senderId: this.deps.instanceId,
            folderPath,
            draft: null,
            action: 'delete',
          });
        } catch {}
      }
    } catch (err) {
      fsLog.warn('Failed to delete composer draft from localStorage', { folderPath, err });
    }
  }

  // Fullscreen Drafts
  public getFullscreenDraft(itemId: string): FullscreenDraft | null {
    try {
      const raw = localStorage.getItem(`${this.getFullscreenDraftsKey()}_${itemId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public saveFullscreenDraft(itemId: string, draft: FullscreenDraft, origin: 'local' | 'remote' = 'local'): void {
    try {
      localStorage.setItem(`${this.getFullscreenDraftsKey()}_${itemId}`, JSON.stringify(draft));
      this.deps.emitChange({
        kind: 'draft',
        action: 'upsert',
        id: `fullscreen:${itemId}`,
        payload: draft,
        origin,
      });
    } catch (err) {
      fsLog.warn('Failed to save fullscreen draft to localStorage', { itemId, err });
    }
  }

  public clearFullscreenDraft(itemId: string, origin: 'local' | 'remote' = 'local'): void {
    try {
      localStorage.removeItem(`${this.getFullscreenDraftsKey()}_${itemId}`);
      this.deps.emitChange({
        kind: 'draft',
        action: 'delete',
        id: `fullscreen:${itemId}`,
        origin,
      });
    } catch {}
  }

  public getFullscreenWidth(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEYS.FULLSCREEN_WIDTH) === 'true';
    } catch {
      return false;
    }
  }

  public saveFullscreenWidth(isFullWidth: boolean): void {
    try {
      localStorage.setItem(STORAGE_KEYS.FULLSCREEN_WIDTH, String(isFullWidth));
    } catch {}
  }

  // Assistant History
  public getAssistantHistory(): ChatMessage[] {
    const raw = localStorage.getItem(this.getAssistantKey());
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public saveAssistantHistory(messages: ChatMessage[]): void {
    try {
      localStorage.setItem(this.getAssistantKey(), JSON.stringify(messages));
    } catch (err) {
      fsLog.error('Failed to save assistant history to localStorage', { count: messages.length, err });
    }
  }

  public clearAssistantHistory(): void {
    localStorage.removeItem(this.getAssistantKey());
    fsLog.info('Cleared assistant chat history');
  }

  // Workspace State
  public getWorkspaceState(): WorkspaceState {
    const raw = localStorage.getItem(this.getWorkspaceStateKey());
    if (!raw) return { ...DEFAULT_WORKSPACE_STATE };
    try {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_WORKSPACE_STATE,
        ...(parsed && typeof parsed === 'object' ? parsed : {}),
      };
    } catch {
      return { ...DEFAULT_WORKSPACE_STATE };
    }
  }

  public saveWorkspaceState(partialState: Partial<WorkspaceState>, origin: 'local' | 'remote' = 'local'): void {
    try {
      const current = this.getWorkspaceState();
      const updated = { ...current, ...partialState };
      localStorage.setItem(this.getWorkspaceStateKey(), JSON.stringify(updated));
      this.deps.emitChange({ kind: 'workspace', action: 'upsert', id: 'workspace_state', payload: updated, origin });
    } catch (err) {
      fsLog.warn('Failed to save workspace state to localStorage', err);
    }
  }

  public getFolderViewSettings(folderPath: string): FolderViewSettings {
    const ws = this.getWorkspaceState();
    return ws.folderSettings?.[folderPath] || {
      ...DEFAULT_FOLDER_VIEW_SETTINGS,
      viewMode: ws.feedViewMode || DEFAULT_FOLDER_VIEW_SETTINGS.viewMode,
      typeFilter: ws.activeTypeFilter || DEFAULT_FOLDER_VIEW_SETTINGS.typeFilter,
      sortBy: ws.sortBy || DEFAULT_FOLDER_VIEW_SETTINGS.sortBy,
      sortOrder: ws.sortOrder || DEFAULT_FOLDER_VIEW_SETTINGS.sortOrder,
      hideCompletedTasks: ws.hideCompletedTasks ?? DEFAULT_FOLDER_VIEW_SETTINGS.hideCompletedTasks,
    };
  }

  public saveFolderViewSettings(folderPath: string, settings: Partial<FolderViewSettings>): void {
    const ws = this.getWorkspaceState();
    const currentSettings = ws.folderSettings?.[folderPath] || { ...DEFAULT_FOLDER_VIEW_SETTINGS };
    const updatedSettings = { ...currentSettings, ...settings };
    const folderSettings = { ...(ws.folderSettings || {}), [folderPath]: updatedSettings };
    this.saveWorkspaceState({ folderSettings });
  }
}
