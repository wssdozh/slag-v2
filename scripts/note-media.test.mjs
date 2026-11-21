import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { NoteChannel } from '../src/lib/sync/notes/channel.ts';
import { openRegistryMedia, REGISTRY_MEDIA_MAX_BYTES, sealRegistryMedia } from '../src/lib/sync/notes/mediaWire.ts';
import { sharedRegistryId } from '../src/lib/sync/notes/sharedBody.ts';
import { deriveNoteKeys, opaqueNoteId, openAnyRegistryBody, openNote, parseNoteHead, sealNote, sealSharedRecord } from '../src/lib/sync/notes/wire.ts';

test('media channel scopes requests and checks both upload receipt and download bytes', async (t) => {
  const vaultKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const keys = await deriveNoteKeys(vaultKey, 'test/room');
  const controller = new AbortController();
  const channel = new NoteChannel({ serverUrl: 'http://127.0.0.1:1/', roomId: 'test/room', vaultId: 'local-test',
    atomicGroups: true, sharedRecords: true, signal: controller.signal,
    headers: (json) => ({ Authorization: 'Bearer fixture', ...(json ? { 'Content-Type': 'application/json' } : {}) }) });
  let stored;
  let lostPut = true;
  let badReceipt = false;
  let badBytes = false;
  const fetch = t.mock.method(globalThis, 'fetch', async (url, init) => {
    const { pathname, searchParams: params } = new URL(url);
    assert.equal(pathname, '/api/rooms/test%2Froom/note-media');
    assert.equal(params.get('generation'), '7');
    assert.equal(params.get('vault'), 'local-test');
    assert.equal(params.get('sharedRecords'), '1');
    assert.equal(params.get('atomicGroups'), '1');
    assert.equal(init.headers.Authorization, 'Bearer fixture');
    if (init.method === 'PUT') {
      assert.equal(init.headers['Content-Type'], 'application/json');
      const next = JSON.parse(init.body);
      if (!badReceipt && stored) assert.deepEqual(next, stored);
      stored = next;
      const id = createHash('sha256').update(Buffer.from(stored.ciphertext, 'base64')).digest('hex');
      assert.equal(params.get('id'), id);
      if (lostPut) { lostPut = false; throw new TypeError('connection lost after upload'); }
      return Response.json({ id: badReceipt ? 'wrong' : id });
    }
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    return Response.json(badBytes ? { ciphertext: Buffer.alloc(32).toString('base64') } : stored);
  });
  const source = Uint8Array.of(1, 2, 3);
  const id = await channel.uploadMedia(keys, 7, source);
  assert.deepEqual(await channel.downloadMedia(keys, 7, id), source);
  await assert.rejects(channel.uploadMedia(keys, 7, Uint8Array.of(3, 2, 1), id), /Байты вложения изменились/);
  badBytes = true;
  await assert.rejects(channel.downloadMedia(keys, 7, id), /address mismatch/);
  badReceipt = true;
  await assert.rejects(channel.uploadMedia(keys, 7, source), /invalid registry media receipt/i);
  controller.abort();
  await assert.rejects(channel.downloadMedia(keys, 7, id), { name: 'AbortError' });
  assert.equal(fetch.mock.callCount(), 5);
});

test('media references survive parsing and are authenticated by the note seal', async () => {
  const vaultKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const keys = await deriveNoteKeys(vaultKey, 'fixture');
  const mediaIds = ['a'.repeat(64), 'b'.repeat(64)];
  const attachments = mediaIds.map((registryBlobId, i) => ({ id: `file-${i}`, name: `file-${i}`, type: 'file',
    mimeType: 'application/octet-stream', size: 1, relativePath: `.attachments/file-${i}`, registryBlobId }));
  const item = { id: 'fixture', type: 'note', title: '', content: '', folder: 'Inbox', createdAt: 1, updatedAt: 1, tags: [], attachments };
  const op = { opId: 'fixture', noteId: await opaqueNoteId(keys, item.id), kind: 'create', baseRevision: 0, mediaIds };
  const head = parseNoteHead({ ...await sealNote(keys, 'fixture', 7, op, item.id, item), revision: 1 });
  assert.deepEqual(head.mediaIds, mediaIds);
  assert.deepEqual(await openNote(keys, 'fixture', 7, head), { id: item.id, item });
  await assert.rejects(openNote(keys, 'fixture', 7, { ...head, mediaIds: undefined }));
  await assert.rejects(openNote(keys, 'fixture', 7, { ...head, mediaIds: ['c'.repeat(64)] }));
  assert.throws(() => parseNoteHead({ ...head, mediaIds: [...mediaIds].reverse() }), /media references/);
  await assert.rejects(sealNote(keys, 'fixture', 7, { ...op, mediaIds: undefined }, item.id, item), /addresses do not match/);
  await assert.rejects(sealNote(keys, 'fixture', 7, op, item.id, { ...item, attachments: [] }), /addresses do not match/);
  const draftId = sharedRegistryId('composer', 'Inbox');
  const draftOp = { ...op, noteId: await opaqueNoteId(keys, draftId) };
  const draft = { content: 'draft', attachments, updatedAt: 1 };
  const sealedDraft = await sealSharedRecord(keys, 'fixture', 7, draftOp, draftId, draft);
  const opened = await openAnyRegistryBody(keys, 'fixture', 7, { ...sealedDraft, revision: 1 });
  assert.deepEqual(opened.shared.attachments, attachments);
  await assert.rejects(sealSharedRecord(keys, 'fixture', 7, { ...draftOp, mediaIds: undefined }, draftId, draft), /addresses do not match/);
});

test('registry media verifies immutable bytes and authenticates the room and generation', async () => {
  const vaultKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const keys = await deriveNoteKeys(vaultKey, 'fixture');
  const plain = new TextEncoder().encode('local-only fixture');
  const { id, bytes } = await sealRegistryMedia(keys, 'fixture', 7, plain);
  assert.equal(id, createHash('sha256').update(bytes).digest('hex'));
  const reopenedKeys = await deriveNoteKeys(vaultKey, 'fixture');
  assert.deepEqual(await sealRegistryMedia(reopenedKeys, 'fixture', 7, plain), { id, bytes });
  assert.notEqual((await sealRegistryMedia(keys, 'fixture', 8, plain)).id, id);
  assert.notEqual((await sealRegistryMedia(await deriveNoteKeys(vaultKey, 'other'), 'other', 7, plain)).id, id);
  assert.notEqual((await sealRegistryMedia(keys, 'fixture', 7, Uint8Array.of(7))).id, id);
  assert.deepEqual(await openRegistryMedia(keys, 'fixture', 7, id, bytes), plain);
  await assert.rejects(openRegistryMedia(keys, 'other', 7, id, bytes));
  await assert.rejects(openRegistryMedia(keys, 'fixture', 8, id, bytes));
  await assert.rejects(openRegistryMedia(keys, 'fixture', 7, id, bytes.subarray(1)), /address mismatch/);
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(openRegistryMedia(keys, 'fixture', 7, id, bytes), /address mismatch/);
  await assert.rejects(openRegistryMedia(keys, 'fixture', 7, createHash('sha256').update(bytes).digest('hex'), bytes));
  await assert.rejects(sealRegistryMedia(keys, 'fixture', 7, new Uint8Array(REGISTRY_MEDIA_MAX_BYTES)), /size limit/);
});
