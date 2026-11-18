// Which files a synced import takes off the disk.
//
// A bundle carries changes, not a snapshot of the vault: a note it never mentions is a note it never
// touched. Reading "absent from the payload" as "deleted" once removed eighty-four files the sender
// had said nothing about, so the only notes that leave the disk are the ids the bundle deleted and
// named. A backup restored from a file names none of them and therefore removes nothing.
//
// Pure and import-free on purpose: `node --test` reads this file as is.
export function notesRemovedByImport<T extends { id: string }>(
  previous: readonly T[],
  nextIds: ReadonlySet<string>,
  removedIds: readonly string[],
): T[] {
  if (removedIds.length === 0) return [];
  const byId = new Map(previous.map((item) => [item.id, item]));
  const gone: T[] = [];
  for (const id of removedIds) {
    // The same bundle may have carried the note's new copy after the delete: it is back, not gone.
    if (nextIds.has(id)) continue;
    const item = byId.get(id);
    if (item) gone.push(item);
  }
  return gone;
}
