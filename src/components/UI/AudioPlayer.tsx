import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, ChevronDown, Copy, Check, Sparkles } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  duration?: number;
  size?: number;
  waveform?: number[];
  compact?: boolean;
  timeContext?: string;
  transcript?: string;
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
  transcript,
  summary,
  enrichmentStatus = 'idle',
  onEnrich,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveTrackRef = useRef<HTMLDivElement | null>(null);

  const handleCopyTranscript = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!transcript) return;
    navigator.clipboard.writeText(transcript).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [transcript]);

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

  const barsCount = compact ? 22 : 40;

  // Generate or sample waveform bars
  const bars = React.useMemo(() => {
    if (customWaveform && customWaveform.length > 0) {
      // Interpolate or sample down to barsCount
      const sampled: number[] = [];
      const step = customWaveform.length / barsCount;
      for (let i = 0; i < barsCount; i++) {
        const idx = Math.min(customWaveform.length - 1, Math.floor(i * step));
        const val = customWaveform[idx] ?? 0.3;
        sampled.push(Math.max(0.15, Math.min(1, val)));
      }
      return sampled;
    }

    // Deterministic procedural waveform pattern with speech-like dynamics
    const generated: number[] = [];
    for (let i = 0; i < barsCount; i++) {
      const t = i / barsCount;
      const envelope = Math.sin(t * Math.PI); // tapering edges
      const noise = Math.sin(i * 1.7) * 0.35 + Math.cos(i * 3.3) * 0.25 + Math.sin(i * 0.8) * 0.2;
      const val = Math.max(0.12, (0.45 + noise) * envelope + 0.12);
      generated.push(Math.min(1, Math.max(0.15, val)));
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
            const height = Math.round(4 + norm * 11);
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

        <span className="text-[10px] font-mono text-zinc-400 shrink-0">
          {isPlaying ? formatTime(currentTime) : formatTime(currentDur)}
        </span>
      </div>
    );
  }

  const formattedSize = formatBytes(size);

  return (
    <div className="w-full flex flex-col">
      <div className="flex items-center gap-3 py-1 w-full select-none">
        <audio ref={audioRef} src={src} preload="metadata" />

        {/* Linear Monochrome Play/Pause round button */}
        <button
          type="button"
          onClick={togglePlay}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white hover:bg-zinc-200 active:scale-95 flex items-center justify-center text-black transition-all shrink-0 shadow-sm cursor-pointer"
          title={isPlaying ? 'Пауза' : 'Воспроизвести'}
          aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        {/* Waveform and Time metadata */}
        <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-0">
          <div
            ref={waveTrackRef}
            onMouseDown={handleMouseDown}
            className="flex items-center justify-between gap-[2px] h-6 cursor-pointer select-none py-1 w-full"
            title="Перемотка"
          >
            {bars.map((norm, i) => {
              const barFraction = (i / barsCount) * 100;
              const isFilled = barFraction <= progressPercent;
              const height = Math.round(4 + norm * 18);
              return (
                <div
                  key={i}
                  style={{ height: `${height}px` }}
                  className={`flex-1 min-w-[2px] max-w-[4px] rounded-full transition-colors ${
                    isFilled ? 'bg-white' : 'bg-white/20 hover:bg-white/30'
                  }`}
                />
              );
            })}
          </div>

          {/* Subtitle with details: 00:08, 30.2 KB, timestamp */}
          <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400">
            <div className="flex items-center gap-1.5 truncate">
              <span>{isPlaying ? formatTime(currentTime) : formatTime(currentDur)}</span>
              {formattedSize && (
                <>
                  <span className="text-zinc-600">•</span>
                  <span className="text-zinc-500">{formattedSize}</span>
                </>
              )}

              {/* Transcript toggle or status */}
              {enrichmentStatus === 'processing' && (
                <>
                  <span className="text-zinc-600">•</span>
                  <span className="text-zinc-400 animate-pulse font-sans flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    Расшифровка...
                  </span>
                </>
              )}

              {transcript && (
                <>
                  <span className="text-zinc-600">•</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded(prev => !prev);
                    }}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer flex items-center gap-0.5 font-sans"
                  >
                    <span>{isExpanded ? 'Скрыть текст' : 'Раскрыть текст'}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </>
              )}

              {!transcript && enrichmentStatus === 'idle' && onEnrich && (
                <>
                  <span className="text-zinc-600">•</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEnrich();
                    }}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer font-sans"
                  >
                    Распознать
                  </button>
                </>
              )}
            </div>

            {timeContext && (
              <span className="text-zinc-500 text-[10px] font-mono ml-auto shrink-0 select-none">
                {timeContext}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Transcript Accordion (Linear 95%, Anti-matryoshka: clean left guide line) */}
      {isExpanded && transcript && (
        <div className="mt-2 pt-1.5 pl-3 border-l border-white/10 text-xs text-zinc-300 font-sans leading-relaxed select-text flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 select-none">
            <span>РАСШИФРОВКА WHISPER</span>
            <button
              type="button"
              onClick={handleCopyTranscript}
              className="text-[10px] text-zinc-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
              title="Скопировать расшифровку"
            >
              {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
              <span>{copied ? 'Скопировано' : 'Копировать'}</span>
            </button>
          </div>
          <p className="whitespace-pre-wrap">{transcript}</p>
          {summary && summary !== transcript && (
            <div className="text-[11px] text-zinc-500 font-mono pt-0.5">
              Суть: {summary}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
