import type { ComposerDraft, FullscreenDraft, MemoryItem, WorkspaceState } from '../../types/index.ts';
import { parseSharedRegistryId, readSharedBody, sharedRegistryId } from '../sync/notes/sharedBody.ts';
import type { SharedBody, SharedMutation } from '../sync/notes/sharedBody.ts';
import { equal } from '../sync/notes/merge.ts';
import { isSharedWorkspaceField, selectSharedWorkspace, sharedWorkspacePatch } from '../sync/notes/sharedWorkspace.ts';
import { draftsFromSection, draftsToSection, memoryFromSection, memoryToSection } from './stateSections.ts';
import type { DraftsSection } from './stateSections.ts';

export function workspaceSharedMutations(before: WorkspaceState, patch: Partial<WorkspaceState>): SharedMutation[] {
  const previous = selectSharedWorkspace(before);
  const next = selectSharedWorkspace({ ...before, ...patch });
  return Object.keys(next).flatMap((key) => {
    if (!isSharedWorkspaceField(key) || equal(previous[key], next[key])) return [];
    return [{ id: sharedRegistryId('workspace', key), previous: previous[key] ?? null, value: next[key] ?? null }];
  });
}

export function memorySharedMutations(before: MemoryItem[], after: MemoryItem[]): SharedMutation[] {
  const live = (items: MemoryItem[]) => new Map(items.filter((item) => item.deletedAt === undefined).map((item) => [item.id, item]));
  const previous = live(before);
  const next = live(after);
  const deleted = new Set(after.filter((item) => item.deletedAt !== undefined).map((item) => item.id));
  return [...new Set([...previous.keys(), ...next.keys()])].flatMap((key) => {
    const old = previous.get(key) ?? null;
    const value = next.get(key) ?? null;
    // A missing list member is not an explicit deletion. The memory API writes a tombstone.
    if (value === null && !deleted.has(key)) return [];
    return equal(old, value) ? [] : [{ id: sharedRegistryId('memory', key), previous: old, value }];
  });
}

export function draftSharedMutation(kind: 'composer' | 'fullscreen', key: string,
  previous: ComposerDraft | FullscreenDraft | null, value: ComposerDraft | FullscreenDraft | null): SharedMutation[] {
  const id = sharedRegistryId(kind, key);
  const normalize = (input: typeof value) => readSharedBody(id, input, input === null ? 'delete' : 'update').shared;
  const before = normalize(previous);
  const after = normalize(value);
  return equal(before, after) ? [] : [{ id, previous: before, value: after }];
}

export function sharedSettingsProjection(body: SharedBody) {
  const { type, key } = parseSharedRegistryId(body.id);
  const { shared } = readSharedBody(body.id, body.shared, body.shared === null ? 'delete' : 'update');
  if (type === 'workspace') {
    if (!isSharedWorkspaceField(key)) throw new Error('Invalid shared workspace field');
    return { section: 'workspace' as const, patch: (current: WorkspaceState) => sharedWorkspacePatch(key, shared, current) };
  }
  if (type === 'memory') {
    const replace = (items: MemoryItem[]) => {
      const result = items.filter((item) => item.id !== key);
      if (shared !== null) result.push(shared as MemoryItem);
      return result;
    };
    return { section: 'memory' as const, patch: (disk: unknown) => memoryToSection(replace(memoryFromSection(disk))), replace };
  }
  const replace = (target: DraftsSection) => {
    // A remote tombstone deletes exactly this draft; don't compare editor clocks.
    if (shared === null) delete target[type][key];
    else if (type === 'composer') target.composer[key] = shared as ComposerDraft;
    else target.fullscreen[key] = shared as FullscreenDraft;
  };
  return { section: 'drafts' as const, patch: (disk: unknown) => {
    const drafts = draftsFromSection(disk);
    replace(drafts);
    return draftsToSection(drafts);
  }, replace };
}
