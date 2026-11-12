import React from 'react';
import { Mic, Video } from 'lucide-react';

export interface ComposerRecordButtonProps {
  /** Which recorder a hold starts; a mobile tap flips between the two. */
  mediaType: 'audio' | 'video';
  onPointerDown: React.PointerEventHandler<HTMLButtonElement>;
  onPointerMove: React.PointerEventHandler<HTMLButtonElement>;
  onPointerUp: React.PointerEventHandler<HTMLButtonElement>;
  onPointerCancel: React.PointerEventHandler<HTMLButtonElement>;
}

/**
 * An empty draft has nothing to send, so the send plate becomes the recorder:
 * hold to record, tap to switch between voice and video.
 */
export const ComposerRecordButton: React.FC<ComposerRecordButtonProps> = ({
  mediaType,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}) => (
  <button
    type="button"
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerCancel}
    className="composer-toolbar-control composer-toolbar-icon w-ctrl-md h-ctrl-md rounded-md flex items-center justify-center motion-press shrink-0 cursor-pointer touch-none bg-transparent hover:bg-surface-hover text-fg-secondary hover:text-fg-primary"
    title={
      mediaType === 'audio'
        ? 'Записать аудио (удерживайте) / Кликните для видео'
        : 'Записать видео (удерживайте) / Кликните для аудио'
    }
    aria-label={mediaType === 'audio' ? 'Записать голосовую заметку' : 'Записать видео'}
  >
    {mediaType === 'audio' ? (
      <Mic className="w-4 h-4 transition-transform duration-150" />
    ) : (
      <Video className="w-4 h-4 transition-transform duration-150" />
    )}
  </button>
);
