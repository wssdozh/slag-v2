import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  duration?: number;
  size?: number;
  waveform?: number[];
  compact?: boolean;
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
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveTrackRef = useRef<HTMLDivElement | null>(null);

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

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) audioRef.current.playbackRate = nextRate;
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

    // Deterministic procedural waveform pattern (resembles human speech envelope)
    const generated: number[] = [];
    for (let i = 0; i < barsCount; i++) {
      const envelope = Math.sin((i / barsCount) * Math.PI); // tapering edges
      const noise = Math.sin(i * 1.8) * 0.35 + Math.cos(i * 3.7) * 0.25;
      const val = Math.max(0.18, (0.4 + noise) * envelope + 0.15);
      generated.push(Math.min(1, val));
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
          className="w-6 h-6 rounded-full bg-[#2a82e4] hover:bg-[#2473cb] active:scale-95 flex items-center justify-center text-white shrink-0 cursor-pointer transition-transform shadow-sm"
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
                  isFilled ? 'bg-[#529ee8]' : 'bg-white/20'
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
    <div className="flex items-center gap-3 py-1 max-w-sm w-full select-none">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Telegram Blue Play/Pause round button */}
      <button
        type="button"
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-[#2a82e4] hover:bg-[#2473cb] active:scale-95 flex items-center justify-center text-white transition-all shrink-0 shadow-md shadow-[#2a82e4]/20 cursor-pointer"
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
          className="flex items-center gap-[2px] h-6 cursor-pointer select-none py-1"
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
                className={`w-[2.5px] rounded-full transition-colors ${
                  isFilled ? 'bg-[#529ee8]' : 'bg-white/20 hover:bg-white/30'
                }`}
              />
            );
          })}
        </div>

        {/* Subtitle with Telegram-style details: 00:08, 30.2 KB */}
        <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400">
          <div className="flex items-center gap-1.5 truncate">
            <span>{isPlaying ? formatTime(currentTime) : formatTime(currentDur)}</span>
            {formattedSize && (
              <>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-500">{formattedSize}</span>
              </>
            )}
          </div>

          {/* Speed badge */}
          <button
            type="button"
            onClick={cycleSpeed}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors shrink-0 cursor-pointer"
            title="Скорость воспроизведения"
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
};
