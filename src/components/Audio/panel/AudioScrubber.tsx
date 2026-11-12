// The seek bar: click or drag anywhere on the track to scrub, time labels at both ends.
import React, { useCallback, useRef } from 'react';
import { formatAudioDuration } from '../../../lib/media/audioHelper';

interface AudioScrubberProps {
  currentTime: number;
  duration: number;
  progressPercent: number;
  onSeek: (fraction: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}

export const AudioScrubber: React.FC<AudioScrubberProps> = ({
  currentTime,
  duration,
  progressPercent,
  onSeek,
  onScrubStart,
  onScrubEnd,
}) => {
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(fraction);
    },
    [onSeek]
  );

  const handleTimelineMouseDown = (e: React.MouseEvent) => {
    onScrubStart();
    seekFromClientX(e.clientX);

    const onMouseMove = (moveEvent: MouseEvent) => {
      seekFromClientX(moveEvent.clientX);
    };
    const onMouseUp = () => {
      onScrubEnd();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className="w-full flex items-center gap-3 mb-5 select-none">
      <span className="text-[11px] font-mono text-zinc-400 w-8 text-left shrink-0">
        {formatAudioDuration(currentTime)}
      </span>

      <div
        ref={timelineRef}
        onMouseDown={handleTimelineMouseDown}
        className="group relative flex-1 flex items-center h-4 cursor-pointer select-none"
      >
        <div className="w-full h-1 bg-white/15 rounded-full overflow-hidden group-hover:h-1.5">
          {/* Composited fill: `width` here re-laid-out the track on every
              `timeupdate` tick for the whole length of the track, forever.
              A `scaleX` on the compositor costs one matrix update instead. */}
          <div
            style={{ transform: `scaleX(${progressPercent / 100})`, transformOrigin: 'left center' }}
            className="h-full w-full bg-white transition-transform duration-100 ease-linear"
          />
        </div>
        <div
          style={{ left: `${progressPercent}%` }}
          className="absolute -ml-1.5 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        />
      </div>

      <span className="text-[11px] font-mono text-zinc-500 w-8 text-right shrink-0">
        {formatAudioDuration(duration)}
      </span>
    </div>
  );
};
