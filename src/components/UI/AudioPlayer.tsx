import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, ChevronUp, Loader2 } from 'lucide-react';

const TelegramTranscribeIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Arrow: -> */}
    <path d="M2 8.5h4.5" />
    <path d="M4.5 6l2.5 2.5-2.5 2.5" />
    {/* Capital letter A: */}
    <path d="M9.5 12l2-7 2 7" />
    <path d="M10.2 9.7h2.6" />
  </svg>
);

interface AudioPlayerProps {
  src: string;
  duration?: number;
  size?: number;
  waveform?: number[];
  compact?: boolean;
  timeContext?: string;
  transcript?: string;
  extractedText?: string;
  summary?: string;
  enrichmentStatus?: 'idle' | 'processing' | 'ready' | 'error';
  onEnrich?: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(secs: number): string {
  if (isNaN(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  duration: initialDuration,
  size,
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
  const [isExpanded, setIsExpanded] = useState(() => Boolean(transcript));

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

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [isScrubbing]);

  const currentDur = duration > 0 ? duration : (initialDuration || 0);
  const progressPercent = currentDur > 0 ? (currentTime / currentDur) * 100 : 0;

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
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
          className="w-6 h-6 rounded-full bg-white hover:bg-zinc-200 active:scale-95 flex items-center justify-center text-black shrink-0 cursor-pointer transition-transform shadow-sm"
          title={isPlaying ? 'Пауза' : 'Воспроизвести'}
        >
          {isPlaying ? (
            <Pause className="w-3 h-3 fill-current" />
          ) : (
            <Play className="w-3 h-3 fill-current ml-0.5" />
          )}
        </button>

        <div
          ref={waveTrackRef}
          onMouseDown={handleMouseDown}
          className="flex items-center gap-[1.5px] h-4 cursor-pointer select-none"
        >
          {bars.map((norm, i) => {
            const barFraction = (i / barsCount) * 100;
            const isFilled = barFraction <= progressPercent;
            const height = Math.round(2 + norm * 12);
            return (
              <div
                key={i}
                style={{ height: `${height}px` }}
                className={`w-[2px] rounded-full transition-colors ${
                  isFilled ? 'bg-white' : 'bg-white/20'
                }`}
              />
            );
          })}
        </div>

        <span className="text-[11px] font-sans tabular-nums text-zinc-400 shrink-0">
          {isPlaying ? formatTime(currentTime) : formatTime(currentDur)}
        </span>
      </div>
    );
  }

  const formattedSize = formatBytes(size);

  return (
    <div className="w-full flex flex-col">
      <div className="flex items-center gap-2.5 py-0.5 w-full select-none">
        <audio ref={audioRef} src={src} preload="metadata" />

        {/* Telegram-proportional Play/Pause round button */}
        <button
          type="button"
          onClick={togglePlay}
          className="w-8 h-8 sm:w-[34px] sm:h-[34px] rounded-full bg-white hover:bg-zinc-200 active:scale-95 flex items-center justify-center text-black transition-all shrink-0 shadow-sm cursor-pointer"
          title={isPlaying ? 'Пауза' : 'Воспроизвести'}
          aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
        >
          {isPlaying ? (
            <Pause className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
          )}
        </button>

        {/* Waveform and Time metadata */}
        <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
          <div
            ref={waveTrackRef}
            onMouseDown={handleMouseDown}
            className="flex items-center justify-between gap-[1.5px] h-5 cursor-pointer select-none py-0.5 w-full"
            title="Перемотка"
          >
            {bars.map((norm, i) => {
              const barFraction = (i / barsCount) * 100;
              const isFilled = barFraction <= progressPercent;
              const height = Math.round(2 + norm * 16);
              return (
                <div
                  key={i}
                  style={{ height: `${height}px` }}
                  className={`w-[2px] rounded-full transition-colors ${
                    isFilled ? 'bg-white' : 'bg-white/25 hover:bg-white/40'
                  }`}
                />
              );
            })}
          </div>

          {/* Subtitle with details: 00:08, 30.2 KB, timestamp */}
          <div className="flex justify-between items-center text-[11px] font-sans tabular-nums text-zinc-400">
            <div className="flex items-center gap-1 truncate">
              <span>{isPlaying ? formatTime(currentTime) : formatTime(currentDur)}</span>
              {formattedSize && (
                <>
                  <span className="text-zinc-600 font-normal">,</span>
                  <span className="text-zinc-500">{formattedSize}</span>
                </>
              )}
            </div>

            {timeContext && (
              <span className="text-zinc-500 text-[11px] font-sans ml-auto shrink-0 select-none">
                {timeContext}
              </span>
            )}
          </div>
        </div>

        {/* Telegram-style Transcription Button (Seamless ->A / Loader / Chevron) */}
        {(onEnrich || transcript || enrichmentStatus === 'processing') && (
          <button
            type="button"
            onClick={handleTranscriptToggle}
            disabled={enrichmentStatus === 'processing'}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
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
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
            ) : transcript && isExpanded ? (
              <ChevronUp className="w-4 h-4 text-zinc-300" />
            ) : (
              <TelegramTranscribeIcon className="w-3.5 h-3.5 text-zinc-400 hover:text-zinc-200" />
            )}
          </button>
        )}
      </div>

      {/* Telegram-style Transcript with user-approved divider line */}
      {isExpanded && transcript && (
        <div className="mt-2 pt-2 border-t border-white/[0.08] text-xs sm:text-[13px] text-zinc-200 font-sans leading-relaxed select-text flex flex-col animate-in fade-in duration-150">
          <p className="whitespace-pre-wrap">{transcript}</p>
        </div>
      )}
    </div>
  );
};
