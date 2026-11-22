import type { FolderMeta, SlagItem } from '../../types';

export type NoteOrigin = { revision: number } | { intentId: string };

export interface NoteMutation {
  id: string;
  intentId?: string;
  /** null: a snapshot is available, but its registry provenance is not known. */
  origin?: NoteOrigin | null;
  kind: 'create' | 'update' | 'delete' | 'restore';
  item: SlagItem | null;
  /** Snapshot visible at the mutation, even when a remote write is finishing on disk. */
  previous?: SlagItem;
}

export interface AcceptedNote {
  id: string;
  item: SlagItem | null;
  revision?: number;
  registryBodyMarker?: string;
  /** The live copy is a rejected edit, not the deleted revision. Do not move it to trash. */
  discardLiveCopy?: true;
}

export type FolderTreeListener = (folders: FolderMeta[], previous: FolderMeta[]) => Promise<void>;
export type FolderGroupListener = (changes: NoteMutation[], folders: FolderMeta[], previous: FolderMeta[]) => Promise<void>;

export interface NoteRegistryStorage {
  applyAcceptedFolderTree?(folders: FolderMeta[]): Promise<void>;
  hasIncompleteFolderProjection?(): Promise<boolean>;
  readRegistryNoteCopies?(ids: Set<string>): Promise<{ item: SlagItem; marker?: string }[]>;
  rememberNoteProjection?(note: AcceptedNote, disk: SlagItem): void;
  applyAcceptedFolderGroup?(notes: AcceptedNote[], folders: FolderMeta[] | undefined): Promise<void>;
  subscribeFolderTreeIntents?(listener: FolderTreeListener, group?: FolderGroupListener): () => void;
  readNoteRegistry(): Promise<unknown>;
  writeNoteRegistry(value: unknown): Promise<void>;
  applyAcceptedNote(note: AcceptedNote): Promise<void>;
  subscribeNoteIntents(listener: (changes: NoteMutation[]) => Promise<void>): () => void;
}
