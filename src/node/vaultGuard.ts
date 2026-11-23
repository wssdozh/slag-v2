// What a second writer owes the app's own storage: do not mutate a vault the SLAG app owns, and
// fail closed when that question cannot be answered.
//
// The app keeps its note journal, its sync config and ledger, and the local-recovery flag next to
// the notes. A headless writer (MCP server, headless node) that touched such a vault would race
// the app's durable store, so it must refuse before it writes anything. The markers are matched
// by shape as well as by name: an interrupted app boot can leave `note-registry.json` uncreated
// while `<logical>.commit.json` and the `.slot0-0`…`.slot1-1` generations already exist.
import fs from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Plain files the app writes for enrolment, sync and recovery. Any one of them closes the vault to
 * standalone writers. The `.commit.json` / slot shapes below cover the rest of the durable store.
 */
const ENROLLED_FILES = new Set([
  'note-registry.json',
  'recovery-local-only.json',
  'sync-config.json',
  'sync-ledger.json',
  'recovery-note-op.json',
]);

/** Per-logical-path generation markers: `<logical>.commit.json` and `<logical>.slot<gen>-<copy>`. */
const DURABLE_SUFFIXES = ['.commit.json', '.slot0-0', '.slot0-1', '.slot1-0', '.slot1-1'];

export function isEnrolledMarkerName(name: string): boolean {
  return ENROLLED_FILES.has(name) || DURABLE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/**
 * The directories whose entries decide ownership. A caller opened through the `notes` child is
 * still sharing a vault root with the app, which keeps its markers one level up.
 */
export function guardRoots(root: string): string[] {
  const resolved = path.resolve(root);
  return path.basename(resolved).toLowerCase() === 'notes'
    ? [resolved, path.dirname(resolved)]
    : [resolved];
}

/** The marker found in one root, or null. A missing root has no marker; any other error throws. */
function markerInSync(root: string): string | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch (error) {
    // ENOENT is "this directory does not exist yet", which is not a claim of ownership.
    // EACCES/ENOTDIR/EPERM are "cannot tell", and a writer that cannot tell must not write.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const marker = entries.find(isEnrolledMarkerName);
  return marker ? path.join(root, marker) : null;
}

async function markerIn(root: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const marker = entries.find(isEnrolledMarkerName);
  return marker ? path.join(root, marker) : null;
}

/** Synchronous probe for the headless node, whose writes are synchronous by contract. */
export function enrolledMarkerSync(root: string): string | null {
  for (const candidate of guardRoots(root)) {
    const marker = markerInSync(candidate);
    if (marker) return marker;
  }
  return null;
}

/** Asynchronous probe for the MCP server. */
export async function enrolledMarker(root: string): Promise<string | null> {
  for (const candidate of guardRoots(root)) {
    const marker = await markerIn(candidate);
    if (marker) return marker;
  }
  return null;
}
