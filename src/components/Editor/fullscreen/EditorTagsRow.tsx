// The editor's tag ribbon: chips you can step into and rename in place.
import React, { useCallback, useRef, useState } from 'react';
import { TagChip } from '../../UI/TagChip';

export interface EditorTagsRowProps {
  tags: string[];
  onChange: (next: string[]) => void;
}

const normalizeTag = (raw: string) => raw.trim().replace(/^#+/, '').trim();

/** Drops blanks and folds duplicates onto the first chip that carries the tag. */
const cleanTags = (tags: string[]) => {
  const kept: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (tag && !kept.includes(tag)) kept.push(tag);
  }
  return kept;
};

export const EditorTagsRow: React.FC<EditorTagsRowProps> = ({ tags, onChange }) => {
  const [draft, setDraft] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const addRef = useRef<HTMLInputElement | null>(null);

  const startRename = useCallback((index: number) => {
    if (index < 0 || index >= tags.length) return;
    setEditingIndex(index);
    setEditingValue(tags[index]);
  }, [tags]);

  const stopRename = useCallback(() => {
    setEditingIndex(null);
    setEditingValue('');
  }, []);

  const commitDraft = useCallback(() => {
    const parts = draft.split(/[\s,]+/).filter(Boolean);
    if (parts.length === 0) return;
    onChange(cleanTags([...tags, ...parts]));
    setDraft('');
  }, [draft, tags, onChange]);

  // Blur is a commit too: an empty chip is how a tag gets deleted with the keyboard.
  const commitRename = useCallback(() => {
    if (editingIndex === null) return;
    const next = tags.map((tag, index) => (index === editingIndex ? editingValue : tag));
    stopRename();
    onChange(cleanTags(next));
  }, [editingIndex, editingValue, tags, onChange, stopRename]);

  const removeAt = useCallback((index: number) => {
    onChange(tags.filter((_, position) => position !== index));
  }, [tags, onChange]);

  const handleAddKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === ' ') {
      event.preventDefault();
      commitDraft();
      return;
    }
    // Caret walks left from the empty add field into the last chip.
    if ((event.key === 'Backspace' || event.key === 'ArrowLeft') && !draft && tags.length > 0) {
      event.preventDefault();
      startRename(tags.length - 1);
    }
  };

  const handleEditKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitRename();
      addRef.current?.focus();
      return;
    }
    if (editingIndex === null) return;
    const input = event.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    if (event.key === 'Backspace' && input.value === '') {
      event.preventDefault();
      const index = editingIndex;
      stopRename();
      removeAt(index);
      addRef.current?.focus();
      return;
    }
    if (event.key === 'Escape') {
      // Escape belongs to the editor surface: it closes, this rename is dropped with it.
      return;
    }
    // Arrows off an emptied chip leave the tag as it was: deletion is Backspace's job.
    if (input.value === '' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      stopRename();
      addRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowLeft' && atStart) {
      event.preventDefault();
      const previous = editingIndex - 1;
      commitRename();
      if (previous >= 0) startRename(previous);
      else addRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowRight' && atEnd) {
      event.preventDefault();
      const next = editingIndex + 1;
      commitRename();
      if (next < tags.length) startRename(next);
      else addRef.current?.focus();
    }
  };

  // A chip's text is a span with tabIndex, so Enter and Space have to be wired here.
  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
    const holder = (event.target as HTMLElement).closest<HTMLElement>('[data-tag-index]');
    if (!holder) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      startRename(Number(holder.dataset.tagIndex));
    }
  };

  return (
    <div
      data-testid="editor-tags"
      onClick={(event) => {
        if (event.target === event.currentTarget) addRef.current?.focus();
      }}
      onKeyDown={handleRowKeyDown}
      className="flex items-center gap-1.5 flex-wrap min-h-7 py-0.5 cursor-text text-xs"
    >
      {tags.map((tag, index) =>
        editingIndex === index ? (
          <span
            key={tag}
            className="inline-flex items-center gap-0 px-2 py-0.5 rounded-md bg-tint-6 text-xs font-mono text-fg-tertiary ring-1 ring-tint-30"
          >
            <span aria-hidden="true">#</span>
            <input
              autoFocus
              value={editingValue}
              onChange={(event) => setEditingValue(event.target.value)}
              onBlur={commitRename}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={handleEditKeyDown}
              aria-label={`Переименовать тег ${tag}`}
              data-testid="editor-tag-edit"
              className="bg-transparent border-none outline-none text-fg-primary p-0"
              style={{ width: `${Math.min(28, Math.max(2, editingValue.length + 0.5))}ch` }}
            />
          </span>
        ) : (
          <span key={tag} data-tag-index={index}>
            <TagChip
              tag={tag}
              variant="pill"
              onClick={() => startRename(index)}
              onRemove={() => removeAt(index)}
            />
          </span>
        )
      )}
      <input
        ref={addRef}
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleAddKeyDown}
        onBlur={commitDraft}
        placeholder={tags.length === 0 ? 'добавьте теги...' : ''}
        aria-label="Добавить тег"
        data-testid="editor-tag-input"
        className="bg-transparent text-xs font-mono text-fg-tertiary placeholder-fg-dim outline-none min-w-[70px] flex-1 py-0.5"
      />
    </div>
  );
};
