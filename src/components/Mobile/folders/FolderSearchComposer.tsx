// The search input at the top of the folder picker: plain input, clear button, keyboard pass-through.
import React from 'react';

export interface FolderSearchComposerProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onClose: () => void;
}

/** Pure search input with a clear "×" plate. No list — that's FolderPickerList. */
export const FolderSearchComposer: React.FC<FolderSearchComposerProps> = ({
  inputRef,
  query,
  onQueryChange,
  onKeyDown,
  onClose,
}) => {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2 bg-surface border-b border-tint-6">
      {/* Magnifier icon placeholder — uses theme tokens */}
      <svg
        className="w-4 h-4 shrink-0 text-fg-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>

      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={onQueryChange}
        onKeyDown={onKeyDown}
        placeholder="Поиск папок…"
        className="flex-1 min-w-0 bg-transparent text-base text-fg-primary placeholder-fg-muted outline-none py-1"
        aria-label="Поиск папок"
      />

      {query && (
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.preventDefault()}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-fg-tertiary hover:text-fg-secondary hover:bg-tint-6 transition-colors cursor-pointer"
          aria-label="Очистить"
        >
          ×
        </button>
      )}
    </div>
  );
};
