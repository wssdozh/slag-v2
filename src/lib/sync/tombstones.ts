// The tombstones a delete leaves behind, and the shape they take in `state.json`.
//
// A tombstone says "this id was deleted at this moment". Losing the hashes or the cursor costs
// traffic; losing a tombstone costs the data: the file is gone from the disk, nothing is left to
// push, and the next bundle from the relay hands the deleted note back. That is why this is the
// one ledger that moves out of `localStorage`, and why its stored shape is spelled out here.
//
// Pure on purpose: no Tauri, no `localStorage`, no config. `node --test` reads this file as is.
export type TombstoneMap = Record<string, number>;

/** The `sync` section of `state.json`, as far as tombstones are concerned. */
export type TombstonesSection = { tombstones: TombstoneMap };

/**
 * The tombstones a stored `sync` section holds. A missing key, an array, a string or a section an
 * older build wrote before it knew about them all read as "nothing was deleted yet".
 */
export function tombstonesFromState(state: unknown): TombstoneMap {
  if (!isRecord(state)) return {};
  return sanitizeTombstones(state.tombstones);
}

/** The section these tombstones are written as: junk stripped, and `{}` stays an empty map. */
export function tombstonesToState(tombstones: TombstoneMap): TombstonesSection {
  return { tombstones: sanitizeTombstones(tombstones) };
}

/**
 * Two copies of the ledger into one: per id the later stamp wins, and neither side loses an id.
 * This is the migration rule too — the section on disk and the old `localStorage` blob are merged,
 * never swapped, so a move that dies halfway drops no delete.
 */
export function mergeTombstones(stored: TombstoneMap, incoming: TombstoneMap): TombstoneMap {
  const merged = sanitizeTombstones(stored);
  for (const [id, deletedAt] of Object.entries(sanitizeTombstones(incoming))) {
    if (deletedAt > (merged[id] ?? 0)) merged[id] = deletedAt;
  }
  return merged;
}

/**
 * Only what a tombstone can be: a finite positive stamp under a non-empty id. Anything else is
 * what a half-written key, an older build or a hand-edited file leaves behind — and a string
 * stamp or a `NaN` in the ledger would make a delete compare against `undefined` instead of a
 * moment in time.
 */
export function sanitizeTombstones(value: unknown): TombstoneMap {
  const tombstones: TombstoneMap = {};
  if (!isRecord(value)) return tombstones;
  for (const [id, deletedAt] of Object.entries(value)) {
    if (id.length === 0 || typeof deletedAt !== 'number' || !Number.isFinite(deletedAt) || deletedAt <= 0) continue;
    tombstones[id] = deletedAt;
  }
  return tombstones;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
