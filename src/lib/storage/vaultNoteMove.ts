// A local note move — rename, or a move to another folder — is two disk operations: the new file
// lands, then the old one goes. A crash between them leaves both copies, and the start-up scan has
// no way to tell "the note is at its new path" from "somebody copied it and edited the copy".
// So the intention goes to disk first: one JSON file at the vault root, `recovery-note-op.json`,
// carrying both paths, both digests and the new Markdown. A move runs under the single serial disk
// writer; after a crash `resumeVaultNoteMove` finishes exactly that intention and refuses to guess.
//
// Contract:
// - `io` paths are vault-relative. `recovery-note-op.json` therefore lands at
//   `vaults/<id>/recovery-note-op.json`, and a note path looks like `notes/Inbox/Call.md`.
// - `io.writeText` must be a durable atomic replace (temp file, fsync where the platform has it,
//   rename). `io.readText` returns `null` only for "file absent"; other failures throw.
// - Only one move may be pending per vault. A second intent is refused, never overwritten.
// - The source file is removed only after the exact target bytes are read back from disk and the
//   source still hashes to the digest recorded in the intent. Anything else stops the move and
//   leaves every file as evidence.
// - Finishing writes the terminal marker `null` over the intent instead of deleting it: one durable
//   write that a reader can tell apart from a crash mid-operation. A later move overwrites it.
//
// Wiring the storage service does (this module touches neither VaultFiles nor the registry):
// - call `performVaultNoteMove` under the serial writer wherever a note is written to a new path;
// - call `resumeVaultNoteMove` before the start-up disk scan and surface a blocked result instead of
//   retrying it — a blocked move is evidence of an external edit, not a transient failure.

import { isSafeVaultRelativePath, safeVaultRelativePath } from '../vault/safePath.ts';

/** Vault-relative location of the single pending move. */
export const VAULT_NOTE_MOVE_INTENT_FILE = 'recovery-note-op.json';
/** Bumped only when the on-disk shape changes incompatibly. */
export const VAULT_NOTE_MOVE_VERSION = 1;

/** Notes live under `notes/` inside a vault; nothing else is a move this module may perform. */
const NOTE_PREFIX = 'notes/';
/** The intent is destroyed by writing this exact text, not by deleting the file. */
const TERMINAL_INTENT = 'null';
const encoder = new TextEncoder();

export interface VaultNoteMoveIo {
  /** Vault-relative path → UTF-8 text, or `null` when the file does not exist. */
  readText(path: string): Promise<string | null>;
  /** Durable atomic replace: resolves only after the bytes would survive a crash. */
  writeText(path: string, text: string): Promise<void>;
  /** Durable removal of an existing vault-relative file. */
  removeFile(path: string, expectedDigest: string): Promise<void>;
}

export interface VaultNoteMoveRequest {
  noteId: string;
  /** Markdown path the note has now, relative to the vault. */
  from: string;
  /** Markdown path the note must have after the move, relative to the vault. */
  to: string;
  /** Exact serialized Markdown the note must have at `to`. */
  markdown: string;
}

export interface VaultNoteMoveIntentV1 {
  version: 1;
  opId: string;
  noteId: string;
  from: string;
  fromDigest: string;
  to: string;
  toDigest: string;
  /** The bytes `to` must hold. Absent only for a hand-staged rename that needs no content. */
  newMarkdown?: string;
  createdAt: string;
}

export type VaultNoteMoveBlockReason =
  | 'invalid-paths'
  | 'invalid-intent'
  | 'pending-intent'
  | 'source-missing'
  | 'source-changed'
  | 'target-occupied'
  | 'target-missing'
  | 'io-error';

export type VaultNoteMoveOutcome =
  | { status: 'idle' }
  | { status: 'completed'; opId?: string }
  | { status: 'blocked'; reason: VaultNoteMoveBlockReason; detail: string; opId?: string };

/**
 * Stage the intention durably, then finish it. Replaying the same request after a successful move
 * is safe: the source is already gone and the target already hashes to the requested bytes.
 */
export async function performVaultNoteMove(
  io: VaultNoteMoveIo,
  request: VaultNoteMoveRequest,
): Promise<VaultNoteMoveOutcome> {
  const from = notePath(request?.from);
  const to = notePath(request?.to);
  const noteId = typeof request?.noteId === 'string' ? request.noteId.trim() : '';
  if (!from || !to || from === to || !noteId || typeof request.markdown !== 'string') {
    return blocked('invalid-paths', 'from/to must be distinct vault-relative notes/*.md paths and the request needs a note id and Markdown');
  }

  try {
    const pending = await readIntent(io);
    if (pending.kind === 'invalid') return blocked(pending.reason, pending.detail);
    if (pending.kind === 'op') {
      // The serial writer should have resumed before starting another move. Never overwrite an
      // unfinished intention: it is the only record of where the other note is.
      if (pending.op.noteId !== noteId || pending.op.from !== from || pending.op.to !== to) {
        return blocked('pending-intent', `unfinished move ${pending.op.opId} of note ${pending.op.noteId} (${pending.op.from} → ${pending.op.to})`, pending.op.opId);
      }
      const resumed = await applyIntent(io, pending.op);
      if (resumed.status !== 'completed') return resumed;
    }

    const toDigest = await sha256(request.markdown);
    const source = await io.readText(from);
    const target = await io.readText(to);

    if (source === null) {
      // Already moved by an earlier attempt whose terminal marker was lost: target is the proof.
      if (target !== null && (await sha256(target)) === toDigest) return { status: 'completed' };
      return blocked('source-missing', `${from} is gone and ${to} ${target === null ? 'is gone too' : 'does not hold the requested bytes'}`);
    }
    if (target !== null && (await sha256(target)) !== toDigest) {
      return blocked('target-occupied', `${to} already exists with different content`);
    }

    const op: VaultNoteMoveIntentV1 = {
      version: VAULT_NOTE_MOVE_VERSION,
      opId: crypto.randomUUID(),
      noteId,
      from,
      fromDigest: await sha256(source),
      to,
      toDigest,
      newMarkdown: request.markdown,
      createdAt: new Date().toISOString(),
    };
    await io.writeText(VAULT_NOTE_MOVE_INTENT_FILE, JSON.stringify(op, null, 2));
    return await applyIntent(io, op);
  } catch (err) {
    return blocked('io-error', reasonOf(err));
  }
}

/**
 * Finish the intention left on disk, if any. Idempotent: a terminal marker means there is nothing
 * to do, a completed move has no source left to remove, and a blocked one keeps its evidence.
 */
export async function resumeVaultNoteMove(io: VaultNoteMoveIo): Promise<VaultNoteMoveOutcome> {
  try {
    const intent = await readIntent(io);
    if (intent.kind === 'none' || intent.kind === 'terminal') return { status: 'idle' };
    if (intent.kind === 'invalid') return blocked(intent.reason, intent.detail);
    return await applyIntent(io, intent.op);
  } catch (err) {
    return blocked('io-error', reasonOf(err));
  }
}

async function applyIntent(io: VaultNoteMoveIo, op: VaultNoteMoveIntentV1): Promise<VaultNoteMoveOutcome> {
  try {
    const target = await io.readText(op.to);

    if (target === null) {
      const source = await io.readText(op.from);
      if (source === null) {
        return blocked('source-missing', `both ${op.from} and ${op.to} are absent`, op.opId);
      }
      // An external edit after the intent was staged means the moves must not race that edit: the
      // staged Markdown is stale, and writing it would resurrect old content under a new name.
      if ((await sha256(source)) !== op.fromDigest) {
        return blocked('source-changed', `${op.from} changed after the move was staged; left the edited source in place`, op.opId);
      }
      if (op.newMarkdown === undefined) {
        return blocked('target-missing', `${op.to} is absent and the intent carries no Markdown to recreate it`, op.opId);
      }
      if ((await sha256(op.newMarkdown)) !== op.toDigest) {
        return blocked('invalid-intent', 'the staged Markdown does not match its digest', op.opId);
      }
      await io.writeText(op.to, op.newMarkdown);
      const written = await io.readText(op.to);
      if (written === null || (await sha256(written)) !== op.toDigest) {
        return blocked('io-error', `${op.to} did not read back as the intended bytes`, op.opId);
      }
    } else if ((await sha256(target)) !== op.toDigest) {
      return blocked('target-occupied', `${op.to} exists but does not hold the intended bytes`, op.opId);
    }

    // Target bytes are durable and verified. The source leaves only if it is still exactly the file
    // the move started from; otherwise the edit wins and the move stops with both copies intact.
    const source = await io.readText(op.from);
    if (source === null) {
      await clearIntent(io);
      return { status: 'completed', opId: op.opId };
    }
    if ((await sha256(source)) !== op.fromDigest) {
      return blocked('source-changed', `${op.from} changed after the target became durable; kept both files`, op.opId);
    }
    await io.removeFile(op.from, op.fromDigest);
    await clearIntent(io);
    return { status: 'completed', opId: op.opId };
  } catch (err) {
    return blocked('io-error', reasonOf(err), op.opId);
  }
}

async function clearIntent(io: VaultNoteMoveIo): Promise<void> {
  // A terminal marker, not a delete: one durable write, and a crash before it simply replays.
  await io.writeText(VAULT_NOTE_MOVE_INTENT_FILE, TERMINAL_INTENT);
}

type IntentRead =
  | { kind: 'none' }
  | { kind: 'terminal' }
  | { kind: 'op'; op: VaultNoteMoveIntentV1 }
  | { kind: 'invalid'; reason: 'invalid-intent' | 'invalid-paths' | 'io-error'; detail: string };

async function readIntent(io: VaultNoteMoveIo): Promise<IntentRead> {
  let text: string | null;
  try {
    text = await io.readText(VAULT_NOTE_MOVE_INTENT_FILE);
  } catch (err) {
    return { kind: 'invalid', reason: 'io-error', detail: `${VAULT_NOTE_MOVE_INTENT_FILE} is unreadable: ${reasonOf(err)}` };
  }
  if (text === null) return { kind: 'none' };
  if (text.trim() === TERMINAL_INTENT) return { kind: 'terminal' };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'invalid', reason: 'invalid-intent', detail: `${VAULT_NOTE_MOVE_INTENT_FILE} is not JSON` };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { kind: 'invalid', reason: 'invalid-intent', detail: `${VAULT_NOTE_MOVE_INTENT_FILE} is not an object` };
  }

  const record = raw as Record<string, unknown>;
  if (record.version !== VAULT_NOTE_MOVE_VERSION) {
    return { kind: 'invalid', reason: 'invalid-intent', detail: `unsupported intent version ${String(record.version)}` };
  }
  const opId = typeof record.opId === 'string' ? record.opId : '';
  const noteId = typeof record.noteId === 'string' ? record.noteId.trim() : '';
  const fromDigest = typeof record.fromDigest === 'string' ? record.fromDigest.toLowerCase() : '';
  const toDigest = typeof record.toDigest === 'string' ? record.toDigest.toLowerCase() : '';
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : '';
  const newMarkdown = record.newMarkdown;
  if (!opId || !noteId || !isDigest(fromDigest) || !isDigest(toDigest) || !createdAt
    || (newMarkdown !== undefined && typeof newMarkdown !== 'string')) {
    return { kind: 'invalid', reason: 'invalid-intent', detail: 'intent fields are missing or malformed' };
  }

  const from = notePath(record.from);
  const to = notePath(record.to);
  if (!from || !to || from === to) {
    return { kind: 'invalid', reason: 'invalid-paths', detail: 'from/to are not distinct vault-relative notes/*.md paths' };
  }

  return {
    kind: 'op',
    op: {
      version: VAULT_NOTE_MOVE_VERSION,
      opId,
      noteId,
      from,
      fromDigest,
      to,
      toDigest,
      ...(typeof newMarkdown === 'string' ? { newMarkdown } : {}),
      createdAt,
    },
  };
}

/** A path this module is willing to move: inside `notes/`, a Markdown file, no traversal. */
function notePath(value: unknown): string | null {
  if (typeof value !== 'string' || !isSafeVaultRelativePath(value)) return null;
  const path = safeVaultRelativePath(value);
  if (!path.startsWith(NOTE_PREFIX) || !path.toLowerCase().endsWith('.md')) return null;
  return path;
}

function isDigest(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

function blocked(
  reason: VaultNoteMoveBlockReason,
  detail: string,
  opId?: string,
): VaultNoteMoveOutcome {
  return { status: 'blocked', reason, detail, ...(opId ? { opId } : {}) };
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
