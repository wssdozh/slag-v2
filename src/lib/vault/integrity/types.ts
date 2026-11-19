// What a storage check finds, and what fixing it would do.
//
// Pure data and one mapping: no filesystem, no storage, no React. The app, the CLI and
// `node --test` agree on the shape because they read this file, not because they happen to match.

export type Severity = 'high' | 'medium' | 'low';

/**
 * How a finding may be repaired.
 *
 * `safe` — a file move inside the vault, or a metadata entry dropped after a backup copy of
 * `state.json` is put in the hygiene trash. Reversible by hand.
 * `manual` — needs a person. A file this app cannot prove is junk is not ours to delete.
 * `none` — report only.
 */
export type FixKind = 'safe' | 'manual' | 'none';

export type ScannerId =
  | 'duplicate-id'
  | 'path-mismatch'
  | 'folder-missing'
  | 'ghost-folder'
  | 'empty-folder'
  | 'broken-frontmatter'
  | 'unreferenced-attachment'
  | 'trash-aging';

/**
 * The one place the scanner-to-fix mapping lives, so a scanner cannot quietly acquire a fix
 * and a repair planner cannot invent one.
 */
export const FIX_KIND_BY_SCANNER: Record<ScannerId, FixKind> = {
  'duplicate-id': 'safe',
  'path-mismatch': 'safe',
  'folder-missing': 'manual',
  'ghost-folder': 'safe',
  'empty-folder': 'safe',
  'broken-frontmatter': 'manual',
  // A file nobody names is weight, and the sweep does not delete it: it moves it into the hygiene
  // trash, where a wrong guess costs one copy back. The ordering rule lives outside the scanner —
  // a file another device's note still names is only discovered after the two devices agree, which
  // is why the sweep runs after a manifest reconciliation, never before.
  'unreferenced-attachment': 'safe',
  'trash-aging': 'safe',
};

export interface Finding {
  /** Stable across runs: the same problem yields the same id, so two reports can be diffed. */
  id: string;
  scanner: ScannerId;
  severity: Severity;
  fix: FixKind;
  /** Vault-relative path (slash-separated) this finding is about; empty when it is metadata-only. */
  path: string;
  /** Set when the finding belongs to one note. */
  itemId?: string;
  /** One line a person reads: what is wrong. */
  summary: string;
  /** The consequence, not a restatement of the summary. */
  why: string;
  /** What a fix would do; empty when there is none. */
  action?: string;
  /**
   * The paths a fix works on, when the finding spans more than one file. The first one is the
   * keeper: the scan decides which copy survives, the repair only carries that decision out.
   */
  paths?: string[];
  /** What a person needs in front of them to decide: paths, counts, timestamps. */
  evidence: string[];
}

/** One `.md` file as the disk shows it. Parsing happens in the adapter, never in a scanner. */
export interface DiskNote {
  /** Vault-relative, slash-separated: `Проекты/SLAG/баги.md`. */
  path: string;
  /** Frontmatter `id`; empty when the file has none. */
  id: string;
  /** Frontmatter `folder`; empty when the file has none. The directory is `path`. */
  folder: string;
  title: string;
  updatedAt: number;
  /** Attachment paths this note mentions: frontmatter list plus body references, normalized. */
  attachments: string[];
}

export interface FolderEntry {
  path: string;
  name?: string;
}

/** Everything the scanners are allowed to see. Built by an adapter: node `fs` or the app. */
export interface VaultSnapshot {
  /** Notes found on disk, in walk order. */
  notes: DiskNote[];
  /** Folders that exist as directories, vault-relative, slash-separated. */
  diskFolders: string[];
  /** Folder entries from `state.json`; some of them may name directories that are gone. */
  stateFolders: FolderEntry[];
  /** File names under `.attachments/`. */
  attachmentFiles: string[];
  /** Trashed note file names with how long they have been sitting there. */
  trash: Array<{ name: string; ageMs: number }>;
  /** The inbox path: scanners never suggest moving something out of it. */
  inbox: string;
}

export interface ScanOptions {
  /** A trashed note older than this is dirt. Default: 30 days. */
  trashAgingMs?: number;
}

export type Scanner = (snapshot: VaultSnapshot, options?: ScanOptions) => Finding[];

/**
 * A repair, planned but not performed. The executor lives with the storage, not here: this file
 * must stay importable by a plain `node` process.
 */
export type RepairOp =
  | { kind: 'move'; findingId: string; from: string; to: string; note: string }
  | { kind: 'remove-dir'; findingId: string; path: string; note: string }
  | { kind: 'drop-folders'; findingId: string; paths: string[]; note: string };

export interface RepairPlan {
  ops: RepairOp[];
  /** Findings the guard refused to act on, kept so the report can say why. */
  blocked: Finding[];
}

export interface RepairOptions {
  /** Hard ceiling on note ops per run: a mass finding is a reason to look, not to sweep. */
  maxActions?: number;
  /** Share of notes a run may touch. Past it the whole run is report-only. */
  maxShare?: number;
  /**
   * Ceiling on attachment ops. Separate from `maxActions` on purpose: two hundred orphaned files
   * are a normal vault after a few years of pasted screenshots, while fifty moved notes are an
   * event. A share rule would be wrong here too — most of a vault's `.attachments/` being unnamed
   * is a Monday, not a symptom.
   */
  maxAttachments?: number;
  /** Vault-relative directory the moved files land in. Default: `.trash/.hygiene`. */
  hygieneRoot?: string;
  /** One run's own directory under `hygieneRoot`, so two sweeps never overwrite each other. */
  runId?: string;
}

// --- one truth, three levels ----------------------------------------------------------------
//
// A leaf is one note, a folder is its leaves, the root is every folder. Comparing the root answers
// "am I in sync" in one string; a folder that disagrees is the only branch worth walking.

export interface Manifest {
  /** Hash over the sorted `path:folderHash` list. */
  root: string;
  /** Folder path → hash over its sorted `id:leafHash` list. */
  folders: Record<string, string>;
  /** Note id → fingerprint of its canonical form. Kept apart from the index so startup stays cheap. */
  leaves: Record<string, string>;
}

/**
 * What a comparison found. A report, never an action: `extra` means "this device has something the
 * reference does not", and the lesson of 2026-11-18 is that absence is not permission to delete.
 */
export interface DriftReport {
  rootMatch: boolean;
  /** Folders whose hash disagrees with the reference. */
  folders: string[];
  /** Ids the reference has and this device does not. */
  missing: string[];
  /** Ids this device has and the reference does not. */
  extra: string[];
  /** Ids both have with different fingerprints. */
  conflict: string[];
}

/** What the device keeps: a small index inline in `state.json`, the leaves on demand. */
export interface IntegrityIndex {
  at: string;
  root: string;
  folders: Record<string, string>;
}

export interface IntegrityStore {
  readIndex(): Promise<IntegrityIndex | null>;
  saveIndex(index: IntegrityIndex): Promise<void>;
  readLeaves(): Promise<Record<string, string> | null>;
  saveLeaves(leaves: Record<string, string>): Promise<void>;
}

/** The manifest as it travels between devices: fingerprints keyed with the vault key. */
export interface WireManifest {
  v: 1;
  root: string;
  folders: Record<string, string>;
  leaves?: Record<string, string>;
}

/** What the storage panel draws. */
export interface IntegrityStatus {
  at: string | null;
  root: string | null;
  inSync: boolean;
  drift: DriftReport | null;
}
