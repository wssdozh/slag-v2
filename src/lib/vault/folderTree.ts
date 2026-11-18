// The folder hierarchy and the order it is drawn in: one tree for the sidebar, the pickers and
// the drag rule. Pure — no config, no storage — so it runs under plain node in the tests.
import type { FolderMeta } from '../../types';

export interface FolderNode {
  path: string;
  name: string;
  meta?: FolderMeta;
  children: FolderNode[];
}

/** One drawn row of the tree: the branch lines are the prefix, the name is the folder itself. */
export interface FolderTreeRow {
  path: string;
  name: string;
  /** `├── ` / `│   ╰── ` and so on, already indented for the row's depth. */
  prefix: string;
  depth: number;
  meta?: FolderMeta;
}

/** Where a dragged folder lands relative to the row under the pointer. */
export type FolderDropMode = 'into' | 'before' | 'after' | 'root-end';

// A plain run of spaces collapses in the picker, which made a nested folder look like a root.
const GAP = '\u00A0\u00A0\u00A0';

export const folderName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** A folder that was never dragged has no rank and keeps the list's own order behind the ranked ones. */
export function folderRank(folder: FolderMeta): number {
  return typeof folder.order === 'number' && Number.isFinite(folder.order)
    ? folder.order
    : Number.POSITIVE_INFINITY;
}

/**
 * The list in the order it is drawn: the inbox pinned first, then `order`, then whatever order the
 * rest already had (the sort is stable, so an unranked list is left exactly as it came).
 */
export function sortFolders(folders: FolderMeta[], inbox?: string): FolderMeta[] {
  return [...folders].sort((a, b) => {
    const pinned = (folder: FolderMeta) => (inbox !== undefined && folder.path === inbox ? 0 : 1);
    return pinned(a) - pinned(b) || folderRank(a) - folderRank(b);
  });
}

/** The flat list as one hierarchy, in list order. A path without its parent still opens its branch. */
export function buildFolderTree(folders: FolderMeta[]): FolderNode[] {
  const byPath = new Map<string, FolderNode>();
  const roots: FolderNode[] = [];

  for (const folder of folders) {
    const parts = folder.path.split('/');
    let parent: FolderNode | null = null;
    for (let index = 0; index < parts.length; index += 1) {
      const path = parts.slice(0, index + 1).join('/');
      let node = byPath.get(path);
      if (!node) {
        node = { path, name: folderName(path), children: [] };
        byPath.set(path, node);
        (parent ? parent.children : roots).push(node);
      }
      if (index === parts.length - 1) node.meta = folder;
      parent = node;
    }
  }

  return roots;
}

/**
 * The tree as rows of text. The last child of a branch closes it with `╰──`, every other one
 * continues the vertical line, which is what makes a nested folder read as nested:
 *
 *   Род
 *   ├── доч1
 *   │   ╰── внук
 *   ╰── доч2
 */
export function folderTreeRows(folders: FolderMeta[]): FolderTreeRow[] {
  const rows: FolderTreeRow[] = [];

  const walk = (nodes: FolderNode[], prefix: string, depth: number) => {
    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1;
      const branch = depth === 0 ? '' : `${prefix}${isLast ? '╰── ' : '├── '}`;
      rows.push({ path: node.path, name: node.name, prefix: branch, depth, meta: node.meta });
      // A root carries no vertical bar above it, so its children start flush left.
      const childPrefix = depth === 0 ? '' : `${prefix}${isLast ? `${GAP} ` : `│${GAP}`}`;
      walk(node.children, childPrefix, depth + 1);
    });
  };

  walk(buildFolderTree(folders), '', 0);
  return rows;
}

/** True when `candidate` is the folder itself or lives below it. */
export function isSameFolderOrChild(folderPath: string, candidate: string): boolean {
  return candidate === folderPath || candidate.startsWith(`${folderPath}/`);
}

/**
 * The whole list re-ordered after a drop: the moved folder with its subtree leaves its place and
 * lands on `targetPath` — as its child (`into`), as its sibling (`before` / `after`) or at the end
 * of the root (`root-end`). The answer is the new order as paths; `null` means the drop is refused
 * (onto itself, its own subtree, or a target that is not in the list).
 *
 * The folders come in already in the order they are drawn, and every path in `folders` is answered.
 */
export function moveFolderPaths(
  folders: FolderMeta[],
  movedPath: string,
  targetPath: string,
  mode: FolderDropMode
): string[] | null {
  const paths = folders.map((folder) => folder.path);
  const subtreeOf = (root: string) => paths.filter((path) => isSameFolderOrChild(root, path));

  const moved = subtreeOf(movedPath);
  if (moved.length === 0) return null;
  if (targetPath && isSameFolderOrChild(movedPath, targetPath)) return null;

  const rest = paths.filter((path) => !isSameFolderOrChild(movedPath, path));

  let insertAt: number;
  if (mode === 'root-end') {
    insertAt = rest.length;
  } else {
    const targetIndexes = rest.reduce<number[]>((indexes, path, index) => {
      if (isSameFolderOrChild(targetPath, path)) indexes.push(index);
      return indexes;
    }, []);
    if (targetIndexes.length === 0) return null;
    if (mode === 'into') insertAt = targetIndexes[targetIndexes.length - 1] + 1;
    else if (mode === 'before') insertAt = targetIndexes[0];
    else insertAt = targetIndexes[targetIndexes.length - 1] + 1;
  }

  return [...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)];
}
