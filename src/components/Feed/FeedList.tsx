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
import type { SlagItem } from '../../types';
import { Inbox, UploadCloud, Sparkles, ChevronDown } from 'lucide-react';
import { EmptyState } from '../UI/EmptyState';
import { Button } from '../UI/Button';
import { processFileListToAttachments } from '../../lib/fileDropHelper';
import { enrichItemAttachments } from '../../lib/attachmentEnrichment';

const PAGE_SIZE = 35;

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
    addToast,
    highlightedItemId,
  } = useApp();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Sync state during render on folder change (React pure pattern)
  const [prevFolder, setPrevFolder] = useState(currentFolder);
  if (prevFolder !== currentFolder) {
    setPrevFolder(currentFolder);
    setVisibleCount(PAGE_SIZE);
  }

  const prevScrollHeightRef = useRef<number>(0);
  const prevScrollTopRef = useRef<number>(0);
  const isPrependRef = useRef<boolean>(false);
  const prevItemsLengthRef = useRef<number>(filteredItems.length);

  const todayMidnight = useSyncExternalStore(subscribeToNow, getTodayMidnight, () => 0);
  const yesterdayMidnight = todayMidnight - 86400000;
  const currentYear = new Date(todayMidnight || 0).getFullYear();

  // If a specific item is targeted via wiki-link or reply, derive expanded window size during render
  const effectiveVisibleCount = useMemo(() => {
    if (!highlightedItemId) return visibleCount;
    const targetIdx = filteredItems.findIndex(i => i.id === highlightedItemId);
    if (targetIdx !== -1) {
      const neededCount = filteredItems.length - targetIdx;
      return Math.max(visibleCount, neededCount);
    }
    return visibleCount;
  }, [highlightedItemId, filteredItems, visibleCount]);

  // Windowed items (only the most recent N items)
  const windowedItems = useMemo(() => {
    if (filteredItems.length <= effectiveVisibleCount) return filteredItems;
    return filteredItems.slice(filteredItems.length - effectiveVisibleCount);
  }, [filteredItems, effectiveVisibleCount]);

  const hasMoreOlder = filteredItems.length > effectiveVisibleCount;

  // Load more older items with scroll position preservation
  const loadMoreOlder = useCallback(() => {
    const container = containerRef.current;
    if (!container || !hasMoreOlder) return;

    prevScrollHeightRef.current = container.scrollHeight;
    prevScrollTopRef.current = container.scrollTop;
    isPrependRef.current = true;

    setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filteredItems.length));
  }, [hasMoreOlder, filteredItems.length]);

  // Maintain scroll anchor when prepending items at the top
  useLayoutEffect(() => {
    if (isPrependRef.current && containerRef.current) {
      const delta = containerRef.current.scrollHeight - prevScrollHeightRef.current;
      if (delta > 0) {
        containerRef.current.scrollTop = prevScrollTopRef.current + delta;
      }
      isPrependRef.current = false;
    }
  });

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

  // Instant scroll-to-bottom on folder switch or initial mount
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [currentFolder]);

  // Smart bottom scroll: only auto-scroll on new items if user is already near bottom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isNewItemAdded = filteredItems.length > prevItemsLengthRef.current;
    prevItemsLengthRef.current = filteredItems.length;

    if (isNewItemAdded) {
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distFromBottom <= 200) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [filteredItems.length]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollBottom(distFromBottom > 220);
  }, []);

  const scrollToBottom = useCallback(() => {
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

            if (aiSettings.groqApiKey) {
              enrichItemAttachments(created, updateItem, aiSettings).catch(() => {});
            }
          }
        } catch {
          addToast('Не удалось обработать прикрепленные файлы', 'error');
        }
      }
    }
  };

  // Group items by calendar date using pure timestamp calculations
  const grouped = useMemo(() => {
    const groups: { dateLabel: string; items: SlagItem[] }[] = [];
    let currentGroup: { dateLabel: string; items: SlagItem[] } | null = null;

    windowedItems.forEach(item => {
      let label = '';
      if (item.createdAt >= todayMidnight) {
        label = 'Сегодня';
      } else if (item.createdAt >= yesterdayMidnight) {
        label = 'Вчера';
      } else {
        const itemDate = new Date(item.createdAt);
        label = itemDate.toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: itemDate.getFullYear() !== currentYear ? 'numeric' : undefined,
        });
      }

      if (!currentGroup || currentGroup.dateLabel !== label) {
        currentGroup = { dateLabel: label, items: [item] };
        groups.push(currentGroup);
      } else {
        currentGroup.items.push(item);
      }
    });

    return groups;
  }, [windowedItems, todayMidnight, yesterdayMidnight, currentYear]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onContextMenu={handleFeedContextMenu}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 flex flex-col gap-6 relative scrollbar-thin"
    >
      {/* Drag & Drop Visual Dropzone Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-2 z-30 rounded-2xl bg-[#09090b]/92 backdrop-blur-md border-2 border-dashed border-blue-500/40 flex flex-col items-center justify-center gap-2 pointer-events-none select-none animate-in fade-in duration-100">
          <UploadCloud className="w-8 h-8 text-blue-400 animate-bounce" />
          <span className="text-sm font-medium text-zinc-200">
            Перетащите файлы сюда для создания заметки
          </span>
          <span className="text-xs text-zinc-500 font-mono">
            Изображения, аудио, видео или документы сохранятся в локальное хранилище
          </span>
        </div>
      )}

      {filteredItems.length === 0 ? (
        <EmptyState
          icon={items.length === 0 ? <Sparkles className="w-5 h-5 text-amber-400" /> : <Inbox className="w-5 h-5" />}
          title={items.length === 0 ? 'Хранилище пустое' : 'В этой папке пусто'}
          description={
            items.length === 0
              ? 'Создайте первую мысль в поле ввода внизу или сгенерируйте стартовые демо-заметки и папки.'
              : 'Напишите сообщение в поле внизу, запишите голосовое или прикрепите файл.'
          }
          action={
            items.length === 0 ? (
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
                className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1 rounded-full bg-[#141417] border border-white/[0.04] cursor-pointer"
              >
                Показать более ранние записи...
              </button>
            </div>
          )}

          {grouped.map(group => (
            <div key={group.dateLabel} className="flex flex-col gap-2">
              {/* Telegram-style date bubble */}
              <div className="flex justify-center py-1 select-none">
                <span className="px-3 py-0.5 rounded-full bg-[#18181b] border border-white/[0.06] text-[11px] text-zinc-400 shadow-sm">
                  {group.dateLabel}
                </span>
              </div>

              {/* List of cards */}
              <div className="flex flex-col gap-1.5">
                {group.items.map(item => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Floating scroll to bottom button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="sticky bottom-28 ml-auto mr-2 sm:mr-4 z-20 w-8 h-8 rounded-full bg-[#18181b]/95 hover:bg-[#27272a] text-zinc-300 hover:text-white border border-white/[0.1] shadow-xl backdrop-blur flex items-center justify-center cursor-pointer transition-all active:scale-95 animate-in fade-in zoom-in-90"
          title="К последним заметкам"
          aria-label="Прокрутить к последним заметкам"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}

      {/* Bottom spacer so the last card clears the composer with a clean gap */}
      <div className="h-24 shrink-0 pointer-events-none" aria-hidden="true" />
      <div ref={bottomAnchorRef} />
    </div>
  );
};
