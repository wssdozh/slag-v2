// State machine for the folder picker overlay: open/closed, search text, keyboard navigation.
import { useState, useMemo, useCallback } from 'react';
import type { FolderMeta } from '../../../types';
import { folderTreeRows, type FolderTreeRow } from '../../../lib/vault/folderTree';

export interface UseFolderPickerParams {
  folders: FolderMeta[];
  currentFolder: string;
  onSelect: (path: string) => void;
}

export interface UseFolderPickerResult {
  query: string;
  setQuery: (v: string) => void;
  rows: FolderTreeRow[];
  /** Index of the currently active row inside `rows`. Component layer composes activeOptionId via makeOptionId. */
  selectedIndex: number;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/** Build the DOM id used by aria-activedescendant / role="option". Shared between hook + two components. */
export function makeOptionId(containerId: string, index: number): string {
  return `${containerId}-opt-${index}`;
}

const MATCH = (name: string, path: string, q: string) =>
  name.toLowerCase().includes(q) || path.toLowerCase().includes(q);

/** Filter and memoize tree rows from the raw folder list. */
const buildRows = (folders: FolderMeta[], query: string): FolderTreeRow[] => {
  const filtered = query
    ? folders.filter((f) => MATCH(f.name, f.path, query))
    : folders;
  return folderTreeRows(filtered);
};

export function useFolderPicker({
  folders,
  onSelect,
}: UseFolderPickerParams): UseFolderPickerResult {
  const [query, _setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const setQuery = useCallback((v: string) => {
    _setQuery(v);
    setSelectedIndex(0);
  }, []);

  // Only real folders can be selected — Inbox too, but not intermediate nodes.
  const selectable = useMemo(
    () => buildRows(folders, query).filter((row) => row.meta !== undefined),
    [folders, query],
  );

  const onSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // IME composition must pass arrows/Enter through — the user is still typing.
      if (e.nativeEvent.isComposing) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (selectable.length > 0 && i < selectable.length - 1 ? i + 1 : i));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i > 0 ? i - 1 : 0));
        return;
      }
      if (e.key === 'Enter' && selectable.length > 0) {
        e.preventDefault();
        const chosen = selectable[selectedIndex];
        if (chosen?.meta) onSelect(chosen.meta.path);
        return;
      }
    },
    [selectable, selectedIndex, onSelect],
  );

  return { query, setQuery, rows: selectable, selectedIndex, onSearchKeyDown };
}
