// Task mailbox — atomic bridge for status changes from MCP in registry-enabled vaults.
//
// Protocol:
//  1. Client writes request to <vault>/.task-mailbox/pending/<uuid>.json
//  2. Processor atomically claims via rename pending/ → processing/
//  3. Processor validates, mutates via StorageCore, writes receipt to <vault>/.task-mailbox/receipts/
//  4. Processor cleans up processing file; keeps receipts for polling clients
//
// Invariants:
//  - Atomic claim guarantees at-most-once, even on restart/vault change
//  - Strict filename/parser — only known UUID pattern, bounded body
//  - Cleanup removes only own artifacts, never directories or foreign files

import type { SlagItemStatus } from '../../types';

// ── Request / response shapes ────────────────────────────────────────

export type TaskMailboxRequest = {
  /** Unique operation id */
  requestId: string;
  /** Note ID inside current vault */
  noteId: string;
  /** Target status for a task */
  targetStatus: SlagItemStatus;
  /** Timestamp (ms) of creation — processor rejects requests older than ttlMs */
  createdAt: number;
};

/** Result returned to MCP after the processor finishes. */
export type TaskMailboxReceipt = {
  requestId: string;
  /** 'journal_durable' — journal committed, disk write queued asynchronously */
  /** 'projected' — both journal and disk projection confirmed */
  /** 'rejected_unknown' — vault not open / task not found / scope mismatch */
  /** 'rejected_expired' — request TTL exceeded */
  state: 'journal_durable' | 'projected' | 'rejected_unknown' | 'rejected_expired';
  noteId: string;
  newStatus?: SlagItemStatus;
  error?: string;
};

// ── Mailbox layout constants ─────────────────────────────────────────

export const MAILBOX_DIR_NAME = '.task-mailbox';
export const PENDING_DIR = 'pending';
export const PROCESSING_DIR = 'processing';
export const RECEIPT_DIR = 'receipts';
export const REQUEST_FILE_SUFFIX = '.json';
export const RECEIPT_FILE_SUFFIX = '.json';

/** TTL for inbound requests: if createdAt is older, processor silently drops. */
export const REQUEST_TTL_MS = 10_000; // 10 seconds

// ── Filename parser & validator ──────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Validate a request filename: must be exactly <uuid>.json under pending/ or processing/.
 * Returns true if the name follows the expected pattern. Does NOT read the file.
 */
export function isValidRequestFilename(name: string): boolean {
  if (!name.endsWith(REQUEST_FILE_SUFFIX)) return false;
  const stem = name.slice(0, -REQUEST_FILE_SUFFIX.length);
  return UUID_RE.test(stem);
}

/**
 * Validate a receipt filename: must be exactly <uuid>.json under receipts/.
 */
export function isValidReceiptFilename(name: string): boolean {
  if (!name.endsWith(RECEIPT_FILE_SUFFIX)) return false;
  const stem = name.slice(0, -RECEIPT_FILE_SUFFIX.length);
  return UUID_RE.test(stem);
}

// ── Validation helpers ───────────────────────────────────────────────

/** Check whether a parsed request is valid (known fields only, reasonable bounds). */
export function isValidRequest(req: unknown): req is TaskMailboxRequest {
  if (!req || typeof req !== 'object') return false;
  const r = req as Record<string, unknown>;
  if (typeof r.requestId !== 'string') return false;
  if (!UUID_RE.test(r.requestId)) return false;
  if (typeof r.noteId !== 'string') return false;
  const status = r.targetStatus as string | undefined;
  if (!status || !['backlog', 'todo', 'in_progress', 'done'].includes(status)) return false;
  if (typeof r.createdAt !== 'number' || !Number.isFinite(r.createdAt)) return false;
  return true;
}

/** Check whether a request has expired relative to the given time. */
export function isRequestExpired(request: TaskMailboxRequest, now = Date.now()): boolean {
  return now - request.createdAt > REQUEST_TTL_MS;
}

// ── Paths building ───────────────────────────────────────────────────

/**
 * Build the base directory path for the mailbox within a vault root.
 * Both implementations (MCP Node and App Tauri) receive the vault root.
 */
export function buildPendingDir(vaultRoot: string): string {
  return `${vaultRoot}/${MAILBOX_DIR_NAME}/${PENDING_DIR}`;
}

export function buildProcessingDir(vaultRoot: string): string {
  return `${vaultRoot}/${MAILBOX_DIR_NAME}/${PROCESSING_DIR}`;
}

export function buildReceiptDir(vaultRoot: string): string {
  return `${vaultRoot}/${MAILBOX_DIR_NAME}/${RECEIPT_DIR}`;
}

export function buildPendingPath(vaultRoot: string, requestId: string): string {
  return `${buildPendingDir(vaultRoot)}/${requestId}${REQUEST_FILE_SUFFIX}`;
}

export function buildProcessingPath(vaultRoot: string, requestId: string): string {
  return `${buildProcessingDir(vaultRoot)}/${requestId}${REQUEST_FILE_SUFFIX}`;
}

export function buildReceiptPath(vaultRoot: string, requestId: string): string {
  return `${buildReceiptDir(vaultRoot)}/${requestId}${RECEIPT_FILE_SUFFIX}`;
}
