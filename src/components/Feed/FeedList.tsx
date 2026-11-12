import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  useSyncExternalStore,
} from 'react';
import { useApp } from '../../context/AppContext';
import { ItemCard } from './ItemCard';
import type { SlagAttachment, LightboxImage } from '../../types';
import { Inbox, Sparkles, Pin } from 'lucide-react';
import { EmptyState } from '../UI/EmptyState';
import { Button } from '../UI/Button';
import { processFileListToAttachments } from '../../lib/media/fileDropHelper';
import { canEnrichAttachments, enrichItemAttachments } from '../../lib/media/attachmentEnrichment';
import { PinnedBanner } from './PinnedBanner';
import { useAttachmentSrcs } from '../../hooks/media/useAttachmentSrc';
import { FeedColumnResizer } from './FeedColumnResizer';
import { useFlipLayout } from '../../hooks/layout/useFlipLayout';
import { usePullToSearch } from '../../hooks/gestures/usePullToSearch';
import { FeedDropOverlay } from './list/FeedDropOverlay';
import { FeedDateBubble } from './list/FeedDateBubble';
import { FeedScrollHint } from './list/FeedScrollHint';
import {
  WINDOW_CHUNK,
  groupFeedByDate,
  hasOlderItems,
  nextWindowSize,
  takeWindow,
  windowSizeAroundTarget,
} from './list/feedWindow';

function subscribeToNow() {
  return () => {};
}

function getTodayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const FeedList: React.FC = () => {
  const {
    filteredItems,
    items,
    seedDemoData,
    openContextMenu,
    saveItem,
    updateItem,
    aiSettings,
    currentFolder,
    activeTypeFilter,
    activeTagFilter,
    addToast,
    highlightedItemId,
    openLightbox,
    isPinnedOnlyFilter,
    togglePinnedOnlyFilter,
    setIsSearchOpen,
  } = useApp();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);

  // Past either end there is nothing left to scroll, so the same drag opens search.
  const { pull, side: pullSide, handlers: pullHandlers } = usePullToSearch({
    onTrigger: () => setIsSearchOpen(true),
  });

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  // Окно всегда прижато к новым записям: размер — единственная ручка.
  const [windowSize, setWindowSize] = useState(WINDOW_CHUNK);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Fast O(1) item lookup map for reply targets
  const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);

  // Precomputed reply counts & first reply IDs in a single pass across items
  const replyMetaMap = useMemo(() => {
    const countMap = new Map<string, number>();
    const firstReplyMap = new Map<string, string>();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.replyToId) {
        countMap.set(it.replyToId, (countMap.get(it.replyToId) || 0) + 1);
        if (!firstReplyMap.has(it.replyToId)) {
          firstReplyMap.set(it.replyToId, it.id);
        }
      }
    }
    return { countMap, firstReplyMap };
  }, [items]);

  // The note keeps attachment metadata; the bytes are resolved once for the whole feed.
  const feedAttachments = useMemo(
    () => filteredItems.flatMap(it => it.attachments || []),
    [filteredItems],
  );
  const attachmentSrcs = useAttachmentSrcs(feedAttachments);

  // Stable handler for image lightbox in feed
  const handleImageClick = useCallback((img: SlagAttachment) => {
    const folderImages: LightboxImage[] = filteredItems.flatMap(it =>
      (it.attachments || [])
        // Photos and clips in one deck: the viewer pages through the folder the way it opened.
        .filter(att => att.type === 'image' || att.type === 'video')
        .map(att => ({
          id: att.id,
          name: att.name,
          url: attachmentSrcs[att.id] ?? att.dataUrl ?? '',
          kind: att.type === 'video' ? ('video' as const) : ('image' as const),
          extractedText: att.extractedText,
          summary: att.summary,
          enrichmentStatus: att.enrichmentStatus,
          enrichmentError: att.enrichmentError,
          sourceItem: it,
        }))
    );
    const clickedIdx = folderImages.findIndex(i => i.id === img.id);
    openLightbox(folderImages, clickedIdx >= 0 ? clickedIdx : 0);
  }, [attachmentSrcs, filteredItems, openLightbox]);

  // Sync state during render on folder or filter change (React pure pattern)
  const filterKey = `${currentFolder}:${activeTypeFilter}:${activeTagFilter || ''}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setWindowSize(WINDOW_CHUNK);
  }

  // Permanently expand the window during render when an item is targeted (React pure pattern)
  const highlightKey = `${filterKey}:${highlightedItemId || ''}`;
  const [prevHighlightKey, setPrevHighlightKey] = useState(highlightKey);
  if (prevHighlightKey !== highlightKey) {
    setPrevHighlightKey(highlightKey);
    if (highlightedItemId) {
      const targetIdx = filteredItems.findIndex(i => i.id === highlightedItemId);
      const grown = windowSizeAroundTarget(windowSize, filteredItems.length, targetIdx);
      if (grown !== windowSize) setWindowSize(grown);
    }
  }

  const prevScrollHeightRef = useRef<number>(0);
  const prevScrollTopRef = useRef<number>(0);
  const isPrependRef = useRef<boolean>(false);
  const prevItemsLengthRef = useRef<number>(filteredItems.length);

  const todayMidnight = useSyncExternalStore(subscribeToNow, getTodayMidnight, () => 0);

  // Windowed items: последние `windowSize` записей, новее всегда в кадре
  const windowedItems = useMemo(() => takeWindow(filteredItems, windowSize), [filteredItems, windowSize]);

  const hasMoreOlder = hasOlderItems(filteredItems.length, windowSize);

  // Cards glide when the list shrinks or reorders; a fresh note lands instead.
  useFlipLayout(containerRef, windowedItems.map(item => item.id).join('|'));

  // Load more older items with scroll position preservation
  const loadMoreOlder = useCallback(() => {
    const container = containerRef.current;
    if (!container || !hasMoreOlder) return;
    // Предыдущая догрузка ещё держит анкор: вторая подряд даёт скачок.
    if (isPrependRef.current) return;

    prevScrollHeightRef.current = container.scrollHeight;
    prevScrollTopRef.current = container.scrollTop;
    isPrependRef.current = true;

    setWindowSize(prev => nextWindowSize(prev, filteredItems.length));
  }, [hasMoreOlder, filteredItems.length]);

  const isStuckToBottomRef = useRef(true);

  // Maintain scroll anchor when prepending items at the top OR keep pinned to bottom on layout shifts
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (isPrependRef.current) {
      const delta = container.scrollHeight - prevScrollHeightRef.current;
      if (delta > 0) {
        container.scrollTop = prevScrollTopRef.current + delta;
      }
      isPrependRef.current = false;
      return;
    }

    if (isStuckToBottomRef.current && !highlightedItemId) {
      container.scrollTop = container.scrollHeight;
    }
  });

  // The keyboard and a growing composer resize the scrollport without rendering this list.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (isStuckToBottomRef.current && !highlightedItemId) {
        container.scrollTop = container.scrollHeight;
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [highlightedItemId]);

  // Dedicated anchoring effect when an item is highlighted / targeted via wiki-link
  useEffect(() => {
    if (!highlightedItemId) return;
    const container = containerRef.current;
    if (!container) return;

    // Immediately un-pin from bottom so layout settling doesn't yank scroll back
    isStuckToBottomRef.current = false;

    let rafId: number;
    let timerId: ReturnType<typeof setTimeout>;

    const tryScrollToTarget = (attempt = 0) => {
      const el = document.getElementById(`item-${highlightedItemId}`);
      if (!el || !container) {
        if (attempt < 15) {
          timerId = setTimeout(() => tryScrollToTarget(attempt + 1), 35);
        }
        return;
      }

      isStuckToBottomRef.current = false;

      // Calculate exact centered position relative to feed container (no ancestor scroll jitter)
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const currentRelTop = elRect.top - containerRect.top;
      const targetScrollTop = container.scrollTop + currentRelTop - (container.clientHeight / 2) + (el.clientHeight / 2);

      const targetClamped = Math.max(0, Math.round(targetScrollTop));
      const distance = Math.abs(container.scrollTop - targetClamped);

      // If note is far away (>900px), leap close first then smooth-magnetize the final 200px
      if (distance > 900) {
        const intermediate = targetClamped > container.scrollTop
          ? targetClamped - 200
          : targetClamped + 200;
        container.scrollTop = Math.max(0, intermediate);
      }

      container.scrollTo({
        top: targetClamped,
        behavior: 'smooth',
      });
    };

    rafId = requestAnimationFrame(() => tryScrollToTarget(0));

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
    };
  }, [highlightedItemId, currentFolder]);

  // Top sentinel intersection observer to auto-load older items when scrolling up
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || !hasMoreOlder) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          loadMoreOlder();
        }
      },
      { root: containerRef.current, threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreOlder, loadMoreOlder]);

  const prevFolderForScrollRef = useRef(currentFolder);

  // Instant scroll-to-bottom strictly on folder switch
  useLayoutEffect(() => {
    if (prevFolderForScrollRef.current !== currentFolder) {
      prevFolderForScrollRef.current = currentFolder;
      if (!highlightedItemId) {
        isStuckToBottomRef.current = true;
        const container = containerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      }
    }
  }, [currentFolder, highlightedItemId]);

  // Multi-pass settling (RAF + timer) to ensure bottom-pin after async markdown/image layout shifts
  useEffect(() => {
    if (!isStuckToBottomRef.current || highlightedItemId) return;
    const container = containerRef.current;
    if (!container) return;

    const snap = () => {
      if (isStuckToBottomRef.current && !highlightedItemId && container) {
        container.scrollTop = container.scrollHeight;
      }
    };

    const rafId = requestAnimationFrame(snap);
    const timerId = setTimeout(snap, 60);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
    };
  }, [currentFolder, windowedItems, highlightedItemId]);

  // Smart bottom scroll: only auto-scroll on new items if user is already near bottom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isNewItemAdded = filteredItems.length > prevItemsLengthRef.current;
    prevItemsLengthRef.current = filteredItems.length;

    if (isNewItemAdded) {
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distFromBottom <= 200 || isStuckToBottomRef.current) {
        isStuckToBottomRef.current = true;
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [filteredItems.length]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    // Unlock stick-to-bottom only when user deliberately scrolls up past threshold and not in mid-highlight
    if (!highlightedItemId) {
      isStuckToBottomRef.current = distFromBottom <= 40;
    }
    setShowScrollBottom(distFromBottom > 220);

    // Выгрузка только внизу: там окно прижато к новым, срезание старых не двигает
    // видимую часть. По дороге вверх окно не трогаем — иначе догрузка и выгрузка
    // дёргают друг друга на каждом кадре скролла.
    // ponytail: выгрузка по «прилипанию к низу»; индексная виртуализация, если карточки станут тяжёлыми
    if (
      !highlightedItemId &&
      isStuckToBottomRef.current &&
      windowSize > WINDOW_CHUNK
    ) {
      setWindowSize(WINDOW_CHUNK);
    }
  }, [highlightedItemId, windowSize]);

  const scrollToBottom = useCallback(() => {
    isStuckToBottomRef.current = true;
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, []);

  const handleFeedContextMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.group')) return;
    e.preventDefault();
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'feed',
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        try {
          const attachments = await processFileListToAttachments(e.dataTransfer.files);
          if (attachments.length > 0) {
            const created = saveItem({
              type: 'note',
              title: attachments.length === 1 ? attachments[0].name : `Файлы (${attachments.length})`,
              content: '',
              folder: currentFolder,
              attachments,
            });
            addToast(`Заметка создана с ${attachments.length} ${attachments.length === 1 ? 'файлом' : 'файлами'}`, 'success');

            if (canEnrichAttachments(aiSettings)) {
              enrichItemAttachments(created, updateItem, aiSettings).catch(() => {});
            }
          }
        } catch {
          addToast('Не удалось обработать прикрепленные файлы', 'error');
        }
      }
    }
  };

  // Группы по календарным дням и шаг между соседями считает feedWindow: здесь остаётся «сейчас».
  const grouped = useMemo(
    () => groupFeedByDate(windowedItems, todayMidnight),
    [windowedItems, todayMidnight],
  );

  return (
    <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
      <FeedColumnResizer />
      <PinnedBanner />
      <div
        ref={containerRef}
        data-testid="feed-list-container"
        onScroll={handleScroll}
        onContextMenu={handleFeedContextMenu}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        {...pullHandlers}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 flex flex-col gap-6 relative scrollbar-thin"
        // Padding, not a spacer element: the column has a flex gap, so a spacer would add it too
        // and the anchor would stop a gap short of the composer. The dock height is published by
        // whoever owns the composer, so a keyboard frame costs no render here.
        style={{ paddingBottom: 'calc(var(--composer-inset, 104px) + 4px)' }}
      >
        {/* Drag & Drop Visual Dropzone Overlay */}
        <FeedDropOverlay isVisible={isDraggingOver} />

        {filteredItems.length === 0 ? (
          <EmptyState
            icon={
              isPinnedOnlyFilter ? (
                <Pin className="w-5 h-5 text-amber-400 rotate-45" />
              ) : items.length === 0 ? (
                <Sparkles className="w-5 h-5 text-amber-400" />
              ) : (
                <Inbox className="w-5 h-5" />
              )
            }
            title={
              isPinnedOnlyFilter
                ? 'Нет закрепленных записей'
                : items.length === 0
                ? 'Хранилище пустое'
                : 'В этой папке пусто'
            }
            description={
              isPinnedOnlyFilter
                ? 'В текущей папке нет закрепленных сообщений.'
                : items.length === 0
                ? 'Создайте первую мысль в поле ввода внизу или сгенерируйте стартовые демо-заметки и папки.'
                : 'Напишите сообщение в поле внизу, запишите голосовое или прикрепите файл.'
            }
            action={
              isPinnedOnlyFilter ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={togglePinnedOnlyFilter}
                  className="gap-1.5 text-xs text-zinc-200 hover:text-white"
                >
                  Показать все сообщения
                </Button>
              ) : items.length === 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={seedDemoData}
                  className="gap-1.5 text-xs text-zinc-200 hover:text-white"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Сгенерировать демо-заметки и папки
                </Button>
              ) : undefined
            }
            className="flex-1"
          />
        ) : (
          <>
            {/* Top spacer to push items to the bottom when list doesn't fill screen (Telegram-style) */}
            <div className="mt-auto pointer-events-none" aria-hidden="true" />

            {/* Top sentinel / load earlier notes trigger */}
            {hasMoreOlder && (
              <div ref={topSentinelRef} className="flex justify-center py-2 select-none">
                <button
                  type="button"
                  onClick={loadMoreOlder}
                  className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1 rounded-full bg-surface border border-white/[0.04] cursor-pointer"
                >
                  Показать более ранние записи...
                </button>
              </div>
            )}

            {grouped.map(group => (
              <div key={group.dateLabel} className="flex flex-col gap-2">
                <FeedDateBubble label={group.dateLabel} />

                {/* List of cards: the step between two notes is their own gap, not the column's */}
                <div className="flex flex-col">
                  {group.items.map(({ item, gap }) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      gap={gap}
                      isHighlighted={highlightedItemId === item.id}
                      repliesCount={replyMetaMap.countMap.get(item.id) || 0}
                      firstReplyId={replyMetaMap.firstReplyMap.get(item.id) || null}
                      replyParent={item.replyToId ? itemMap.get(item.replyToId) || null : null}
                      onImageClick={handleImageClick}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

      </div>

      <FeedScrollHint
        pull={pull}
        pullSide={pullSide}
        isBottomButtonVisible={showScrollBottom}
        onScrollToBottom={scrollToBottom}
      />
    </div>
  );
};
