// One temporary navigation surface: results above the view, search in the composer position.
import type { RefObject } from 'react';
import { FolderPickerList } from './FolderPickerList';
import { FolderSearchComposer } from './FolderSearchComposer';
import { folderOptionId, useFolderPicker } from './useFolderPicker';
import type { FolderMeta } from '../../../types';

interface FolderOverlayProps {
  folders: FolderMeta[];
  currentFolder: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onSelect: (path: string) => void;
  onClose: () => void;
  listId: string;
}

export function FolderOverlay({ folders, currentFolder, inputRef, onSelect, onClose, listId }: FolderOverlayProps) {
  const { query, isFiltering, rows, activeIndex, onSearchKeyDown, setQuery } = useFolderPicker(folders, currentFolder, onSelect);
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex min-h-0 flex-col gap-2">
      {/* Spend the outside tap on dismissal; don't pass it through to the note beneath it. */}
      <div aria-hidden="true" className="pointer-events-auto absolute inset-0" onClick={onClose} />
      <div className="pointer-events-none relative flex min-h-0 flex-1 items-start justify-center px-3 pt-1.5">
        <FolderPickerList id={listId} rows={rows} currentFolder={currentFolder} activeIndex={activeIndex}
          isFiltering={isFiltering} onSelect={onSelect} />
      </div>
      <div className="relative shrink-0" style={{
        paddingBottom: 'calc(var(--sab) + 8px)',
        paddingLeft: 'calc(var(--sal) + 12px)',
        paddingRight: 'calc(var(--sar) + 12px)',
      }}>
        <div className="pointer-events-auto">
          <FolderSearchComposer inputRef={inputRef} query={query} onQueryChange={setQuery} onKeyDown={onSearchKeyDown}
            onClose={onClose} listId={listId} activeOptionId={activeIndex >= 0 ? folderOptionId(listId, activeIndex) : undefined} />
        </div>
      </div>
    </div>
  );
}
