// A single-line folder search that occupies the note composer's position.
import type { KeyboardEventHandler, RefObject } from 'react';
import { Icon } from '../../UI/icons/Icon';

interface FolderSearchComposerProps {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (query: string) => void;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
  onClose: () => void;
  listId: string;
  activeOptionId?: string;
}

export function FolderSearchComposer({ inputRef, query, onQueryChange, onKeyDown, onClose, listId, activeOptionId }: FolderSearchComposerProps) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-subtle bg-surface pl-4 focus-within:border-hover">
      <Icon name="action.search" size="md" tone="secondary" className="shrink-0" />
      <input ref={inputRef} type="text" role="combobox" aria-label="Найти папку" aria-expanded="true"
        aria-autocomplete="list" aria-controls={listId} aria-activedescendant={activeOptionId}
        inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false}
        placeholder="Найти папку…" value={query} onChange={event => onQueryChange(event.target.value)} onKeyDown={onKeyDown}
        className="h-12 min-w-0 flex-1 bg-transparent text-base text-fg-primary outline-none placeholder:text-fg-secondary" />
      <button type="button" aria-label="Закрыть поиск папок" onClick={onClose}
        className="grid size-12 shrink-0 place-items-center rounded-full text-fg-secondary active:bg-tint-8 focus-visible:bg-tint-10">
        <Icon name="action.close" size="md" tone="inherit" />
      </button>
    </div>
  );
}
