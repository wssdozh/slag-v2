import React from 'react';
import type { LightboxImage, SlagAttachment } from '../../types';
import { AudioPlayer } from '../UI/AudioPlayer';
import { VideoCirclePlayer } from '../UI/VideoCirclePlayer';
import { useAttachmentSrcs } from '../../hooks/media/useAttachmentSrc';
import {
  ChevronRight,
  ChevronDown,
  Paperclip,
  Link2,
  ArrowUp,
  ArrowDown,
  Trash2,
} from 'lucide-react';

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
  const srcs = useAttachmentSrcs(attachments);
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-col rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
      <div
        onClick={onToggleCollapse}
        className="flex items-center justify-between px-3 py-2 text-xs text-zinc-400 hover:bg-white/[0.03] cursor-pointer transition-colors select-none"
      >
        <div className="flex items-center gap-2">
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          )}
          <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
          <span className="font-medium text-zinc-300">
            Медиа и вложения ({attachments.length})
          </span>
          {isCollapsed && (
            <span className="text-[11px] font-mono text-zinc-500">
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
            className="text-[11px] font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            + Добавить
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="flex flex-col gap-2.5 p-3 pt-1 border-t border-white/[0.04]">
          {attachments.map((att, idx) => (
            <div
              key={att.id}
              onClick={() => onSelectAttachment(att.id === selectedAttachmentId ? null : att.id)}
              className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-2.5 rounded-lg border transition-colors cursor-pointer ${
                selectedAttachmentId === att.id
                  ? 'bg-blue-500/10 border-blue-500/40 ring-1 ring-blue-500/40 shadow-sm'
                  : 'bg-black/40 border-white/[0.06] hover:border-white/[0.12]'
              }`}
            >
              {/* Media Rendering */}
              <div className="flex-1 min-w-0">
                {att.type === 'audio' ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-zinc-400 font-medium">
                        🎙 Войс:
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[200px]">
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
                      <span className="text-xs font-mono text-zinc-300 font-medium truncate">
                        {att.name}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
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
                      className="w-14 h-14 rounded-lg overflow-hidden bg-black/60 border border-white/10 shrink-0 cursor-pointer hover:opacity-90"
                    >
                      <img src={srcs[att.id] ?? att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-mono text-zinc-300 font-medium truncate">
                        {att.name}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {Math.round(att.size / 1024)} KB
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="text-xs font-mono text-zinc-300 truncate">{att.name}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">
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
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white text-[11px] font-mono transition-colors cursor-pointer"
                  title="Вставить ссылку ![[файл]] в позицию курсора markdown для структурирования заметки"
                >
                  <Link2 className="w-3 h-3 text-accent" />
                  <span>Вставить в текст</span>
                </button>

                {/* Reorder Up */}
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => onMoveAttachment(idx, 'up')}
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Переместить выше"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>

                {/* Reorder Down */}
                <button
                  type="button"
                  disabled={idx === attachments.length - 1}
                  onClick={() => onMoveAttachment(idx, 'down')}
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Переместить ниже"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(att.id)}
                  className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-white/[0.06] transition-colors cursor-pointer"
                  title="Удалить"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
