import React from 'react';
import { Mic, Music, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AudioTrack } from '../../lib/audioHelper';

interface AudioCoverArtProps {
  track: AudioTrack | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  className?: string;
}

export const AudioCoverArt: React.FC<AudioCoverArtProps> = ({
  track,
  isPlaying,
  onTogglePlay,
  onPrevTrack,
  onNextTrack,
  className = '',
}) => {
  return (
    <div
      className={`group relative aspect-square w-52 h-52 sm:w-60 sm:h-60 rounded-3xl overflow-hidden border border-white/[0.08] shadow-2xl bg-[#131316] flex items-center justify-center select-none ${className}`}
    >
      {/* Artwork Background */}
      {track?.coverUrl ? (
        <img
          src={track.coverUrl}
          alt={track.name}
          className={`absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out ${
            isPlaying ? 'scale-105' : 'scale-100'
          }`}
        />
      ) : track?.isVoice ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-[#18181e] to-[#0f0f12]">
          <div className="w-16 h-16 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
            <Mic className="w-7 h-7 text-zinc-400" />
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            Голосовая запись
          </span>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-[#17171d] to-[#0f0f13]">
          <div className="w-16 h-16 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
            <Music className="w-7 h-7 text-zinc-500" />
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            {track?.format || 'Аудио'}
          </span>
        </div>
      )}

      {/* Dim overlay for buttons */}
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px] transition-opacity" />

      {/* Embedded Controls: Prev, Center Play/Pause, Next */}
      <div className="relative z-10 flex items-center justify-center gap-4">
        {/* Prev Track Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrevTrack();
          }}
          className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-zinc-300 hover:text-white flex items-center justify-center transition-all cursor-pointer border border-white/10 opacity-70 hover:opacity-100 active:scale-95"
          title="Предыдущий трек"
          aria-label="Предыдущий трек"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Center Circular Play/Pause Button (Inspired by the bright central disc in the reference) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlay();
          }}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white hover:bg-zinc-200 text-black flex items-center justify-center shadow-2xl transition-transform hover:scale-105 active:scale-95 cursor-pointer"
          title={isPlaying ? 'Пауза (Пробел)' : 'Воспроизведение (Пробел)'}
          aria-label={isPlaying ? 'Пауза' : 'Воспроизведение'}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 fill-current" />
          ) : (
            <Play className="w-6 h-6 fill-current ml-0.5" />
          )}
        </button>

        {/* Next Track Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNextTrack();
          }}
          className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-zinc-300 hover:text-white flex items-center justify-center transition-all cursor-pointer border border-white/10 opacity-70 hover:opacity-100 active:scale-95"
          title="Следующий трек"
          aria-label="Следующий трек"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Corner Format Tag */}
      {track && (
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-mono tracking-wider text-zinc-300 uppercase">
          {track.format}
        </div>
      )}
    </div>
  );
};
