// The authenticated relay sees routing metadata, never the note's identity or body.
import type { FolderMeta, SlagAttachment, SlagItem } from '../../../types/index.ts';
import { safeVaultRelativePath } from '../../vault/safePath.ts';
import { isFolderColor } from '../../vault/folderColor.ts';
import { readSharedBody, isSharedRegistryId } from './sharedBody.ts';
import type { SharedBody } from './sharedBody.ts';

import { bytesToBase64, base64ToBytes, toArrayBuffer } from '../../media/byteCodec.ts';

export const FOLDER_TREE_ID = 'slag:folder-tree:v1';
export type RegistryBody = { id: string; item: SlagItem | null } | { id: typeof FOLDER_TREE_ID; folders: FolderMeta[] };

export type NoteKind = 'create' | 'update' | 'delete' | 'restore';
export type NoteMode = 'legacy' | 'frozen' | 'registry';
export interface NoteStatus { mode: NoteMode; generation: number; head: number; floor: number; folderTree?: true; atomicGroups?: true; sharedRecords?: true; registryMedia?: true }
export interface NoteSealed { iv: string; ciphertext: string }
export interface NoteGroup { id: string; index: number; size: number }
export interface NoteOp {
  opId: string;
  noteId: string;
  baseRevision: number;
  kind: NoteKind;
  group?: NoteGroup;
  mediaIds?: string[];
  sealed: NoteSealed;
}
export interface NoteHead extends NoteOp { revision: number }
export type NoteResult = { opId: string; status: 'accepted'; revision: number }
  | { opId: string; status: 'stale'; current: NoteHead | null }
  | { opId: string; status: 'rejected'; code: string };
export interface NoteEvents { generation: number; head: number; floor: number; events: NoteHead[] }
export interface NoteHeads { generation: number; head: number; floor: number; heads: NoteHead[]; next: string | null }
export interface NoteResults { type: 'note_results'; requestId: string; generation: number; results: NoteResult[] }

export const NOTE_BATCH_COUNT = 100;
export const NOTE_BATCH_BYTES = 2_000_000;
export const NOTE_MAX_BYTES = 12_000_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const opaqueId = /^[a-f0-9]{64}$/;
const opId = /^[A-Za-z0-9_-]{1,128}$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid note registry record');
  return value as Record<string, unknown>;
}

function integer(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new Error('Invalid note registry revision');
  return value;
}

function string(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error('Invalid note registry field');
  return value;
}

function records<T>(value: unknown, parse: (value: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > NOTE_BATCH_COUNT) throw new Error('Invalid note registry page');
  return value.map(parse);
}

function watermark(value: Record<string, unknown>) {
  const generation = integer(value.generation);
  const head = integer(value.head);
  const floor = integer(value.floor);
  if (floor > head) throw new Error('Invalid note registry watermark');
  return { generation, head, floor };
}

export function parseNoteStatus(value: unknown): NoteStatus {
  const input = record(value);
  const { mode } = input;
  if (mode !== 'legacy' && mode !== 'frozen' && mode !== 'registry') throw new Error('Invalid note registry mode');
  if (input.folderTree !== undefined && input.folderTree !== true) throw new Error('Invalid folder tree capability');
  if (input.folderTree === true && mode !== 'registry') throw new Error('Folder tree requires registry mode');
  if (input.atomicGroups !== undefined && (input.atomicGroups !== true || input.folderTree !== true)) {
    throw new Error('Atomic groups require folder tree capability');
  }
  if (input.sharedRecords !== undefined && (input.sharedRecords !== true || mode !== 'registry')) throw new Error('Invalid shared records capability');
  if (input.registryMedia !== undefined && (input.registryMedia !== true || mode !== 'registry')) throw new Error('Invalid registry media capability');
  return { mode, ...watermark(input), ...(input.folderTree === true ? { folderTree: true as const } : {}),
    ...(input.atomicGroups === true ? { atomicGroups: true as const } : {}),
    ...(input.sharedRecords === true ? { sharedRecords: true as const } : {}),
    ...(input.registryMedia === true ? { registryMedia: true as const } : {}) };
}

function readMediaIds(value: unknown, kind: NoteKind): string[] | undefined {
  if (value === undefined) return undefined;
  const ids = records(value, (id) => string(id, opaqueId));
  if (kind === 'delete' || !ids.length || ids.some((id, i) => i > 0 && id <= ids[i - 1])) {
    throw new Error('Invalid registry media references');
  }
  return ids;
}

export function parseNoteHead(value: unknown): NoteHead {
  const input = record(value);
  const { kind } = input;
  if (kind !== 'create' && kind !== 'update' && kind !== 'delete' && kind !== 'restore') throw new Error('Invalid note operation kind');
  const sealed = record(input.sealed);
  const revision = integer(input.revision, 1);
  const baseRevision = integer(input.baseRevision);
  if (baseRevision >= revision) throw new Error('Invalid note operation base');
  const group = input.group === undefined ? undefined : parseGroup(input.group);
  const mediaIds = readMediaIds(input.mediaIds, kind);
  const ciphertext = sealed.ciphertext;
  if (typeof ciphertext !== 'string' || ciphertext.length < 24 || ciphertext.length > NOTE_MAX_BYTES) throw new Error('Invalid encrypted note size');
  return {
    kind, revision, baseRevision, noteId: string(input.noteId, opaqueId), opId: string(input.opId, opId),
    ...(group ? { group } : {}), ...(mediaIds ? { mediaIds } : {}), sealed: { iv: string(sealed.iv, /^[A-Za-z0-9+/]{16}$/), ciphertext },
  };
}

export function parseNoteEvents(value: unknown): NoteEvents {
  const input = record(value);
  return { ...watermark(input), events: records(input.events, parseNoteHead) };
}

export function parseLiveNoteEvents(value: unknown): Pick<NoteEvents, 'generation' | 'events'> {
  const input = record(value);
  if (input.type !== 'note_events') throw new Error('Invalid live note event');
  return { generation: integer(input.generation, 1), events: records(input.events, parseNoteHead) };
}

export function parseNoteHeads(value: unknown): NoteHeads {
  const input = record(value);
  return { ...watermark(input), heads: records(input.heads, parseNoteHead), next: input.next === null ? null : string(input.next, opaqueId) };
}

export function parseNoteResults(value: unknown): NoteResults {
  const input = record(value);
  if (input.type !== 'note_results') throw new Error('Invalid note registry response');
  return {
    type: input.type,
    generation: integer(input.generation, 1),
    requestId: string(input.requestId, opId),
    results: records(input.results, (raw): NoteResult => {
      const result = record(raw);
      const id = string(result.opId, opId);
      if (result.status === 'accepted') return { opId: id, status: result.status, revision: integer(result.revision, 1) };
      if (result.status === 'stale') return { opId: id, status: result.status, current: result.current === null ? null : parseNoteHead(result.current) };
      if (result.status === 'rejected') return { opId: id, status: result.status, code: string(result.code, /^[a-z0-9_]{1,64}$/) };
      throw new Error('Invalid note operation result');
    }),
  };
}

export function parseGroup(value: unknown): NoteGroup {
  const input = record(value);
  const group = { id: string(input.id, opId), index: integer(input.index), size: integer(input.size, 2) };
  if (group.size > NOTE_BATCH_COUNT || group.index >= group.size) throw new Error('Invalid note group');
  return group;
}

function associatedData(room: string, generation: number, op: Omit<NoteOp, 'sealed'>) {
  const group = op.group;
  return encoder.encode(JSON.stringify(['slag-note-v1', room, generation, op.opId, op.noteId, op.kind, op.baseRevision,
    ...(group ? [group.id, group.index, group.size] : []), ...(op.mediaIds ? [op.mediaIds] : [])]));
}

export async function deriveNoteKeys(vaultKey: CryptoKey, room: string) {
  const source = await crypto.subtle.importKey('raw', await crypto.subtle.exportKey('raw', vaultKey), 'HKDF', false, ['deriveKey']);
  const params = (purpose: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(room), info: encoder.encode(`slag-note-v1:${purpose}`) });
  const [idKey, bodyKey, mediaKey, mediaNonceKey] = await Promise.all([
    crypto.subtle.deriveKey(params('id'), source, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']),
    crypto.subtle.deriveKey(params('body'), source, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    crypto.subtle.deriveKey(params('media'), source, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    crypto.subtle.deriveKey(params('media-nonce'), source, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']),
  ]);
  return { idKey, bodyKey, mediaKey, mediaNonceKey };
}

export type NoteKeys = Awaited<ReturnType<typeof deriveNoteKeys>>;

export async function opaqueNoteId(keys: NoteKeys, id: string): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', keys.idKey, encoder.encode(id)));
  return Array.from(mac, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function sealNote(keys: NoteKeys, room: string, generation: number, op: Omit<NoteOp, 'sealed'>, id: string, item: SlagItem | null): Promise<NoteOp> {
  if (id === FOLDER_TREE_ID || isSharedRegistryId(id) || (op.kind === 'delete') !== (item === null) || (item && item.id !== id)) throw new Error('Invalid local note operation');
  return sealRegistryBody(keys, room, generation, op, { id, item });
}

export function sealFolderTree(keys: NoteKeys, room: string, generation: number, op: Omit<NoteOp, 'sealed'>, folders: FolderMeta[]): Promise<NoteOp> {
  return sealRegistryBody(keys, room, generation, op, { id: FOLDER_TREE_ID, folders: readFolderTree(folders, op.kind) });
}

export function sealSharedRecord(keys: NoteKeys, room: string, generation: number, op: Omit<NoteOp, 'sealed'>, id: string, value: unknown): Promise<NoteOp> {
  if (op.group) throw new Error('Shared records cannot be members of a folder group');
  return sealRegistryBody(keys, room, generation, op, checkedSharedBody(id, value, op.kind));
}

export function checkedSharedBody(id: string, value: unknown, kind: NoteKind): SharedBody {
  const body = readSharedBody(id, value, kind);
  if (body.shared && typeof body.shared === 'object' && 'attachments' in body.shared && (!Array.isArray(body.shared.attachments)
      || !body.shared.attachments.every(isAttachmentMetadata))) throw new Error('Invalid shared attachment metadata');
  return body;
}

export function registryAttachments(body: RegistryBody | SharedBody): SlagAttachment[] {
  const value = 'item' in body ? body.item : 'shared' in body ? body.shared : null;
  return value && typeof value === 'object' && 'attachments' in value ? value.attachments ?? [] : [];
}

export function registryMediaIds(attachments: SlagAttachment[]): string[] {
  return [...new Set(attachments.flatMap(({ registryBlobId }) => registryBlobId ? [registryBlobId] : []))].sort();
}

function verifyMediaIds(body: RegistryBody | SharedBody, declared: string[] | undefined) {
  const expected = registryMediaIds(registryAttachments(body));
  if (expected.length !== (declared?.length ?? 0) || expected.some((id, index) => id !== declared?.[index])) {
    throw new Error('Registry attachment addresses do not match the operation');
  }
}

async function sealRegistryBody(keys: NoteKeys, room: string, generation: number, op: Omit<NoteOp, 'sealed'>, body: RegistryBody | SharedBody): Promise<NoteOp> {
  const mediaIds = readMediaIds(op.mediaIds, op.kind);
  verifyMediaIds(body, mediaIds);
  op = { ...op, ...(mediaIds ? { mediaIds } : {}) };
  if (await opaqueNoteId(keys, body.id) !== op.noteId) throw new Error('Local registry identity mismatch');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: associatedData(room, generation, op) },
    keys.bodyKey, encoder.encode(JSON.stringify(body)),
  ));
  const encoded = bytesToBase64(ciphertext);
  if (encoded.length > NOTE_MAX_BYTES) throw new Error('Note exceeds registry size limit');
  return { ...op, sealed: { iv: bytesToBase64(iv), ciphertext: encoded } };
}

export function isNoteItem(value: unknown): value is SlagItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && item.id.length > 0
    && (item.type === 'note' || item.type === 'task' || item.type === 'article')
    && typeof item.title === 'string' && typeof item.content === 'string' && typeof item.folder === 'string'
    && typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
    && typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
    && Array.isArray(item.tags) && item.tags.every((tag: unknown) => typeof tag === 'string')
    && Array.isArray(item.attachments) && item.attachments.every(isAttachmentMetadata);
}

function isAttachmentMetadata(attachment: unknown): boolean {
  if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return false;
  const metadata = attachment as Record<string, unknown>;
  return typeof metadata.id === 'string' && typeof metadata.name === 'string'
    && typeof metadata.relativePath === 'string' && typeof metadata.mimeType === 'string'
    && (metadata.type === 'image' || metadata.type === 'audio' || metadata.type === 'video' || metadata.type === 'file')
    && typeof metadata.size === 'number' && Number.isFinite(metadata.size) && metadata.size >= 0
    && (metadata.registryBlobId === undefined || (typeof metadata.registryBlobId === 'string' && opaqueId.test(metadata.registryBlobId)))
    && metadata.dataUrl === undefined;
}

function isFolderMeta(value: unknown): value is FolderMeta {
  const folder = record(value);
  return typeof folder.path === 'string' && safeVaultRelativePath(folder.path) === folder.path
    && folder.path.split('/').every((segment) => !segment.startsWith('.'))
    && typeof folder.name === 'string' && typeof folder.description === 'string'
    && (folder.icon === undefined || typeof folder.icon === 'string')
    && (folder.color === undefined || typeof folder.color === 'string')
    && (folder.order === undefined || (typeof folder.order === 'number' && Number.isFinite(folder.order)))
    && (folder.showReferenceColumn === undefined || typeof folder.showReferenceColumn === 'boolean')
    && (folder.kanbanColumns === undefined || (Array.isArray(folder.kanbanColumns)
      && folder.kanbanColumns.every((raw: unknown) => {
        const column = record(raw);
        return typeof column.id === 'string' && typeof column.title === 'string'
          && (column.statusMapping === undefined || ['backlog', 'todo', 'in_progress', 'done'].some((status) => status === column.statusMapping));
      })));
}

export function readFolderTree(value: unknown, kind: NoteKind): FolderMeta[] {
  if ((kind !== 'create' && kind !== 'update') || !Array.isArray(value) || !value.every(isFolderMeta)) {
    throw new Error('Invalid encrypted folder tree');
  }
  if (new Set(value.map((folder) => folder.path.normalize('NFC').toLowerCase())).size !== value.length) {
    throw new Error('Duplicate folder path in registry');
  }
  return value.map((folder) => folder.color === undefined || isFolderColor(folder.color)
    ? folder : { ...folder, color: undefined });
}

export async function openAnyRegistryBody(keys: NoteKeys, room: string, generation: number, op: NoteHead): Promise<RegistryBody | SharedBody> {
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(op.sealed.iv)), additionalData: associatedData(room, generation, op),
  }, keys.bodyKey, toArrayBuffer(base64ToBytes(op.sealed.ciphertext)));
  const { id, item, folders, shared } = record(JSON.parse(decoder.decode(plaintext)));
  if (typeof id !== 'string' || !id || await opaqueNoteId(keys, id) !== op.noteId) throw new Error('Encrypted registry identity mismatch');
  let body: RegistryBody | SharedBody;
  if (isSharedRegistryId(id)) {
    if (op.group) throw new Error('Shared records cannot be members of a folder group');
    body = checkedSharedBody(id, shared, op.kind);
  } else if (id === FOLDER_TREE_ID) {
    body = { id, folders: readFolderTree(folders, op.kind) };
  } else if (op.kind === 'delete' && item === null) {
    body = { id, item };
  } else if (op.kind !== 'delete' && isNoteItem(item) && item.id === id) {
    body = { id, item };
  } else {
    throw new Error('Invalid encrypted note');
  }
  verifyMediaIds(body, readMediaIds(op.mediaIds, op.kind));
  return body;
}

export async function openRegistryBody(keys: NoteKeys, room: string, generation: number, op: NoteHead): Promise<RegistryBody> {
  const body = await openAnyRegistryBody(keys, room, generation, op);
  if ('shared' in body) throw new Error('Shared records require a compatible replica');
  return body;
}

export async function openNote(keys: NoteKeys, room: string, generation: number, op: NoteHead): Promise<{ id: string; item: SlagItem | null }> {
  const body = await openRegistryBody(keys, room, generation, op);
  if (!('item' in body)) throw new Error('Folder tree support is not enabled for this session');
  return body;
}
