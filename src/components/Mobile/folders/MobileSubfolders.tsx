// One row of shortcuts to direct subfolders; counts the physical folder only.
import { useMemo } from 'react';
import type { FolderMeta, SlagItem } from '../../../types';
import { Icon } from '../../UI/icons/Icon';

interface MobileSubfoldersProps {
  folders: FolderMeta[];
  items: SlagItem[];
  currentFolder: string;
  onSelect: (path: string) => void;
  onCreate: (path: string) => void;
}

export function MobileSubfolders({ folders, items, currentFolder, onSelect, onCreate }: MobileSubfoldersProps) {
  const direct = useMemo(() => {
    const prefix = `${currentFolder}/`;
    return folders.filter(folder => folder.path.startsWith(prefix) && !folder.path.includes('/', prefix.length));
  }, [folders, currentFolder]);
  const counts = useMemo(() => {
    const result = new Map(direct.map(folder => [folder.path, 0]));
    if (result.size) {
      for (const item of items) {
        const count = result.get(item.folder);
        if (count !== undefined) result.set(item.folder, count + 1);
      }
    }
    return result;
  }, [direct, items]);
  if (!direct.length) return null;

  return (
    <div className="z-10 flex shrink-0 items-center gap-2 overflow-x-auto border-b border-tint-6 bg-panel px-3 scrollbar-none">
      {direct.map(folder => (
        <button key={folder.path} type="button" onClick={() => onSelect(folder.path)}
          className="flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-xs font-medium text-fg-secondary active:bg-tint-8 focus-visible:bg-tint-8">
          <Icon name="entity.folder" size="sm" />
          <span>{folder.name}</span>
          <span key={counts.get(folder.path)} className="motion-count font-mono text-3xs text-fg-muted">({counts.get(folder.path)})</span>
        </button>
      ))}
      <button type="button" onClick={() => onCreate(currentFolder)} title="Создать подпапку"
        className="flex h-12 shrink-0 items-center gap-1.5 px-2 text-xs text-fg-secondary active:bg-tint-8 focus-visible:bg-tint-8">
        <Icon name="action.add" size="sm" tone="inherit" />
        <span>Подпапка</span>
      </button>
    </div>
  );
}
