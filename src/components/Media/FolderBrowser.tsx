import React from 'react';
import { ArrowLeft, ChevronRight, FileText, Folder, FolderPlus, Image as ImageIcon, Lock } from 'lucide-react';
import { formatBytes } from '../../lib/formatBytes';
import { useFolderBrowser } from './useFolderBrowser';
import type { DevicePick, FolderEntry } from '../../types';

function iconFor(entry: FolderEntry): React.ReactNode {
  if (entry.isDir) return <Folder className="h-4 w-4 shrink-0 text-fg-muted" />;
  if (entry.mimeType.startsWith('image/')) return <ImageIcon className="h-4 w-4 shrink-0 text-fg-muted" />;
  return <FileText className="h-4 w-4 shrink-0 text-fg-muted" />;
}

export interface FolderBrowserProps {
  selected: DevicePick[];
  onToggle: (pick: DevicePick) => void;
  /** The system dialog has no grid to select from, so its files attach immediately. */
  onSystemPick: (entries: FolderEntry[]) => void;
}

/**
 * The files tab: folders someone granted once, then their contents. The system dialog stays one
 * tap away because Android refuses to grant some directories at all (the root of Download, for
 * one), and a picker that cannot open a folder is worse than a system dialog.
 */
export const FolderBrowser: React.FC<FolderBrowserProps> = ({ selected, onToggle, onSystemPick }) => {
  const { folders, openFolder, entries, isLoading, error, addFolder, open, back, browseSystem } =
    useFolderBrowser(true);

  const handleSystem = async () => {
    const picked = await browseSystem();
    if (picked.length > 0) onSystemPick(picked.filter((entry) => !entry.isDir));
  };

  if (openFolder) {
    return (
      <div className="flex min-h-0 flex-col gap-1" data-testid="folder-browser">
        <div className="flex items-center gap-2 px-1">
          <button
            type="button"
            onClick={back}
            aria-label="Назад к папкам"
            className="cursor-pointer rounded-lg p-1 text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg-primary"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="truncate text-xs font-medium text-fg-primary">{openFolder.name}</span>
          <span className="ml-auto font-mono text-[10px] text-fg-muted">{entries.length}</span>
        </div>

        <div className="max-h-[42vh] overflow-y-auto" data-testid="folder-entries">
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
                <span className="shrink-0 font-mono text-[10px] text-fg-muted">
                  {entry.isDir ? '' : formatBytes(entry.size)}
                </span>
                {!entry.isDir && (
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] ${
                      isSelected ? 'bg-accent-strong text-white' : 'border border-white/25 text-transparent'
                    }`}
                  >
                    {isSelected ? selected.findIndex((pick) => pick.uri.uri === entry.uri.uri) + 1 : ''}
                  </span>
                )}
                {entry.isDir && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-dim" />}
              </button>
            );
          })}

          {isLoading && <p className="py-6 text-center text-[10px] text-fg-muted">читаю папку</p>}
          {!isLoading && entries.length === 0 && (
            <p className="py-6 text-center text-[10px] text-fg-muted">Пусто</p>
          )}
        </div>

        {error && <p className="px-1 text-[10px] text-rose-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-1" data-testid="folder-browser">
      <div className="max-h-[38vh] overflow-y-auto">
        {folders.map((folder) => (
          <button
            key={folder.uri.uri}
            type="button"
            onClick={() => void open(folder)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-hover"
          >
            <Folder className="h-4 w-4 shrink-0 text-fg-muted" />
            <span className="min-w-0 flex-1 truncate text-xs text-fg-primary">{folder.name}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-dim" />
          </button>
        ))}

        {isLoading && folders.length === 0 && (
          <p className="py-6 text-center text-[10px] text-fg-muted">читаю папки</p>
        )}
        {!isLoading && folders.length === 0 && (
          <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
            <Lock className="h-4 w-4 text-fg-muted" />
            <p className="text-xs text-fg-primary">Папок пока нет</p>
            <p className="text-[10px] leading-relaxed text-fg-muted">
              Выдай одну — и она открывается здесь, без системных экранов.
            </p>
          </div>
        )}
      </div>

      <div className="mt-1 flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={() => void addFolder()}
          className="flex cursor-pointer items-center gap-1.5 rounded-md bg-surface px-2.5 py-1.5 text-[11px] font-medium text-fg-primary transition-colors hover:bg-surface-hover"
        >
          <FolderPlus className="h-3.5 w-3.5" /> Выдать папку
        </button>
        <button
          type="button"
          onClick={() => void handleSystem()}
          className="cursor-pointer rounded-md px-2 py-1.5 text-[11px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg-primary"
        >
          Системный диалог
        </button>
      </div>

      {error && <p className="px-1 text-[10px] text-rose-400">{error}</p>}
    </div>
  );
};
