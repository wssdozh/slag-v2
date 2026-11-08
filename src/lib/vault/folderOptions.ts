import type { FolderMeta } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';

export interface FolderSelectOption {
  value: string;
  label: string;
  /** True for a root folder; renders a separator above it. */
  dividerBefore?: boolean;
}

interface Node {
  path: string;
  children: Node[];
}

const lastSegment = (path: string) => path.slice(path.lastIndexOf('/') + 1);

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

  const sorted = (nodes: Node[]) => [...nodes].sort((a, b) => a.path.localeCompare(b.path, 'ru'));

  const options: FolderSelectOption[] = [];
  const walk = (node: Node, prefix: string, isLast: boolean, depth: number) => {
    const label = depth === 0
      ? lastSegment(node.path)
      : `${prefix}${isLast ? '╰── ' : '├── '}${lastSegment(node.path)}`;
    options.push({ value: node.path, label, dividerBefore: depth === 0 });

    // A root carries no vertical bar above it, so its children start flush left.
    const childPrefix = depth === 0 ? '' : `${prefix}${isLast ? '    ' : '│   '}`;
    const children = sorted(node.children);
    children.forEach((child, index) => walk(child, childPrefix, index === children.length - 1, depth + 1));
  };

  sorted(Array.from(rootMap.values())).forEach((root, index, roots) => {
    walk(root, '', index === roots.length - 1, 0);
  });

  return [{ value: DEFAULT_INBOX_FOLDER, label: DEFAULT_INBOX_FOLDER }, ...options];
}
