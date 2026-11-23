// The upper folder list: browse the tree or pick a result by its full path.
import { useLayoutEffect, useRef } from 'react';
import { Icon } from '../../UI/icons/Icon';
import { folderOptionId, type FolderPickerRow } from './useFolderPicker';

interface FolderPickerListProps {
  id: string;
  rows: FolderPickerRow[];
  currentFolder: string;
  activeIndex: number;
  isFiltering: boolean;
  onSelect: (path: string) => void;
}

export function FolderPickerList({ id, rows, currentFolder, activeIndex, isFiltering, onSelect }: FolderPickerListProps) {
  const activeRow = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    activeRow.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, rows]);

  return (
    <div data-swipe-ignore className="motion-fade pointer-events-auto w-full max-w-sm max-h-full overflow-y-auto overscroll-contain rounded-xl border border-tint-10 bg-surface-elevated p-1 shadow-xl shadow-scrim-80">
      <div id={id} role="listbox" aria-label="Папки">
        {rows.map((row, index) => {
          const active = activeIndex === index;
          const current = currentFolder === row.path;
          return (
            <button key={row.path} ref={active ? activeRow : null} id={folderOptionId(id, index)} type="button"
              role="option" aria-selected={active} aria-current={current ? 'page' : undefined} tabIndex={-1}
              onMouseDown={event => event.preventDefault()} onClick={() => onSelect(row.path)}
              className={`flex min-h-12 w-full items-center gap-2 rounded-lg px-3 py-1 text-start text-sm active:bg-tint-10 ${active ? 'bg-tint-6 text-fg-primary' : 'text-fg-secondary'}`}>
              {!isFiltering && row.prefix && <span aria-hidden="true" className="shrink-0 whitespace-pre font-mono text-fg-muted">{row.prefix}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{row.name}</span>
                {isFiltering && row.parent && <span className="block truncate text-xs text-fg-secondary">{row.parent}</span>}
              </span>
              {current && <Icon name="action.check" size="sm" className="shrink-0" />}
            </button>
          );
        })}
      </div>
      {rows.length === 0 && <div role="status" className="px-3 py-3 text-sm text-fg-secondary">Папки не найдены</div>}
    </div>
  );
}
