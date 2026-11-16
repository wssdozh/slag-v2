// Binds the session to the panel: url resolution, the queue, and the transport actions.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { storage } from '../../../lib/storage';
import { logger } from '../../../lib/logger/logger';
import type { AudioTrack } from '../../../lib/media/audioHelper';
import {
  PLAYBACK_SPEEDS,
  clearAudioSource,
  cycleAudioSpeed,
  getAudioSessionSnapshot,
  loadAudioSource,
  nextAudioTrack,
  pauseAudio,
  playAudio,
  playAudioTrackAt,
  previousAudioTrack,
  seekAudioToFraction,
  setAudioQueue,
  setAudioScrubbing,
  skipAudioTime,
  subscribeAudioSession,
  toggleAudioLoop,
  toggleAudioMute,
  toggleAudioShuffle,
} from '../../../lib/media/audioSession';

const mediaLog = logger.scope('MEDIA');

interface AudioPlayback {
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
  const session = useSyncExternalStore(subscribeAudioSession, getAudioSessionSnapshot);
  const [resolvedSrcs, setResolvedSrcs] = useState<Record<string, string | null>>({});
  const resolveSummaryRef = useRef<string>('');

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

  // The next track belongs to the session, not the view: it has to outlive the panel.
  useEffect(() => {
    setAudioQueue(tracks);
  }, [tracks]);

  const currentTrack = session.currentTrack ?? tracks[0] ?? null;
  const trackUrl = currentTrack ? (currentTrack.url || resolvedSrcs[currentTrack.id] || undefined) : undefined;
  // The resolver already answered "nothing here": bytes never reached this device.
  const isTrackMissing = currentTrack !== null && !trackUrl && resolvedSrcs[currentTrack.id] === null;

  // Sync audio source when the track (or its bytes) changes.
  useEffect(() => {
    if (!currentTrack) return;
    if (trackUrl) {
      if (loadAudioSource(trackUrl)) {
        const kind = trackUrl.startsWith('data:') ? 'base64' : trackUrl.startsWith('blob:') ? 'file' : 'url';
        mediaLog.info(`Track loaded: "${currentTrack.name}" from ${kind} (${currentTrack.mimeType || 'no mime'})`);
      }
    } else {
      mediaLog.debug(`Track has no source yet: "${currentTrack.name ?? 'none'}"`);
      clearAudioSource();
    }
  }, [currentTrack, trackUrl]);

  // Toggle playback
  const togglePlay = useCallback(() => {
    if (!currentTrack || isTrackMissing) {
      if (isTrackMissing) mediaLog.warn(`Play refused, bytes are not on this device: "${currentTrack?.name}"`);
      return;
    }
    if (session.isPlaying) pauseAudio();
    else playAudio();
  }, [currentTrack, isTrackMissing, session.isPlaying]);

  // Skip tracks
  const handlePrevTrack = useCallback(() => {
    previousAudioTrack();
  }, []);

  const handleNextTrack = useCallback(() => {
    nextAudioTrack();
  }, []);

  // Skip 10s
  const handleSkipTime = useCallback((delta: number) => {
    skipAudioTime(delta);
  }, []);

  // Timeline Scrubbing
  const seekToFraction = useCallback((fraction: number) => {
    seekAudioToFraction(fraction);
  }, []);

  const startScrub = useCallback(() => setAudioScrubbing(true), []);
  const endScrub = useCallback(() => setAudioScrubbing(false), []);

  // Speed Toggle
  const toggleSpeed = useCallback(() => {
    cycleAudioSpeed();
  }, []);

  // Volume toggle
  const toggleMute = useCallback(() => {
    toggleAudioMute();
  }, []);

  const toggleShuffle = useCallback(() => toggleAudioShuffle(), []);
  const toggleLoop = useCallback(() => toggleAudioLoop(), []);

  const playTrackAt = useCallback((index: number) => {
    playAudioTrackAt(index);
  }, []);

  const effectiveDuration = session.duration > 0 ? session.duration : (currentTrack?.duration || 0);
  const progressPercent = effectiveDuration > 0 ? (session.currentTime / effectiveDuration) * 100 : 0;

  return {
    analyser: session.analyser,
    currentTrack,
    resolvedSrcs,
    isTrackMissing,
    isPlaying: session.isPlaying,
    isLoop: session.isLoop,
    isShuffle: session.isShuffle,
    isMuted: session.isMuted,
    speed: PLAYBACK_SPEEDS[session.speedIndex],
    currentTime: session.currentTime,
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
