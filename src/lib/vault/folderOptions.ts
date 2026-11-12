// Turns the flat folder list into the one tree of picker options every menu shares.
import type { FolderMeta } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';

export interface FolderSelectOption {
  value: string;
  label: string;
  /** Tail of the path for the closed trigger: "… / медиа / Идеи". */
  triggerLabel: string;
  mono: boolean;
  /** True for a root folder; renders a separator above it. */
  dividerBefore?: boolean;
}

interface Node {
  path: string;
  children: Node[];
}

const lastSegment = (path: string) => path.slice(path.lastIndexOf('/') + 1);

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
  const regularFolders = folders.filter((f) => f.path !== DEFAULT_INBOX_FOLDER);

  const rootMap = new Map<string, Node>();
  regularFolders.forEach((f) => {
    const parts = f.path.split('/');
    let current = '';
    let parentNode: Node | null = null;

    parts.forEach((part, idx) => {
      current = current ? `${current}/${part}` : part;
      if (idx === 0) {
        if (!rootMap.has(part)) {
          rootMap.set(part, { path: current, children: [] });
        }
        parentNode = rootMap.get(part)!;
      } else if (parentNode) {
        let child = parentNode.children.find((c) => c.path === current);
        if (!child) {
          child = { path: current, children: [] };
          parentNode.children.push(child);
        }
        parentNode = child;
      }
    });
  });

  const options: FolderSelectOption[] = [];
  // Indentation uses non-breaking spaces: a plain run of spaces collapses to one in the picker,
  // which made a nested folder look like a root.
  const GAP = '\u00A0\u00A0\u00A0';
  const walk = (node: Node, prefix: string, isLast: boolean, depth: number) => {
    const label = depth === 0
      ? lastSegment(node.path)
      : `${prefix}${isLast ? '╰── ' : '├── '}${lastSegment(node.path)}`;
    options.push({
      value: node.path,
      label,
      // The trigger has no room for the whole path; keep the tail so the current folder stays visible.
      triggerLabel: segmentsOf(node.path),
      mono: true,
      dividerBefore: depth === 0,
    });

    // A root carries no vertical bar above it, so its children start flush left.
    const childPrefix = depth === 0 ? '' : `${prefix}${isLast ? `${GAP} ` : `│${GAP}`}`;
    const children = node.children;
    children.forEach((child, index) => walk(child, childPrefix, index === children.length - 1, depth + 1));
  };

  // Same order the app shows folders in: the vault array order, not an alphabetical resort.
  Array.from(rootMap.values()).forEach((root, index, roots) => {
    walk(root, '', index === roots.length - 1, 0);
  });

  return [{ value: DEFAULT_INBOX_FOLDER, label: DEFAULT_INBOX_FOLDER, triggerLabel: DEFAULT_INBOX_FOLDER, mono: true }, ...options];
}
