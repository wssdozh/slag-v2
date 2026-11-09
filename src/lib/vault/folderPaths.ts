import type { FolderMeta } from '../../types';

const INVALID_NAME_CHARS = /[\\/:*?"<>|]/g;

/** Folder names are file names on disk, so the OS-forbidden characters become dashes. */
export function sanitizeFolderName(raw: string): string {
  return raw.trim().replace(INVALID_NAME_CHARS, '-');
}

export function parentPathOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

/** Renaming only changes the last segment; the folder stays under the same parent. */
export function folderPathForName(oldPath: string, name: string): string {
  const parent = parentPathOf(oldPath);
  return parent ? `${parent}/${name}` : name;
}

export function folderPathUnder(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

export function isFolderPathFree(folders: FolderMeta[], path: string, exceptPath?: string): boolean {
  return !folders.some(folder => folder.path === path && folder.path !== exceptPath);
}

/** True when `candidate` is the folder itself or lives below it. */
export function isSelfOrDescendant(folderPath: string, candidate: string): boolean {
  return candidate === folderPath || candidate.startsWith(`${folderPath}/`);
}

/** Parent folders a folder can be moved into: everything but itself and its own subtree. */
export function movableTargets(folders: FolderMeta[], folderPath: string): FolderMeta[] {
  return folders.filter(folder => !isSelfOrDescendant(folderPath, folder.path));
}
