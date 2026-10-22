import React, { useEffect, useRef, useState, useMemo, useSyncExternalStore } from 'react';
import { useApp } from '../../context/AppContext';
import { ItemCard } from './ItemCard';
import type { SlagItem } from '../../types';
import { Inbox, UploadCloud } from 'lucide-react';
import { processFileListToAttachments } from '../../lib/fileDropHelper';

function subscribeToNow() {
  return () => {};
}

function getTodayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const FeedList: React.FC = () => {
  const { filteredItems, openContextMenu, saveItem, currentFolder, addToast } = useApp();
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const todayMidnight = useSyncExternalStore(subscribeToNow, getTodayMidnight, () => 0);
  const yesterdayMidnight = todayMidnight - 86400000;
  const currentYear = new Date(todayMidnight || 0).getFullYear();

  const handleFeedContextMenu = (e: React.MouseEvent) => {
    // Only open if clicking on empty feed space
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
    // Check if leaving to outside the list
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
            saveItem({
              type: 'note',
              title: attachments.length === 1 ? attachments[0].name : `Файлы (${attachments.length})`,
              content: '',
              folder: currentFolder,
              attachments,
            });
            addToast(`Заметка создана с ${attachments.length} ${attachments.length === 1 ? 'файлом' : 'файлами'}`, 'success');
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

    filteredItems.forEach(item => {
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
  }, [filteredItems, todayMidnight, yesterdayMidnight, currentYear]);

  // Scroll to bottom when new item is added
  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredItems.length]);

  return (
    <div
      onContextMenu={handleFeedContextMenu}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6 relative"
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
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-500 select-none">
          <div className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-3 text-zinc-600">
            <Inbox className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium text-zinc-400">В этой папке пусто</p>
          <p className="text-xs text-zinc-600 mt-1 max-w-xs">
            Напишите сообщение в поле внизу, запишите голосовое или прикрепите файл.
          </p>
        </div>
      ) : (
        grouped.map(group => (
          <div key={group.dateLabel} className="flex flex-col gap-3">
            {/* Telegram-style date sticky bubble */}
            <div className="flex justify-center sticky top-0 z-10 py-1 pointer-events-none">
              <span className="px-3 py-1 rounded-full bg-[#18181b]/90 border border-white/[0.06] text-[11px] font-mono text-zinc-400 shadow-md">
                {group.dateLabel}
              </span>
            </div>

            {/* List of cards */}
            <div className="flex flex-col gap-2.5">
              {group.items.map(item => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))
      )}
      <div ref={bottomAnchorRef} />
    </div>
  );
};
