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
  Shuffle,
  Volume2,
  VolumeX,
  ListMusic,
  Pin,
  Folder,
  FileX,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { buildFolderOptions } from '../../lib/vault/folderOptions';
import {
  extractAudioTracks,
  formatAudioDuration,
  audioTrackLabel,
  type AudioTrack,
  type AudioScopeMode,
  type AudioTypeFilter,
} from '../../lib/media/audioHelper';
import { AudioCoverArt } from './AudioCoverArt';
import { AudioPlaylistDrawer } from './AudioPlaylistDrawer';
import { useAudioAnalyser } from '../../hooks/useAudioAnalyser';
import { storage } from '../../lib/storage';
import { logger } from '../../lib/logger';
import { Select } from '../UI/Select';

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2] as const;
const mediaLog = logger.scope('MEDIA');

export const AudioPanel: React.FC = () => {
  const { items, folders, currentFolder, inboxMode, scrollToItem, isMobile } = useApp();

  // Scope & Filter State
  const [scopeMode, setScopeMode] = useState<AudioScopeMode>('active');
  const [pinnedFolder, setPinnedFolder] = useState<string>(currentFolder || DEFAULT_INBOX_FOLDER);
  const [typeFilters, setTypeFilters] = useState<AudioTypeFilter[]>(['voice', 'file']);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);

  // Audio Playback State
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [speedIndex, setSpeedIndex] = useState<number>(0);
  const [isLoop, setIsLoop] = useState<boolean>(false);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  // Nothing in the panel exposes a volume slider: a state without a setter is a constant.
  const volume = 1;
  const [resolvedSrcs, setResolvedSrcs] = useState<Record<string, string | null>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const resolveSummaryRef = useRef<string>('');
  const analyser = useAudioAnalyser(audioRef);

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

  // Notes restored from markdown carry attachment metadata without bytes. Resolve only the
  // visible playlist, and keep blob: URLs out of the vault. A `null` is a real answer: the bytes
  // are on another device and the row must say so instead of arming a dead play button.
  useEffect(() => {
    const missing = tracks.filter(t => !t.url);
    if (missing.length === 0) return;
    let active = true;
    void Promise.all(
      missing.map(async t => [t.id, await storage.getAttachmentUrl(t.attachmentId, t.relativePath, t.mimeType)] as const)
    ).then(pairs => {
      if (!active) return;
      const next: Record<string, string | null> = {};
      for (const [id, url] of pairs) next[id] = url ?? null;
      const unresolved = pairs.filter(([, url]) => !url).map(([id]) => id);
      const summary = `${pairs.length - unresolved.length}/${pairs.length}${unresolved.length ? ` missing ${unresolved.join(',')}` : ''}`;
      // The effect re-runs whenever the items array identity changes; log the outcome, not a tick.
      if (summary !== resolveSummaryRef.current) {
        resolveSummaryRef.current = summary;
        if (unresolved.length > 0) mediaLog.warn(`Playlist has unplayable tracks: ${summary}`);
        else mediaLog.debug(`Playlist urls resolved: ${summary} playable`);
      }
      setResolvedSrcs(prev => ({ ...prev, ...next }));
    });
    return () => {
      active = false;
    };
  }, [tracks]);

  // Safe derived track index to avoid out-of-bounds without set-state-in-effect
  const safeTrackIndex = tracks.length === 0 ? 0 : Math.min(currentTrackIndex, tracks.length - 1);
  const currentTrack: AudioTrack | null = tracks[safeTrackIndex] ?? null;

  // Refs for audio listeners to avoid stale closures
  const isPlayingRef = useRef(isPlaying);
  const isLoopRef = useRef(isLoop);
  const isShuffleRef = useRef(isShuffle);
  const tracksLengthRef = useRef(tracks.length);
  const safeIndexRef = useRef(safeTrackIndex);
  const currentTrackNameRef = useRef<string | null>(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    isLoopRef.current = isLoop;
    isShuffleRef.current = isShuffle;
    tracksLengthRef.current = tracks.length;
    safeIndexRef.current = safeTrackIndex;
    currentTrackNameRef.current = currentTrack?.name ?? null;
  }, [isPlaying, isLoop, isShuffle, tracks.length, safeTrackIndex, currentTrack?.name]);

  // Sync playback rate and volume
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = PLAYBACK_SPEEDS[speedIndex];
    audio.volume = isMuted ? 0 : volume;
  }, [speedIndex, isMuted]);

  // Sync audio source when track changes
  const trackId = currentTrack?.id;
  const trackUrl = currentTrack ? (currentTrack.url || resolvedSrcs[currentTrack.id] || undefined) : undefined;
  // The resolver already answered "nothing here": bytes never reached this device.
  const trackMissing = currentTrack !== null && !trackUrl && resolvedSrcs[currentTrack.id] === null;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (trackUrl) {
      const kind = trackUrl.startsWith('data:') ? 'base64' : trackUrl.startsWith('blob:') ? 'file' : 'url';
      mediaLog.info(`Track loaded: "${currentTrack?.name}" from ${kind} (${currentTrack?.mimeType || 'no mime'})`);
      audio.src = trackUrl;
      if (isPlayingRef.current) {
        audio.play().catch((err: unknown) => {
          mediaLog.warn(`Resume after track change was refused: ${err instanceof Error ? err.name : String(err)}`);
        });
      }
    } else {
      mediaLog.debug(`Track has no source yet: "${currentTrack?.name ?? 'none'}"`);
      audio.pause();
      audio.removeAttribute('src');
    }
  }, [trackId, trackUrl, currentTrack?.name, currentTrack?.mimeType]);

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
      mediaLog.info(
        `Metadata: duration ${Number.isFinite(audio.duration) ? audio.duration.toFixed(1) : '?'}s, src ${audio.currentSrc.split(':')[0] || 'none'}`
      );
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      } else if (currentTrack?.duration) {
        setDuration(currentTrack.duration);
      }
    };

    // The error that used to vanish: a src that cannot decode, or bytes that never arrived.
    const onError = () => {
      const code = audio.error?.code;
      mediaLog.error(
        `Audio element error ${code ?? '?'}: "${currentTrackNameRef.current}" (${audio.error?.message || 'no message'})`,
        { src: audio.currentSrc.slice(0, 60), networkState: audio.networkState, readyState: audio.readyState }
      );
    };

    const onEnded = () => {
      if (isLoopRef.current) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else if (isShuffleRef.current && tracksLengthRef.current > 1) {
        const rand = Math.floor(Math.random() * (tracksLengthRef.current - 1));
        const nextIdx = rand >= safeIndexRef.current ? rand + 1 : rand;
        setCurrentTrackIndex(nextIdx);
        setIsPlaying(true);
      } else if (safeIndexRef.current < tracksLengthRef.current - 1) {
        // Auto-advance to next track in playlist
        setCurrentTrackIndex(safeIndexRef.current + 1);
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };

    const onPlay = () => {
      mediaLog.info(`Play: "${currentTrackNameRef.current}"`);
      setIsPlaying(true);
    };
    const onPause = () => {
      mediaLog.debug(`Pause: "${currentTrackNameRef.current}"`);
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [isScrubbing, currentTrack?.duration]);

  // Toggle playback
  const togglePlay = () => {
    if (!audioRef.current || !currentTrack || trackMissing) {
      if (trackMissing) mediaLog.warn(`Play refused, bytes are not on this device: "${currentTrack?.name}"`);
      return;
    }
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err: unknown) => {
        mediaLog.warn(`Play was refused: ${err instanceof Error ? err.name : String(err)} ("${currentTrack?.name}")`);
      });
    }
  };

  // Skip tracks
  const handlePrevTrack = () => {
    if (currentTime > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      setCurrentTime(0);
    } else if (isShuffle && tracks.length > 1) {
      const rand = Math.floor(Math.random() * (tracks.length - 1));
      setCurrentTrackIndex(rand >= safeTrackIndex ? rand + 1 : rand);
    } else if (safeTrackIndex > 0) {
      setCurrentTrackIndex(safeTrackIndex - 1);
    } else {
      setCurrentTrackIndex(Math.max(0, tracks.length - 1));
    }
  };

  const handleNextTrack = () => {
    if (isShuffle && tracks.length > 1) {
      const rand = Math.floor(Math.random() * (tracks.length - 1));
      setCurrentTrackIndex(rand >= safeTrackIndex ? rand + 1 : rand);
    } else if (safeTrackIndex < tracks.length - 1) {
      setCurrentTrackIndex(safeTrackIndex + 1);
    } else {
      setCurrentTrackIndex(0);
    }
  };

  // Skip 10s
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

  const effectiveDuration = duration > 0 ? duration : (currentTrack?.duration || 0);
  const progressPercent = effectiveDuration > 0 ? (currentTime / effectiveDuration) * 100 : 0;

  // A recorded memo has a machine name; the note title is the only human label it owns.
  const trackLabel = currentTrack ? audioTrackLabel(currentTrack.name) : null;
  const trackTitle = trackLabel
    ? trackLabel.isRecorded
      ? currentTrack?.itemTitle || 'Аудиозапись'
      : trackLabel.title || currentTrack?.itemTitle || 'Аудиозапись'
    : 'Аудиозапись';
  const trackAuthor = trackLabel && !trackLabel.isRecorded ? trackLabel.author : '';
  const missingTrackIds = tracks.filter(t => !t.url && resolvedSrcs[t.id] === null).map(t => t.id);

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="relative w-full h-full bg-canvas text-zinc-100 flex flex-col justify-between overflow-hidden select-none outline-none"
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
        missingIds={missingTrackIds}
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

      {/* Main Center Stage */}
      <main className="relative z-10 flex flex-1 min-h-0 flex-col items-center justify-center overflow-y-auto overflow-x-hidden p-4">
        <div className="w-full max-w-sm flex flex-col items-center my-auto">
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
              {/* 1. Square Art Tile (Clean, without buttons) */}
              <AudioCoverArt track={currentTrack} isPlaying={isPlaying} analyser={analyser} />

              {/* 2. Track Title (parsed from `Artist - Title.ext`, extension dropped) */}
              <h2
                className={`text-lg sm:text-xl font-bold tracking-tight truncate max-w-full text-center mt-5 mb-1 px-2 ${
                  trackMissing ? 'text-zinc-500' : 'text-white'
                }`}
              >
                {trackTitle}
              </h2>

              {/* The bytes never landed on this device: say so instead of faking a play button. */}
              {trackMissing && (
                <div className="mb-1 flex items-center justify-center gap-1.5 text-[11px] font-mono text-zinc-500">
                  <FileX className="h-3 w-3" />
                  файла нет на устройстве
                </div>
              )}

              {/* 3. Author line: who made it, before where it lives */}
              {trackAuthor && (
                <div className="text-xs text-zinc-400 text-center truncate max-w-full px-2 mb-1">
                  {trackAuthor}
                </div>
              )}

              {/* 4. Subtitle: Note title • Folder */}
              <div className="text-xs text-zinc-400 text-center flex items-center justify-center gap-1.5 max-w-full truncate px-2 mb-5">
                {currentTrack?.itemTitle && currentTrack.itemTitle !== trackTitle && (
                  <button
                    onClick={() => scrollToItem(currentTrack.itemId)}
                    className="hover:text-zinc-200 transition-colors truncate cursor-pointer underline-offset-2 hover:underline"
                    title="Перейти к заметке"
                  >
                    {currentTrack.itemTitle}
                  </button>
                )}
                {currentTrack?.itemTitle && currentTrack.itemTitle !== trackTitle && (
                  <span className="text-zinc-600">•</span>
                )}
                <span className="text-zinc-500 truncate">{currentTrack?.itemFolder}</span>
              </div>

              {/* 4. Scrubber Timeline: [0:49] ────── [3:39] */}
              <div className="w-full flex items-center gap-3 mb-5 select-none">
                <span className="text-[11px] font-mono text-zinc-400 w-8 text-left shrink-0">
                  {formatAudioDuration(currentTime)}
                </span>

                <div
                  ref={timelineRef}
                  onMouseDown={handleTimelineMouseDown}
                  className="group relative flex-1 flex items-center h-4 cursor-pointer select-none"
                >
                  <div className="w-full h-1 bg-white/15 rounded-full overflow-hidden group-hover:h-1.5">
                    {/* Composited fill: `width` here re-laid-out the track on every
                        `timeupdate` tick for the whole length of the track, forever.
                        A `scaleX` on the compositor costs one matrix update instead. */}
                    <div
                      style={{ transform: `scaleX(${progressPercent / 100})`, transformOrigin: 'left center' }}
                      className="h-full w-full bg-white transition-transform duration-100 ease-linear"
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

              {/* 5. Transport Controls Row: [<<]  [|<]  [Play/Pause]  [>|]  [>>] */}
              <div className="flex items-center justify-center gap-4 sm:gap-5 select-none">
                {/* -10s */}
                <button
                  onClick={() => handleSkipTime(-10)}
                  className="w-8 h-8 rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
                  title="Назад на 10 секунд (←)"
                  aria-label="Назад на 10 секунд"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                {/* Prev */}
                <button
                  onClick={handlePrevTrack}
                  className="w-9 h-9 rounded-full text-zinc-300 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors cursor-pointer"
                  title="Предыдущий трек"
                  aria-label="Предыдущий трек"
                >
                  <SkipBack className="w-5 h-5 fill-current" />
                </button>

                {/* Central Round Play / Pause */}
                <button
                  onClick={togglePlay}
                  disabled={trackMissing}
                  className="w-13 h-13 rounded-full bg-accent-media hover:bg-accent-media/90 text-white flex items-center justify-center shadow-xl motion-press cursor-pointer disabled:cursor-default disabled:opacity-40"
                  title={
                    trackMissing
                      ? 'Файла нет на устройстве'
                      : isPlaying ? 'Пауза (Пробел)' : 'Воспроизведение (Пробел)'
                  }
                  aria-label={trackMissing ? 'Файла нет на устройстве' : isPlaying ? 'Пауза' : 'Воспроизведение'}
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6 fill-current" />
                  ) : (
                    <Play className="w-6 h-6 fill-current ml-0.5" />
                  )}
                </button>

                {/* Next */}
                <button
                  onClick={handleNextTrack}
                  className="w-9 h-9 rounded-full text-zinc-300 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors cursor-pointer"
                  title="Следующий трек"
                  aria-label="Следующий трек"
                >
                  <SkipForward className="w-5 h-5 fill-current" />
                </button>

                {/* +10s */}
                <button
                  onClick={() => handleSkipTime(10)}
                  className="w-8 h-8 rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
                  title="Вперед на 10 секунд (→)"
                  aria-label="Вперед на 10 секунд"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>

              {/* 6. Utility Controls Row: Queue, Shuffle, Loop | Speed, Volume */}
              <div className="flex items-center justify-between w-full max-w-[270px] text-zinc-400 select-none mt-5">
                {/* Queue Button */}
                <button
                  onClick={() => setIsPlaylistOpen(true)}
                  className="p-1.5 rounded-lg hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  title="Очередь воспроизведения"
                  aria-label="Очередь воспроизведения"
                >
                  <ListMusic className="w-4 h-4" />
                </button>

                {/* Shuffle Button */}
                <button
                  onClick={() => setIsShuffle((prev) => !prev)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isShuffle ? 'text-white bg-white/10' : 'hover:text-white hover:bg-white/[0.08]'
                  }`}
                  title={isShuffle ? 'Перемешивание включено' : 'Перемешивание выключено'}
                  aria-label="Перемешать"
                >
                  <Shuffle className="w-4 h-4" />
                </button>

                {/* Loop Button */}
                <button
                  onClick={() => setIsLoop((prev) => !prev)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isLoop ? 'text-white bg-white/10' : 'hover:text-white hover:bg-white/[0.08]'
                  }`}
                  title={isLoop ? 'Повтор включен' : 'Повтор выключен'}
                  aria-label="Повтор"
                >
                  {isLoop ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                </button>

                {/* Subtle Vertical Divider */}
                <div className="h-4 w-px bg-white/15 mx-0.5" />

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
                  className="p-1.5 rounded-lg hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  title={isMuted ? 'Включить звук' : 'Выключить звук'}
                  aria-label="Громкость"
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
              </div>
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
              className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
              title={
                scopeMode === 'pinned'
                  ? 'Папка закреплена (нажмите, чтобы открепить)'
                  : 'Следовать за активной (нажмите, чтобы закрепить)'
              }
            >
              <Pin
                className={`w-3.5 h-3.5 transition-[color,scale] ${
                  scopeMode === 'pinned'
                    ? 'text-zinc-200 fill-current scale-105'
                    : 'text-zinc-500 group-hover:text-zinc-300'
                }`}
              />
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
