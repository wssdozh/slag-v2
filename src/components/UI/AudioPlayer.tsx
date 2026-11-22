// Plays a note's audio: waveform scrub, speed, transcript and on-demand enrichment.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from './icons/Icon';
import { formatAudioDuration, audioTrackLabel } from '../../lib/media/audioHelper';
import { bindMediaEvents } from '../../lib/media/mediaEvents';
import { logger } from '../../lib/logger/logger';

const mediaLog = logger.scope('MEDIA');

interface AudioPlayerProps {
  /** Missing means the bytes never reached this device: the row says so and arms no play. */
  src?: string;
  /** Row header when a card carries more than one track: `Artist - Title.ext`. */
  name?: string;
  duration?: number;
  waveform?: number[];
  compact?: boolean;
  timeContext?: React.ReactNode;
  transcript?: string;
  extractedText?: string;
  summary?: string;
  enrichmentStatus?: 'idle' | 'processing' | 'ready' | 'error';
  onEnrich?: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  name,
  duration: initialDuration,
  waveform: customWaveform,
  compact = false,
  timeContext,
  transcript: propTranscript,
  extractedText: propExtractedText,
  summary: _summary,
  enrichmentStatus = 'idle',
  onEnrich,
}) => {
  const transcript = propTranscript || propExtractedText;
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  // A transcript is folded away by default: nobody asked to read it on open.
  const [isExpanded, setIsExpanded] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveTrackRef = useRef<HTMLDivElement | null>(null);

  const handleTranscriptToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (transcript) {
      setIsExpanded(prev => !prev);
    } else if (onEnrich && enrichmentStatus !== 'processing') {
      setIsExpanded(true);
      onEnrich();
    }
  }, [transcript, onEnrich, enrichmentStatus]);

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
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    // The element is the truth: another player may start and pause this one behind our back.
    const onPlay = () => {
      mediaLog.info(`Row playing: "${name || 'audio'}"`);
      setIsPlaying(true);
    };
    const onPause = () => setIsPlaying(false);
    const onError = () => {
      mediaLog.error(
        `Row audio error ${audio.error?.code ?? '?'}: "${name || 'audio'}" (${audio.error?.message || 'no message'})`,
        { src: audio.currentSrc.slice(0, 60) }
      );
    };

    return bindMediaEvents(audio, {
      onTimeUpdate,
      onLoadedMetadata,
      onEnded,
      onPlay,
      onPause,
      onError,
    });
  }, [isScrubbing, name]);

  const currentDur = duration > 0 ? duration : (initialDuration || 0);
  const progressPercent = currentDur > 0 ? (currentTime / currentDur) * 100 : 0;
  // Recorders stamp machine names (`voice_11-30-52`): those rows stay label-free.
  const track = name ? audioTrackLabel(name) : null;
  const header = track && !track.isRecorded ? track : null;

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current || !src) {
      if (!src) mediaLog.warn(`Row play refused, bytes are not on this device: "${name || 'audio'}"`);
      return;
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch((err: unknown) => {
        mediaLog.warn(`Row play was refused: ${err instanceof Error ? err.name : String(err)} ("${name || 'audio'}")`);
      });
    }
  };

  const seekFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!audioRef.current || !waveTrackRef.current) return;
    const rect = waveTrackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, clickX / rect.width));
    const targetDur = duration || initialDuration || audioRef.current.duration || 0;
    const targetTime = fraction * targetDur;
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  }, [duration, initialDuration]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // The card is draggable on desktop: without this the drag starts and no mousemove arrives.
    e.preventDefault();
    e.stopPropagation();
    setIsScrubbing(true);
    seekFromEvent(e);

    const onMouseMove = (moveEvent: MouseEvent) => {
      seekFromEvent(moveEvent);
    };
    const onMouseUp = () => {
      setIsScrubbing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const barsCount = compact ? 26 : 56;

  // Generate or sample waveform bars
  const bars = React.useMemo(() => {
    if (customWaveform && customWaveform.length > 0) {
      // Interpolate or sample down to barsCount
      const sampled: number[] = [];
      const step = customWaveform.length / barsCount;
      for (let i = 0; i < barsCount; i++) {
        const idx = Math.min(customWaveform.length - 1, Math.floor(i * step));
        const val = customWaveform[idx] ?? 0.3;
        sampled.push(Math.max(0.08, Math.min(1, val)));
      }
      return sampled;
    }

    // Deterministic procedural waveform pattern with speech-like dynamics
    const generated: number[] = [];
    for (let i = 0; i < barsCount; i++) {
      const t = i / barsCount;
      const envelope = Math.sin(t * Math.PI) * 0.4 + 0.6;
      const speechBurst = Math.sin(i * 1.35) * 0.35 + Math.cos(i * 2.8) * 0.3 + Math.sin(i * 0.55) * 0.25;
      const raw = Math.max(0, (0.42 + speechBurst) * envelope);
      generated.push(Math.min(1, Math.max(0.06, raw)));
    }
    return generated;
  }, [customWaveform, barsCount]);

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs select-none">
        <audio ref={audioRef} src={src} preload="metadata" />
        <button
          type="button"
          onClick={togglePlay}
          disabled={!src}
          className="w-6 h-6 rounded-full bg-accent-media hover:bg-accent-media/90 motion-press flex items-center justify-center text-white shrink-0 cursor-pointer shadow-sm disabled:cursor-default disabled:opacity-40"
          title={src ? (isPlaying ? 'Пауза' : 'Воспроизвести') : 'Файла нет на устройстве'}
        >
          {isPlaying ? (
            <Icon name="media.pause" size="sm" tone="inherit" variant="filled" />
          ) : (
            <Icon name="media.play" size="sm" tone="inherit" variant="filled" className="ml-0.5" />
          )}
        </button>

        <div
          ref={waveTrackRef}
          onMouseDown={handleMouseDown}
          className="flex items-center gap-[1.5px] h-4 cursor-pointer select-none"
        >
          {bars.map((norm, i) => {
            const barFraction = (i / barsCount) * 100;
            const isFilled = (currentTime === 0 && !isPlaying) || barFraction <= progressPercent;
            const height = Math.max(3, Math.round(2 + norm * 12));
            return (
              <div
                key={i}
                style={{ height: `${height}px` }}
                className={`w-[2px] rounded-full transition-colors ${
                  isFilled ? 'bg-white' : 'bg-tint-35'
                }`}
              />
            );
          })}
        </div>

        <span className="text-2xs font-sans tabular-nums text-fg-secondary shrink-0">
          {src
            ? (isPlaying ? formatAudioDuration(currentTime) : formatAudioDuration(currentDur))
            : 'файла нет'}
        </span>
      </div>
    );
  }

  const playButton = (
    <button
      type="button"
      onClick={togglePlay}
      disabled={!src}
      className="w-9 h-9 rounded-full bg-accent-media hover:bg-accent-media/90 motion-press flex items-center justify-center text-white shrink-0 shadow-sm cursor-pointer disabled:cursor-default disabled:opacity-40"
      title={src ? (isPlaying ? 'Пауза' : 'Воспроизвести') : 'Файла нет на устройстве'}
      aria-label={src ? (isPlaying ? 'Пауза' : 'Воспроизвести') : 'Файла нет на устройстве'}
    >
      {isPlaying ? (
        <Icon name="media.pause" size="md" tone="inherit" variant="filled" />
      ) : (
        <Icon name="media.play" size="md" tone="inherit" variant="filled" className="ml-0.5" />
      )}
    </button>
  );

  const scrubTrack = (
    <div
      ref={waveTrackRef}
      onMouseDown={handleMouseDown}
      title="Перемотка"
      className="relative h-2 w-full min-w-0 flex-1 cursor-pointer overflow-hidden rounded-full bg-tint-12"
    >
      <div
        style={{ transform: `scaleX(${progressPercent / 100})`, transformOrigin: 'left center' }}
        className="h-full w-full rounded-full bg-tint-85 transition-transform duration-100 ease-linear"
      />
    </div>
  );

  const durationText = (
    <span className="shrink-0 font-mono text-3xs tabular-nums text-fg-secondary">
      {src
        ? (isPlaying ? formatAudioDuration(currentTime) : formatAudioDuration(currentDur))
        : 'файла нет'}
    </span>
  );

  const enrichControl = (onEnrich || transcript || enrichmentStatus === 'processing') ? (
    <button
      type="button"
      onClick={handleTranscriptToggle}
      disabled={enrichmentStatus === 'processing'}
      className="h-5 w-5 rounded-md text-fg-secondary hover:text-white hover:bg-tint-8 motion-press flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
      title={
        enrichmentStatus === 'processing'
          ? 'Идет расшифровка...'
          : transcript
          ? isExpanded
            ? 'Скрыть текст'
            : 'Показать текст'
          : 'Расшифровать войс'
      }
      aria-label="Расшифровка"
    >
      {enrichmentStatus === 'processing' ? (
        <Icon name="status.loading" size="sm" className="animate-spin" />
      ) : transcript && isExpanded ? (
        // weight is decided by Icon, not by the call site
        <Icon name="nav.up" size="md" tone="soft" />
      ) : transcript ? (
        // weight is decided by Icon, not by the call site
        <Icon name="nav.down" size="md" className="hover:text-fg-soft" />
      ) : (
        <Icon name="action.transcribe" size="md" />
      )}
    </button>
  ) : null;

  return (
    <div className="w-full flex flex-col">
      <audio ref={audioRef} src={src} preload="metadata" />

      {header ? (
        /* A named track reads as a row: title and author above, the line under them. */
        <div className="flex w-full items-center gap-2 select-none">
          {playButton}
          <div
            data-testid="audio-row-meta"
            className="flex h-9 min-w-0 flex-1 flex-col justify-center gap-1.5"
          >
            <div className="flex items-baseline gap-1.5">
              <span className="min-w-0 truncate text-xs font-medium leading-tight text-fg-primary">
                {header.title}
              </span>
              {header.author && (
                <>
                  <span className="shrink-0 text-fg-dim">·</span>
                  <span className="min-w-0 truncate text-2xs text-fg-secondary">{header.author}</span>
                </>
              )}
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {durationText}
                {timeContext}
                {enrichControl}
              </span>
            </div>
            {scrubTrack}
          </div>
        </div>
      ) : (
        <div className="flex w-full items-center gap-2 select-none">
          {playButton}
          {scrubTrack}
          {durationText}
          {timeContext}
          {enrichControl}
        </div>
      )}

      {/* Telegram-style Transcript with user-approved divider line. Collapses by
          height, so folding it back does not snap the whole card. */}
      <div
        className="motion-accordion w-full"
        data-expanded={Boolean(isExpanded && transcript)}
        aria-hidden={!(isExpanded && transcript)}
      >
        <div className="motion-accordion-inner">
          {transcript && (
            <div className="mt-2 pt-2 border-t border-tint-8 text-xs sm:text-ui text-fg-soft font-sans leading-relaxed select-text flex flex-col">
              <p className="whitespace-pre-wrap">{transcript}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
