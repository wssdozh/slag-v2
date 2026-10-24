import React from 'react';
import type { AudioTrack } from '../../lib/audioHelper';

interface AudioCoverArtProps {
  track: AudioTrack | null;
  isPlaying: boolean;
  className?: string;
}

// Minimalist Micro-Cassette Spool (Teenage Engineering TP-7 / Braun Dieter Rams aesthetic)
const CassetteReel: React.FC<{
  isPlaying: boolean;
  isLeft?: boolean;
}> = ({ isPlaying, isLeft = true }) => {
  return (
    <div
      className={`relative rounded-full flex items-center justify-center select-none shadow-sm ${
        isLeft
          ? 'w-14 h-14 sm:w-16 sm:h-16 bg-[#211e1c] border border-[#332b27]'
          : 'w-11 h-11 sm:w-13 sm:h-13 bg-[#1a1716] border border-[#26201d]'
      }`}
    >
      {/* Tape winding concentric ring */}
      <div className="absolute inset-1 rounded-full border border-white/[0.03]" />

      {/* Rotating Center Spool Hub */}
      <div
        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#0a0a0c] border border-white/20 flex items-center justify-center relative shadow-inner ${
          isPlaying ? 'animate-[spin_3.5s_linear_infinite]' : ''
        }`}
      >
        {/* 6 Gear Spokes */}
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <div
            key={deg}
            style={{ transform: `rotate(${deg}deg)` }}
            className="absolute w-1 h-2 bg-zinc-200/90 rounded-xs top-0 -mt-0.5"
          />
        ))}

        {/* Center spindle hole */}
        <div className="w-2.5 h-2.5 rounded-full bg-[#18181c] border border-white/25 z-10" />
      </div>
    </div>
  );
};

export const AudioCoverArt: React.FC<AudioCoverArtProps> = ({
  track,
  isPlaying,
  className = '',
}) => {
  // If track has an associated cover image (e.g. music note with photo)
  if (track?.coverUrl) {
    return (
      <div
        className={`relative aspect-square w-52 h-52 sm:w-64 sm:h-64 rounded-3xl overflow-hidden border border-white/[0.08] shadow-2xl bg-[#131316] flex items-center justify-center select-none ${className}`}
      >
        <img
          src={track.coverUrl}
          alt={track.name}
          className={`w-full h-full object-cover transition-transform duration-700 ease-out outline outline-1 -outline-offset-1 outline-white/10 ${
            isPlaying ? 'scale-105' : 'scale-100'
          }`}
        />
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-mono tracking-wider text-zinc-300 uppercase">
          {track.format}
        </div>
      </div>
    );
  }

  // Micro-Cassette / Tape Deck aesthetic (Teenage Engineering TP-7 / Braun)
  return (
    <div
      className={`relative aspect-square w-52 h-52 sm:w-64 sm:h-64 rounded-3xl p-3.5 bg-gradient-to-b from-[#19191d] via-[#141416] to-[#0f0f11] border border-white/[0.08] border-t-white/[0.14] shadow-2xl flex flex-col justify-between overflow-hidden select-none ${className}`}
    >
      {/* Top Header Strip: Corner Screws & Swiss Minimalist Typography */}
      <div className="flex items-center justify-between px-0.5">
        {/* Top-left screw */}
        <div className="w-2 h-2 rounded-full border border-white/15 bg-zinc-800 flex items-center justify-center shadow-xs">
          <div className="w-1 h-px bg-white/30" />
        </div>

        {/* Cassette Model & Status */}
        <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-zinc-400">
          <div
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              isPlaying ? 'bg-amber-400 animate-pulse' : 'bg-zinc-600'
            }`}
          />
          <span className="font-semibold text-zinc-300">
            {track?.isVoice ? 'VOICE LOG' : 'AUDIO TAPE'}
          </span>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-500">TP-60</span>
        </div>

        {/* Top-right screw */}
        <div className="w-2 h-2 rounded-full border border-white/15 bg-zinc-800 flex items-center justify-center shadow-xs">
          <div className="w-1 h-px bg-white/30" />
        </div>
      </div>

      {/* Central Smoked Acrylic Window (Concentric radius: 24px - 14px = 10px / rounded-xl) */}
      <div className="relative w-full h-24 sm:h-28 rounded-xl bg-black/80 border border-white/[0.08] px-4 py-2 flex items-center justify-between overflow-hidden shadow-inner">
        {/* Subtle glass reflection gradient */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.03] via-transparent to-transparent pointer-events-none" />

        {/* Magnetic Tape Ribbon stretched across */}
        <div className="absolute inset-x-5 top-1/2 -translate-y-1/2 h-6 bg-[#1e1a18] border-t border-b border-amber-950/40 pointer-events-none" />

        {/* Left Spool (Supply Reel) */}
        <div className="relative z-10">
          <CassetteReel isPlaying={isPlaying} isLeft={true} />
        </div>

        {/* Center Optical Tape Meter / Scale (Braun style) */}
        <div className="relative z-10 flex flex-col items-center justify-center opacity-45 text-[7px] font-mono tracking-widest text-zinc-400 select-none">
          <span>100</span>
          <div className="w-3.5 h-px bg-white/30 my-0.5" />
          <span>50</span>
          <div className="w-3.5 h-px bg-white/30 my-0.5" />
          <span>0</span>
        </div>

        {/* Right Spool (Take-up Reel) */}
        <div className="relative z-10">
          <CassetteReel isPlaying={isPlaying} isLeft={false} />
        </div>
      </div>

      {/* Bottom Tape-Head Notch & Mechanical Detailing */}
      <div className="relative flex flex-col items-center w-full">
        {/* Trapezoid Tape-Head Reader Plate */}
        <div className="w-28 sm:w-36 h-4.5 rounded-t-md bg-[#0a0a0c] border-t border-x border-white/[0.07] flex items-center justify-around px-3 shadow-xs">
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 border border-white/10" />
          <div className="w-6 h-1 rounded-full bg-black border border-white/15" />
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 border border-white/10" />
        </div>

        {/* Cassette Technical Spec Strip */}
        <div className="w-full flex items-center justify-between pt-1 px-1 text-[8px] font-mono uppercase tracking-wider text-zinc-500">
          <span>SIDE A</span>
          <span>15/16 IPS</span>
          <span>{track?.format || 'TYPE I'}</span>
        </div>
      </div>
    </div>
  );
};
