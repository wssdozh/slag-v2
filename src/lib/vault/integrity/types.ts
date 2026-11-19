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
  'unreferenced-attachment': 'manual',
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
  /** Hard ceiling on ops per run: a mass finding is a reason to look, not to sweep. */
  maxActions?: number;
  /** Share of notes a run may touch. Past it the whole run is report-only. */
  maxShare?: number;
  /** Vault-relative directory the moved files land in. Default: `.trash/.hygiene`. */
  hygieneRoot?: string;
  /** One run's own directory under `hygieneRoot`, so two sweeps never overwrite each other. */
  runId?: string;
}
