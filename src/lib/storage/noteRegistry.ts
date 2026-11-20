import type { SlagItem } from '../../types';

export interface NoteMutation {
  id: string;
  kind: 'create' | 'update' | 'delete' | 'restore';
  item: SlagItem | null;
  /** Snapshot visible at the mutation, even when a remote write is finishing on disk. */
  previous?: SlagItem;
}

export interface AcceptedNote { id: string; item: SlagItem | null }

export interface NoteRegistryStorage {
  readNoteRegistry(): Promise<unknown>;
  writeNoteRegistry(value: unknown): Promise<void>;
  writeNoteConflict(id: string, value: unknown): Promise<void>;
  applyAcceptedNote(note: AcceptedNote): Promise<void>;
  subscribeNoteIntents(listener: (changes: NoteMutation[]) => Promise<void>): () => void;
}
