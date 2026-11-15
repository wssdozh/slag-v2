// The tray of what is about to be sent: attachment chips, each removable.
import React, { useState } from 'react';
import { Icon } from '../../UI/icons/Icon';
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
  const { srcs: attachmentSrcs } = useAttachmentSrcs(attachments);
  // A fresh paste usually carries its `dataUrl`, so this fade is quiet — but it keeps the tray
  // honest when the bytes still have to come back from the disk.
  const [loadedImageIds, setLoadedImageIds] = useState<ReadonlySet<string>>(() => new Set());
  const markImageLoaded = (id: string) => {
    setLoadedImageIds((current) => (current.has(id) ? current : new Set(current).add(id)));
  };

  if (attachments.length === 0) return null;

  return (
    <div data-composer-attachments="" className="flex items-center gap-2 py-1 overflow-x-auto scrollbar-none whitespace-nowrap">
      {attachments.map(att => (
        <div key={att.id} className="shrink-0 flex items-center">
          {att.type === 'audio' ? (
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-tint-5 border border-tint-8 relative group">
              <AudioPlayer
                src={attachmentSrcs[att.id] ?? att.dataUrl ?? ''}
                duration={att.duration}
                waveform={att.waveform}
                compact={true}
              />
              <button
                type="button"
                onClick={() => onRemove(att.id)}
                className="p-1 rounded-full text-fg-secondary hover:text-rose-400 hover:bg-tint-8 transition-colors cursor-pointer"
                title="Удалить войс"
              >
                <Icon name="action.close" size="xs" tone="inherit" />
              </button>
            </div>
          ) : att.type === 'video' ? (
            <div className="relative group p-0.5">
              <VideoCirclePlayer src={attachmentSrcs[att.id] ?? att.dataUrl ?? ''} compact={true} />
              <button
                type="button"
                onClick={() => onRemove(att.id)}
                className="absolute -top-1 -right-1 p-1 rounded-full bg-scrim-80 border border-tint-20 text-fg-secondary hover:text-rose-400 transition-colors cursor-pointer shadow-md"
                title="Удалить видео-кружок"
              >
                <Icon name="action.close" size="xs" tone="inherit" />
              </button>
            </div>
          ) : att.type === 'image' ? (
            <div className="relative group rounded-lg overflow-hidden border border-tint-8 bg-scrim-40">
              {(attachmentSrcs[att.id] ?? att.dataUrl) && (
                <img
                  src={attachmentSrcs[att.id] ?? att.dataUrl}
                  alt={att.name}
                  data-loaded={loadedImageIds.has(att.id) ? 'true' : 'false'}
                  onLoad={() => markImageLoaded(att.id)}
                  className={`w-11 h-11 object-cover transition-opacity duration-200 motion-reduce:transition-none ${
                    loadedImageIds.has(att.id) ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              )}
              {!loadedImageIds.has(att.id) && (
                <span
                  data-testid="media-skeleton"
                  aria-hidden
                  className="absolute inset-0 bg-tint-4 motion-safe:animate-pulse"
                />
              )}
              <button
                type="button"
                onClick={() => onRemove(att.id)}
                className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-scrim-70 text-fg-tertiary hover:text-white transition-colors cursor-pointer"
                title="Удалить"
              >
                <Icon name="action.close" size="xs" tone="inherit" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-tint-4 border border-tint-6 text-xs text-fg-tertiary relative group">
              <Icon name="action.attach" size="sm" className="shrink-0" />
              <span className="text-2xs font-mono text-fg-tertiary truncate max-w-[120px]">{att.name}</span>
              <button
                type="button"
                onClick={() => onRemove(att.id)}
                className="p-0.5 rounded text-fg-muted hover:text-rose-400 transition-colors cursor-pointer"
                title="Удалить"
              >
                <Icon name="action.close" size="xs" tone="inherit" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
