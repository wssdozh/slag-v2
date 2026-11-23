// Search and keyboard selection over the current vault's prebuilt folder tree.
import { useMemo, useState, type KeyboardEvent } from 'react';
import { DEFAULT_INBOX_FOLDER } from '../../../config';
import { folderTreeRows } from '../../../lib/vault/folderTree';
import type { FolderMeta } from '../../../types';

export const folderOptionId = (listId: string, index: number) => `${listId}-option-${index}`;

export function useFolderPicker(folders: FolderMeta[], currentFolder: string, onSelect: (path: string) => void) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const options = useMemo(() => {
    const rest = folders.filter(folder => folder.path !== DEFAULT_INBOX_FOLDER);
    const inbox = folders.find(folder => folder.path === DEFAULT_INBOX_FOLDER)
      ?? { path: DEFAULT_INBOX_FOLDER, name: DEFAULT_INBOX_FOLDER, description: '' };
    return folderTreeRows([inbox, ...rest]).flatMap(row => {
      if (!row.meta) return [];
      const parentEnd = row.path.lastIndexOf('/');
      const parent = parentEnd < 0 ? '' : row.path.slice(0, parentEnd);
      return [{ ...row, name: row.meta.name, parent, searchText: `${row.meta.name} ${row.path}`.toLowerCase() }];
    });
  }, [folders]);
  const needle = query.trim().toLowerCase();
  const rows = useMemo(() => needle ? options.filter(row => row.searchText.includes(needle)) : options, [needle, options]);
  const found = !needle ? rows.findIndex(row => row.path === currentFolder) : 0;
  const activeIndex = Math.min(highlighted ?? Math.max(0, found), rows.length - 1);

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229 || activeIndex < 0) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      onSelect(rows[activeIndex].path);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted(Math.max(0, Math.min(rows.length - 1, activeIndex + step)));
    }
  }

  return {
    query,
    isFiltering: needle !== '',
    rows,
    activeIndex,
    onSearchKeyDown,
    setQuery(next: string) {
      setQuery(next);
      setHighlighted(null);
    },
  };
}

export type FolderPickerRow = ReturnType<typeof useFolderPicker>['rows'][number];
