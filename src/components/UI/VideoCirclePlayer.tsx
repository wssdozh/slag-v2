// Round Telegram-style video bubble: tap to play, mute toggle, progress ring.
import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './icons/Icon';
import { bindMediaEvents } from '../../lib/media/mediaEvents';

interface VideoCirclePlayerProps {
  src: string;
  compact?: boolean;
}

export const VideoCirclePlayer: React.FC<VideoCirclePlayerProps> = ({ src, compact = false }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progressFraction, setProgressFraction] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (video.duration) {
        setProgressFraction(video.currentTime / video.duration);
      }
    };
    const onLoadedMetadata = () => {
      if (video.duration) setDuration(video.duration);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setProgressFraction(0);
    };

    return bindMediaEvents(video, {
      onTimeUpdate,
      onLoadedMetadata,
      onEnded,
    });
  }, []);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const sizeClass = compact ? 'w-24 h-24' : 'w-48 h-48 sm:w-56 sm:h-56';
  const radius = compact ? 44 : 106;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progressFraction * circumference;

  return (
    <div
      onClick={togglePlay}
      className={`relative ${sizeClass} rounded-full overflow-hidden bg-black border border-tint-10 shadow-2xl cursor-pointer group select-none shrink-0`}
      title="Нажмите для воспроизведения/паузы"
    >
      <video
        ref={videoRef}
        src={src}
        playsInline
        className="w-full h-full object-cover scale-x-[-1]"
      />

      {/* SVG Circular Progress Arc along the edge */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none -rotate-90"
        viewBox={compact ? '0 0 96 96' : '0 0 224 224'}
      >
        {/* Background track */}
        <circle
          cx={compact ? 48 : 112}
          cy={compact ? 48 : 112}
          r={radius}
          fill="none"
          className="stroke-tint-15"
          strokeWidth={compact ? 2.5 : 3.5}
        />
        {/* Active progress arc */}
        <circle
          cx={compact ? 48 : 112}
          cy={compact ? 48 : 112}
          r={radius}
          fill="none"
          className="stroke-fg-primary transition-[stroke-dashoffset] duration-75"
          strokeWidth={compact ? 2.5 : 3.5}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>

      {/* Play/Pause Center Button on hover or when paused */}
      <div
        className={`absolute inset-0 flex items-center justify-center bg-scrim-35 transition-opacity ${
          isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
        }`}
      >
        <div className="w-12 h-12 rounded-full bg-canvas/80 flex items-center justify-center text-white border border-tint-20 shadow-lg motion-press">
          {isPlaying ? (
            <Icon name="media.pause" size="lg" tone="inherit" variant="filled" />
          ) : (
            <Icon name="media.play" size="lg" tone="inherit" variant="filled" className="ml-0.5" />
          )}
        </div>
      </div>

      {/* Audio Mute/Unmute in corner */}
      {!compact && (
        <button
          type="button"
          onClick={toggleMute}
          className="absolute bottom-3 right-5 p-1.5 rounded-full bg-canvas/90 text-tint-90 hover:text-white border border-tint-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          title={isMuted ? 'Включить звук' : 'Выключить звук'}
        >
          {isMuted ? <Icon name="media.volumeOff" size="sm" tone="inherit" /> : <Icon name="media.volumeOn" size="sm" tone="inherit" />}
        </button>
      )}

      {/* Duration badge at the top if paused and non-compact */}
      {!compact && !isPlaying && duration > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-canvas/90 text-3xs font-mono text-tint-90 border border-tint-10 pointer-events-none">
          {Math.floor(duration / 60)}:{(Math.floor(duration % 60) < 10 ? '0' : '') + Math.floor(duration % 60)}
        </div>
      )}
    </div>
  );
};
