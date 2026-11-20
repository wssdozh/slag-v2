import type { SlagItem } from '../../types';

export interface NoteMutation {
  id: string;
  kind: 'create' | 'update' | 'delete' | 'restore';
  item: SlagItem | null;
}

export interface AcceptedNote { id: string; item: SlagItem | null }

export interface NoteRegistryStorage {
  readNoteRegistry(): Promise<unknown>;
  writeNoteRegistry(value: unknown): Promise<void>;
  applyAcceptedNote(note: AcceptedNote): Promise<void>;
  subscribeNoteIntents(listener: (changes: NoteMutation[]) => Promise<void>): () => void;
}
