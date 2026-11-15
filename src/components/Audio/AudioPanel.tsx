// The audio panel: track scope and type filters, transport controls, and the queue.
import React, { useMemo, useState } from 'react';
import { Icon } from '../UI/icons/Icon';
import { useApp } from '../../context/AppContext';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { buildFolderOptions } from '../../lib/vault/folderOptions';
import {
  extractAudioTracks,
  audioTrackLabel,
  type AudioScopeMode,
  type AudioTypeFilter,
  type AudioTrack,
} from '../../lib/media/audioHelper';
import { Select } from '../UI/Select';
import { AudioArtwork } from './panel/AudioArtwork';
import { AudioScrubber } from './panel/AudioScrubber';
import { AudioTransport } from './panel/AudioTransport';
import { PlaylistDrawer } from './panel/PlaylistDrawer';
import { useAudioPlayback } from './panel/useAudioPlayback';

export const AudioPanel: React.FC = () => {
  const { items, folders, currentFolder, inboxMode, scrollToItem, isMobile } = useApp();

  // Scope & Filter State
  const [scopeMode, setScopeMode] = useState<AudioScopeMode>('active');
  const [pinnedFolder, setPinnedFolder] = useState<string>(currentFolder || DEFAULT_INBOX_FOLDER);
  const [typeFilters, setTypeFilters] = useState<AudioTypeFilter[]>(['voice', 'file']);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);

  // Effective folder based on mode
  const effectiveFolder = scopeMode === 'active' ? currentFolder || DEFAULT_INBOX_FOLDER : pinnedFolder;

  // Same hierarchical folder list as every other picker in the app
  const folderOptions = useMemo(() => buildFolderOptions(folders), [folders]);

  // Extract tracks for current folder and filters
  const tracks = useMemo(() => {
    return extractAudioTracks(items, {
      folderScope: effectiveFolder,
      scopeMode,
      typeFilters,
      inboxMode,
    });
  }, [items, effectiveFolder, scopeMode, typeFilters, inboxMode]);

  const {
    audioRef,
    analyser,
    currentTrack,
    resolvedSrcs,
    isTrackMissing,
    isPlaying,
    isLoop,
    isShuffle,
    isMuted,
    speed,
    currentTime,
    effectiveDuration,
    progressPercent,
    togglePlay,
    toggleSpeed,
    toggleMute,
    toggleShuffle,
    toggleLoop,
    handlePrevTrack,
    handleNextTrack,
    handleSkipTime,
    seekToFraction,
    startScrub,
    endScrub,
    playTrackAt,
  } = useAudioPlayback(tracks);

  // Scope toggle (active <-> pinned)
  const toggleScopeMode = () => {
    if (scopeMode === 'active') {
      setScopeMode('pinned');
      if (!pinnedFolder) setPinnedFolder(currentFolder || DEFAULT_INBOX_FOLDER);
    } else {
      setScopeMode('active');
    }
  };

  // Filter Toggles
  const toggleTypeFilter = (type: AudioTypeFilter) => {
    setTypeFilters((prev) => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev;
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  };

  const handleSelectTrack = (track: AudioTrack) => {
    const index = tracks.findIndex((candidate) => candidate.id === track.id);
    if (index === -1) return;
    playTrackAt(index);
    setIsPlaylistOpen(false);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('button, input, textarea, select, a, [role="listbox"]')) return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      handleSkipTime(-10);
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      handleSkipTime(10);
    }
  };

  // A recorded memo has a machine name; the note title is the only human label it owns.
  const trackLabel = currentTrack ? audioTrackLabel(currentTrack.name) : null;
  const trackTitle = trackLabel
    ? trackLabel.isRecorded
      ? currentTrack?.itemTitle || 'Аудиозапись'
      : trackLabel.title || currentTrack?.itemTitle || 'Аудиозапись'
    : 'Аудиозапись';
  const trackAuthor = trackLabel && !trackLabel.isRecorded ? trackLabel.author : '';

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="relative w-full h-full bg-canvas text-fg-primary flex flex-col justify-between overflow-hidden select-none outline-none"
    >
      {/* Hidden HTML5 Audio Element */}
      <audio ref={audioRef} preload="metadata" />

      {/* Atmospheric Ambient Glow Backdrop */}
      {currentTrack?.coverUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-10 blur-3xl pointer-events-none scale-125"
          style={{ backgroundImage: `url(${currentTrack.coverUrl})` }}
        />
      )}

      {/* Slide-over Playlist Drawer */}
      <PlaylistDrawer
        isOpen={isPlaylistOpen}
        onClose={() => setIsPlaylistOpen(false)}
        tracks={tracks}
        resolvedSrcs={resolvedSrcs}
        currentTrackId={currentTrack?.id ?? null}
        isPlaying={isPlaying}
        onSelectTrack={handleSelectTrack}
        onJumpToNote={(itemId) => {
          scrollToItem(itemId);
          setIsPlaylistOpen(false);
        }}
        typeFilters={typeFilters}
        onToggleTypeFilter={toggleTypeFilter}
        folders={folders}
        scopeMode={scopeMode}
        pinnedFolder={pinnedFolder}
        onSelectPinnedFolder={(f) => setPinnedFolder(f)}
      />

      {/* Main Center Stage */}
      <main className="relative z-10 flex flex-1 min-h-0 flex-col items-center justify-center overflow-y-auto overflow-x-hidden p-4">
        <div className="w-full max-w-sm flex flex-col items-center my-auto">
          {tracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 px-4">
              <div className="w-16 h-16 rounded-full bg-tint-4 border border-tint-8 flex items-center justify-center mb-4">
                <Icon name="entity.folder" size="none" tone="muted" className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-medium text-fg-soft mb-1">В папке нет аудиозаписей</h3>
              <p className="text-xs text-fg-muted mb-4">
                В папке «{effectiveFolder}» отсутствуют вложения выбранных типов.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setScopeMode('active')}
                  className="text-xs px-3 py-1.5 rounded-lg bg-tint-10 hover:bg-tint-15 text-fg-soft transition-colors cursor-pointer"
                >
                  Активная папка
                </button>
                <button
                  onClick={() => setIsPlaylistOpen(true)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-tint-5 hover:bg-tint-10 text-fg-secondary transition-colors cursor-pointer"
                >
                  Очередь и фильтры
                </button>
              </div>
            </div>
          ) : (
            <>
              <AudioArtwork
                track={currentTrack}
                isPlaying={isPlaying}
                analyser={analyser}
                isTrackMissing={isTrackMissing}
                title={trackTitle}
                author={trackAuthor}
                onOpenNote={(itemId) => scrollToItem(itemId)}
              />

              <AudioScrubber
                currentTime={currentTime}
                duration={effectiveDuration}
                progressPercent={progressPercent}
                onSeek={seekToFraction}
                onScrubStart={startScrub}
                onScrubEnd={endScrub}
              />

              <AudioTransport
                isPlaying={isPlaying}
                isLoop={isLoop}
                isShuffle={isShuffle}
                isMuted={isMuted}
                isTrackMissing={isTrackMissing}
                speed={speed}
                onTogglePlay={togglePlay}
                onPrevTrack={handlePrevTrack}
                onNextTrack={handleNextTrack}
                onSkipTime={handleSkipTime}
                onToggleSpeed={toggleSpeed}
                onToggleMute={toggleMute}
                onToggleShuffle={toggleShuffle}
                onToggleLoop={toggleLoop}
                onOpenPlaylist={() => setIsPlaylistOpen(true)}
              />
            </>
          )}
        </div>
      </main>

      {/* 7. Bottom Folder Toggle strictly at the bottom ("прям внизу внизу") */}
      <footer className={`relative z-10 w-full flex items-center justify-center select-none ${isMobile ? 'pt-2 pb-24' : 'py-2.5'}`}>
        <div className="relative">
          <div className="group flex items-center gap-1 py-0.5 text-xs select-none transition-colors">
            {/* Pin Icon Toggle */}
            <button
              onClick={toggleScopeMode}
              aria-label="Закрепить папку"
              aria-pressed={scopeMode === 'pinned'}
              className="p-1 text-fg-muted hover:text-fg-soft transition-colors cursor-pointer"
              title={
                scopeMode === 'pinned'
                  ? 'Папка закреплена (нажмите, чтобы открепить)'
                  : 'Следовать за активной (нажмите, чтобы закрепить)'
              }
            >
              <Icon name="action.pin" size="sm" tone="inherit" className={`transition-[color,scale] ${scopeMode === 'pinned' ? 'text-fg-soft fill-current scale-105' : 'text-fg-muted group-hover:text-fg-tertiary'}`} />
            </button>

            {/* Selecting a folder pins it; the separate pin toggle keeps following active folders. */}
            <Select
              size="sm"
              variant="ghost"
              direction="up"
              value={effectiveFolder}
              onChange={(folderPath) => {
                setPinnedFolder(folderPath);
                setScopeMode('pinned');
              }}
              options={folderOptions}
              aria-label="Выбрать папку аудио"
              title="Выбрать папку (автоматически закрепит)"
              className={`max-w-[150px] sm:max-w-[190px] font-mono ${scopeMode === 'pinned' ? 'font-medium' : ''}`}
            />
          </div>
        </div>
      </footer>
    </div>
  );
};
