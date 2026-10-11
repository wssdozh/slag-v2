import React, { useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { ItemCard } from './ItemCard';
import type { SlagItem } from '../../types';
import { Inbox } from 'lucide-react';

export const FeedList: React.FC = () => {
  const { filteredItems, openContextMenu } = useApp();
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);

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

  // Group items by calendar date
  const groupItemsByDate = (items: SlagItem[]) => {
    const groups: { dateLabel: string; items: SlagItem[] }[] = [];
    const now = new Date();
    const todayStr = now.toDateString();
    
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    let currentGroup: { dateLabel: string; items: SlagItem[] } | null = null;

    items.forEach(item => {
      const itemDate = new Date(item.createdAt);
      let label = '';

      if (itemDate.toDateString() === todayStr) {
        label = 'Сегодня';
      } else if (itemDate.toDateString() === yesterdayStr) {
        label = 'Вчера';
      } else {
        label = itemDate.toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: itemDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
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
  };

  const grouped = groupItemsByDate(filteredItems);

  // Scroll to bottom when new item is added
  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredItems.length]);

  return (
    <div
      onContextMenu={handleFeedContextMenu}
      className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6"
    >
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
