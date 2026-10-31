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
  Calendar,
  ChevronDown,
  ChevronUp,
  FileText,
  CornerUpLeft,
  Pin,
  Sparkles,
  Loader2,
  Flame,
  Download
} from 'lucide-react';
import { LinearSignalBars } from '../UI/PriorityBadge';
import { enrichAttachment, extractFocalContext } from '../../lib/attachmentEnrichment';
import { MarkdownRenderer } from '../UI/MarkdownRenderer';
import { TagChip } from '../UI/TagChip';

export interface ItemCardProps {
  item: SlagItem;
  isHighlighted?: boolean;
  repliesCount?: number;
  firstReplyId?: string | null;
  replyParent?: SlagItem | null;
  onImageClick?: (img: SlagAttachment, currentItem: SlagItem) => void;
}

const formatDueDate = (rawDate?: string): string => {
  if (!rawDate) return '';
  const parts = rawDate.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(monthIdx) && !isNaN(day) && monthIdx >= 0 && monthIdx < 12) {
      const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
      const currentYear = new Date().getFullYear();
      if (year === currentYear) {
        return `${day} ${months[monthIdx]}`;
      }
      return `${day} ${months[monthIdx]} ${year}`;
    }
  }
  return rawDate;
};

const isGenericTitle = (title?: string): boolean => {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  return (
    t === 'заметка' ||
    t === 'новая заметка' ||
    t === 'голосовая заметка' ||
    t === 'видео-сообщение' ||
    t === 'видеосообщение' ||
    t === 'изображение' ||
    t === 'вложение' ||
    t === 'черновик' ||
    t === 'без названия'
  );
};

const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ItemCardComponent: React.FC<ItemCardProps> = ({
  item,
  isHighlighted = false,
  repliesCount = 0,
  firstReplyId = null,
  replyParent = null,
  onImageClick,
}) => {
  const {
    toggleTaskComplete,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    setActiveTagFilter,
    openContextMenu,
    setReplyTarget,
    scrollToItem,
    navigateToFolder,
    currentFolder,
    openLightbox,
    isMobile,
    setMobileActionSheetItem,
    updateItem,
    aiSettings,
    addToast
  } = useApp();

  const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(true);
  const [isTagsExpanded, setIsTagsExpanded] = useState(false);
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

  const isPureFile =
    fileAttachments.length === 1 &&
    audioAttachments.length === 0 &&
    videoAttachments.length === 0 &&
    imageAttachments.length === 0 &&
    !item.content.trim() &&
    !isTask &&
    !isArticle &&
    (!item.subtasks || item.subtasks.length === 0) &&
    (!item.tags || item.tags.length === 0) &&
    !item.replyToId &&
    !item.isPinned &&
    (!item.priority || item.priority === 'none');

  const handleImageClick = (img: SlagAttachment) => {
    if (onImageClick) {
      onImageClick(img, item);
      return;
    }
    const itemImages: LightboxImage[] = (item.attachments || [])
      .filter(att => att.type === 'image' && att.dataUrl)
      .map(att => ({
        id: att.id,
        name: att.name,
        url: att.dataUrl!,
        extractedText: att.extractedText,
        summary: att.summary,
        enrichmentStatus: att.enrichmentStatus,
        enrichmentError: att.enrichmentError,
        sourceItem: item,
      }));
    const clickedIdx = itemImages.findIndex(i => i.id === img.id);
    openLightbox(itemImages, clickedIdx >= 0 ? clickedIdx : 0);
  };

  const folderDisplayName =
    item.folder !== 'Входящие'
      ? item.folder.split('/').filter(Boolean).pop() || item.folder
      : currentFolder !== 'Входящие'
        ? 'Входящие'
        : '';

  const metaElements: React.ReactNode[] = [];

  if (folderDisplayName) {
    metaElements.push(
      <button
        key="folder"
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          navigateToFolder(item.folder, item.id);
        }}
        className="text-2xs text-zinc-500 hover:text-zinc-200 font-mono transition-colors cursor-pointer hover:underline underline-offset-2 truncate max-w-[140px] text-left leading-none inline-flex items-center"
        title={`Перейти в папку «${item.folder}» и перейти к этой записи`}
      >
        {folderDisplayName}
      </button>
    );
  }

  if (isArticle) {
    metaElements.push(
      <span
        key="article"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          openContextMenu({
            x: rect.left,
            y: rect.bottom + 4,
            type: 'item',
            item,
          });
        }}
        className="text-2xs font-mono text-zinc-400 hover:text-white cursor-pointer transition-colors"
        title="Сменить тип записи (клик или ПКМ)"
      >
        Статья
      </span>
    );
  }

  if (isTask && item.priority && item.priority !== 'none') {
    const priorityLabel =
      item.priority === 'high' ? 'Высокий' : item.priority === 'medium' ? 'Средний' : 'Низкий';
    metaElements.push(
      <span
        key="priority"
        className="flex items-center"
        title={`Приоритет: ${priorityLabel}`}
        aria-label={`Приоритет: ${priorityLabel}`}
      >
        <LinearSignalBars priority={item.priority} className="w-3.5 h-3.5" />
      </span>
    );
  }

  if (isTask && item.dueDate) {
    metaElements.push(
      <span
        key="due"
        className="flex items-center gap-1 text-2xs text-zinc-500 font-mono"
        title={`Срок: ${item.dueDate}`}
      >
        <Calendar className="w-3 h-3 text-zinc-600" />
        <span>{formatDueDate(item.dueDate)}</span>
      </span>
    );
  }

  if (isTask && item.recurrence) {
    const streak = item.streak ?? 0;
    const isZero = streak === 0;
    metaElements.push(
      <span
        key="streak"
        className="flex items-center gap-1 text-2xs font-mono select-none"
        title={isZero ? 'Серия прервана (0)' : `Серия: ${streak}`}
      >
        <Flame
          className={`w-3 h-3 shrink-0 ${
            isZero ? 'text-rose-400/80' : 'text-amber-400/90'
          }`}
        />
        <span className={isZero ? 'text-rose-400/80 font-medium' : 'text-zinc-400 font-medium'}>
          {streak}
        </span>
      </span>
    );
  }

  if (item.isPinned) {
    metaElements.push(
      <span
        key="pin"
        className="flex items-center gap-1 text-2xs font-mono text-amber-400/90"
        title="Закрепленная запись"
      >
        <Pin className="w-2.5 h-2.5 rotate-45 shrink-0" />
        <span>Закреп</span>
      </span>
    );
  }

  const hasBottomMeta =
    metaElements.length > 0 || Boolean(item.tags && item.tags.length > 0);

  const shouldRenderBottomBar = (!isPureVoice && !isPureFile) || hasBottomMeta;

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
    // If dragging an interactive element (wiki-link, tag, button, input), prevent card drag
    const target = e.target as HTMLElement | null;
    if (target?.closest('a, button, [role="button"], input, textarea, .cursor-pointer')) {
      e.preventDefault();
      return;
    }
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

  return (
    <div className={`relative max-w-2xl w-full mx-auto feed-card-contain ${swipeOffset ? 'overflow-hidden' : ''}`}>
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
          isPureVoice || isPureFile ? 'gap-0 max-w-sm sm:max-w-md' : 'gap-1.5 w-full'
        } p-2.5 sm:p-3 rounded-xl transition-all cursor-default select-none ${
          isHighlighted
            ? 'bg-blue-500/10 border border-blue-500/40 item-highlight-pulse'
            : 'bg-surface/80 hover:bg-surface-hover border border-white/[0.05]'
        }`}
      >
        {/* Action Buttons: desktop inside card for full-width items; floating right for pure voice/file bubbles */}
        <div
          className={`absolute top-2 right-2 ${
            isPureVoice || isPureFile
              ? 'sm:right-auto sm:left-full sm:pl-1.5 flex flex-col'
              : 'sm:top-2.5 sm:right-2.5 flex items-center'
          } gap-1 sm:gap-0 sm:group-hover:gap-1 transition-all duration-150 z-20 pointer-events-auto`}
        >
          <button
            onClick={() => setReplyTarget(item)}
            className="h-6 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-all duration-150 cursor-pointer hidden sm:flex items-center justify-center shrink-0 sm:w-0 sm:opacity-0 sm:overflow-hidden sm:group-hover:w-6 sm:group-hover:opacity-100"
            title="Ответить (R)"
          >
            <CornerUpLeft className="w-3.5 h-3.5 shrink-0" />
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
            className="w-6 h-6 sm:w-0 sm:opacity-0 sm:overflow-hidden sm:group-hover:w-6 sm:group-hover:opacity-100 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-all duration-150 cursor-pointer flex items-center justify-center shrink-0"
            title="Действия"
          >
            <MoreVertical className="w-3.5 h-3.5 shrink-0" />
          </button>

          {/* Article Focus Editor Button in top-right corner - kept in place on the far right */}
          {isArticle && (
            <button
              type="button"
              onClick={handleOpenArticle}
              className="w-6 h-6 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer flex items-center justify-center shrink-0"
              title="Открыть в фокус-редакторе (⌘E)"
              aria-label="Открыть в фокус-редакторе"
            >
              <Maximize2 className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}
        </div>

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

            <div className="flex-1 min-w-0 pr-14 sm:pr-16">
              <h3
                className={`text-base font-medium leading-snug tracking-tight ${
                  item.status === 'done'
                    ? 'line-through text-zinc-500'
                    : 'text-zinc-100'
                }`}
              >
                <MarkdownRenderer
                  content={item.title}
                  inline
                  onWikiLinkClick={scrollToItem}
                  className={item.status === 'done' ? 'line-through text-zinc-500' : 'text-zinc-100'}
                />
              </h3>

              {taskBodyContent && (
                <div className="mt-1 text-sm text-zinc-300 leading-relaxed font-normal">
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
                      className="flex items-center gap-2 cursor-pointer text-xs sm:text-ui group/sub select-none"
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
                        className={`text-xs sm:text-ui flex-1 min-w-0 ${
                          st.completed ? 'line-through text-zinc-500' : 'text-zinc-300'
                        }`}
                      >
                        <MarkdownRenderer
                          content={st.title}
                          inline
                          onWikiLinkClick={scrollToItem}
                          className={st.completed ? 'line-through text-zinc-500' : 'text-zinc-300'}
                        />
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
            className="text-base font-medium text-zinc-100 tracking-tight flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors pr-14 sm:pr-20"
          >
            <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>{item.title}</span>
          </h3>

          <p
            onClick={handleOpenArticle}
            className="text-sm text-zinc-300 line-clamp-3 leading-relaxed font-normal cursor-pointer hover:text-zinc-100 transition-colors"
          >
            {item.summary || item.content.slice(0, 200)}
          </p>
        </div>
      ) : (
        /* Note Variant: pure stream note without title header (title is managed only in Focus Editor) */
        (() => {
          const hasContent = Boolean(item.content && item.content.trim());
          const hasAttachments = Boolean(item.attachments && item.attachments.length > 0);
          const textToRender = hasContent
            ? item.content
            : (!hasAttachments && item.title && !isGenericTitle(item.title) ? item.title : null);

          if (!textToRender) return null;

          return (
            <div className="flex flex-col gap-1.5 pr-14 sm:pr-16">
              <div className="text-sm text-zinc-200 leading-relaxed font-normal whitespace-pre-wrap">
                <MarkdownRenderer content={textToRender} onWikiLinkClick={scrollToItem} />
              </div>
            </div>
          );
        })()
      )}

      {/* Video Circle Notes (Telegram style) */}
      {videoAttachments.map(att => (
        <div key={att.id} className="pt-1 flex">
          <VideoCirclePlayer src={att.dataUrl || ''} />
        </div>
      ))}

      {/* Audio Notes Player */}
      {audioAttachments.map(att => (
        <div key={att.id} className={isPureVoice ? 'w-full' : 'pt-0.5 w-full'}>
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
                  loading="lazy"
                  decoding="async"
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
                    className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/15 text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer select-none text-2xs font-mono shadow-md active:scale-95 z-10"
                    title={expandedOcrIds.has(imageAttachments[0].id) ? 'Скрыть текст' : 'Показать текст с фото'}
                  >
                    <FileText className="w-3.5 h-3.5 text-zinc-300" />
                    <span>Текст</span>
                    <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${expandedOcrIds.has(imageAttachments[0].id) ? 'rotate-180' : ''}`} />
                  </button>
                ) : imageAttachments[0].enrichmentStatus === 'processing' ? (
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/15 text-zinc-300 text-2xs font-mono flex items-center gap-1.5 shadow-md z-10 animate-pulse">
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
                    className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/15 text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer select-none text-2xs font-mono shadow-md active:scale-95 z-10"
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
                    <img
                      src={img.dataUrl}
                      alt={img.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {img.extractedText && (
                    <div className="w-full mt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleOcr(img.id);
                        }}
                        className="text-2xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-0.5 cursor-pointer select-none font-mono"
                      >
                        <span>{expandedOcrIds.has(img.id) ? 'Скрыть текст' : 'Текст'}</span>
                        <ChevronDown className={`w-2.5 h-2.5 transition-transform ${expandedOcrIds.has(img.id) ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedOcrIds.has(img.id) && (
                        <div className="mt-0.5 pt-0.5 pl-2 border-l border-white/10 text-2xs font-mono text-zinc-300 leading-relaxed select-text whitespace-pre-wrap">
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
        <div className={`flex flex-col gap-1.5 ${isPureFile ? 'w-full' : 'pt-1 w-full'}`}>
          {fileAttachments.map(file => (
            <a
              key={file.id}
              href={file.dataUrl}
              download={file.name}
              className={
                isPureFile
                  ? 'flex items-center gap-2.5 sm:gap-3 w-full select-none group/file cursor-pointer'
                  : 'flex items-center gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] transition-all group/file select-none cursor-pointer w-full'
              }
            >
              {/* Pure File Icon without podlozhka */}
              <FileText className="w-5 h-5 text-zinc-400 group-hover/file:text-zinc-200 transition-colors shrink-0" />

              {/* Filename & Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                  <span
                    className="text-sm font-medium text-zinc-200 group-hover/file:text-white truncate font-sans"
                    title={file.name}
                  >
                    {file.name}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-sans truncate">
                    <span className="font-mono text-zinc-400">{formatBytes(file.size)}</span>
                    {file.summary && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-zinc-600 shrink-0" />
                        <span className="truncate text-zinc-400" title={file.summary}>
                          {file.summary}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right Action: Timestamp + Download for pure file, or Download icon */}
                <div className="flex items-center gap-2 shrink-0 ml-1">
                  {isPureFile && (
                    <span className="text-2xs font-mono text-zinc-500 select-none leading-none">
                      {formattedTime}
                    </span>
                  )}
                  <div
                    className="w-7 h-7 rounded-lg text-zinc-400 group-hover/file:text-white group-hover/file:bg-white/[0.08] flex items-center justify-center transition-all"
                    title="Скачать файл"
                  >
                    <Download className="w-4 h-4" />
                  </div>
                </div>
              </a>
            ))}
        </div>
      )}

      {/* Bottom Bar: Metadata & Tags on left + Timestamp on right */}
      {shouldRenderBottomBar && (
        <div className="flex items-center justify-between gap-2 pt-1 min-h-[16px] w-full select-none">
          {hasBottomMeta ? (
            <div className="flex flex-wrap gap-x-2 gap-y-1 items-center min-w-0">
              {metaElements.map((el, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="w-1 h-1 rounded-full bg-zinc-600/80 inline-block shrink-0" />}
                  {el}
                </React.Fragment>
              ))}

              {/* Separator between metadata and tags */}
              {metaElements.length > 0 && item.tags && item.tags.length > 0 && (
                <span className="w-1 h-1 rounded-full bg-zinc-600/80 inline-block shrink-0" />
              )}

              {/* Tags with overflow folding */}
              {item.tags && item.tags.length > 0 && (() => {
                const maxVisible = 3;
                const hasOverflow = item.tags.length > maxVisible;
                const visibleTags = isTagsExpanded || !hasOverflow ? item.tags : item.tags.slice(0, maxVisible);
                const hiddenCount = item.tags.length - maxVisible;

                return (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {visibleTags.map(tag => (
                      <TagChip
                        key={tag}
                        tag={tag}
                        variant="flat"
                        onClick={() => setActiveTagFilter(tag)}
                      />
                    ))}
                    {hasOverflow && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsTagsExpanded(prev => !prev);
                        }}
                        className="text-2xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer select-none leading-none"
                        title={isTagsExpanded ? 'Свернуть теги' : `Показать ещё ${hiddenCount} тегов`}
                      >
                        {isTagsExpanded ? 'свернуть' : `+${hiddenCount}`}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div />
          )}

          {!isPureVoice && (
            <span className="text-2xs font-mono text-zinc-500 select-none ml-auto shrink-0 leading-none">
              {formattedTime}
            </span>
          )}
        </div>
      )}

      {/* Replies Count Link */}
      {repliesCount > 0 && (
        <button
          onClick={() => {
            if (firstReplyId) scrollToItem(firstReplyId);
          }}
          className="flex items-center gap-1.5 text-2xs font-mono text-zinc-500 hover:text-blue-400 transition-colors pt-1 select-none w-fit"
        >
          <CornerUpLeft className="w-3 h-3 rotate-180 text-zinc-500" />
          <span>{repliesCount} {repliesCount === 1 ? 'ответ' : repliesCount < 5 ? 'ответа' : 'ответов'}</span>
        </button>
      )}
      </div>
    </div>
  );
};

export const ItemCard = React.memo(ItemCardComponent);

