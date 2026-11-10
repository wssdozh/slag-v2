import React, { useState, useMemo } from 'react';
import { X, Search, Mic, Music, Play, Pause, ExternalLink } from 'lucide-react';
import type { AudioTrack, AudioTypeFilter } from '../../lib/media/audioHelper';
import { formatAudioDuration } from '../../lib/media/audioHelper';
import type { FolderMeta } from '../../types';
import { IconButton } from '../UI/IconButton';
import { Select } from '../UI/Select';
import { buildFolderOptions } from '../../lib/vault/folderOptions';
import { usePresence } from '../../hooks/usePresence';

interface AudioPlaylistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: AudioTrack[];
  currentTrackId: string | null;
  isPlaying: boolean;
  onSelectTrack: (track: AudioTrack) => void;
  onJumpToNote?: (itemId: string) => void;
  // Filters & Scope in drawer
  typeFilters: AudioTypeFilter[];
  onToggleTypeFilter: (type: AudioTypeFilter) => void;
  folders: FolderMeta[];
  scopeMode: 'active' | 'pinned';
  pinnedFolder: string;
  onSelectPinnedFolder: (folder: string) => void;
}

export const AudioPlaylistDrawer: React.FC<AudioPlaylistDrawerProps> = ({
  isOpen,
  onClose,
  tracks,
  currentTrackId,
  isPlaying,
  onSelectTrack,
  onJumpToNote,
  typeFilters,
  onToggleTypeFilter,
  folders,
  scopeMode,
  pinnedFolder,
  onSelectPinnedFolder,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  // Collapsed until asked for: the list is the point, the field is not.
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const folderOptions = useMemo(() => buildFolderOptions(folders), [folders]);

  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    const q = searchQuery.toLowerCase();
    return tracks.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.itemTitle.toLowerCase().includes(q) ||
        t.itemFolder.toLowerCase().includes(q)
    );
  }, [tracks, searchQuery]);

  const { ref: drawerRef, phase, isPresent, onTransitionEnd } = usePresence(isOpen);

  if (!isPresent) return null;

  return (
    <div
      ref={drawerRef}
      data-motion-state={phase}
      data-testid="audio-queue"
      onTransitionEnd={onTransitionEnd}
      inert={!isOpen}
      className="absolute inset-0 z-30 bg-panel/95 backdrop-blur-xl flex flex-col overflow-hidden motion-fade"
    >
      {/* One toolbar does the filters and the way out: no title row repeating the panel name. */}
      <div className="px-3 pt-2 pb-2 border-b border-white/[0.08] flex items-center justify-between gap-2 flex-wrap">
        {/* Multi-type chips */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onToggleTypeFilter('voice')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
              typeFilters.includes('voice')
                ? 'bg-white/10 text-white font-medium border border-white/10'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Mic className="w-3 h-3" />
            <span>Войсы</span>
          </button>
          <button
            onClick={() => onToggleTypeFilter('file')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
              typeFilters.includes('file')
                ? 'bg-white/10 text-white font-medium border border-white/10'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Music className="w-3 h-3" />
            <span>Файлы</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Pinned Folder selector (when pinned) */}
          {scopeMode === 'pinned' && (
            <Select
              size="sm"
              variant="ghost"
              value={pinnedFolder}
              onChange={onSelectPinnedFolder}
              options={folderOptions}
              aria-label="Закреплённая папка аудио"
              className="max-w-[150px] font-mono"
            />
          )}
          <IconButton
            size="md"
            variant="ghost"
            onClick={() => setIsSearchOpen((open) => !open)}
            aria-pressed={isSearchOpen}
            title="Поиск в очереди"
            aria-label="Поиск в очереди"
            className={isSearchOpen ? 'text-fg-primary' : undefined}
          >
            <Search className="w-4 h-4" />
          </IconButton>
          <IconButton
            size="md"
            variant="ghost"
            onClick={onClose}
            title="Закрыть список"
            aria-label="Закрыть список"
          >
            <X className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      {/* The field only exists while it is being used. */}
      {isSearchOpen && (
        <div className="px-3 py-2 border-b border-white/[0.04]">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по названию или заметке..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/[0.04] text-zinc-200 placeholder-zinc-500 rounded-lg border border-white/[0.06] focus:border-white/20 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Очистить поиск"
                className="absolute right-2 cursor-pointer text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Playlist Items */}
      <div className="flex-1 overflow-y-auto px-2 py-2 pb-24 space-y-1.5">
        {filteredTracks.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            {searchQuery ? 'Ничего не найдено' : 'В списке нет треков'}
          </div>
        ) : (
          filteredTracks.map((track, idx) => {
            const isCurrent = track.id === currentTrackId;

            return (
              <div
                key={track.id}
                onClick={() => onSelectTrack(track)}
                className={`group flex items-center justify-between px-3 py-3 rounded-xl text-[13px] transition-colors cursor-pointer select-none ${
                  isCurrent
                    ? 'bg-white/[0.08] text-white'
                    : 'text-zinc-300 hover:bg-white/[0.04] hover:text-zinc-100'
                }`}
              >
                {/* Left: Index / Play Icon & Track Info */}
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className="w-5 h-5 shrink-0 flex items-center justify-center text-zinc-500">
                    {isCurrent ? (
                      isPlaying ? (
                        <Pause className="w-3.5 h-3.5 text-white fill-current" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-white fill-current ml-0.5" />
                      )
                    ) : (
                      <span className="text-[10px] font-mono group-hover:hidden">
                        {idx + 1}
                      </span>
                    )}
                    {!isCurrent && (
                      <Play className="w-3 h-3 text-zinc-400 fill-current ml-0.5 hidden group-hover:block" />
                    )}
                  </div>

                  {/* Icon */}
                  <div className="shrink-0 w-6 h-6 rounded bg-white/[0.04] flex items-center justify-center text-zinc-400">
                    {track.isVoice ? (
                      <Mic className="w-3 h-3" />
                    ) : (
                      <Music className="w-3 h-3" />
                    )}
                  </div>

                  {/* Title & Note details */}
                  <div className="min-w-0 flex flex-col">
                    <span
                      className={`truncate font-medium ${
                        isCurrent ? 'text-white' : 'text-zinc-200'
                      }`}
                    >
                      {track.name}
                    </span>
                    <span className="truncate text-2xs text-zinc-500">
                      {track.itemTitle}
                    </span>
                  </div>
                </div>

                {/* Right: duration and the way to the note it came from */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-2xs font-mono text-zinc-500">
                    {formatAudioDuration(track.duration)}
                  </span>

                  {onJumpToNote && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToNote(track.itemId);
                      }}
                      className="cursor-pointer rounded p-1 text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-zinc-200"
                      title="Перейти к заметке"
                      aria-label="Перейти к заметке"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
