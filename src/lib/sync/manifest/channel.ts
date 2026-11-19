// How a manifest crosses the wire: shape, validation, comparison.
//
// The manifest arrives already keyed by `buildManifest`. This module never touches the leaves'
// fingerprints: it decides what a `WireManifest` is allowed to look like, how a local manifest is
// compared with a peer's, and what is worth asking that peer for. The shape comes from the
// network, so every field is narrowed from `unknown` here and nowhere else.
import type { DriftReport, Manifest, WireManifest } from '../../vault/integrity/types';

/** The one version this build speaks. A wire with any other `v` is refused, not upgraded. */
export const WIRE_VERSION = 1;

/** A real manifest is a few kilobytes. Past this it is a bundle, a bug, or an attack. */
export const MAX_WIRE_BYTES = 128 * 1024;

const encoder = new TextEncoder();

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/** A JSON object, not an array and not `null`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A fresh `string → string` map, or `null` when any value is not a string.
 *
 * The copy is deliberate: whatever extra fields the sender put on the object stay behind.
 */
function readStringRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') return null;
    out[key] = entry;
  }
  return out;
}

/** Deterministic keys: sorted, and built by hand so an integer-like key cannot reorder itself. */
function recordToText(record: Record<string, string>): string {
  const pairs = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${JSON.stringify(record[key])}`);
  return `{${pairs.join(',')}}`;
}

function sortedUnion(left: Record<string, string>, right: Record<string, string>): string[] {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
}

/**
 * The fields a comparison reads. A `WireManifest` carries them with a version; a peer row the
 * relay keeps per device carries them without one, and neither needs a second comparison.
 */
export interface WireBody {
  root: string;
  folders: Record<string, string>;
  leaves?: Record<string, string>;
}

/** One other device's manifest as the relay answered it. `deviceId: null` is an old client. */
export interface PeerManifest extends WireBody {
  deviceId: string | null;
  /** When the relay wrote this row, ms epoch. `null` is a relay that does not say. */
  at: number | null;
}

export function toWire(manifest: Manifest): WireManifest {
  return {
    v: WIRE_VERSION,
    root: manifest.root,
    folders: { ...manifest.folders },
    leaves: { ...manifest.leaves },
  };
}

/**
 * The manifest, or `null` when the shape is not exactly what this build expects.
 *
 * Unknown fields are dropped rather than rejected: a newer sender may add a hint, and refusing the
 * whole manifest over it would break sync for no gain. Fields this build relies on are all strict.
 */
export function parseWire(raw: unknown): WireManifest | null {
  if (!isRecord(raw)) return null;
  if (raw.v !== WIRE_VERSION) return null;
  if (typeof raw.root !== 'string' || raw.root.length === 0) return null;

  const folders = readStringRecord(raw.folders);
  if (folders === null) return null;

  const wire: WireManifest = { v: WIRE_VERSION, root: raw.root, folders };
  if (raw.leaves !== undefined) {
    const leaves = readStringRecord(raw.leaves);
    if (leaves === null) return null;
    wire.leaves = leaves;
  }
  return wire;
}

/** The canonical text: the same manifest always yields the same bytes. Alphabetical, no spaces. */
export function wireToText(wire: WireManifest): string {
  const parts = [`"folders":${recordToText(wire.folders)}`];
  if (wire.leaves !== undefined) parts.push(`"leaves":${recordToText(wire.leaves)}`);
  parts.push(`"root":${JSON.stringify(wire.root)}`, `"v":${WIRE_VERSION}`);
  return `{${parts.join(',')}}`;
}

/**
 * What the relay will count. Bytes, not characters: a vault of Russian folder names is twice the
 * size on the wire that `text.length` suggests, and the relay's 413 is about bytes.
 */
export function wireBytes(wire: WireManifest): number {
  return byteLength(wireToText(wire));
}

/**
 * Text back into a manifest, or `null`.
 *
 * Size is checked before parsing: a payload that cannot be a manifest is not worth JSON.parse.
 */
export function wireFromText(text: string): WireManifest | null {
  if (typeof text !== 'string' || text.length > MAX_WIRE_BYTES) return null;
  if (byteLength(text) > MAX_WIRE_BYTES) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    // The wire is allowed to carry junk; a torn frame is a dropped frame, not a crash.
    return null;
  }
  return parseWire(raw);
}

/**
 * What this device has that the reference does not, and the other way round.
 *
 * A remote without `leaves` is not a match: it means nobody sent the leaves, so the report leaves
 * `missing`/`extra`/`conflict` empty and speaks only about folders and the root.
 */
export function diffWire(local: Manifest, remote: WireBody): DriftReport {
  const folders = sortedUnion(local.folders, remote.folders).filter(
    (path) => local.folders[path] !== remote.folders[path]
  );

  const report: DriftReport = {
    rootMatch: local.root === remote.root,
    folders,
    missing: [],
    extra: [],
    conflict: [],
  };

  if (remote.leaves === undefined) return report;
  const remoteLeaves = remote.leaves;

  report.missing = Object.keys(remoteLeaves)
    .filter((id) => local.leaves[id] === undefined)
    .sort();
  report.extra = Object.keys(local.leaves)
    .filter((id) => remoteLeaves[id] === undefined)
    .sort();
  report.conflict = Object.keys(remoteLeaves)
    .filter((id) => local.leaves[id] !== undefined && local.leaves[id] !== remoteLeaves[id])
    .sort();

  return report;
}

/**
 * The ids worth pulling down: the ones only the remote has, plus the disputed ones.
 *
 * Empty when the remote sent no leaves — there is nothing to name, and an empty request is a
 * truthful "ask me again with leaves" rather than a list of guesses.
 */
export function leavesToRequest(report: DriftReport, wire: WireBody): string[] {
  if (wire.leaves === undefined) return [];
  return [...new Set([...report.missing, ...report.conflict])].sort();
}

/**
 * What a device does about the peers in its room.
 *
 * `reconcile` means one full resend, aimed at one peer. The relay keeps a row per device now, so
 * the row that disagreed is the row the resend is for: `resendTo` names it (an old client has no
 * device id, and the resend is the whole room's). `report` is the end of the line — this peer's
 * state already got its resend and cannot be fixed by a second one, so the panel says so and
 * nothing loops.
 */
export interface ManifestDecision {
  action: 'none' | 'reconcile' | 'report';
  /** The peer the verdict is about: the first diverged one, or the first peer when all agree. */
  peer: PeerManifest | null;
  drift: DriftReport | null;
  /** The device the resend is aimed at; `null` for an old client or when nothing is resent. */
  resendTo: string | null;
}

/**
 * The decision, in the order that makes each step safe to repeat.
 *
 * No peers is "nobody answered", not a mismatch: our own row is already written and there is
 * nothing to compare against. `reconciledRoot` is the anti-loop latch — the peer root this device
 * already resent against once.
 *
 * A row with no device id is the room's old single manifest: it never updates, nobody can be asked
 * through it, and a resend aimed at it is bundles into the void. It is compared and reported as
 * "no data about the peer", never acted on — and it cannot win the verdict over a named peer.
 */
export function decideManifest(
  local: Manifest,
  peers: PeerManifest[],
  state: { reconciledRoot: string | null; receiveOnly: boolean },
): ManifestDecision {
  if (peers.length === 0) return { action: 'none', peer: null, drift: null, resendTo: null };

  const divergedNamed = peers.find((peer) => peer.deviceId !== null && peer.root !== local.root);
  if (divergedNamed) {
    const drift = diffWire(local, divergedNamed);
    if (state.receiveOnly || state.reconciledRoot === divergedNamed.root) {
      return { action: 'report', peer: divergedNamed, drift, resendTo: null };
    }
    return { action: 'reconcile', peer: divergedNamed, drift, resendTo: divergedNamed.deviceId };
  }

  // Only the old client's row is left to disagree: that is a fact for the panel, not a job.
  const peer = peers.find((candidate) => candidate.root !== local.root) ?? peers[0];
  return { action: 'none', peer, drift: diffWire(local, peer), resendTo: null };
}

/**
 * One line for the log: version, counts, size. Never a hash.
 *
 * A manifest is fingerprints of vault contents; the log is copied around and shipped in bug
 * reports, so this line can only say how much there was, not what.
 */
export function describeWire(wire: WireManifest): string {
  const folders = Object.keys(wire.folders).length;
  const leaves = wire.leaves === undefined ? 'не присланы' : String(Object.keys(wire.leaves).length);
  return `манифест v${wire.v}: папок ${folders}, листьев ${leaves}, ${wireBytes(wire)} байт`;
}
