import React, { useState, useMemo } from 'react';
import { X, Search, Mic, Music, Play, Pause, ExternalLink, Folder } from 'lucide-react';
import type { AudioTrack, AudioTypeFilter } from '../../lib/media/audioHelper';
import { formatAudioDuration } from '../../lib/media/audioHelper';
import type { FolderMeta } from '../../types';
import { IconButton } from '../UI/IconButton';
import { DEFAULT_INBOX_FOLDER } from '../../config';
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
  const [isFolderSelectOpen, setIsFolderSelectOpen] = useState(false);

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
  const {
    ref: folderMenuRef,
    phase: folderMenuPhase,
    isPresent: isFolderMenuPresent,
    onTransitionEnd: onFolderMenuTransitionEnd,
  } = usePresence(isFolderSelectOpen);

  if (!isPresent) return null;

  return (
    <div
      ref={drawerRef}
      data-motion-state={phase}
      onTransitionEnd={onTransitionEnd}
      inert={!isOpen}
      className="absolute inset-0 z-30 bg-panel/95 backdrop-blur-xl flex flex-col overflow-hidden motion-fade"
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white tracking-wide">
            Очередь воспроизведения
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400">
            {tracks.length}
          </span>
        </div>
        <IconButton
          size="md"
          variant="ghost"
          onClick={onClose}
          title="Закрыть список"
        >
          <X className="w-4 h-4" />
        </IconButton>
      </div>

      {/* Filter toolbar inside drawer */}
      <div className="px-3 py-2 border-b border-white/[0.04] bg-white/[0.02] flex items-center justify-between gap-2 flex-wrap">
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

        {/* Pinned Folder selector (when pinned) */}
        {scopeMode === 'pinned' && (
          <div className="relative">
            <button
              onClick={() => setIsFolderSelectOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-xs text-zinc-300 border border-white/[0.06]"
            >
              <Folder className="w-3 h-3 text-zinc-400" />
              <span className="max-w-[100px] truncate">{pinnedFolder}</span>
            </button>
            {isFolderMenuPresent && (
              <div
                ref={folderMenuRef}
                data-motion-state={folderMenuPhase}
                onTransitionEnd={onFolderMenuTransitionEnd}
                inert={!isFolderSelectOpen}
                className="absolute right-0 top-full mt-1 w-44 rounded-lg bg-surface-elevated border border-white/[0.12] shadow-2xl py-1 z-40 max-h-48 overflow-y-auto motion-popover"
              >
                {Array.from(new Set([DEFAULT_INBOX_FOLDER, ...folders.map((f) => f.path).filter(Boolean)])).map(
                  (folderPath) => (
                    <button
                      key={folderPath}
                      onClick={() => {
                        onSelectPinnedFolder(folderPath);
                        setIsFolderSelectOpen(false);
                      }}
                      className={`w-full px-2.5 py-1 text-left text-xs transition-colors cursor-pointer truncate ${
                        pinnedFolder === folderPath
                          ? 'text-white font-medium bg-white/[0.06]'
                          : 'text-zinc-300 hover:bg-white/[0.08]'
                      }`}
                    >
                      {folderPath}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="px-3 py-2 border-b border-white/[0.04]">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию или заметке..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/[0.04] text-zinc-200 placeholder-zinc-500 rounded-lg border border-white/[0.06] focus:border-white/20 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-zinc-500 hover:text-zinc-300 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Playlist Items */}
      <div className="flex-1 overflow-y-auto px-2 py-2 pb-24 space-y-1">
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
                className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer select-none ${
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

                {/* Right: Badge, Duration, Jump to note */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-2xs font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-500 uppercase">
                    {track.format}
                  </span>

                  <span className="text-2xs font-mono text-zinc-500 w-10 text-right">
                    {formatAudioDuration(track.duration)}
                  </span>

                  {onJumpToNote && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToNote(track.itemId);
                      }}
                      className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.08] rounded transition-colors"
                      title="Перейти к заметке"
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
