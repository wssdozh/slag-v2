// The tray of what is about to be sent: attachment chips, each removable.
import React from 'react';
import { Paperclip, X } from 'lucide-react';
import type { SlagAttachment } from '../../../types';
import { AudioPlayer } from '../../UI/AudioPlayer';
import { VideoCirclePlayer } from '../../UI/VideoCirclePlayer';
import { useAttachmentSrcs } from '../../../hooks/media/useAttachmentSrc';

export interface ComposerAttachmentStripProps {
  attachments: SlagAttachment[];
  onRemove: (attachmentId: string) => void;
}

/**
 * The tray of what is about to be sent. The draft keeps attachment metadata;
 * the bytes are resolved on demand.
 */
export const ComposerAttachmentStrip: React.FC<ComposerAttachmentStripProps> = ({
  attachments,
  onRemove,
}) => {
  const attachmentSrcs = useAttachmentSrcs(attachments);

  if (attachments.length === 0) return null;

  return (
    <div data-composer-attachments="" className="flex items-center gap-2 py-1 overflow-x-auto scrollbar-none whitespace-nowrap">
      {attachments.map(att => (
        <div key={att.id} className="shrink-0 flex items-center">
          {att.type === 'audio' ? (
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.05] border border-white/[0.08] relative group">
              <AudioPlayer
                src={attachmentSrcs[att.id] ?? att.dataUrl ?? ''}
                duration={att.duration}
                waveform={att.waveform}
                compact={true}
              />
              <button
                type="button"
                onClick={() => onRemove(att.id)}
                className="p-1 rounded-full text-zinc-400 hover:text-rose-400 hover:bg-white/[0.08] transition-colors cursor-pointer"
                title="Удалить войс"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : att.type === 'video' ? (
            <div className="relative group p-0.5">
              <VideoCirclePlayer src={attachmentSrcs[att.id] ?? att.dataUrl ?? ''} compact={true} />
              <button
                type="button"
                onClick={() => onRemove(att.id)}
                className="absolute -top-1 -right-1 p-1 rounded-full bg-black/80 border border-white/20 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer shadow-md"
                title="Удалить видео-кружок"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : att.type === 'image' ? (
            <div className="relative group rounded-lg overflow-hidden border border-white/[0.08] bg-black/40">
              <img src={attachmentSrcs[att.id] ?? att.dataUrl} alt={att.name} className="w-11 h-11 object-cover" />
              <button
                type="button"
                onClick={() => onRemove(att.id)}
                className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/70 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title="Удалить"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-zinc-300 relative group">
              <Paperclip className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="text-[11px] font-mono text-zinc-300 truncate max-w-[120px]">{att.name}</span>
              <button
                type="button"
                onClick={() => onRemove(att.id)}
                className="p-0.5 rounded text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                title="Удалить"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
