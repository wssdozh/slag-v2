import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ListMusic,
  Folder,
  Pin,
  Mic,
  Music,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  extractAudioTracks,
  formatAudioDuration,
  setupAudioCollisionGuard,
  type AudioTrack,
  type AudioScopeMode,
  type AudioTypeFilter,
} from '../../lib/audioHelper';
import { AudioCoverArt } from './AudioCoverArt';
import { AudioPlaylistDrawer } from './AudioPlaylistDrawer';

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2] as const;

export const AudioPanel: React.FC = () => {
  const { items, folders, currentFolder, scrollToItem } = useApp();

  // Scope & Filter State
  const [scopeMode, setScopeMode] = useState<AudioScopeMode>('active');
  const [pinnedFolder, setPinnedFolder] = useState<string>(currentFolder || 'Входящие');
  const [typeFilters, setTypeFilters] = useState<AudioTypeFilter[]>(['voice', 'file']);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);

  // Audio Playback State
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [speedIndex, setSpeedIndex] = useState<number>(0);
  const [isLoop, setIsLoop] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const folderPickerRef = useRef<HTMLDivElement | null>(null);

  // Effective folder based on mode
  const effectiveFolder = scopeMode === 'active' ? currentFolder || 'Входящие' : pinnedFolder;

  // Collision guard on mount
  useEffect(() => {
    return setupAudioCollisionGuard();
  }, []);

  // Close folder picker on outside click
  useEffect(() => {
    if (!isFolderPickerOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node)) {
        setIsFolderPickerOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isFolderPickerOpen]);

  // Extract tracks for current folder and filters
  const tracks = useMemo(() => {
    return extractAudioTracks(items, {
      folderScope: effectiveFolder,
      scopeMode,
      typeFilters,
    });
  }, [items, effectiveFolder, scopeMode, typeFilters]);

  // Safe derived track index to avoid out-of-bounds without set-state-in-effect
  const safeTrackIndex = tracks.length === 0 ? 0 : Math.min(currentTrackIndex, tracks.length - 1);
  const currentTrack: AudioTrack | null = tracks[safeTrackIndex] ?? null;

  // Refs for audio listeners to avoid stale closures
  const isPlayingRef = useRef(isPlaying);
  const isLoopRef = useRef(isLoop);
  const tracksLengthRef = useRef(tracks.length);
  const safeIndexRef = useRef(safeTrackIndex);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    isLoopRef.current = isLoop;
    tracksLengthRef.current = tracks.length;
    safeIndexRef.current = safeTrackIndex;
  }, [isPlaying, isLoop, tracks.length, safeTrackIndex]);

  // Sync playback rate and volume
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = PLAYBACK_SPEEDS[speedIndex];
    audio.volume = isMuted ? 0 : volume;
  }, [speedIndex, isMuted, volume]);

  // Sync audio source when track changes
  const trackId = currentTrack?.id;
  const trackUrl = currentTrack?.url;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (trackUrl) {
      audio.src = trackUrl;
      if (isPlayingRef.current) {
        audio.play().catch(() => {});
      }
    } else {
      audio.pause();
      audio.removeAttribute('src');
    }
  }, [trackId, trackUrl]);

  // Audio events binding
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (!isScrubbing) {
        setCurrentTime(audio.currentTime);
      }
    };

    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      } else if (currentTrack?.duration) {
        setDuration(currentTrack.duration);
      }
    };

    const onEnded = () => {
      if (isLoopRef.current) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else if (safeIndexRef.current < tracksLengthRef.current - 1) {
        // Auto-advance to next track in playlist
        setCurrentTrackIndex(safeIndexRef.current + 1);
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [isScrubbing, currentTrack?.duration]);

  // Toggle playback
  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  };

  // Skip tracks
  const handlePrevTrack = () => {
    if (currentTime > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      setCurrentTime(0);
    } else if (safeTrackIndex > 0) {
      setCurrentTrackIndex(safeTrackIndex - 1);
    } else {
      setCurrentTrackIndex(Math.max(0, tracks.length - 1));
    }
  };

  const handleNextTrack = () => {
    if (safeTrackIndex < tracks.length - 1) {
      setCurrentTrackIndex(safeTrackIndex + 1);
    } else {
      setCurrentTrackIndex(0);
    }
  };

  // Jump by 10s
  const handleSkipTime = (delta: number) => {
    if (!audioRef.current) return;
    const targetDur = duration || currentTrack?.duration || 0;
    const nextTime = Math.max(0, Math.min(targetDur, audioRef.current.currentTime + delta));
    audioRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  // Timeline Scrubbing
  const seekFromClientX = useCallback(
    (clientX: number) => {
      if (!audioRef.current || !timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetDur = duration || currentTrack?.duration || audioRef.current.duration || 0;
      const targetTime = fraction * targetDur;
      audioRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    },
    [duration, currentTrack]
  );

  const handleTimelineMouseDown = (e: React.MouseEvent) => {
    setIsScrubbing(true);
    seekFromClientX(e.clientX);

    const onMouseMove = (moveEvent: MouseEvent) => {
      seekFromClientX(moveEvent.clientX);
    };
    const onMouseUp = () => {
      setIsScrubbing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Speed Toggle
  const toggleSpeed = () => {
    const nextIndex = (speedIndex + 1) % PLAYBACK_SPEEDS.length;
    setSpeedIndex(nextIndex);
    if (audioRef.current) {
      audioRef.current.playbackRate = PLAYBACK_SPEEDS[nextIndex];
    }
  };

  // Volume toggle
  const toggleMute = () => {
    if (!audioRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audioRef.current.volume = nextMuted ? 0 : volume;
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(false);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
  };

  // Filter Toggles (Ensure at least one filter remains active)
  const toggleTypeFilter = (type: AudioTypeFilter) => {
    setTypeFilters((prev) => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev; // Do not allow empty filter
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

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

  const effectiveDuration = duration > 0 ? duration : (currentTrack?.duration || 0);
  const progressPercent = effectiveDuration > 0 ? (currentTime / effectiveDuration) * 100 : 0;

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="relative w-full h-full bg-[#09090b] text-zinc-100 flex flex-col justify-between overflow-hidden select-none outline-none"
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
      <AudioPlaylistDrawer
        isOpen={isPlaylistOpen}
        onClose={() => setIsPlaylistOpen(false)}
        tracks={tracks}
        currentTrackId={currentTrack?.id ?? null}
        isPlaying={isPlaying}
        onSelectTrack={(track) => {
          const idx = tracks.findIndex((t) => t.id === track.id);
          if (idx !== -1) {
            setCurrentTrackIndex(idx);
            setIsPlaying(true);
            setIsPlaylistOpen(false);
          }
        }}
        onJumpToNote={(itemId) => {
          scrollToItem(itemId);
          setIsPlaylistOpen(false);
        }}
      />

      {/* Top Header: Folder scope & Filter toolbar */}
      <header className="relative z-10 flex items-center justify-between px-3 py-2 border-b border-white/[0.06] bg-black/30 backdrop-blur-md gap-2 flex-wrap">
        {/* Scope selector */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="flex items-center bg-white/[0.04] p-0.5 rounded-lg border border-white/[0.06] shrink-0">
            <button
              onClick={() => setScopeMode('active')}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                scopeMode === 'active'
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Следовать за активной выбранной папкой"
            >
              <Sparkles className="w-3 h-3 text-zinc-400 shrink-0" />
              <span className="hidden min-[420px]:inline">Активная</span>
            </button>
            <button
              onClick={() => {
                setScopeMode('pinned');
                if (!pinnedFolder) setPinnedFolder(currentFolder || 'Входящие');
              }}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                scopeMode === 'pinned'
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Зафиксировать определенную папку"
            >
              <Pin className="w-3 h-3 text-zinc-400 shrink-0" />
              <span className="hidden min-[420px]:inline">Закрепить</span>
            </button>
          </div>

          {/* Folder name badge / picker */}
          <div className="relative min-w-0" ref={folderPickerRef}>
            {scopeMode === 'pinned' ? (
              <button
                onClick={() => setIsFolderPickerOpen((prev) => !prev)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-zinc-200 transition-colors cursor-pointer max-w-[120px] truncate"
              >
                <Folder className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span className="truncate">{pinnedFolder}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-transparent text-xs text-zinc-400 max-w-[120px] truncate">
                <Folder className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="truncate">{effectiveFolder}</span>
              </div>
            )}

            {/* Folder Dropdown when in pinned mode */}
            {isFolderPickerOpen && scopeMode === 'pinned' && (
              <div className="absolute left-0 top-full mt-1.5 w-52 rounded-xl bg-[#18181c] border border-white/[0.12] shadow-2xl py-1.5 z-40 max-h-60 overflow-y-auto">
                <div className="px-3 py-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider border-b border-white/[0.04] mb-1">
                  Выбрать папку
                </div>
                <button
                  onClick={() => {
                    setPinnedFolder('Входящие');
                    setIsFolderPickerOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-white/[0.08] transition-colors cursor-pointer ${
                    pinnedFolder === 'Входящие' ? 'text-white font-medium bg-white/[0.04]' : 'text-zinc-400'
                  }`}
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>Входящие</span>
                </button>
                {folders.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => {
                      setPinnedFolder(f.path);
                      setIsFolderPickerOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-white/[0.08] transition-colors cursor-pointer ${
                      pinnedFolder === f.path ? 'text-white font-medium bg-white/[0.04]' : 'text-zinc-400'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span className="truncate">{f.path}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Multi-type Filter Chips */}
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <button
            onClick={() => toggleTypeFilter('voice')}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
              typeFilters.includes('voice')
                ? 'bg-white/10 text-zinc-100 border border-white/10 font-medium'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Показывать голосовые заметки"
          >
            <Mic className="w-3 h-3 shrink-0" />
            <span className="hidden min-[380px]:inline">Войсы</span>
          </button>
          <button
            onClick={() => toggleTypeFilter('file')}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
              typeFilters.includes('file')
                ? 'bg-white/10 text-zinc-100 border border-white/10 font-medium'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Показывать аудиофайлы (mp3, wav, flac)"
          >
            <Music className="w-3 h-3 shrink-0" />
            <span className="hidden min-[380px]:inline">Файлы</span>
          </button>

          <div className="h-3 w-px bg-white/10 mx-0.5" />

          {/* Queue Button */}
          <button
            onClick={() => setIsPlaylistOpen(true)}
            className="flex items-center gap-1 px-1.5 py-1 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Открыть очередь воспроизведения"
          >
            <ListMusic className="w-3.5 h-3.5 shrink-0" />
            <span className="font-mono text-[11px]">{tracks.length}</span>
          </button>
        </div>
      </header>

      {/* Main Now Playing Center Stage */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-4 overflow-y-auto min-h-0">
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center max-w-sm px-4">
            <div className="w-16 h-16 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-4">
              <Music className="w-7 h-7 text-zinc-500" />
            </div>
            <h3 className="text-sm font-medium text-zinc-200 mb-1">В папке нет аудиозаписей</h3>
            <p className="text-xs text-zinc-500 mb-4">
              В папке «{effectiveFolder}» отсутствуют вложения выбранных типов.
            </p>
            <button
              onClick={() => {
                setTypeFilters(['voice', 'file']);
                setScopeMode('active');
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 transition-colors"
            >
              Сбросить фильтры
            </button>
          </div>
        ) : (
          <div className="w-full max-w-md flex flex-col items-center justify-center gap-5 my-auto">
            {/* Square Art Tile */}
            <AudioCoverArt track={currentTrack} isPlaying={isPlaying} />

            {/* Track Info */}
            <div className="text-center w-full px-2 flex flex-col items-center gap-1">
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate max-w-full">
                {currentTrack?.name || 'Аудиозапись'}
              </h2>
              {currentTrack?.itemTitle && (
                <button
                  onClick={() => scrollToItem(currentTrack.itemId)}
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors truncate max-w-xs cursor-pointer flex items-center gap-1"
                  title="Перейти к заметке в ленте"
                >
                  <span className="truncate">{currentTrack.itemTitle}</span>
                  <span className="text-[10px] text-zinc-600">• {currentTrack.itemFolder}</span>
                </button>
              )}
            </div>

            {/* Timeline Progress Bar (Scrubber) */}
            <div className="w-full flex flex-col gap-1.5">
              <div
                ref={timelineRef}
                onMouseDown={handleTimelineMouseDown}
                className="group relative flex items-center h-4 cursor-pointer select-none"
              >
                {/* Track Background */}
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden transition-all group-hover:h-1.5">
                  <div
                    style={{ width: `${progressPercent}%` }}
                    className="h-full bg-white transition-all duration-75"
                  />
                </div>
                {/* Thumb */}
                <div
                  style={{ left: `${progressPercent}%` }}
                  className="absolute -ml-1.5 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                />
              </div>

              {/* Time display */}
              <div className="flex justify-between items-center text-[11px] font-mono text-zinc-500">
                <span>{formatAudioDuration(currentTime)}</span>
                <span>{formatAudioDuration(effectiveDuration)}</span>
              </div>
            </div>

            {/* Transport Controls (5 buttons: -10s, Prev, Play/Pause, Next, +10s) */}
            <div className="flex items-center justify-center gap-3 sm:gap-4">
              <button
                onClick={() => handleSkipTime(-10)}
                className="w-8 h-8 rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
                title="Назад на 10 секунд (←)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={handlePrevTrack}
                className="w-9 h-9 rounded-full text-zinc-300 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors cursor-pointer"
                title="Предыдущий трек"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>

              <button
                onClick={togglePlay}
                className="w-13 h-13 rounded-full bg-white hover:bg-zinc-200 active:scale-95 text-black flex items-center justify-center transition-all shadow-xl cursor-pointer"
                title={isPlaying ? 'Пауза (Пробел)' : 'Воспроизведение (Пробел)'}
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 fill-current" />
                ) : (
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                )}
              </button>

              <button
                onClick={handleNextTrack}
                className="w-9 h-9 rounded-full text-zinc-300 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors cursor-pointer"
                title="Следующий трек"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>

              <button
                onClick={() => handleSkipTime(10)}
                className="w-8 h-8 rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
                title="Вперед на 10 секунд (→)"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Bar: Utilities (Speed, Repeat, Volume) */}
      <footer className="relative z-10 flex items-center justify-between px-3 sm:px-6 py-2.5 border-t border-white/[0.06] bg-black/40 backdrop-blur-md text-xs gap-2">
        {/* Left: Queue Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setIsPlaylistOpen(true)}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <ListMusic className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Очередь</span>
          </button>
        </div>

        {/* Center: Playback Speed & Repeat */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button
            onClick={toggleSpeed}
            className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-mono text-zinc-300 transition-colors cursor-pointer"
            title="Скорость воспроизведения"
          >
            {PLAYBACK_SPEEDS[speedIndex]}x
          </button>

          <button
            onClick={() => setIsLoop((prev) => !prev)}
            className={`p-1 rounded transition-colors cursor-pointer ${
              isLoop ? 'text-white bg-white/10' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title={isLoop ? 'Повтор включен' : 'Повтор выключен'}
          >
            {isLoop ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>
        </div>

        {/* Right: Volume Slider */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleMute}
            className="text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            title={isMuted ? 'Включить звук' : 'Выключить звук'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            className="w-12 sm:w-16 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white hidden min-[320px]:block"
            title={`Громкость: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
          />
        </div>
      </footer>
    </div>
  );
};
