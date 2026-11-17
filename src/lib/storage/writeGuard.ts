// The one comparison a write makes before it replaces a file: has this note moved on disk since
// the index last read it. Kept separate from the storage service so it can be tested without a
// filesystem — the rest of the guard is a read and a reload.

export interface NoteIdentity {
  id: string;
  /** The `updated` frontmatter value, in epoch milliseconds. */
  updatedAt: number;
}

/** True when the file behind the note is somebody else's newer version. */
export function hasNewerVersionOnDisk(onDisk: NoteIdentity | null, indexed: NoteIdentity): boolean {
  return Boolean(onDisk && onDisk.id === indexed.id && onDisk.updatedAt > indexed.updatedAt);
}
