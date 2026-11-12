// Cover tile plus the title parsed out of the file name, including the missing state.
import React from 'react';
import { FileX } from 'lucide-react';
import type { AudioTrack } from '../../../lib/media/audioHelper';
import { AudioCoverArt } from '../AudioCoverArt';

interface AudioArtworkProps {
  track: AudioTrack | null;
  isPlaying: boolean;
  analyser: AnalyserNode | null;
  isTrackMissing: boolean;
  title: string;
  author: string;
  onOpenNote: (itemId: string) => void;
}

export const AudioArtwork: React.FC<AudioArtworkProps> = ({
  track,
  isPlaying,
  analyser,
  isTrackMissing,
  title,
  author,
  onOpenNote,
}) => {
  return (
    <>
      {/* 1. Square Art Tile (Clean, without buttons) */}
      <AudioCoverArt track={track} isPlaying={isPlaying} analyser={analyser} />

      {/* 2. Track Title (parsed from `Artist - Title.ext`, extension dropped) */}
      <h2
        className={`text-lg sm:text-xl font-bold tracking-tight truncate max-w-full text-center mt-5 mb-1 px-2 ${
          isTrackMissing ? 'text-zinc-500' : 'text-white'
        }`}
      >
        {title}
      </h2>

      {/* The bytes never landed on this device: say so instead of faking a play button. */}
      {isTrackMissing && (
        <div className="mb-1 flex items-center justify-center gap-1.5 text-[11px] font-mono text-zinc-500">
          <FileX className="h-3 w-3" />
          файла нет на устройстве
        </div>
      )}

      {/* 3. Author line: who made it, before where it lives */}
      {author && (
        <div className="text-xs text-zinc-400 text-center truncate max-w-full px-2 mb-1">
          {author}
        </div>
      )}

      {/* 4. Subtitle: Note title • Folder */}
      <div className="text-xs text-zinc-400 text-center flex items-center justify-center gap-1.5 max-w-full truncate px-2 mb-5">
        {track?.itemTitle && track.itemTitle !== title && (
          <button
            onClick={() => onOpenNote(track.itemId)}
            className="hover:text-zinc-200 transition-colors truncate cursor-pointer underline-offset-2 hover:underline"
            title="Перейти к заметке"
          >
            {track.itemTitle}
          </button>
        )}
        {track?.itemTitle && track.itemTitle !== title && (
          <span className="text-zinc-600">•</span>
        )}
        <span className="text-zinc-500 truncate">{track?.itemFolder}</span>
      </div>
    </>
  );
};
