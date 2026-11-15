// The editor's attachment rail: reorder, remove, insert into the text, inline players.
import React, { useState } from 'react';
import type { LightboxImage, SlagAttachment } from '../../types';
import { AudioPlayer } from '../UI/AudioPlayer';
import { VideoCirclePlayer } from '../UI/VideoCirclePlayer';
import { useAttachmentSrcs } from '../../hooks/media/useAttachmentSrc';
import { Icon } from '../UI/icons/Icon';
export interface AttachmentStripProps {
  itemId: string;
  attachments: SlagAttachment[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  selectedAttachmentId: string | null;
  onSelectAttachment: (id: string | null) => void;
  onInsertMarkdown: (name: string) => void;
  onMoveAttachment: (index: number, direction: 'up' | 'down') => void;
  onRemoveAttachment: (id: string) => void;
  onAddClick: () => void;
  onOpenLightbox: (images: LightboxImage[], index: number) => void;
}

export const AttachmentStrip: React.FC<AttachmentStripProps> = ({
  itemId,
  attachments,
  isCollapsed,
  onToggleCollapse,
  selectedAttachmentId,
  onSelectAttachment,
  onInsertMarkdown,
  onMoveAttachment,
  onRemoveAttachment,
  onAddClick,
  onOpenLightbox,
}) => {
  const { srcs } = useAttachmentSrcs(attachments);
  // A preview fades in once its own bytes are decoded; until then the slot stays a skeleton.
  const [loadedImageIds, setLoadedImageIds] = useState<ReadonlySet<string>>(() => new Set());
  const markImageLoaded = (id: string) => {
    setLoadedImageIds((current) => (current.has(id) ? current : new Set(current).add(id)));
  };
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-col rounded-xl bg-tint-2 border border-tint-6 overflow-hidden">
      <div
        onClick={onToggleCollapse}
        className="flex items-center justify-between px-3 py-2 text-xs text-fg-secondary hover:bg-tint-3 cursor-pointer transition-colors select-none"
      >
        <div className="flex items-center gap-2">
          {isCollapsed ? (
            <Icon name="nav.next" size="sm" tone="muted" />
          ) : (
            <Icon name="nav.down" size="sm" tone="muted" />
          )}
          <Icon name="action.attach" size="sm" />
          <span className="font-medium text-fg-tertiary">
            Медиа и вложения ({attachments.length})
          </span>
          {isCollapsed && (
            <span className="text-2xs font-mono text-fg-muted">
              • {attachments.map(a => a.type === 'audio' ? '🎙' : a.type === 'video' ? '📹' : a.type === 'image' ? '🖼' : '📎').slice(0, 5).join(' ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddClick();
            }}
            className="text-2xs font-mono text-fg-secondary hover:text-white transition-colors cursor-pointer"
          >
            + Добавить
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="flex flex-col gap-2.5 p-3 pt-1 border-t border-tint-4">
          {attachments.map((att, idx) => (
            <div
              key={att.id}
              onClick={() => onSelectAttachment(att.id === selectedAttachmentId ? null : att.id)}
              className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-2.5 rounded-lg border transition-colors cursor-pointer ${
                selectedAttachmentId === att.id
                  ? 'bg-blue-500/10 border-blue-500/40 ring-1 ring-blue-500/40 shadow-sm'
                  : 'bg-scrim-40 border-tint-6 hover:border-tint-12'
              }`}
            >
              {/* Media Rendering */}
              <div className="flex-1 min-w-0">
                {att.type === 'audio' ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-2xs font-mono text-fg-secondary font-medium">
                        🎙 Войс:
                      </span>
                      <span className="text-3xs font-mono text-fg-muted truncate max-w-[200px]">
                        {att.name}
                      </span>
                    </div>
                    <AudioPlayer
                      src={srcs[att.id] ?? att.dataUrl ?? ''}
                      duration={att.duration}
                      waveform={att.waveform}
                      extractedText={att.extractedText}
                      enrichmentStatus={att.enrichmentStatus}
                    />
                  </div>
                ) : att.type === 'video' ? (
                  <div className="flex items-center gap-3">
                    <VideoCirclePlayer src={srcs[att.id] ?? att.dataUrl ?? ''} compact={true} />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-mono text-fg-tertiary font-medium truncate">
                        {att.name}
                      </span>
                      <span className="text-3xs text-fg-muted font-mono">
                        Видео-кружок {att.duration ? `• ${att.duration} сек` : ''}
                      </span>
                    </div>
                  </div>
                ) : att.type === 'image' ? (
                  <div className="flex items-center gap-3">
                    <div
                      onClick={() => {
                        const url = srcs[att.id] ?? att.dataUrl;
                        if (url) {
                          onOpenLightbox([{
                            id: att.id,
                            name: att.name,
                            url,
                            extractedText: att.extractedText,
                            summary: att.summary,
                            enrichmentStatus: att.enrichmentStatus,
                            enrichmentError: att.enrichmentError,
                            itemId,
                          }], 0);
                        }
                      }}
                      className="relative w-14 h-14 rounded-lg overflow-hidden bg-scrim-60 border border-tint-10 shrink-0 cursor-pointer hover:opacity-90"
                    >
                      {(srcs[att.id] ?? att.dataUrl) && (
                        <img
                          src={srcs[att.id] ?? att.dataUrl}
                          alt={att.name}
                          data-loaded={loadedImageIds.has(att.id) ? 'true' : 'false'}
                          onLoad={() => markImageLoaded(att.id)}
                          className={`w-full h-full object-cover transition-opacity duration-200 motion-reduce:transition-none ${
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
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-mono text-fg-tertiary font-medium truncate">
                        {att.name}
                      </span>
                      <span className="text-3xs text-fg-muted font-mono">
                        {Math.round(att.size / 1024)} KB
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Icon name="action.attach" size="md" className="shrink-0" />
                    <span className="text-xs font-mono text-fg-tertiary truncate">{att.name}</span>
                    <span className="text-3xs text-fg-muted font-mono">
                      {Math.round(att.size / 1024)} KB
                    </span>
                  </div>
                )}
              </div>

              {/* Actions: Insert into text, Move up/down, Delete */}
              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => onInsertMarkdown(att.name)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-tint-5 hover:bg-tint-10 text-fg-tertiary hover:text-white text-2xs font-mono transition-colors cursor-pointer"
                  title="Вставить ссылку ![[файл]] в позицию курсора markdown для структурирования заметки"
                >
                  <Icon name="action.link" size="xs" tone="accent" />
                  <span>Вставить в текст</span>
                </button>

                {/* Reorder Up */}
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => onMoveAttachment(idx, 'up')}
                  className="p-1 rounded text-fg-secondary hover:text-white hover:bg-tint-6 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Переместить выше"
                >
                  <Icon name="action.send" size="sm" tone="inherit" />
                </button>

                {/* Reorder Down */}
                <button
                  type="button"
                  disabled={idx === attachments.length - 1}
                  onClick={() => onMoveAttachment(idx, 'down')}
                  className="p-1 rounded text-fg-secondary hover:text-white hover:bg-tint-6 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Переместить ниже"
                >
                  <Icon name="action.moveDown" size="sm" tone="inherit" />
                </button>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(att.id)}
                  className="p-1 rounded text-fg-muted hover:text-rose-400 hover:bg-tint-6 transition-colors cursor-pointer"
                  title="Удалить"
                >
                  <Icon name="action.delete" size="sm" tone="inherit" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
