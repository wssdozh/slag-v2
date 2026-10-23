import React from 'react';
import { Mic, Disc3 } from 'lucide-react';
import type { AudioTrack } from '../../lib/audioHelper';

interface AudioCoverArtProps {
  track: AudioTrack | null;
  isPlaying: boolean;
  className?: string;
}

export const AudioCoverArt: React.FC<AudioCoverArtProps> = ({
  track,
  isPlaying,
  className = '',
}) => {
  // If track has an associated image from the note
  if (track?.coverUrl) {
    return (
      <div
        className={`relative aspect-square w-full max-w-[280px] sm:max-w-[320px] rounded-2xl overflow-hidden border border-white/[0.1] shadow-2xl bg-black select-none ${className}`}
      >
        <img
          src={track.coverUrl}
          alt={track.name}
          className={`w-full h-full object-cover transition-transform duration-700 ease-out ${
            isPlaying ? 'scale-105' : 'scale-100'
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono tracking-wider text-zinc-300 uppercase">
          {track.format}
        </div>
      </div>
    );
  }

  // If track is a voice note
  if (track?.isVoice) {
    return (
      <div
        className={`relative aspect-square w-full max-w-[280px] sm:max-w-[320px] rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl bg-[#111114] flex flex-col items-center justify-center p-6 select-none ${className}`}
      >
        {/* Soft background ambient glow */}
        <div
          className={`absolute w-36 h-36 rounded-full blur-3xl transition-opacity duration-700 pointer-events-none ${
            isPlaying ? 'bg-white/[0.06] opacity-100' : 'bg-transparent opacity-0'
          }`}
        />

        {/* Central mic capsule */}
        <div className="relative z-10 w-16 h-16 rounded-full bg-white/[0.05] border border-white/[0.1] flex items-center justify-center shadow-inner mb-4">
          <Mic
            className={`w-7 h-7 transition-colors duration-300 ${
              isPlaying ? 'text-white' : 'text-zinc-500'
            }`}
          />
        </div>

        {/* Animated dynamic voice wave bars */}
        <div className="relative z-10 flex items-center justify-center gap-1.5 h-12 w-full max-w-[200px]">
          {[18, 32, 45, 24, 38, 52, 28, 40, 20, 35, 48, 22].map((height, i) => {
            const norm = Math.sin(((i + 1) / 12) * Math.PI);
            return (
              <div
                key={i}
                style={{
                  height: `${Math.round(height * (isPlaying ? norm * 0.7 + 0.3 : 0.35))}px`,
                }}
                className={`w-1 rounded-full transition-all duration-300 ${
                  isPlaying ? 'bg-zinc-200 animate-pulse' : 'bg-zinc-700'
                }`}
              />
            );
          })}
        </div>

        <div className="absolute bottom-3 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          Голосовая заметка
        </div>
      </div>
    );
  }

  // Default track without cover: Sleek minimalist rotating vinyl disc
  return (
    <div
      className={`relative aspect-square w-full max-w-[280px] sm:max-w-[320px] rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl bg-[#0e0e11] flex items-center justify-center p-4 select-none ${className}`}
    >
      {/* Vinyl record disc */}
      <div
        className={`relative w-48 h-48 sm:w-56 sm:h-56 rounded-full bg-[#16161a] border border-white/[0.1] flex items-center justify-center shadow-2xl transition-transform ease-linear ${
          isPlaying ? 'animate-[spin_12s_linear_infinite]' : ''
        }`}
      >
        {/* Subtle vinyl concentric grooves */}
        <div className="absolute inset-3 rounded-full border border-white/[0.04]" />
        <div className="absolute inset-6 rounded-full border border-white/[0.04]" />
        <div className="absolute inset-9 rounded-full border border-white/[0.04]" />
        <div className="absolute inset-12 rounded-full border border-white/[0.04]" />

        {/* Center label */}
        <div className="w-20 h-20 rounded-full bg-[#202026] border border-white/[0.15] flex flex-col items-center justify-center shadow-md">
          <Disc3 className="w-6 h-6 text-zinc-400 mb-0.5" />
          <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-400">
            {track?.format || 'AUDIO'}
          </span>
        </div>

        {/* Center spindle hole */}
        <div className="absolute w-3.5 h-3.5 rounded-full bg-[#0e0e11] border border-white/20" />
      </div>

      {track && (
        <div className="absolute bottom-3 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          {track.format} • Аудиофайл
        </div>
      )}
    </div>
  );
};
