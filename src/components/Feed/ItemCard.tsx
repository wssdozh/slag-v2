import { formatBytes } from '../../lib/text/formatBytes';
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, LightboxImage, SlagAttachment } from '../../types';
import { AudioPlayer } from '../UI/AudioPlayer';
import { VideoCirclePlayer } from '../UI/VideoCirclePlayer';
import { TaskStatusMark } from '../UI/TaskStatusMark';
import {
  Maximize2,
  Calendar,
  ChevronDown,
  FileText,
  CornerUpLeft,
  Pin,
  Sparkles,
  Loader2,
  Flame,
  Download,
  ImageOff
} from 'lucide-react';
import { LinearSignalBars } from '../UI/PriorityBadge';
import { canEnrichAttachments, enrichAttachment, extractFocalContext } from '../../lib/media/attachmentEnrichment';
import { MarkdownRenderer } from '../UI/MarkdownRenderer';
import { useAttachmentSrcs } from '../../hooks/media/useAttachmentSrc';
import { UI_DELAYS, DEFAULT_INBOX_FOLDER } from '../../config';
import { TagChip } from '../UI/TagChip';

const CARD_TRANSITION =
  'transform var(--slag-motion-base) var(--ease-standard), ' +
  'background-color var(--slag-motion-base) var(--ease-standard), ' +
  'border-color var(--slag-motion-base) var(--ease-standard)';

/** One picture never eats the column: 320 tall, and never wider than 416 even as a panorama. */
const THUMB_MAX_HEIGHT = 320;
const THUMB_MAX_WIDTH = 416;

type CardShape = 'voice' | 'file' | 'video' | 'image' | 'mixed';

/**
 * A card that is nothing but its attachment becomes a bubble; one kind of picture does it even
 * as a pile. Text, chips, tasks and mixed attachments keep the full row: they need the width.
 */
const cardShape = (
  item: SlagItem,
  counts: { audio: number; video: number; image: number; file: number },
): CardShape => {
  const bare =
    item.type === 'note' &&
    !item.content.trim() &&
    (!item.subtasks || item.subtasks.length === 0) &&
    (!item.tags || item.tags.length === 0) &&
    !item.replyToId &&
    !item.isPinned &&
    (!item.priority || item.priority === 'none');
  if (!bare) return 'mixed';
  if (counts.image > 0) return counts.audio + counts.video + counts.file > 0 ? 'mixed' : 'image';
  if (counts.audio > 0) return counts.audio + counts.video + counts.file > 1 ? 'mixed' : 'voice';
  if (counts.video > 0) return counts.video + counts.file > 1 ? 'mixed' : 'video';
  return counts.file === 1 ? 'file' : 'mixed';
};

/** A pile of pictures fills one canvas: the first frame gets a row of its own. */
const albumRowSizes = (count: number): number[] => {
  if (count === 2) return [2];
  if (count === 3) return [1, 2];
  if (count === 4) return [2, 2];
  if (count === 5) return [2, 3];
  return [3, 3];
};

export interface ItemCardProps {
  item: SlagItem;
  isHighlighted?: boolean;
  repliesCount?: number;
  firstReplyId?: string | null;
  replyParent?: SlagItem | null;
  onImageClick?: (img: SlagAttachment, currentItem: SlagItem) => void;
  /** Layout offset from the list (the gap between two notes), merged into the card box. */
  style?: React.CSSProperties;
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


const ItemCardComponent: React.FC<ItemCardProps> = ({
  item,
  isHighlighted = false,
  repliesCount = 0,
  firstReplyId = null,
  replyParent = null,
  onImageClick,
  style,
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
  const [visibleTagCount, setVisibleTagCount] = useState(0);
  const [tagsRowWidth, setTagsRowWidth] = useState(0);
  const tagsRowRef = useRef<HTMLDivElement | null>(null);

  const toggleOcr = (id: string) => {
    setExpandedOcrIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleEnrichAttachment = React.useCallback(async (targetAtt: SlagAttachment) => {
    if (!canEnrichAttachments(aiSettings)) {
      addToast('Подписка неактивна, а свой ключ Groq не указан — распознавание недоступно', 'info');
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
  const tapTimerRef = useRef<number | null>(null);
  const lastTapAtRef = useRef(0);
  const suppressTapRef = useRef(false);

  // ponytail: замер ряда даёт лишний reflow на карточку; IntersectionObserver на чип, если карточки потяжелеют
  useLayoutEffect(() => {
    const row = tagsRowRef.current;
    if (!row || !item.tags || item.tags.length === 0) return;

    // Невидимые чипы остаются в раскладке, поэтому замер видит все теги сразу
    // и не зависит от того, сколько показано в прошлом проходе.
    let usedPx = 0;
    let count = 0;
    const limit = row.clientWidth;
    for (const child of Array.from(row.children) as HTMLElement[]) {
      if (child.dataset.tagOverflow === '1' || child.offsetWidth === 0) continue;
      usedPx += child.offsetWidth + 6;
      if (usedPx <= limit) count += 1;
    }
    const next = Math.max(1, count);
    setVisibleTagCount(prev => (prev === next ? prev : next));

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setTagsRowWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, [item.tags, tagsRowWidth]);

  const copyItemText = () => {
    const text = (item.content || '').trim() || item.title;
    navigator.clipboard
      .writeText(text)
      .then(() => addToast('Текст скопирован', 'success'))
      .catch(() => addToast('Не удалось скопировать', 'error'));
    try {
      navigator.vibrate?.(10);
    } catch {
      // Ignore: вибрация не критична
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (!isMobile) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, [role="button"], .cursor-pointer')) return;
    if (suppressTapRef.current) {
      suppressTapRef.current = false;
      return;
    }
    const now = performance.now();
    if (now - lastTapAtRef.current < UI_DELAYS.DOUBLE_TAP_MS) {
      lastTapAtRef.current = 0;
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      copyItemText();
      return;
    }
    lastTapAtRef.current = now;
    tapTimerRef.current = window.setTimeout(() => {
      tapTimerRef.current = null;
      setSelectedItem(item);
      setIsFullscreenEditorOpen(true);
    }, UI_DELAYS.DOUBLE_TAP_MS);
  };

  useEffect(() => () => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }

    longPressTimerRef.current = window.setTimeout(() => {
      try {
        navigator.vibrate?.(UI_DELAYS.HAPTIC_VIBRATION_MS);
      } catch {
        // Ignore
      }
      setMobileActionSheetItem(item);
      suppressTapRef.current = true;
      longPressTimerRef.current = null;
    }, UI_DELAYS.LONG_PRESS_MS);
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
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
    }

    // Horizontal swipe left for reply (Telegram style)
    if (dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
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

  // A picture sizes itself from its own proportions: height has a ceiling, width follows the
  // ratio. Without the loaded ratio the browser inflates the box to the unclamped width.
  const [firstImageRatio, setFirstImageRatio] = useState<number | null>(null);

  const isTask = item.type === 'task';
  const isArticle = item.type === 'article';

  const audioAttachments = item.attachments.filter(a => a.type === 'audio');
  const videoAttachments = item.attachments.filter(a => a.type === 'video');
  const imageAttachments = item.attachments.filter(a => a.type === 'image');
  const fileAttachments = item.attachments.filter(a => a.type === 'file');
  // Bytes are not in the note any more: they are resolved from IndexedDB or `.attachments/`.
  const attachmentSrcs = useAttachmentSrcs(item.attachments);

  const completedSubtasksCount = item.subtasks?.filter(s => s.completed).length || 0;
  const totalSubtasksCount = item.subtasks?.length || 0;

  const shape = cardShape(item, {
    audio: audioAttachments.length,
    video: videoAttachments.length,
    image: imageAttachments.length,
    file: fileAttachments.length,
  });
  const isVoiceBubble = shape === 'voice';
  const isFileBubble = shape === 'file';

  // A picture hugs its own width instead of pulling a column-wide slab behind it. The one
  // exception is the open OCR panel: prose needs a column, not a 200px strip.
  const isPictureBubble = shape === 'image' && expandedOcrIds.size === 0;

  // A note can point at a file that is not on disk (an id that moved, an upload that never
  // landed). The card says so quietly instead of drawing the browser's broken-image icon.
  const heroSrc = attachmentSrcs[imageAttachments[0]?.id ?? ''] ?? imageAttachments[0]?.dataUrl;
  const albumSrc = (image: SlagAttachment) => attachmentSrcs[image.id] ?? image.dataUrl;

  // A pile of pictures fills one canvas: the first frame is the biggest, the rest catch up in
  // rows. Six is the ceiling — the sixth slot counts what did not fit.
  const albumShown = imageAttachments.length > 6 ? 5 : imageAttachments.length;
  const albumHidden = imageAttachments.length - albumShown;
  const albumRows = albumRowSizes(imageAttachments.length);
  const albumTiles = imageAttachments.slice(0, albumShown).map((image) => ({ image, hidden: 0 }));
  if (albumHidden > 0) albumTiles.push({ image: imageAttachments[albumShown], hidden: albumHidden });
  const albumRowStarts = albumRows.map((_, rowIndex) =>
    albumRows.slice(0, rowIndex).reduce((sum, perRow) => sum + perRow, 0),
  );

  const handleImageClick = (img: SlagAttachment) => {
    if (onImageClick) {
      onImageClick(img, item);
      return;
    }
    // One deck for the whole note: a photo and a clip page next to each other, as they do
    // in every messenger. `kind` is what the viewer reads to pick a slide.
    const itemImages: LightboxImage[] = (item.attachments || [])
      .filter(att => att.type === 'image' || att.type === 'video')
      .map(att => ({
        id: att.id,
        name: att.name,
        url: attachmentSrcs[att.id] ?? att.dataUrl ?? '',
        kind: att.type === 'video' ? 'video' : 'image',
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
    item.folder !== DEFAULT_INBOX_FOLDER
      ? item.folder.split('/').filter(Boolean).pop() || item.folder
      : currentFolder !== DEFAULT_INBOX_FOLDER
        ? DEFAULT_INBOX_FOLDER
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
        className="text-2xs text-zinc-500 hover:text-zinc-200 font-mono transition-colors cursor-pointer hover:underline underline-offset-2 truncate max-w-[96px] text-left leading-none inline-flex items-center shrink-0"
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
        className="text-2xs font-mono text-zinc-500 hover:text-zinc-200 cursor-pointer transition-colors hover:underline underline-offset-2 shrink-0"
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
        className="flex items-center shrink-0"
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
        className="flex items-center gap-1 text-2xs text-zinc-500 font-mono shrink-0"
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
        className="flex items-center gap-1 text-2xs font-mono select-none shrink-0"
        title={isZero ? 'Серия прервана (0)' : `Серия: ${streak}`}
      >
        <Flame
          className={`w-3 h-3 shrink-0 ${
            isZero ? 'text-rose-400/80' : 'text-amber-400/90'
          }`}
        />
        <span className={isZero ? 'text-rose-400/80 font-medium' : 'text-zinc-500 font-medium'}>
          {streak}
        </span>
      </span>
    );
  }

  if (item.isPinned) {
    metaElements.push(
      <span
        key="pin"
        className="flex items-center gap-1 text-2xs font-mono text-amber-400/90 shrink-0"
        title="Закрепленная запись"
      >
        <Pin className="w-2.5 h-2.5 rotate-45 shrink-0" />
        <span>Закреп</span>
      </span>
    );
  }

  const hasBottomMeta =
    metaElements.length > 0 || Boolean(item.tags && item.tags.length > 0);

  const shouldRenderBottomBar = (shape !== 'voice' && shape !== 'file') || hasBottomMeta;

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
    <div className={`relative w-full mx-auto feed-card-contain ${swipeOffset ? 'overflow-hidden' : ''}`}>
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
        data-flip-id={item.id}
        onClick={handleCardClick}
        draggable={!isMobile}
        onDragStart={handleDragStart}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
          // One declaration for the card: a separate `transition-colors` class would
          // be overridden here, which is why the hover colour used to snap.
          transition: swipeOffset ? 'none' : CARD_TRANSITION,
          ...style,
        }}
        className={`group relative flex flex-col ${
          isVoiceBubble || isFileBubble
            ? 'gap-0 max-w-sm sm:max-w-md'
            : isPictureBubble || shape === 'video'
              ? 'gap-0 w-fit max-w-full'
              : 'gap-1.5 w-full'
        } p-2.5 sm:p-3 rounded-xl cursor-default select-none ${
          isHighlighted
            ? 'bg-accent/10 border border-accent/40 item-highlight-pulse'
            : 'bg-surface hover:bg-surface-hover'
        }`}
      >
        {/* Action Buttons: desktop inside card for full-width items; floating right for pure voice/file bubbles */}
        <div
          className={`absolute top-1.5 right-1.5 sm:top-2 sm:right-2 ${
            isVoiceBubble || isFileBubble || isPictureBubble || shape === 'video'
              ? 'sm:right-auto sm:left-full sm:pl-1.5 flex flex-col'
              : 'flex items-center'
          } gap-1 sm:gap-0 sm:group-hover:gap-1 z-20 pointer-events-auto`}
        >
          <button
            onClick={() => setReplyTarget(item)}
            className="w-7 h-7 sm:w-0 sm:h-6 sm:opacity-0 sm:overflow-hidden sm:group-hover:w-6 sm:group-hover:opacity-100 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-[color,background-color,opacity,width] duration-150 cursor-pointer hidden sm:flex items-center justify-center shrink-0"
            title="Ответить (R)"
          >
            <CornerUpLeft className="w-3.5 h-3.5 shrink-0" />
          </button>

          {/* Действия с карточкой живут на ПКМ: кнопка в углу дублировала меню и шумела. */}

          {/* Article Focus Editor Button in top-right corner - kept in place on the far right */}
          {isArticle && (
            <button
              type="button"
              onClick={handleOpenArticle}
              className="w-7 h-7 sm:w-6 sm:h-6 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer flex items-center justify-center shrink-0"
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
              aria-label="Изменить статус таски"
              className="mt-0.5 text-zinc-400 hover:text-white transition-colors shrink-0"
            >
              <TaskStatusMark done={item.status === 'done'} className="w-4 h-4" />
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
                aria-expanded={isSubtasksExpanded}
                aria-label={`Подзадачи: ${completedSubtasksCount} из ${totalSubtasksCount}`}
                className="flex items-center gap-1.5 text-2xs font-mono text-zinc-500 cursor-pointer hover:text-zinc-300 select-none py-0.5 w-fit"
              >
                <span>
                  Подзадачи: {completedSubtasksCount} из {totalSubtasksCount}
                </span>
                <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform duration-200 ease-out ${isSubtasksExpanded ? 'rotate-180' : ''}`} />
              </button>

              <div
                className="motion-accordion"
                data-expanded={isSubtasksExpanded}
                aria-hidden={!isSubtasksExpanded}
              >
                <div className="motion-accordion-inner flex flex-col gap-1.5 pt-0.5">
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
                        <TaskStatusMark done={st.completed} className="w-3.5 h-3.5" />
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
              </div>
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
              <div className="text-sm text-zinc-200 leading-relaxed font-normal">
                <MarkdownRenderer content={textToRender} onWikiLinkClick={scrollToItem} />
              </div>
            </div>
          );
        })()
      )}

      {/* Video Circle Notes (Telegram style) */}
      {videoAttachments.map(att => (
        <div key={att.id} className="flex items-center gap-1 pt-1">
          <VideoCirclePlayer src={attachmentSrcs[att.id] ?? att.dataUrl ?? ''} />
          {/* The circle plays in place; this is the way out of the card and into the viewer. */}
          <button
            type="button"
            onClick={() => handleImageClick(att)}
            aria-label="Открыть видео"
            title="Открыть видео"
            className="cursor-pointer rounded-md p-1.5 text-fg-dim transition-colors hover:bg-surface-hover hover:text-fg-primary"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {/* Audio Notes Player */}
      {audioAttachments.map(att => (
        <div key={att.id} className={isVoiceBubble ? 'w-full' : 'w-full pt-1'}>
          <AudioPlayer
            src={attachmentSrcs[att.id] ?? att.dataUrl ?? ''}
            name={att.name}
            duration={att.duration}
            waveform={att.waveform}
            timeContext={isVoiceBubble ? formattedTime : undefined}
            transcript={att.extractedText}
            summary={att.summary}
            enrichmentStatus={att.enrichmentStatus}
            onEnrich={() => handleEnrichAttachment(att)}
          />
        </div>
      ))}

      {/* Pictures: one keeps its own shape, a pile fills one canvas */}
      {imageAttachments.length > 0 && (
        <div className={`pt-1 flex flex-col gap-1.5 ${isPictureBubble ? 'w-fit max-w-full' : 'w-full items-start'}`}>
          {imageAttachments.length === 1 ? (
            <>
              <div
                className="relative min-w-[9rem] min-h-[4.5rem] rounded-lg overflow-hidden group/img flex items-center justify-center cursor-pointer hover:opacity-95 transition-opacity"
                style={
                  firstImageRatio
                    ? {
                        width: Math.min(THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT * firstImageRatio),
                        aspectRatio: String(firstImageRatio),
                        maxWidth: '100%',
                      }
                    : undefined
                }
                onClick={heroSrc ? () => handleImageClick(imageAttachments[0]) : undefined}
              >
                {heroSrc ? (
                  <img
                    src={heroSrc}
                    alt={imageAttachments[0].name}
                    loading="lazy"
                    decoding="async"
                    className={
                      firstImageRatio
                        ? 'block h-full w-full object-contain'
                        : 'block h-auto w-auto max-h-[20rem] max-w-full object-contain'
                    }
                    onLoad={(event) => {
                      const picture = event.currentTarget;
                      if (picture.naturalWidth && picture.naturalHeight) {
                        setFirstImageRatio(picture.naturalWidth / picture.naturalHeight);
                      }
                    }}
                  />
                ) : (
                  <MissingMedia name={imageAttachments[0].name} />
                )}

                {/* Text action badge anchored in the bottom-right corner of the image */}
                {imageAttachments[0].extractedText ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleOcr(imageAttachments[0].id);
                    }}
                    className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/80 hover:bg-black/90 border border-white/15 text-zinc-300 hover:text-white flex items-center gap-1.5 cursor-pointer select-none text-2xs font-mono shadow-md motion-press z-10"
                    title={expandedOcrIds.has(imageAttachments[0].id) ? 'Скрыть текст' : 'Показать текст с фото'}
                  >
                    <FileText className="w-3.5 h-3.5 text-zinc-300" />
                    <span>Текст</span>
                    <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${expandedOcrIds.has(imageAttachments[0].id) ? 'rotate-180' : ''}`} />
                  </button>
                ) : imageAttachments[0].enrichmentStatus === 'processing' ? (
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/80 border border-white/15 text-zinc-300 text-2xs font-mono flex items-center gap-1.5 shadow-md z-10 animate-pulse">
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
                    className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/80 hover:bg-black/90 border border-white/15 text-zinc-300 hover:text-white flex items-center gap-1.5 cursor-pointer select-none text-2xs font-mono shadow-md motion-press z-10"
                    title="Распознать текст на изображении"
                  >
                    <Sparkles className="w-3 h-3 text-zinc-400" />
                    <span>{imageAttachments[0].enrichmentStatus === 'error' ? 'Повторить' : 'Текст'}</span>
                  </button>
                )}
              </div>

            {/* Extracted text accordion directly under the hero picture */}
            {imageAttachments[0].extractedText && (
              <div
                className="motion-accordion w-full"
                data-expanded={expandedOcrIds.has(imageAttachments[0].id)}
                aria-hidden={!expandedOcrIds.has(imageAttachments[0].id)}
              >
                <div className="motion-accordion-inner w-full mt-1.5 pt-1.5 border-t border-white/[0.08] text-xs font-mono text-zinc-300 leading-relaxed select-text whitespace-pre-wrap">
                  {imageAttachments[0].extractedText}
                </div>
              </div>
            )}
            </>
          ) : (
            <div className="flex w-[20rem] max-w-full flex-col gap-0.5 overflow-hidden rounded-lg" data-testid="media-album">
              {albumRows.map((perRow, rowIndex) => (
                <div key={rowIndex} className="flex gap-0.5">
                  {albumTiles.slice(albumRowStarts[rowIndex], albumRowStarts[rowIndex] + perRow).map(tile => (
                    <button
                      key={tile.hidden > 0 ? 'more' : tile.image.id}
                      type="button"
                      onClick={tile.hidden > 0 || albumSrc(tile.image) ? () => handleImageClick(tile.image) : undefined}
                      title={tile.hidden > 0 ? `Ещё ${tile.hidden}` : tile.image.name}
                      className={`relative min-w-0 flex-1 overflow-hidden cursor-pointer transition-opacity hover:opacity-90 ${
                        perRow === 1 ? 'aspect-[3/2]' : 'aspect-square'
                      } ${tile.hidden > 0 ? 'bg-white/[0.06]' : ''}`}
                    >
                      {tile.hidden === 0 && (
                        albumSrc(tile.image) ? (
                          <img
                            src={albumSrc(tile.image)}
                            alt={tile.image.name}
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <MissingMedia name={tile.image.name} />
                        )
                      )}
                      {tile.hidden > 0 ? (
                        <span className="absolute inset-0 flex items-center justify-center text-sm font-mono text-zinc-200">
                          +{tile.hidden}
                        </span>
                      ) : (
                        tile.image.extractedText && (
                          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-accent-strong" />
                        )
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* File Attachments */}
      {fileAttachments.length > 0 && (
        <div className={`flex flex-col gap-1.5 ${isFileBubble ? 'w-full' : 'pt-1 w-full'}`}>
          {fileAttachments.map(file => (
            <a
              key={file.id}
              href={attachmentSrcs[file.id] ?? file.dataUrl}
              download={file.name}
              className={
                isFileBubble
                  ? 'flex items-center gap-2.5 sm:gap-3 w-full select-none group/file cursor-pointer'
                  : 'flex items-center gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] transition-colors group/file select-none cursor-pointer w-full'
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
                  {isFileBubble && (
                    <span className="text-2xs font-mono text-zinc-500 select-none leading-none">
                      {formattedTime}
                    </span>
                  )}
                  <div
                    className="w-7 h-7 rounded-lg text-zinc-400 group-hover/file:text-white group-hover/file:bg-white/[0.08] flex items-center justify-center transition-colors"
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
        <div
          data-testid="item-meta-row"
          className="flex items-center gap-2 pt-1 min-h-[16px] w-full select-none"
        >
          {hasBottomMeta ? (
            <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden flex-nowrap">
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
                if (isMobile) {
                  const shown = Math.max(1, visibleTagCount);
                  const hidden = item.tags.length - shown;
                  return (
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <div
                        ref={tagsRowRef}
                        data-testid="item-tags-row"
                        className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden flex-nowrap"
                      >
                        {item.tags.map((tag, idx) => (
                          <TagChip
                            key={tag}
                            tag={tag}
                            variant="flat"
                            // Скрытие через visibility: чип остаётся в раскладке и меряется.
                            className={idx < shown ? '' : 'invisible'}
                            onClick={() => setActiveTagFilter(tag)}
                          />
                        ))}
                      </div>
                      {hidden > 0 && (
                        <span
                          data-tag-overflow="1"
                          className="shrink-0 text-2xs font-mono text-zinc-500"
                        >
                          +{hidden}
                        </span>
                      )}
                    </div>
                  );
                }

                const maxVisible = 3;
                const hasOverflow = item.tags.length > maxVisible;
                const visibleTags = isTagsExpanded || !hasOverflow ? item.tags : item.tags.slice(0, maxVisible);
                const hiddenCount = item.tags.length - maxVisible;

                return (
                  <div
                    data-testid="item-tags-row"
                    className={`flex items-center gap-1.5 min-w-0 overflow-hidden ${
                      isTagsExpanded ? 'flex-wrap' : 'flex-nowrap'
                    }`}
                  >
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
                        className="text-2xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer select-none leading-none shrink-0"
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

          {!isVoiceBubble && (
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

/** A media slot with no bytes behind it. Says so once, instead of a broken-image icon. */
const MissingMedia: React.FC<{ name: string }> = ({ name }) => (
  <span
    data-testid="media-missing"
    title={`Файл не найден: ${name}`}
    className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/[0.04] text-fg-dim"
  >
    <ImageOff className="h-4 w-4" />
    <span className="font-mono text-[10px]">нет файла</span>
  </span>
);

export const ItemCard = React.memo(ItemCardComponent);

