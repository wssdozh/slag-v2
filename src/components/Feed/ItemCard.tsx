import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, LightboxImage, SlagAttachment } from '../../types';
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
  Pin,
  Sparkles,
  Loader2
} from 'lucide-react';
import { LinearSignalBars } from '../UI/PriorityBadge';
import { enrichAttachment, extractFocalContext } from '../../lib/attachmentEnrichment';
import { MarkdownRenderer } from '../UI/MarkdownRenderer';
import { TagChip } from '../UI/TagChip';

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
    setMobileActionSheetItem,
    updateItem,
    aiSettings,
    addToast
  } = useApp();

  const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(true);
  const [expandedOcrIds, setExpandedOcrIds] = useState<Set<string>>(new Set());
  const [swipeOffset, setSwipeOffset] = useState(0);

  const toggleOcr = (id: string) => {
    setExpandedOcrIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleEnrichAttachment = React.useCallback(async (targetAtt: SlagAttachment) => {
    if (!aiSettings.groqApiKey) {
      addToast('Укажите ключ Groq в настройках ИИ для распознавания', 'info');
      return;
    }
    const focalContext = extractFocalContext(item);
    const inFlightAttachments = item.attachments.map(a =>
      a.id === targetAtt.id ? { ...a, enrichmentStatus: 'processing' as const } : a
    );
    updateItem({ ...item, attachments: inFlightAttachments });

    try {
      const enriched = await enrichAttachment(targetAtt, focalContext, aiSettings);
      const updatedAttachments = item.attachments.map(a => a.id === targetAtt.id ? enriched : a);
      updateItem({ ...item, attachments: updatedAttachments });
    } catch {
      // quiet fallback
    }
  }, [aiSettings, item, updateItem, addToast]);

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

  const isPureVoice =
    audioAttachments.length === 1 &&
    videoAttachments.length === 0 &&
    imageAttachments.length === 0 &&
    fileAttachments.length === 0 &&
    !item.content.trim() &&
    !isTask &&
    !isArticle &&
    (!item.subtasks || item.subtasks.length === 0) &&
    (!item.tags || item.tags.length === 0) &&
    !item.replyToId &&
    !item.isPinned &&
    (!item.priority || item.priority === 'none');

  const isGenericMediaTitle = (title?: string) => {
    if (!title) return true;
    const t = title.trim().toLowerCase();
    return (
      t === 'голосовая заметка' ||
      t === 'изображение' ||
      t === 'видео-сообщение' ||
      t === 'заметка' ||
      t === 'черновик' ||
      t === 'новая заметка' ||
      t === 'без названия' ||
      t === 'untitled' ||
      t === 'вложение' ||
      item.attachments.some(a => a.name && a.name.toLowerCase() === t)
    );
  };

  // For notes, check if title is just an excerpt or prefix of the content
  const isTitleExcerptOfContent = Boolean(
    item.title &&
    item.content &&
    (item.content.trim().toLowerCase().startsWith(item.title.trim().toLowerCase()) ||
      item.title.trim().toLowerCase().startsWith(item.content.trim().toLowerCase()) ||
      item.content.trim().toLowerCase().startsWith(item.title.trim().toLowerCase().slice(0, 25)))
  );

  const shouldRenderNoteTitle = Boolean(
    item.title &&
    !isGenericMediaTitle(item.title) &&
    !isTitleExcerptOfContent
  );

  const handleImageClick = (img: SlagAttachment) => {
    const folderImages: LightboxImage[] = filteredItems.flatMap(it =>
      (it.attachments || [])
        .filter(att => att.type === 'image' && att.dataUrl)
        .map(att => ({
          id: att.id,
          name: att.name,
          url: att.dataUrl!,
          extractedText: att.extractedText,
          summary: att.summary,
          enrichmentStatus: att.enrichmentStatus,
          enrichmentError: att.enrichmentError,
          itemId: it.id,
        }))
    );
    const targetIdx = folderImages.findIndex(fi => fi.url === img.dataUrl);
    openLightbox(folderImages, Math.max(0, targetIdx));
  };

  const hasMetadata =
    isTask ||
    isArticle ||
    item.folder !== 'Входящие' ||
    Boolean(item.isPinned) ||
    Boolean(item.priority && item.priority !== 'none') ||
    Boolean(item.dueDate);

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

  const taskBodyContent = (() => {
    let text = item.content || '';
    if (item.subtasks && item.subtasks.length > 0) {
      text = text
        .split('\n')
        .filter(line => !/^\s*[-*+]\s*\[[ xX]\]\s*/.test(line))
        .join('\n')
        .trim();
    }
    if (item.title && text) {
      const normalizedTitle = item.title.trim().toLowerCase();
      const lines = text.split('\n');
      const firstLineClean = lines[0].replace(/^#+\s*/, '').trim().toLowerCase();
      if (firstLineClean === normalizedTitle) {
        text = lines.slice(1).join('\n').trim();
      }
    }
    return text;
  })();

  const isHighlighted = highlightedItemId === item.id;

  return (
    <div className={`relative max-w-2xl w-full mx-auto ${swipeOffset ? 'overflow-hidden' : ''}`}>
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
        className={`group relative flex flex-col ${
          isPureVoice ? 'gap-0 max-w-sm sm:max-w-md' : 'gap-1.5 w-full'
        } p-2.5 sm:p-3 rounded-xl transition-all cursor-default select-none ${
          isHighlighted
            ? 'bg-blue-500/10 border border-blue-500/40 item-highlight-pulse'
            : 'bg-[#141417]/80 hover:bg-[#161619] border border-white/[0.05]'
        }`}
      >
        {/* Action Buttons: desktop floating right on hover; mobile top-right inside card */}
        <div className="absolute top-2 right-2 sm:right-auto sm:left-full sm:pl-1.5 flex flex-col items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150 z-20 pointer-events-auto">
          <button
            onClick={() => setReplyTarget(item)}
            className="w-6 h-6 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer hidden sm:flex items-center justify-center"
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
            className="w-6 h-6 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer flex items-center justify-center"
            title="Действия"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Article Focus Editor Button in top-right corner */}
        {isArticle && (
          <button
            type="button"
            onClick={handleOpenArticle}
            className="absolute top-2 right-9 sm:top-2.5 sm:right-2.5 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer z-10"
            title="Открыть в фокус-редакторе (⌘E)"
            aria-label="Открыть в фокус-редакторе"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}

      {/* Top Header / Metadata Bar: Rendered ONLY when metadata exists */}
      {hasMetadata && (
        <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-500 pr-16 sm:pr-10">
          {/* Item Type: Plain text, no nested chips */}
          {isTask && (
            <span className="text-2xs font-mono text-zinc-400 font-medium">
              Таска
            </span>
          )}
          {isArticle && (
            <span className="text-2xs font-mono text-zinc-400 font-medium">
              Статья • {item.readingTimeMinutes || Math.max(1, Math.round((item.content?.split(/\s+/).length || 0) / 200))} мин
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
            <span className="flex items-center gap-1">
              <LinearSignalBars priority={item.priority} className="w-3 h-3" />
              <span
                className={`text-2xs uppercase font-mono font-medium ${
                  item.priority === 'high'
                    ? 'text-rose-400'
                    : item.priority === 'medium'
                    ? 'text-amber-400'
                    : 'text-zinc-500'
                }`}
              >
                {item.priority === 'high' ? 'Высокий' : item.priority === 'medium' ? 'Средний' : 'Низкий'}
              </span>
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
      )}

      {/* Reply Parent Quote Banner */}
      {item.replyToId && (
        <div
          onClick={() => replyParent && scrollToItem(replyParent.id)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors select-none group/quote pt-0.5"
        >
          <CornerUpLeft className="w-3.5 h-3.5 text-zinc-500 group-hover/quote:text-zinc-300 shrink-0" />
          {replyParent ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-mono text-2xs text-zinc-500 shrink-0">
                {replyParent.type === 'task' ? 'Таска' : replyParent.type === 'article' ? 'Статья' : 'Заметка'}:
              </span>
              <span className="text-zinc-400 group-hover/quote:text-zinc-200 truncate font-medium text-xs">
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

              {taskBodyContent && (
                <div className="mt-1 text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap font-normal">
                  <MarkdownRenderer content={taskBodyContent} onWikiLinkClick={scrollToItem} />
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
        /* Article Variant - Clean Teaser, opens Focus Editor on click */
        <div className="flex flex-col gap-1.5 pt-0.5">
          <h3
            onClick={handleOpenArticle}
            className="text-sm font-medium text-zinc-100 tracking-tight flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors pr-10 sm:pr-12"
          >
            <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>{item.title}</span>
          </h3>

          <p
            onClick={handleOpenArticle}
            className="text-xs text-zinc-400 line-clamp-3 leading-relaxed font-normal cursor-pointer hover:text-zinc-300 transition-colors"
          >
            {item.summary || item.content.slice(0, 200)}
          </p>
        </div>
      ) : (
        /* Note Variant */
        (shouldRenderNoteTitle || item.content) && (
          <div className="flex flex-col gap-1.5">
            {shouldRenderNoteTitle && (
              <h3 className="text-sm font-semibold text-zinc-200 tracking-tight">
                {item.title}
              </h3>
            )}

            {item.content && (
              <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-normal">
                <MarkdownRenderer content={item.content} onWikiLinkClick={scrollToItem} />
              </div>
            )}
          </div>
        )
      )}

      {/* Video Circle Notes (Telegram style) */}
      {videoAttachments.map(att => (
        <div key={att.id} className="pt-1 flex">
          <VideoCirclePlayer src={att.dataUrl || ''} />
        </div>
      ))}

      {/* Audio Notes Player */}
      {audioAttachments.map(att => (
        <div key={att.id} className="pt-0.5 w-full">
          <AudioPlayer
            src={att.dataUrl || ''}
            duration={att.duration}
            size={att.size}
            waveform={att.waveform}
            timeContext={isPureVoice ? formattedTime : undefined}
            transcript={att.extractedText}
            summary={att.summary}
            enrichmentStatus={att.enrichmentStatus}
            onEnrich={() => handleEnrichAttachment(att)}
          />
        </div>
      ))}

      {/* Image Attachments Gallery (Obsidian/Linear Lightbox) */}
      {imageAttachments.length > 0 && (
        <div className="pt-1 w-full flex flex-col gap-1">
          {imageAttachments.length === 1 ? (
            <div className="flex flex-col items-start max-w-full">
              <div
                className="relative rounded-lg overflow-hidden border border-white/[0.08] bg-black/30 min-w-[140px] min-h-[72px] max-h-[420px] max-w-full group/img flex items-center justify-center cursor-pointer hover:opacity-95 transition-opacity"
                onClick={() => handleImageClick(imageAttachments[0])}
              >
                <img
                  src={imageAttachments[0].dataUrl}
                  alt={imageAttachments[0].name}
                  className="w-auto h-auto max-h-[420px] max-w-full object-contain rounded-lg"
                />

                {/* Text action badge anchored in the bottom-right corner of the image */}
                {imageAttachments[0].extractedText ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleOcr(imageAttachments[0].id);
                    }}
                    className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/15 text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer select-none text-[11px] font-mono shadow-md active:scale-95 z-10"
                    title={expandedOcrIds.has(imageAttachments[0].id) ? 'Скрыть текст' : 'Показать текст с фото'}
                  >
                    <FileText className="w-3.5 h-3.5 text-zinc-300" />
                    <span>Текст</span>
                    <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${expandedOcrIds.has(imageAttachments[0].id) ? 'rotate-180' : ''}`} />
                  </button>
                ) : imageAttachments[0].enrichmentStatus === 'processing' ? (
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/15 text-zinc-300 text-[11px] font-mono flex items-center gap-1.5 shadow-md z-10 animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                    <span>Анализ...</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleEnrichAttachment(imageAttachments[0]);
                    }}
                    className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/15 text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer select-none text-[11px] font-mono shadow-md active:scale-95 z-10"
                    title="Распознать текст на изображении"
                  >
                    <Sparkles className="w-3 h-3 text-zinc-400" />
                    <span>{imageAttachments[0].enrichmentStatus === 'error' ? 'Повторить' : 'Текст'}</span>
                  </button>
                )}
              </div>

              {/* Extracted text accordion directly under the image */}
              {imageAttachments[0].extractedText && expandedOcrIds.has(imageAttachments[0].id) && (
                <div className="w-full mt-1.5 pt-1.5 border-t border-white/[0.08] text-xs font-mono text-zinc-300 leading-relaxed select-text whitespace-pre-wrap">
                  {imageAttachments[0].extractedText}
                </div>
              )}
            </div>
          ) : (
            <div
              className={`grid ${
                imageAttachments.length === 2 || imageAttachments.length === 4
                  ? 'grid-cols-2'
                  : imageAttachments.length === 3
                  ? 'grid-cols-3'
                  : 'grid-cols-2 sm:grid-cols-3'
              } gap-1.5 w-full`}
            >
              {imageAttachments.map(img => (
                <div key={img.id} className="flex flex-col">
                  <div
                    className="rounded-lg overflow-hidden border border-white/[0.08] bg-black/30 aspect-[4/3] flex items-center justify-center cursor-pointer hover:opacity-95 transition-opacity"
                    onClick={() => handleImageClick(img)}
                  >
                    <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                  </div>
                  {img.extractedText && (
                    <div className="w-full mt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleOcr(img.id);
                        }}
                        className="text-[9px] text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-0.5 cursor-pointer select-none font-mono"
                      >
                        <span>{expandedOcrIds.has(img.id) ? 'Скрыть текст' : 'Текст'}</span>
                        <ChevronDown className={`w-2.5 h-2.5 transition-transform ${expandedOcrIds.has(img.id) ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedOcrIds.has(img.id) && (
                        <div className="mt-0.5 pt-0.5 pl-2 border-l border-white/10 text-[11px] font-mono text-zinc-300 leading-relaxed select-text whitespace-pre-wrap">
                          {img.extractedText}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* File Attachments */}
      {fileAttachments.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          {fileAttachments.map(file => (
            <div key={file.id} className="flex items-center gap-2 flex-wrap">
              <a
                href={file.dataUrl}
                download={file.name}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.06] text-xs text-zinc-300 border border-white/[0.05] transition-colors shrink-0"
              >
                <Paperclip className="w-3 h-3 text-zinc-400" />
                <span className="truncate max-w-[150px]">{file.name}</span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {Math.round(file.size / 1024)} KB
                </span>
              </a>
              {file.summary && (
                <span className="text-[11px] text-zinc-400 truncate max-w-[320px] font-sans" title={file.summary}>
                  → {file.summary}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bottom Bar: Tags on left + Timestamp on right (identical typography, exact same line) */}
      {(!isPureVoice || (item.tags && item.tags.length > 0)) && (
        <div className="flex items-center justify-between gap-2 pt-0.5 min-h-[16px] w-full select-none">
          {item.tags && item.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2 items-center min-w-0">
              {item.tags.map(tag => (
                <TagChip
                  key={tag}
                  tag={tag}
                  variant="flat"
                  onClick={() => setActiveTagFilter(tag)}
                />
              ))}
            </div>
          ) : (
            <div />
          )}

          {!isPureVoice && (
            <span className="text-[11px] font-mono text-zinc-500 select-none ml-auto shrink-0 leading-none">
              {formattedTime}
            </span>
          )}
        </div>
      )}

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
