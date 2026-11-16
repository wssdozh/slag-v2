// The play queue drawer: search, type filters, folder scope, and missing-bytes state.
import React, { useState, useMemo } from 'react';
import { Icon } from '../UI/icons/Icon';
import type { AudioTrack, AudioTypeFilter } from '../../lib/media/audioHelper';
import { formatAudioDuration } from '../../lib/media/audioHelper';
import type { FolderMeta } from '../../types';
import { IconButton } from '../UI/IconButton';
import { ResponsiveSegmented } from '../UI/ResponsiveSegmented';
import { Select } from '../UI/Select';
import { buildFolderOptions } from '../../lib/vault/folderOptions';
import { usePresence } from '../../hooks/ui/usePresence';

/** The queue lists one of three states of the panel's type filter. */
type QueueFilter = 'all' | 'voice' | 'file';

interface AudioPlaylistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: AudioTrack[];
  /** Tracks whose bytes are not on this device: playable nowhere until sync delivers them. */
  missingIds: string[];
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
  missingIds,
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

  // The panel owns a set of enabled types; the queue shows the three states of that set.
  const queueFilter: QueueFilter = typeFilters.length === 2 ? 'all' : typeFilters[0] === 'file' ? 'file' : 'voice';

  const setQueueFilter = (next: QueueFilter) => {
    if (next === 'all') {
      if (!typeFilters.includes('voice')) onToggleTypeFilter('voice');
      if (!typeFilters.includes('file')) onToggleTypeFilter('file');
      return;
    }
    if (!typeFilters.includes(next)) onToggleTypeFilter(next);
    const other: AudioTypeFilter = next === 'voice' ? 'file' : 'voice';
    if (typeFilters.includes(other)) onToggleTypeFilter(other);
  };

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
      <div className="px-3 pt-2 pb-2 border-b border-tint-8 flex items-center justify-between gap-2 flex-wrap">
        <ResponsiveSegmented<QueueFilter>
          value={queueFilter}
          onChange={setQueueFilter}
          options={[
            { value: 'all', label: 'Всё' },
            { value: 'voice', label: 'Войсы' },
            { value: 'file', label: 'Файлы' },
          ]}
          ariaLabel="Фильтр очереди"
        />

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
            <Icon name="action.search" size="md" tone="inherit" />
          </IconButton>
          <IconButton
            size="md"
            variant="ghost"
            onClick={onClose}
            title="Закрыть список"
            aria-label="Закрыть список"
          >
            <Icon name="action.close" size="md" tone="inherit" />
          </IconButton>
        </div>
      </div>

      {/* The field only exists while it is being used. */}
      {isSearchOpen && (
        <div className="px-3 py-2 border-b border-tint-4">
          <div className="relative flex items-center">
            <Icon name="action.search" size="sm" tone="muted" className="absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по названию или заметке..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-tint-4 text-fg-soft placeholder-fg-muted rounded-lg border border-tint-6 focus:border-tint-20 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Очистить поиск"
                className="absolute right-2 cursor-pointer text-fg-muted hover:text-fg-tertiary"
              >
                <Icon name="action.close" size="sm" tone="inherit" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Playlist Items */}
      <div className="flex-1 overflow-y-auto px-2 py-2 pb-24 space-y-1.5">
        {filteredTracks.length === 0 ? (
          <div className="py-12 text-center text-xs text-fg-muted">
            {searchQuery ? 'Ничего не найдено' : 'В списке нет треков'}
          </div>
        ) : (
          filteredTracks.map((track) => {
            const isCurrent = track.id === currentTrackId;
            const isMissing = missingIds.includes(track.id);

            return (
              <div
                key={track.id}
                onClick={() => onSelectTrack(track)}
                className={`group flex items-center justify-between px-3 py-3 rounded-xl text-ui transition-colors cursor-pointer select-none ${
                  isMissing
                    ? 'opacity-40'
                    : isCurrent
                      ? 'bg-tint-8 text-white'
                      : 'text-fg-tertiary hover:bg-tint-4 hover:text-fg-primary'
                }`}
              >
                {/* Left: cover art & Track Info */}
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  {/* The cover takes the number's place; hovering turns it into a play button. */}
                  <div
                    className={`relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-tint-6 ${
                      isCurrent ? 'ring-1 ring-tint-30' : ''
                    }`}
                  >
                    {track.coverUrl ? (
                      <img src={track.coverUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-fg-muted">
                        {track.isVoice ? (
                          <Icon name="media.microphone" size="sm" tone="inherit" />
                        ) : (
                          <Icon name="media.music" size="sm" tone="inherit" />
                        )}
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-scrim-55 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {isMissing ? (
                        <Icon name="entity.fileMissing" size="sm" tone="inherit" />
                      ) : isCurrent && isPlaying ? (
                        <Icon name="media.pause" size="sm" tone="inherit" variant="filled" />
                      ) : (
                        <Icon name="media.play" size="sm" tone="inherit" variant="filled" />
                      )}
                    </span>
                  </div>

                  {/* Title & Note details */}
                  <div className="min-w-0 flex flex-col">
                    <span
                      className={`truncate font-medium ${
                        isCurrent ? 'text-white' : 'text-fg-soft'
                      }`}
                    >
                      {track.name}
                    </span>
                    <span className="truncate text-2xs text-fg-muted">
                      {isMissing ? 'файла нет на устройстве' : track.itemTitle}
                    </span>
                  </div>
                </div>

                {/* Right: duration and the way to the note it came from */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-2xs font-mono text-fg-muted">
                    {formatAudioDuration(track.duration)}
                  </span>

                  {onJumpToNote && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToNote(track.itemId);
                      }}
                      className="cursor-pointer rounded p-1 text-fg-muted transition-colors hover:bg-tint-8 hover:text-fg-soft"
                      title="Перейти к заметке"
                      aria-label="Перейти к заметке"
                    >
                      <Icon name="nav.externalLink" size="sm" tone="inherit" />
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
