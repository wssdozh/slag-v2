// The transport row: play, skip, speed, shuffle, loop, mute, and the queue toggle.
import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Repeat,
  Repeat1,
  Shuffle,
  Volume2,
  VolumeX,
  ListMusic,
} from 'lucide-react';

interface AudioTransportProps {
  isPlaying: boolean;
  isLoop: boolean;
  isShuffle: boolean;
  isMuted: boolean;
  isTrackMissing: boolean;
  speed: number;
  onTogglePlay: () => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  onSkipTime: (delta: number) => void;
  onToggleSpeed: () => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onToggleLoop: () => void;
  onOpenPlaylist: () => void;
}

export const AudioTransport: React.FC<AudioTransportProps> = ({
  isPlaying,
  isLoop,
  isShuffle,
  isMuted,
  isTrackMissing,
  speed,
  onTogglePlay,
  onPrevTrack,
  onNextTrack,
  onSkipTime,
  onToggleSpeed,
  onToggleMute,
  onToggleShuffle,
  onToggleLoop,
  onOpenPlaylist,
}) => {
  return (
    <>
      {/* 5. Transport Controls Row: [<<]  [|<]  [Play/Pause]  [>|]  [>>] */}
      <div className="flex items-center justify-center gap-4 sm:gap-5 select-none">
        {/* -10s */}
        <button
          onClick={() => onSkipTime(-10)}
          className="w-8 h-8 rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
          title="Назад на 10 секунд (←)"
          aria-label="Назад на 10 секунд"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Prev */}
        <button
          onClick={onPrevTrack}
          className="w-9 h-9 rounded-full text-zinc-300 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors cursor-pointer"
          title="Предыдущий трек"
          aria-label="Предыдущий трек"
        >
          <SkipBack className="w-5 h-5 fill-current" />
        </button>

        {/* Central Round Play / Pause */}
        <button
          onClick={onTogglePlay}
          disabled={isTrackMissing}
          className="w-13 h-13 rounded-full bg-accent-media hover:bg-accent-media/90 text-white flex items-center justify-center shadow-xl motion-press cursor-pointer disabled:cursor-default disabled:opacity-40"
          title={
            isTrackMissing
              ? 'Файла нет на устройстве'
              : isPlaying ? 'Пауза (Пробел)' : 'Воспроизведение (Пробел)'
          }
          aria-label={isTrackMissing ? 'Файла нет на устройстве' : isPlaying ? 'Пауза' : 'Воспроизведение'}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 fill-current" />
          ) : (
            <Play className="w-6 h-6 fill-current ml-0.5" />
          )}
        </button>

        {/* Next */}
        <button
          onClick={onNextTrack}
          className="w-9 h-9 rounded-full text-zinc-300 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors cursor-pointer"
          title="Следующий трек"
          aria-label="Следующий трек"
        >
          <SkipForward className="w-5 h-5 fill-current" />
        </button>

        {/* +10s */}
        <button
          onClick={() => onSkipTime(10)}
          className="w-8 h-8 rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
          title="Вперед на 10 секунд (→)"
          aria-label="Вперед на 10 секунд"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>

      {/* 6. Utility Controls Row: Queue, Shuffle, Loop | Speed, Volume */}
      <div className="flex items-center justify-between w-full max-w-[270px] text-zinc-400 select-none mt-5">
        {/* Queue Button */}
        <button
          onClick={onOpenPlaylist}
          className="p-1.5 rounded-lg hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          title="Очередь воспроизведения"
          aria-label="Очередь воспроизведения"
        >
          <ListMusic className="w-4 h-4" />
        </button>

        {/* Shuffle Button */}
        <button
          onClick={onToggleShuffle}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            isShuffle ? 'text-white bg-white/10' : 'hover:text-white hover:bg-white/[0.08]'
          }`}
          title={isShuffle ? 'Перемешивание включено' : 'Перемешивание выключено'}
          aria-label="Перемешать"
        >
          <Shuffle className="w-4 h-4" />
        </button>

        {/* Loop Button */}
        <button
          onClick={onToggleLoop}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            isLoop ? 'text-white bg-white/10' : 'hover:text-white hover:bg-white/[0.08]'
          }`}
          title={isLoop ? 'Повтор включен' : 'Повтор выключен'}
          aria-label="Повтор"
        >
          {isLoop ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
        </button>

        {/* Subtle Vertical Divider */}
        <div className="h-4 w-px bg-white/15 mx-0.5" />

        {/* Playback Speed */}
        <button
          onClick={onToggleSpeed}
          className="px-2 py-1 rounded text-[11px] font-mono text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          title="Скорость воспроизведения"
          aria-label="Скорость"
        >
          {speed}x
        </button>

        {/* Volume / Mute Button */}
        <button
          onClick={onToggleMute}
          className="p-1.5 rounded-lg hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          title={isMuted ? 'Включить звук' : 'Выключить звук'}
          aria-label="Громкость"
        >
          {isMuted ? (
            <VolumeX className="w-4 h-4 text-red-400" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>
      </div>
    </>
  );
};
