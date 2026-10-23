import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ListMusic,
  ExternalLink,
  Heart,
  Folder,
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
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  // Audio Playback State
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [speedIndex, setSpeedIndex] = useState<number>(0);
  const [isLoop, setIsLoop] = useState<boolean>(false);
  const [volume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // Effective folder based on mode
  const effectiveFolder = scopeMode === 'active' ? currentFolder || 'Входящие' : pinnedFolder;

  // Collision guard on mount
  useEffect(() => {
    return setupAudioCollisionGuard();
  }, []);

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

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      handlePrevTrack();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      handleNextTrack();
    }
  };

  const effectiveDuration = duration > 0 ? duration : (currentTrack?.duration || 0);
  const progressPercent = effectiveDuration > 0 ? (currentTime / effectiveDuration) * 100 : 0;

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="relative w-full h-full bg-[#09090b] text-zinc-100 flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden select-none outline-none"
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
        typeFilters={typeFilters}
        onToggleTypeFilter={toggleTypeFilter}
        folders={folders}
        scopeMode={scopeMode}
        pinnedFolder={pinnedFolder}
        onSelectPinnedFolder={(f) => setPinnedFolder(f)}
      />

      {/* Main Center Now Playing Card */}
      <div className="relative z-10 w-full max-w-sm flex flex-col items-center my-auto">
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-10 px-4">
            <div className="w-16 h-16 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-4">
              <Folder className="w-7 h-7 text-zinc-500" />
            </div>
            <h3 className="text-sm font-medium text-zinc-200 mb-1">В папке нет аудиозаписей</h3>
            <p className="text-xs text-zinc-500 mb-4">
              В папке «{effectiveFolder}» отсутствуют вложения выбранных типов.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setScopeMode('active')}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 transition-colors cursor-pointer"
              >
                Активная папка
              </button>
              <button
                onClick={() => setIsPlaylistOpen(true)}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/10 text-zinc-400 transition-colors cursor-pointer"
              >
                Очередь и фильтры
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 1. Square Art Tile with embedded Center Play/Pause button */}
            <AudioCoverArt
              track={currentTrack}
              isPlaying={isPlaying}
              onTogglePlay={togglePlay}
              onPrevTrack={handlePrevTrack}
              onNextTrack={handleNextTrack}
            />

            {/* 2. Track Title (Like "Огонь в окне" in reference) */}
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate max-w-full text-center mt-5 mb-1 px-2">
              {currentTrack?.name || 'Аудиозапись'}
            </h2>

            {/* 3. Subtitle: Note title • Folder • Format */}
            <div className="text-xs text-zinc-400 text-center flex items-center justify-center gap-1.5 max-w-full truncate px-2 mb-4">
              {currentTrack?.itemTitle && (
                <button
                  onClick={() => scrollToItem(currentTrack.itemId)}
                  className="hover:text-zinc-200 transition-colors truncate cursor-pointer underline-offset-2 hover:underline"
                  title="Перейти к заметке"
                >
                  {currentTrack.itemTitle}
                </button>
              )}
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-500 truncate">{currentTrack?.itemFolder}</span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-500 text-[10px] font-mono uppercase">{currentTrack?.format}</span>
            </div>

            {/* 4. Pill Switcher under Subtitle (Like "Вариант 1 / Вариант 2" in reference) */}
            <div className="flex items-center bg-white/[0.06] p-1 rounded-full border border-white/[0.08] mb-5 select-none shadow-inner">
              <button
                onClick={() => setScopeMode('active')}
                className={`px-4 py-1 text-xs rounded-full transition-all cursor-pointer ${
                  scopeMode === 'active'
                    ? 'bg-white text-black font-semibold shadow-md'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Активная
              </button>
              <button
                onClick={() => {
                  setScopeMode('pinned');
                  if (!pinnedFolder) setPinnedFolder(currentFolder || 'Входящие');
                }}
                className={`px-4 py-1 text-xs rounded-full transition-all cursor-pointer ${
                  scopeMode === 'pinned'
                    ? 'bg-white text-black font-semibold shadow-md'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Закрепить
              </button>
            </div>

            {/* 5. Scrubber Timeline in a single clean row: [0:00] ────── [1:12] */}
            <div className="w-full flex items-center gap-3 mb-6 select-none">
              <span className="text-[11px] font-mono text-zinc-400 w-8 text-left shrink-0">
                {formatAudioDuration(currentTime)}
              </span>

              <div
                ref={timelineRef}
                onMouseDown={handleTimelineMouseDown}
                className="group relative flex-1 flex items-center h-4 cursor-pointer select-none"
              >
                <div className="w-full h-1 bg-white/15 rounded-full overflow-hidden transition-all group-hover:h-1.5">
                  <div
                    style={{ width: `${progressPercent}%` }}
                    className="h-full bg-white transition-all duration-75"
                  />
                </div>
                <div
                  style={{ left: `${progressPercent}%` }}
                  className="absolute -ml-1.5 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                />
              </div>

              <span className="text-[11px] font-mono text-zinc-500 w-8 text-right shrink-0">
                {formatAudioDuration(effectiveDuration)}
              </span>
            </div>

            {/* 6. Unified Bottom Controls Row (Strictly according to reference: Queue, Loop, Share/Jump | Speed, Vol, Fav) */}
            <div className="flex items-center justify-between w-full max-w-[300px] text-zinc-400 select-none">
              {/* Queue Button */}
              <button
                onClick={() => setIsPlaylistOpen(true)}
                className="p-2 rounded-lg hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                title="Очередь воспроизведения"
                aria-label="Очередь воспроизведения"
              >
                <ListMusic className="w-4 h-4" />
              </button>

              {/* Loop Button */}
              <button
                onClick={() => setIsLoop((prev) => !prev)}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  isLoop ? 'text-white bg-white/10' : 'hover:text-white hover:bg-white/[0.08]'
                }`}
                title={isLoop ? 'Повтор включен' : 'Повтор выключен'}
                aria-label="Повтор"
              >
                {isLoop ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
              </button>

              {/* Go to Note Link Button (Share/Jump) */}
              <button
                onClick={() => currentTrack && scrollToItem(currentTrack.itemId)}
                className="p-2 rounded-lg hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                title="Перейти к заметке"
                aria-label="Перейти к заметке"
              >
                <ExternalLink className="w-4 h-4" />
              </button>

              {/* Subtle Vertical Divider */}
              <div className="h-4 w-px bg-white/15 mx-1" />

              {/* Playback Speed */}
              <button
                onClick={toggleSpeed}
                className="px-2 py-1 rounded text-[11px] font-mono text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                title="Скорость воспроизведения"
                aria-label="Скорость"
              >
                {PLAYBACK_SPEEDS[speedIndex]}x
              </button>

              {/* Volume / Mute Button */}
              <button
                onClick={toggleMute}
                className="p-2 rounded-lg hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                title={isMuted ? 'Включить звук' : 'Выключить звук'}
                aria-label="Громкость"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              {/* Heart / Favorite Button */}
              <button
                onClick={() => setIsFavorite((prev) => !prev)}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  isFavorite ? 'text-red-400' : 'hover:text-white hover:bg-white/[0.08]'
                }`}
                title={isFavorite ? 'В избранном' : 'Добавить в избранное'}
                aria-label="Избранное"
              >
                <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
