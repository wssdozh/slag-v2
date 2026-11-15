// The files tab: folders already granted, their contents, and the system dialog escape.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
import { formatBytes } from '../../lib/text/formatBytes';
import { useFolderBrowser } from './useFolderBrowser';
import type { DevicePick, FolderEntry } from '../../types';

function iconFor(entry: FolderEntry): React.ReactNode {
  if (entry.isDir) return <Icon name="entity.folder" size="md" tone="muted" className="shrink-0" />;
  if (entry.mimeType.startsWith('image/')) return <Icon name="entity.image" size="md" tone="muted" className="shrink-0" />;
  return <Icon name="entity.article" size="md" tone="muted" className="shrink-0" />;
}

export interface FolderBrowserProps {
  selected: DevicePick[];
  onToggle: (pick: DevicePick) => void;
  /** The system dialog has no grid to select from, so its files attach immediately. */
  onSystemPick: (entries: FolderEntry[]) => void;
  /** The sheet's scroll handoff needs the live scroller, and which one depends on the view. */
  bodyRef?: (node: HTMLDivElement | null) => void;
}

/**
 * The files tab: folders someone granted once, then their contents. The system dialog stays one
 * tap away because Android refuses to grant some directories at all (the root of Download, for
 * one), and a picker that cannot open a folder is worse than a system dialog.
 */
export const FolderBrowser: React.FC<FolderBrowserProps> = ({ selected, onToggle, onSystemPick, bodyRef }) => {
  const { folders, openFolder, entries, isLoading, error, addFolder, open, back, browseSystem } =
    useFolderBrowser(true);

  const handleSystem = async () => {
    const picked = await browseSystem();
    if (picked.length > 0) onSystemPick(picked.filter((entry) => !entry.isDir));
  };

  if (openFolder) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-1" data-testid="folder-browser">
        <div className="flex shrink-0 items-center gap-2 px-1">
          <button
            type="button"
            onClick={back}
            aria-label="Назад к папкам"
            className="cursor-pointer rounded-lg p-1 text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg-primary"
          >
            <Icon name="nav.back" size="md" tone="inherit" />
          </button>
          <span className="truncate text-xs font-medium text-fg-primary">{openFolder.name}</span>
          <span className="ml-auto font-mono text-3xs text-fg-muted">{entries.length}</span>
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto" data-testid="folder-entries">
          {entries.map((entry) => {
            const isSelected = selected.some((pick) => pick.uri.uri === entry.uri.uri);
            return (
              <button
                key={entry.uri.uri}
                type="button"
                onClick={() => (entry.isDir ? void open({ uri: entry.uri, name: entry.name }) : onToggle(entry))}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-hover"
              >
                {iconFor(entry)}
                <span className="min-w-0 flex-1 truncate text-xs text-fg-primary">{entry.name}</span>
                <span className="shrink-0 font-mono text-3xs text-fg-muted">
                  {entry.isDir ? '' : formatBytes(entry.size)}
                </span>
                {!entry.isDir && (
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-4xs ${
                      isSelected ? 'bg-accent-strong text-white' : 'border border-tint-25 text-transparent'
                    }`}
                  >
                    {isSelected ? selected.findIndex((pick) => pick.uri.uri === entry.uri.uri) + 1 : ''}
                  </span>
                )}
                {entry.isDir && <Icon name="nav.next" size="sm" tone="dim" className="shrink-0" />}
              </button>
            );
          })}

          {isLoading && <p className="py-6 text-center text-3xs text-fg-muted">читаю папку</p>}
          {!isLoading && entries.length === 0 && (
            <p className="py-6 text-center text-3xs text-fg-muted">Пусто</p>
          )}
        </div>

        {error && <p className="shrink-0 px-1 text-3xs text-rose-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1" data-testid="folder-browser">
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">
        {folders.map((folder) => (
          <button
            key={folder.uri.uri}
            type="button"
            onClick={() => void open(folder)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-hover"
          >
            <Icon name="entity.folder" size="md" tone="muted" className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-xs text-fg-primary">{folder.name}</span>
            <Icon name="nav.next" size="sm" tone="dim" className="shrink-0" />
          </button>
        ))}

        {isLoading && folders.length === 0 && (
          <p className="py-6 text-center text-3xs text-fg-muted">читаю папки</p>
        )}
        {!isLoading && folders.length === 0 && (
          <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
            <Icon name="action.lock" size="md" tone="muted" />
            <p className="text-xs text-fg-primary">Папок пока нет</p>
            <p className="text-3xs leading-relaxed text-fg-muted">
              Выдай одну — и она открывается здесь, без системных экранов.
            </p>
          </div>
        )}
      </div>

      <div className="mt-1 flex shrink-0 items-center gap-2 px-1">
        <button
          type="button"
          onClick={() => void addFolder()}
          className="flex cursor-pointer items-center gap-1.5 rounded-md bg-surface px-2.5 py-1.5 text-2xs font-medium text-fg-primary transition-colors hover:bg-surface-hover"
        >
          <Icon name="action.folderAdd" size="sm" tone="inherit" /> Выдать папку
        </button>
        <button
          type="button"
          onClick={() => void handleSystem()}
          className="cursor-pointer rounded-md px-2 py-1.5 text-2xs text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg-primary"
        >
          Системный диалог
        </button>
      </div>

      {error && <p className="shrink-0 px-1 text-3xs text-rose-400">{error}</p>}
    </div>
  );
};
