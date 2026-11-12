// Drives the one audio element: track index, play state, speed, loop, shuffle, scrubbing.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { storage } from '../../../lib/storage';
import { logger } from '../../../lib/logger/logger';
import { useAudioAnalyser } from '../../../hooks/media/useAudioAnalyser';
import type { AudioTrack } from '../../../lib/media/audioHelper';
import { bindMediaEvents } from '../../../lib/media/mediaEvents';

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2] as const;
// Nothing in the panel exposes a volume slider: a constant, not state.
const VOLUME = 1;
const mediaLog = logger.scope('MEDIA');

interface AudioPlayback {
  audioRef: RefObject<HTMLAudioElement | null>;
  analyser: AnalyserNode | null;
  currentTrack: AudioTrack | null;
  resolvedSrcs: Record<string, string | null>;
  isTrackMissing: boolean;
  isPlaying: boolean;
  isLoop: boolean;
  isShuffle: boolean;
  isMuted: boolean;
  speed: number;
  currentTime: number;
  effectiveDuration: number;
  progressPercent: number;
  togglePlay: () => void;
  toggleSpeed: () => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleLoop: () => void;
  handlePrevTrack: () => void;
  handleNextTrack: () => void;
  handleSkipTime: (delta: number) => void;
  seekToFraction: (fraction: number) => void;
  startScrub: () => void;
  endScrub: () => void;
  playTrackAt: (index: number) => void;
}

export function useAudioPlayback(tracks: AudioTrack[]): AudioPlayback {
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [speedIndex, setSpeedIndex] = useState<number>(0);
  const [isLoop, setIsLoop] = useState<boolean>(false);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [resolvedSrcs, setResolvedSrcs] = useState<Record<string, string | null>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resolveSummaryRef = useRef<string>('');
  const analyser = useAudioAnalyser(audioRef);

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
    audio.volume = isMuted ? 0 : VOLUME;
  }, [speedIndex, isMuted]);

  // Sync audio source when track changes
  const trackId = currentTrack?.id;
  const trackUrl = currentTrack ? (currentTrack.url || resolvedSrcs[currentTrack.id] || undefined) : undefined;
  // The resolver already answered "nothing here": bytes never reached this device.
  const isTrackMissing = currentTrack !== null && !trackUrl && resolvedSrcs[currentTrack.id] === null;
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

    return bindMediaEvents(audio, {
      onTimeUpdate,
      onLoadedMetadata,
      onError,
      onEnded,
      onPlay,
      onPause,
    });
  }, [isScrubbing, currentTrack?.duration]);

  // Toggle playback
  const togglePlay = useCallback(() => {
    if (!audioRef.current || !currentTrack || isTrackMissing) {
      if (isTrackMissing) mediaLog.warn(`Play refused, bytes are not on this device: "${currentTrack?.name}"`);
      return;
    }
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err: unknown) => {
        mediaLog.warn(`Play was refused: ${err instanceof Error ? err.name : String(err)} ("${currentTrack?.name}")`);
      });
    }
  }, [currentTrack, isPlaying, isTrackMissing]);

  // Skip tracks
  const handlePrevTrack = useCallback(() => {
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
  }, [currentTime, isShuffle, safeTrackIndex, tracks.length]);

  const handleNextTrack = useCallback(() => {
    if (isShuffle && tracks.length > 1) {
      const rand = Math.floor(Math.random() * (tracks.length - 1));
      setCurrentTrackIndex(rand >= safeTrackIndex ? rand + 1 : rand);
    } else if (safeTrackIndex < tracks.length - 1) {
      setCurrentTrackIndex(safeTrackIndex + 1);
    } else {
      setCurrentTrackIndex(0);
    }
  }, [isShuffle, safeTrackIndex, tracks.length]);

  // Skip 10s
  const handleSkipTime = useCallback((delta: number) => {
    if (!audioRef.current) return;
    const targetDur = duration || currentTrack?.duration || 0;
    const nextTime = Math.max(0, Math.min(targetDur, audioRef.current.currentTime + delta));
    audioRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, [currentTrack, duration]);

  // Timeline Scrubbing
  const seekToFraction = useCallback((fraction: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const targetDur = duration || currentTrack?.duration || audio.duration || 0;
    const targetTime = fraction * targetDur;
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
  }, [currentTrack, duration]);

  const startScrub = useCallback(() => setIsScrubbing(true), []);
  const endScrub = useCallback(() => setIsScrubbing(false), []);

  // Speed Toggle
  const toggleSpeed = useCallback(() => {
    const nextIndex = (speedIndex + 1) % PLAYBACK_SPEEDS.length;
    setSpeedIndex(nextIndex);
    if (audioRef.current) {
      audioRef.current.playbackRate = PLAYBACK_SPEEDS[nextIndex];
    }
  }, [speedIndex]);

  // Volume toggle
  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audioRef.current.volume = nextMuted ? 0 : VOLUME;
  }, [isMuted]);

  const toggleShuffle = useCallback(() => setIsShuffle((prev) => !prev), []);
  const toggleLoop = useCallback(() => setIsLoop((prev) => !prev), []);

  const playTrackAt = useCallback((index: number) => {
    setCurrentTrackIndex(index);
    setIsPlaying(true);
  }, []);

  const effectiveDuration = duration > 0 ? duration : (currentTrack?.duration || 0);
  const progressPercent = effectiveDuration > 0 ? (currentTime / effectiveDuration) * 100 : 0;

  return {
    audioRef,
    analyser,
    currentTrack,
    resolvedSrcs,
    isTrackMissing,
    isPlaying,
    isLoop,
    isShuffle,
    isMuted,
    speed: PLAYBACK_SPEEDS[speedIndex],
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
  };
}
