import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem } from '../../types';
import { AudioPlayer } from '../UI/AudioPlayer';
import { VideoCirclePlayer } from '../UI/VideoCirclePlayer';
import {
  CheckCircle2,
  Circle,
  Maximize2,
  MoreVertical,
  Paperclip,
  Calendar,
  ChevronDown,
  ChevronUp,
  FileText,
  CornerUpLeft,
  Link2,
  Pin
} from 'lucide-react';
import type { LightboxImage } from '../../types';

interface ItemCardProps {
  item: SlagItem;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item }) => {
  const {
    items,
    filteredItems,
    toggleTaskComplete,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    setActiveTagFilter,
    openContextMenu,
    setReplyTarget,
    highlightedItemId,
    scrollToItem,
    openLightbox,
    isMobile,
    setMobileActionSheetItem
  } = useApp();

  const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(true);
  const [isArticleExpanded, setIsArticleExpanded] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const longPressTimerRef = useRef<number | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    longPressTimerRef.current = window.setTimeout(() => {
      try {
        navigator.vibrate?.(15);
      } catch {
        // Ignore
      }
      setMobileActionSheetItem(item);
      longPressTimerRef.current = null;
    }, 450);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPosRef.current.x;
    const dy = touch.clientY - touchStartPosRef.current.y;

    // Cancel long press on movement
    if (Math.hypot(dx, dy) > 10 && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // Horizontal swipe left for reply (Telegram style)
    if (dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setSwipeOffset(Math.max(-70, dx));
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (swipeOffset < -45) {
      try {
        navigator.vibrate?.(10);
      } catch {
        // Ignore
      }
      setReplyTarget(item);
    }
    setSwipeOffset(0);
    touchStartPosRef.current = null;
  };

  const formattedTime = new Date(item.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isTask = item.type === 'task';
  const isArticle = item.type === 'article';

  const audioAttachments = item.attachments.filter(a => a.type === 'audio');
  const videoAttachments = item.attachments.filter(a => a.type === 'video');
  const imageAttachments = item.attachments.filter(a => a.type === 'image');
  const fileAttachments = item.attachments.filter(a => a.type === 'file');

  const completedSubtasksCount = item.subtasks?.filter(s => s.completed).length || 0;
  const totalSubtasksCount = item.subtasks?.length || 0;

  // Replied parent item
  const replyParent = item.replyToId ? items.find(i => i.id === item.replyToId) : null;
  const repliesCount = items.filter(i => i.replyToId === item.id).length;

  const hasMetadata = isTask || isArticle || (item.folder !== 'Входящие') || Boolean(item.isPinned) || Boolean(item.priority && item.priority !== 'none') || Boolean(item.dueDate);

  const handleOpenArticle = () => {
    setSelectedItem(item);
    setIsFullscreenEditorOpen(true);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'item',
      item,
    });
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const renderContentWithWikiLinks = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\[\[[^\]]+\]\])/g);
    return parts.map((part, idx) => {
      const match = part.match(/^\[\[([^\]]+)\]\]$/);
      if (match) {
        const linkTarget = match[1];
        return (
          <span
            key={idx}
            onClick={(e) => {
              e.stopPropagation();
              scrollToItem(linkTarget);
            }}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 hover:text-white font-mono text-2xs cursor-pointer transition-colors border border-white/[0.06] align-baseline"
            title={`Перейти к «${linkTarget}»`}
          >
            <Link2 className="w-2.5 h-2.5 text-blue-400 shrink-0" />
            <span className="underline decoration-white/20 underline-offset-2">{linkTarget}</span>
          </span>
        );
      }
      return part;
    });
  };

  const isHighlighted = highlightedItemId === item.id;

  return (
    <div className="relative max-w-2xl w-full mx-auto overflow-hidden">
      {/* Background Reply Swipe Indicator */}
      {swipeOffset < 0 && (
        <div className="absolute inset-y-0 right-0 w-16 flex items-center justify-center text-blue-400">
          <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
            <CornerUpLeft className="w-4 h-4" />
          </div>
        </div>
      )}

      <div
        id={`item-${item.id}`}
        draggable={!isMobile}
        onDragStart={handleDragStart}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
          transition: swipeOffset ? 'none' : 'transform 150ms ease-out',
        }}
        className={`group relative flex flex-col gap-2 w-full p-3 rounded-xl transition-all cursor-default select-none ${
          isHighlighted
            ? 'bg-blue-500/10 border border-blue-500/40 item-highlight-pulse'
            : 'bg-[#141417]/80 hover:bg-[#161619] border border-white/[0.05]'
        }`}
      >
        {/* Action Buttons (Seamless, no bulky background pill) */}
        <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150 z-10 pointer-events-auto">
          <button
            onClick={() => setReplyTarget(item)}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer flex items-center justify-center"
            title="Ответить (R)"
          >
            <CornerUpLeft className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isMobile) {
                setMobileActionSheetItem(item);
              } else {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                openContextMenu({
                  x: rect.right - 224,
                  y: rect.bottom + 6,
                  type: 'item',
                  item,
                });
              }
            }}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer flex items-center justify-center"
            title="Действия"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </div>

      {/* Top Header / Metadata Bar (Rendered ONLY when metadata exists) */}
      {hasMetadata && (
        <div className="flex items-center justify-between text-xs text-zinc-500 pr-12">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Item Type: Plain text, no nested chips */}
            {isTask && (
              <span className="text-2xs font-mono text-zinc-400 font-medium">
                Таска
              </span>
            )}
            {isArticle && (
              <span className="text-2xs font-mono text-zinc-400 font-medium">
                Статья {item.readingTimeMinutes ? `• ${item.readingTimeMinutes} мин` : ''}
              </span>
            )}

            {/* Folder name if not in inbox */}
            {item.folder !== 'Входящие' && (
              <span className="text-2xs text-zinc-500 font-mono">
                {item.folder}
              </span>
            )}

            {/* Task Priority */}
            {isTask && item.priority && item.priority !== 'none' && (
              <span
                className={`text-2xs uppercase font-mono font-medium ${
                  item.priority === 'high'
                    ? 'text-rose-400'
                    : item.priority === 'medium'
                    ? 'text-amber-400'
                    : 'text-zinc-500'
                }`}
              >
                {item.priority}
              </span>
            )}

            {/* Pin indicator */}
            {item.isPinned && (
              <span className="flex items-center gap-1 text-2xs font-mono text-amber-400/90" title="Закрепленная запись">
                <Pin className="w-2.5 h-2.5 rotate-45 shrink-0" />
                <span>Закреп</span>
              </span>
            )}

            {/* Task Due Date */}
            {isTask && item.dueDate && (
              <span className="flex items-center gap-1 text-2xs text-zinc-500 font-mono">
                <Calendar className="w-3 h-3 text-zinc-600" />
                {item.dueDate}
              </span>
            )}
          </div>

          <span className="text-2xs font-mono text-zinc-500 shrink-0">{formattedTime}</span>
        </div>
      )}

      {/* Reply Parent Quote Banner */}
      {item.replyToId && (
        <div
          onClick={() => replyParent && scrollToItem(replyParent.id)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] cursor-pointer transition-colors text-xs text-zinc-400 select-none group/quote"
        >
          <CornerUpLeft className="w-3 h-3 text-zinc-500 group-hover/quote:text-zinc-300 shrink-0" />
          {replyParent ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-mono text-2xs text-zinc-500 shrink-0">
                {replyParent.type === 'task' ? 'Таска' : replyParent.type === 'article' ? 'Статья' : 'Заметка'}:
              </span>
              <span className="text-zinc-300 truncate font-medium text-xs">
                {replyParent.title || replyParent.content.slice(0, 45)}
              </span>
            </div>
          ) : (
            <span className="text-2xs text-zinc-600 italic">Исходная запись удалена</span>
          )}
        </div>
      )}

      {/* Main Content Area */}
      {isTask ? (
        /* Task Variant */
        <div className="flex flex-col gap-2 pt-0.5">
          <div className="flex items-start gap-2.5">
            <button
              onClick={() => toggleTaskComplete(item.id)}
              title={item.status === 'done' ? 'Отметить как невыполненную' : 'Отметить как выполненную'}
              aria-label="Изменить статус задачи"
              className="mt-0.5 text-zinc-400 hover:text-white transition-colors shrink-0"
            >
              {item.status === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-500/10" />
              ) : (
                <Circle className="w-4 h-4 text-zinc-500 hover:text-zinc-300" />
              )}
            </button>

            <div className="flex-1 min-w-0">
              <h3
                className={`text-sm font-medium leading-snug tracking-tight ${
                  item.status === 'done'
                    ? 'line-through text-zinc-500'
                    : 'text-zinc-100'
                }`}
              >
                {item.title}
              </h3>

              {item.content && (
                <div className="mt-1 text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap font-normal">
                  {renderContentWithWikiLinks(item.content)}
                </div>
              )}
            </div>
          </div>

          {/* Subtasks Section - Flat Linear layout */}
          {item.subtasks && item.subtasks.length > 0 && (
            <div className="mt-1 pl-[26px] flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setIsSubtasksExpanded(!isSubtasksExpanded)}
                className="flex items-center gap-1.5 text-2xs font-mono text-zinc-500 cursor-pointer hover:text-zinc-300 select-none py-0.5 w-fit"
              >
                <span>
                  Подзадачи: {completedSubtasksCount} из {totalSubtasksCount}
                </span>
                {isSubtasksExpanded ? <ChevronUp className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
              </button>

              {isSubtasksExpanded && (
                <div className="flex flex-col gap-1.5">
                  {item.subtasks.map(st => (
                    <div
                      key={st.id}
                      onClick={() => toggleTaskComplete(item.id, st.id)}
                      className="flex items-center gap-2 cursor-pointer text-xs group/sub select-none"
                    >
                      <button
                        type="button"
                        aria-label={`Отметить подзадачу ${st.title}`}
                        className="text-zinc-500 group-hover/sub:text-zinc-300 transition-colors shrink-0"
                      >
                        {st.completed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-zinc-600 group-hover/sub:text-zinc-400" />
                        )}
                      </button>
                      <span
                        className={`text-xs ${
                          st.completed ? 'line-through text-zinc-500' : 'text-zinc-300'
                        }`}
                      >
                        {st.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : isArticle ? (
        /* Article Variant - Flat Linear Style, no nested card in card */
        <div className="flex flex-col gap-2 pt-0.5">
          <div className="flex items-start justify-between gap-3">
            <h3
              onClick={() => setIsArticleExpanded(!isArticleExpanded)}
              className="text-sm font-medium text-zinc-100 tracking-tight flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
            >
              <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
              <span>{item.title}</span>
            </h3>

            <button
              onClick={handleOpenArticle}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors shrink-0 font-mono"
              title="Открыть в полноэкранном фокус-редакторе (⌘E)"
            >
              <span>Фокус-редактор</span>
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>

          {isArticleExpanded ? (
            <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-normal pt-0.5">
              {renderContentWithWikiLinks(item.content)}
            </div>
          ) : (
            <p
              onClick={() => setIsArticleExpanded(true)}
              className="text-xs text-zinc-400 line-clamp-3 leading-relaxed font-normal cursor-pointer hover:text-zinc-300 transition-colors"
            >
              {item.summary || item.content.slice(0, 180)}
            </p>
          )}

          <div className="flex items-center pt-0.5 text-2xs">
            <button
              onClick={() => setIsArticleExpanded(!isArticleExpanded)}
              className="text-zinc-400 hover:text-zinc-200 transition-colors font-mono"
            >
              {isArticleExpanded ? 'Свернуть ↑' : `Читать полностью (${item.readingTimeMinutes || 2} мин) ↓`}
            </button>
          </div>
        </div>
      ) : (
        /* Note Variant */
        <div className="flex flex-col gap-1.5">
          {item.title && item.title !== item.content.slice(0, 40) && (
            <h3 className="text-sm font-semibold text-zinc-200 tracking-tight">
              {item.title}
            </h3>
          )}

          {item.content && (
            <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-normal">
              {renderContentWithWikiLinks(item.content)}
            </div>
          )}
        </div>
      )}

      {/* Video Circle Notes (Telegram style) */}
      {videoAttachments.map(att => (
        <div key={att.id} className="pt-1 flex">
          <VideoCirclePlayer src={att.dataUrl || ''} />
        </div>
      ))}

      {/* Audio Notes Player */}
      {audioAttachments.map(att => (
        <div key={att.id} className="pt-1">
          <AudioPlayer
            src={att.dataUrl || ''}
            duration={att.duration}
            size={att.size}
            waveform={att.waveform}
          />
        </div>
      ))}

      {/* Image Attachments Gallery (Obsidian/Linear Lightbox) */}
      {imageAttachments.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-1 max-w-md">
          {imageAttachments.map(img => (
            <div
              key={img.id}
              className="rounded-lg overflow-hidden border border-white/[0.06] bg-black/40 aspect-video flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => {
                const folderImages: LightboxImage[] = [];
                filteredItems.forEach(it => {
                  it.attachments?.forEach(att => {
                    if (att.type === 'image' && att.dataUrl) {
                      folderImages.push({
                        id: att.id,
                        name: att.name,
                        url: att.dataUrl,
                      });
                    }
                  });
                });
                const targetIdx = folderImages.findIndex(fi => fi.url === img.dataUrl);
                openLightbox(folderImages, Math.max(0, targetIdx));
              }}
            >
              <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* File Attachments */}
      {fileAttachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {fileAttachments.map(file => (
            <a
              key={file.id}
              href={file.dataUrl}
              download={file.name}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.06] text-xs text-zinc-300 border border-white/[0.05] transition-colors"
            >
              <Paperclip className="w-3 h-3 text-zinc-400" />
              <span className="truncate max-w-[150px]">{file.name}</span>
              <span className="text-[10px] text-zinc-500 font-mono">
                {Math.round(file.size / 1024)} KB
              </span>
            </a>
          ))}
        </div>
      )}

      {/* Bottom Bar: Tags + Timestamp (when no top metadata bar exists) */}
      <div className="flex items-center justify-between gap-2 pt-0.5 min-h-[16px]">
        {item.tags && item.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 items-center">
            {item.tags.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTagFilter(tag)}
                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                #{tag}
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}

        {!hasMetadata && (
          <span className="text-[10px] font-mono text-zinc-600 select-none ml-auto shrink-0">
            {formattedTime}
          </span>
        )}
      </div>

      {/* Replies Count Link */}
      {repliesCount > 0 && (
        <button
          onClick={() => {
            const firstReply = items.find(i => i.replyToId === item.id);
            if (firstReply) scrollToItem(firstReply.id);
          }}
          className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 hover:text-blue-400 transition-colors pt-1 select-none w-fit"
        >
          <CornerUpLeft className="w-3 h-3 rotate-180 text-zinc-500" />
          <span>{repliesCount} {repliesCount === 1 ? 'ответ' : repliesCount < 5 ? 'ответа' : 'ответов'}</span>
        </button>
      )}
      </div>
    </div>
  );
};
