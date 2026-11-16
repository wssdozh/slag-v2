// A bundle is written from a snapshot: the user keeps typing while it travels to disk.
import type { FolderMeta, SlagItem, WorkspaceState } from '../../types';

/**
 * The three states a staged sync import touches.
 *
 * `base` is what the bundle's merge was computed from, `current` is what the vault holds now,
 * and `incoming` is the staged result of the merge. Keeping them apart is what lets a note saved
 * mid-persist survive: the bundle may only be a few hundred milliseconds old, but the person in
 * front of the screen is faster.
 */
export interface SyncedVaultSnapshot {
  items: SlagItem[];
  folders: FolderMeta[];
  workspace: WorkspaceState;
}

export interface StagedSyncImport {
  items: SlagItem[];
  folders: FolderMeta[];
  /** Absent when the bundle carried no workspace change. */
  workspace?: WorkspaceState;
}

export interface ReconciledSyncImport {
  items: SlagItem[];
  folders: FolderMeta[];
  workspace: WorkspaceState;
  /** Notes whose local copy won over an older remote one already written: put them back on disk. */
  localWins: SlagItem[];
  /** Notes deleted locally while the bundle was persisting: their files must go too. */
  dropped: SlagItem[];
  /** True when the local state moved after the merge was computed. */
  drifted: boolean;
}

const sameJson = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/** Wall-clock last-writer-wins, the same rule the bundle merge itself uses. */
const newerThan = (candidate: SlagItem, other: SlagItem): boolean =>
  (candidate.updatedAt ?? 0) > (other.updatedAt ?? 0);

function mergeWorkspace(
  base: WorkspaceState,
  current: WorkspaceState,
  incoming: WorkspaceState | undefined,
): WorkspaceState {
  if (!incoming) return current;
  const merged = { ...current, ...incoming } as Record<string, unknown>;
  const before = base as unknown as Record<string, unknown>;
  const now = current as unknown as Record<string, unknown>;
  // A field the person changed while the bundle was on its way is newer than the whole payload.
  for (const key of Object.keys(now)) {
    if (!sameJson(now[key], before[key])) merged[key] = now[key];
  }
  return merged as unknown as WorkspaceState;
}

/**
 * Merges a staged remote snapshot over the local state it was computed from, tolerating a local
 * write in between. Without this a single save during the write either lost the local edit or
 * failed the whole burst, and a failed burst left the bundle pending and the screen red.
 */
export function reconcileSyncedVault(input: {
  base: SyncedVaultSnapshot;
  current: SyncedVaultSnapshot;
  incoming: StagedSyncImport;
}): ReconciledSyncImport {
  const { base, current, incoming } = input;
  const workspace = mergeWorkspace(base.workspace, current.workspace, incoming.workspace);
  const drifted =
    !sameJson(base.items, current.items) ||
    !sameJson(base.folders, current.folders) ||
    !sameJson(base.workspace, current.workspace);
  if (!drifted) {
    // The common case: nothing moved, so the staged result is already the answer.
    return { items: incoming.items, folders: incoming.folders, workspace, localWins: [], dropped: [], drifted };
  }

  const baseById = new Map(base.items.map((item) => [item.id, item]));
  const currentIds = new Set(current.items.map((item) => item.id));
  const incomingById = new Map(incoming.items.map((item) => [item.id, item]));
  const dropped = incoming.items.filter((item) => baseById.has(item.id) && !currentIds.has(item.id));
  const droppedIds = new Set(dropped.map((item) => item.id));

  const items: SlagItem[] = [];
  const localWins: SlagItem[] = [];
  const placed = new Set<string>();
  for (const local of current.items) {
    placed.add(local.id);
    const staged = incomingById.get(local.id);
    if (!staged) {
      // Created locally while the bundle was being written: the bundle never heard of it.
      items.push(local);
      continue;
    }
    const baseItem = baseById.get(local.id);
    const touched = !baseItem || !sameJson(baseItem, local);
    const remoteWrote = !sameJson(baseItem, staged);
    // A per-keystroke edit bumps `updatedAt`, so "touched and not older" keeps the fresh copy.
    if ((touched && !newerThan(staged, local)) || newerThan(local, staged)) {
      items.push(local);
      if (remoteWrote) localWins.push(local);
    } else {
      items.push(staged);
    }
  }
  for (const staged of incoming.items) {
    if (placed.has(staged.id) || droppedIds.has(staged.id)) continue;
    items.push(staged);
  }

  const currentFolders = new Set(current.folders.map((folder) => folder.path));
  const baseFolders = new Map(base.folders.map((folder) => [folder.path, folder]));
  const incomingFolders = new Map(incoming.folders.map((folder) => [folder.path, folder]));
  const folders: FolderMeta[] = [];
  for (const local of current.folders) {
    const staged = incomingFolders.get(local.path);
    if (!staged) {
      // Renamed or created locally: a path the bundle never saw stays where the person put it.
      if (!baseFolders.has(local.path)) folders.push(local);
      continue;
    }
    folders.push(sameJson(baseFolders.get(local.path), local) ? staged : local);
  }
  for (const staged of incoming.folders) {
    if (currentFolders.has(staged.path) || baseFolders.has(staged.path)) continue;
    folders.push(staged);
  }

  return { items, folders, workspace, localWins, dropped, drifted };
}
