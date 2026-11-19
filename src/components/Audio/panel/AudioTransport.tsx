// The transport row: play, skip, speed, shuffle, loop, mute, and the queue toggle.
import React from 'react';
import { Icon } from '../../UI/icons/Icon';
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
          className="w-8 h-8 rounded-full text-fg-secondary hover:text-white hover:bg-tint-6 flex items-center justify-center transition-colors cursor-pointer"
          title="Назад на 10 секунд (←)"
          aria-label="Назад на 10 секунд"
        >
          <Icon name="action.retry" size="md" tone="inherit" />
        </button>

        {/* Prev */}
        <button
          onClick={onPrevTrack}
          className="w-9 h-9 rounded-full text-fg-tertiary hover:text-white hover:bg-tint-8 flex items-center justify-center transition-colors cursor-pointer"
          title="Предыдущий трек"
          aria-label="Предыдущий трек"
        >
          <Icon name="media.skipBack" size="lg" tone="inherit" />
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
            <Icon name="media.pause" size="xl" tone="inherit" variant="filled" />
          ) : (
            <Icon name="media.play" size="xl" tone="inherit" variant="filled" className="ml-0.5" />
          )}
        </button>

        {/* Next */}
        <button
          onClick={onNextTrack}
          className="w-9 h-9 rounded-full text-fg-tertiary hover:text-white hover:bg-tint-8 flex items-center justify-center transition-colors cursor-pointer"
          title="Следующий трек"
          aria-label="Следующий трек"
        >
          <Icon name="media.skipForward" size="lg" tone="inherit" />
        </button>

        {/* +10s */}
        <button
          onClick={() => onSkipTime(10)}
          className="w-8 h-8 rounded-full text-fg-secondary hover:text-white hover:bg-tint-6 flex items-center justify-center transition-colors cursor-pointer"
          title="Вперед на 10 секунд (→)"
          aria-label="Вперед на 10 секунд"
        >
          <Icon name="action.retryForward" size="md" tone="inherit" />
        </button>
      </div>

      {/* 6. Utility Controls Row: Queue, Shuffle, Loop | Speed, Volume */}
      <div className="flex items-center justify-between w-full max-w-[270px] text-fg-secondary select-none mt-5">
        {/* Queue Button */}
        <button
          onClick={onOpenPlaylist}
          className="p-1.5 rounded-lg hover:text-white hover:bg-tint-8 transition-colors cursor-pointer"
          title="Очередь воспроизведения"
          aria-label="Очередь воспроизведения"
        >
          <Icon name="media.queue" size="md" tone="inherit" />
        </button>

        {/* Shuffle Button */}
        <button
          onClick={onToggleShuffle}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            isShuffle ? 'text-white bg-tint-10' : 'hover:text-white hover:bg-tint-8'
          }`}
          title={isShuffle ? 'Перемешивание включено' : 'Перемешивание выключено'}
          aria-label="Перемешать"
        >
          <Icon name="media.shuffle" size="md" tone="inherit" />
        </button>

        {/* Loop Button */}
        <button
          onClick={onToggleLoop}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            isLoop ? 'text-white bg-tint-10' : 'hover:text-white hover:bg-tint-8'
          }`}
          title={isLoop ? 'Повтор включен' : 'Повтор выключен'}
          aria-label="Повтор"
        >
          {isLoop ? <Icon name="time.repeatOne" size="md" tone="inherit" /> : <Icon name="time.repeat" size="md" tone="inherit" />}
        </button>

        {/* Subtle Vertical Divider */}
        <div className="h-4 w-px bg-tint-15 mx-0.5" />

        {/* Playback Speed */}
        <button
          onClick={onToggleSpeed}
          className="px-2 py-1 rounded text-2xs font-mono text-fg-tertiary hover:text-white hover:bg-tint-8 transition-colors cursor-pointer"
          title="Скорость воспроизведения"
          aria-label="Скорость"
        >
          {speed}x
        </button>

        {/* Volume / Mute Button */}
        <button
          onClick={onToggleMute}
          className="p-1.5 rounded-lg hover:text-white hover:bg-tint-8 transition-colors cursor-pointer"
          title={isMuted ? 'Включить звук' : 'Выключить звук'}
          aria-label="Громкость"
        >
          {isMuted ? (
            <Icon name="media.volumeOff" size="md" tone="danger" />
          ) : (
            <Icon name="media.volumeOn" size="md" tone="inherit" />
          )}
        </button>
      </div>
    </>
  );
};
