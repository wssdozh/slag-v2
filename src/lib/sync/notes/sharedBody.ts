import type { ComposerDraft, FullscreenDraft, MemoryItem } from '../../../types/index.ts';
import { composerDraftsFrom, fullscreenDraftsFrom, memoryFromSection } from '../../storage/stateSections.ts';
import type { NoteKind } from './wire.ts';
import { isSharedWorkspaceField, readSharedWorkspaceField } from './sharedWorkspace.ts';
import type { SharedWorkspaceValue } from './sharedWorkspace.ts';

const prefix = 'slag:shared:v1:';
export type SharedKind = 'memory' | 'composer' | 'fullscreen' | 'workspace';
export type SharedValue = { shared: MemoryItem | ComposerDraft | FullscreenDraft | SharedWorkspaceValue };

export function isLegacySharedKind(kind: string): boolean {
  return kind === 'workspace' || kind === 'assistant_prompt' || kind === 'memory' || kind === 'draft';
}
export type SharedBody = { id: string; shared: SharedValue['shared'] | null };
export interface SharedMutation { id: string; value: unknown; previous: unknown; keepAlternative?: true }

export function isSharedRegistryId(id: string): boolean {
  return id.startsWith(prefix);
}

export function sharedRegistryId(kind: SharedKind, key: string): string {
  if (!key || key === '__proto__' || key.length > 1024) throw new Error('Invalid shared registry key');
  return `${prefix}${kind}:${key}`;
}

export function parseSharedRegistryId(id: string): { type: SharedKind; key: string } {
  if (!isSharedRegistryId(id)) throw new Error('Invalid shared registry address');
  const address = id.slice(prefix.length);
  const split = address.indexOf(':');
  const key = address.slice(split + 1);
  const type = address.slice(0, split);
  if ((type !== 'memory' && type !== 'composer' && type !== 'fullscreen' && type !== 'workspace') || id !== sharedRegistryId(type, key)) {
    throw new Error('Invalid shared registry address');
  }
  return { type, key };
}

export function readSharedBody(id: string, value: unknown, kind: NoteKind): SharedBody {
  const { type, key } = parseSharedRegistryId(id);
  if (type === 'workspace') {
    if (!isSharedWorkspaceField(key)) throw new Error('Invalid shared workspace field');
    if (kind !== 'delete') return { id, shared: readSharedWorkspaceField(key, value) };
  }
  if (kind === 'delete' && value === null) return { id, shared: null };
  if (kind === 'delete' || value === null) throw new Error('Invalid shared registry deletion');
  const shared = type === 'memory' ? memoryFromSection({ items: [value] }).find((fact) => fact.id === key && fact.deletedAt === undefined)
    : type === 'composer' ? composerDraftsFrom({ value }).value
    : fullscreenDraftsFrom({ value }).value;
  if (!shared || (type === 'fullscreen' && (!('itemId' in shared) || shared.itemId !== key))) {
    throw new Error('Invalid shared registry value');
  }
  if ('attachments' in shared && shared.attachments) {
    return { id, shared: { ...shared, attachments: shared.attachments.map(({ dataUrl, ...metadata }) => {
      void dataUrl;
      return metadata;
    }) } };
  }
  return { id, shared };
}
