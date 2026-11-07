import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

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

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('ended', onEnded);
    };
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
      className={`relative ${sizeClass} rounded-full overflow-hidden bg-black border border-white/10 shadow-2xl cursor-pointer group select-none shrink-0`}
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
          stroke="rgba(255, 255, 255, 0.15)"
          strokeWidth={compact ? 2.5 : 3.5}
        />
        {/* Active progress arc */}
        <circle
          cx={compact ? 48 : 112}
          cy={compact ? 48 : 112}
          r={radius}
          fill="none"
          stroke="#ffffff"
          strokeWidth={compact ? 2.5 : 3.5}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-75"
        />
      </svg>

      {/* Play/Pause Center Button on hover or when paused */}
      <div
        className={`absolute inset-0 flex items-center justify-center bg-black/35 transition-opacity ${
          isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
        }`}
      >
        <div className="w-12 h-12 rounded-full bg-canvas/80 flex items-center justify-center text-white border border-white/20 shadow-lg motion-press">
          {isPlaying ? (
            <Pause className="w-5 h-5 fill-current" />
          ) : (
            <Play className="w-5 h-5 fill-current ml-0.5" />
          )}
        </div>
      </div>

      {/* Audio Mute/Unmute in corner */}
      {!compact && (
        <button
          type="button"
          onClick={toggleMute}
          className="absolute bottom-3 right-5 p-1.5 rounded-full bg-canvas/90 text-white/90 hover:text-white border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          title={isMuted ? 'Включить звук' : 'Выключить звук'}
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* Duration badge at the top if paused and non-compact */}
      {!compact && !isPlaying && duration > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-canvas/90 text-[10px] font-mono text-white/90 border border-white/10 pointer-events-none">
          {Math.floor(duration / 60)}:{(Math.floor(duration % 60) < 10 ? '0' : '') + Math.floor(duration % 60)}
        </div>
      )}
    </div>
  );
};
