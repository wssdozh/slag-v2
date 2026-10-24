import React from 'react';
import { Mic, Music } from 'lucide-react';
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
  return (
    <div
      className={`relative aspect-square w-52 h-52 sm:w-64 sm:h-64 rounded-3xl overflow-hidden border border-white/[0.08] shadow-2xl bg-[#131316] flex items-center justify-center select-none ${className}`}
    >
      {/* Artwork Background */}
      {track?.coverUrl ? (
        <img
          src={track.coverUrl}
          alt={track.name}
          className={`w-full h-full object-cover transition-transform duration-700 ease-out ${
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

      {/* Subtle Corner Format Tag */}
      {track && (
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-mono tracking-wider text-zinc-300 uppercase">
          {track.format}
        </div>
      )}
    </div>
  );
};
