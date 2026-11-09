import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

export interface ViewerVideoProps {
  src: string;
  /** Only the slide on screen loads bytes; its neighbours stay empty frames. */
  isActive: boolean;
  /** The transport and the centre plate travel with the chrome, the way every phone does it. */
  chromeVisible: boolean;
}

/** `m:ss`, the way a seek bar labels itself. */
function clock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const whole = Math.floor(safe);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * A clip in the viewer. No native controls: they are the one surface that cannot hide with the
 * chrome, and they look like the platform rather than like the app. Play is a promise because
 * Android refuses to start with sound until the user has touched something — the plate is what
 * shows when it refuses.
 */
export const ViewerVideo: React.FC<ViewerVideoProps> = ({ src, isActive, chromeVisible }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setTime(video.currentTime);
    const onMeta = () => setDuration(video.duration);
    const onEnded = () => {
      setIsPlaying(false);
      setTime(0);
    };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('durationchange', onMeta);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('durationchange', onMeta);
      video.removeEventListener('ended', onEnded);
    };
  }, []);

  // Swiping onto a clip starts it; swiping away stops it, or it would talk to itself off screen.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isActive) void video.play().catch(() => setIsPlaying(false));
    else video.pause();
  }, [isActive]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setIsPlaying(false));
    else video.pause();
  }, []);

  const seek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Number(event.target.value);
    video.currentTime = next;
    setTime(next);
  }, []);

  if (!isActive) return <div className="h-full w-full bg-black" />;

  const chrome = chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0';

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="auto"
        className="h-full w-full object-contain"
        data-testid="viewer-video"
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
        className={`absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-surface/85 text-white ring-1 ring-white/10 backdrop-blur-sm transition-opacity duration-150 ${
          isPlaying && !chromeVisible ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        {isPlaying ? <Pause className="h-7 w-7 fill-current" /> : <Play className="ml-0.5 h-7 w-7 fill-current" />}
      </button>

      <div
        className={`absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pt-6 pb-3 transition-opacity duration-150 ${chrome}`}
      >
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={time}
          onChange={seek}
          aria-label="Позиция в видео"
          className="h-1 min-w-0 flex-1 cursor-pointer accent-accent-strong"
        />
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-white/80">
          {clock(time)} / {clock(duration)}
        </span>
      </div>
    </div>
  );
};
