// Cover tile plus the title parsed out of the file name, including the missing state.
import React from 'react';
import { Icon } from '../../UI/icons/Icon';
import type { AudioTrack } from '../../../lib/media/audioHelper';
import { AudioCoverArt } from '../AudioCoverArt';

interface AudioArtworkProps {
  track: AudioTrack | null;
  isPlaying: boolean;
  analyser: AnalyserNode | null;
  isTrackMissing: boolean;
  title: string;
  author: string;
  /** `Artist - Title` parsed out of the file name: the caption carries the author, not the name. */
  hasParsedMetadata: boolean;
  onOpenNote: (itemId: string) => void;
}

export const AudioArtwork: React.FC<AudioArtworkProps> = ({
  track,
  isPlaying,
  analyser,
  isTrackMissing,
  title,
  author,
  hasParsedMetadata,
  onOpenNote,
}) => {
  // Parsed metadata already answers "who"; the file name under the title is noise.
  const noteLabel = !hasParsedMetadata && track?.itemTitle && track.itemTitle !== title ? track.itemTitle : null;
  const caption = hasParsedMetadata ? author : noteLabel;
  return (
    <>
      {/* 1. Square Art Tile (Clean, without buttons) */}
      <AudioCoverArt track={track} isPlaying={isPlaying} analyser={analyser} />

      {/* 2. Track Title (parsed from `Artist - Title.ext`, extension dropped) */}
      <h2
        className={`text-lg sm:text-xl font-bold tracking-tight truncate max-w-full text-center mt-5 mb-1 px-2 ${
          isTrackMissing ? 'text-fg-muted' : 'text-white'
        }`}
      >
        {title}
      </h2>

      {/* The bytes never landed on this device: say so instead of faking a play button. */}
      {isTrackMissing && (
        <div className="mb-1 flex items-center justify-center gap-1.5 text-2xs font-mono text-fg-muted">
          <Icon name="entity.fileMissing" size="xs" tone="inherit" />
          файла нет на устройстве
        </div>
      )}

      {/* 3. Subtitle: author • folder once metadata parsed, note title • folder otherwise */}
      <div className="text-xs text-fg-secondary text-center flex items-center justify-center gap-1.5 max-w-full truncate px-2 mb-5">
        {caption && track && (
          <button
            onClick={() => onOpenNote(track.itemId)}
            className="hover:text-fg-soft transition-colors truncate cursor-pointer underline-offset-2 hover:underline"
            title="Перейти к заметке"
          >
            {caption}
          </button>
        )}
        {caption && <span className="text-fg-dim">•</span>}
        <span className="text-fg-muted truncate">{track?.itemFolder}</span>
      </div>
    </>
  );
};
