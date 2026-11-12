import React from 'react';
import type { AudioScopeMode, AudioTrack, AudioTypeFilter } from '../../../lib/media/audioHelper';
import type { FolderMeta } from '../../../types';
import { AudioPlaylistDrawer } from '../AudioPlaylistDrawer';

interface PlaylistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: AudioTrack[];
  resolvedSrcs: Record<string, string | null>;
  currentTrackId: string | null;
  isPlaying: boolean;
  onSelectTrack: (track: AudioTrack) => void;
  onJumpToNote: (itemId: string) => void;
  typeFilters: AudioTypeFilter[];
  onToggleTypeFilter: (type: AudioTypeFilter) => void;
  folders: FolderMeta[];
  scopeMode: AudioScopeMode;
  pinnedFolder: string;
  onSelectPinnedFolder: (folder: string) => void;
}

export const PlaylistDrawer: React.FC<PlaylistDrawerProps> = ({
  isOpen,
  onClose,
  tracks,
  resolvedSrcs,
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
  // A `null` answer means the bytes are on another device, not that they are still loading.
  const missingIds = tracks
    .filter((track) => !track.url && resolvedSrcs[track.id] === null)
    .map((track) => track.id);

  return (
    <AudioPlaylistDrawer
      isOpen={isOpen}
      onClose={onClose}
      tracks={tracks}
      missingIds={missingIds}
      currentTrackId={currentTrackId}
      isPlaying={isPlaying}
      onSelectTrack={onSelectTrack}
      onJumpToNote={onJumpToNote}
      typeFilters={typeFilters}
      onToggleTypeFilter={onToggleTypeFilter}
      folders={folders}
      scopeMode={scopeMode}
      pinnedFolder={pinnedFolder}
      onSelectPinnedFolder={onSelectPinnedFolder}
    />
  );
};
