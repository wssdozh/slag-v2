import type { FolderColor } from '../../types';

export function isFolderColor(value: unknown): value is FolderColor {
  return value === 'blue' || value === 'green' || value === 'amber' || value === 'rose';
}
