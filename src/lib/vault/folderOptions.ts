// Turns the flat folder list into the one tree of picker options every menu shares.
import type { FolderMeta } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { folderTreeRows } from './folderTree';

export interface FolderSelectOption {
  value: string;
  label: string;
  /** Tail of the path for the closed trigger: "… / медиа / Идеи". */
  triggerLabel: string;
  mono: boolean;
  /** True for a root folder; renders a separator above it. */
  dividerBefore?: boolean;
}

/** The trigger only fits the tail, so a deep path shows as "… / медиа / Идеи". */
const segmentsOf = (path: string) => {
  const parts = path.split('/');
  return parts.length > 2 ? `… / ${parts.slice(-2).join(' / ')}` : parts.join(' / ');
};

/**
 * The single folder list for every folder picker. The `value` is always the full
 * path; the `label` is the tree branch, so a nested folder reads as its own name
 * under a parent instead of repeating the whole path:
 *
 *   Род
 *   ├── доч1
 *   │   ╰── внук
 *   ╰── доч2
 */
export function buildFolderOptions(folders: FolderMeta[]): FolderSelectOption[] {
  const rows = folderTreeRows(folders.filter((folder) => folder.path !== DEFAULT_INBOX_FOLDER));

  return [
    { value: DEFAULT_INBOX_FOLDER, label: DEFAULT_INBOX_FOLDER, triggerLabel: DEFAULT_INBOX_FOLDER, mono: true },
    ...rows.map((row) => ({
      value: row.path,
      label: `${row.prefix}${row.name}`,
      // The trigger has no room for the whole path; keep the tail so the current folder stays visible.
      triggerLabel: segmentsOf(row.path),
      mono: true,
      dividerBefore: row.depth === 0,
    })),
  ];
}
