// The sync vocabulary: which entities travel, which actions exist, what one op holds.
import type { SlagItem, FolderMeta, WorkspaceState, SlagAttachment } from '../../../types';

export type SyncEntityKind = 'item' | 'folder' | 'workspace' | 'trash' | 'attachment' | 'draft' | 'memory';

export type SyncAction = 'upsert' | 'delete' | 'rename' | 'restore' | 'purge';

export interface SyncOperation {
  opId: string;
  kind: SyncEntityKind;
  id: string;
  action: SyncAction;
  timestamp: number;
  payload?: SlagItem | FolderMeta | WorkspaceState | SlagAttachment | unknown;
  oldPath?: string;
}
