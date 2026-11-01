import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { FeedViewMode, SlagItemType, SortField, InboxMode } from '../../types';
import {
  SlidersHorizontal,
  Layers,
  Kanban,
  Calendar,
  Clock,
  CalendarClock,
  ArrowDownAZ,
  ArrowUpZA,
  Pin,
  EyeOff,
  RotateCcw,
  Check,
  X,
} from 'lucide-react';

export const FolderViewModal: React.FC = () => {
  const {
    isFolderViewModalOpen,
    closeFolderViewModal,
    feedViewMode,
    activeTypeFilter,
    inboxMode,
    sortBy,
    sortOrder,
    hideCompletedTasks,
    isPinnedOnlyFilter,
    setIsPinnedOnlyFilter,
    updateCurrentFolderViewSettings,
    resetCurrentFolderViewSettings,
    currentFolder,
  } = useApp();

  const isInbox = currentFolder === 'Входящие';
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);

  // Position popover directly under the 3-dots button in the active header
  useEffect(() => {
    if (!isFolderViewModalOpen) return;

    const updatePosition = () => {
      const trigger = document.querySelector('button[aria-label="Вид и фильтры папки"]');
      if (trigger) {
        const rect = trigger.getBoundingClientRect();
        const top = rect.bottom + 6;
        const right = Math.max(8, window.innerWidth - rect.right);
        setCoords({ top, right });
      } else {
        setCoords({ top: 56, right: 16 });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isFolderViewModalOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isFolderViewModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeFolderViewModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFolderViewModalOpen, closeFolderViewModal]);

  if (!isFolderViewModalOpen) return null;

  const viewModes: { id: FeedViewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'feed', label: 'Лента', icon: <Layers className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'kanban', label: 'Канбан', icon: <Kanban className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'calendar', label: 'Календарь', icon: <Calendar className="w-3.5 h-3.5 shrink-0" /> },
  ];

  const sortFields: { id: SortField; label: string; icon: React.ReactNode }[] = [
    { id: 'createdAt', label: 'По созданию', icon: <Clock className="w-3 h-3" /> },
    { id: 'updatedAt', label: 'По изменению', icon: <Clock className="w-3 h-3" /> },
    { id: 'title', label: 'По названию', icon: <ArrowDownAZ className="w-3 h-3" /> },
    { id: 'dueDate', label: 'По дедлайну', icon: <CalendarClock className="w-3 h-3" /> },
  ];

  const typeOptions: { id: SlagItemType | 'all'; label: string }[] = [
    { id: 'all', label: 'Все' },
    { id: 'note', label: 'Заметки' },
    { id: 'task', label: 'Таски' },
    { id: 'article', label: 'Статьи' },
  ];

  const inboxOptions: { id: InboxMode; label: string }[] = [
    { id: 'all', label: 'Все' },
    { id: 'sorted', label: 'Разобранные' },
    { id: 'unsorted', label: 'Неразобранные' },
  ];

  const ascLabel = sortBy === 'title' ? 'А → Я' : 'Старые';
  const descLabel = sortBy === 'title' ? 'Я → А' : 'Новые';

  return (
    <div className="fixed inset-0 z-50 pointer-events-none select-none">
      {/* Invisible backdrop to dismiss popover on outside click without darkening screen */}
      <div
        className="fixed inset-0 pointer-events-auto bg-transparent"
        onClick={closeFolderViewModal}
      />

      {/* Lightweight dropdown popover attached to the button */}
      <div
        role="dialog"
        aria-label="Вид и фильтры"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: coords ? `${coords.top}px` : '56px',
          right: coords ? `${coords.right}px` : '16px',
        }}
        className="pointer-events-auto w-[270px] max-h-[calc(100dvh-70px)] overflow-y-auto scrollbar-none rounded-xl bg-[#121215]/95 border border-white/[0.1] shadow-2xl shadow-black/90 backdrop-blur-xl p-2.5 space-y-2.5 animate-in fade-in zoom-in-95 duration-100 text-xs text-zinc-200"
      >
        {/* Header row */}
        <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-1.5 min-w-0">
            <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="font-semibold text-xs text-white truncate">Вид и фильтры</span>
          </div>
          <button
            type="button"
            onClick={closeFolderViewModal}
            className="p-1 rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            aria-label="Закрыть"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Section 1: View Modes (Segmented Row) */}
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-1">
            Режим отображения
          </span>
          <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-panel/60 border border-white/[0.04]">
            {viewModes.map((m) => {
              const isActive = feedViewMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => updateCurrentFolderViewSettings({ viewMode: m.id })}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-1 rounded-md text-xs transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-white/10 text-white font-medium shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {m.icon}
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Sorting */}
        <div className="pt-1.5 border-t border-white/[0.06]">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-1">
            Сортировка
          </span>
          <div className="grid grid-cols-2 gap-1 mb-1">
            {sortFields.map((sf) => {
              const isActive = sortBy === sf.id;
              return (
                <button
                  key={sf.id}
                  type="button"
                  onClick={() => updateCurrentFolderViewSettings({ sortBy: sf.id })}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-left text-[11px] transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-white/10 text-white border-white/20 font-medium'
                      : 'bg-panel/40 text-zinc-400 border-white/[0.04] hover:bg-white/[0.04] hover:text-zinc-200'
                  }`}
                >
                  <span className={isActive ? 'text-white' : 'text-zinc-500'}>
                    {sf.icon}
                  </span>
                  <span className="truncate">{sf.label}</span>
                </button>
              );
            })}
          </div>

          {/* Direction */}
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => updateCurrentFolderViewSettings({ sortOrder: 'asc' })}
              className={`flex items-center justify-center gap-1 px-1.5 py-1 rounded-md border text-[11px] transition-colors cursor-pointer ${
                sortOrder === 'asc'
                  ? 'bg-white/10 text-white border-white/20 font-medium'
                  : 'bg-panel/40 text-zinc-400 border-white/[0.04] hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              <ArrowDownAZ className="w-3 h-3" />
              <span className="truncate">{ascLabel}</span>
            </button>
            <button
              type="button"
              onClick={() => updateCurrentFolderViewSettings({ sortOrder: 'desc' })}
              className={`flex items-center justify-center gap-1 px-1.5 py-1 rounded-md border text-[11px] transition-colors cursor-pointer ${
                sortOrder === 'desc'
                  ? 'bg-white/10 text-white border-white/20 font-medium'
                  : 'bg-panel/40 text-zinc-400 border-white/[0.04] hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              <ArrowUpZA className="w-3 h-3" />
              <span className="truncate">{descLabel}</span>
            </button>
          </div>
        </div>

        {/* Section 3: Filters */}
        <div className="pt-1.5 border-t border-white/[0.06]">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-1">
            Фильтрация записей
          </span>

          {/* Type filter */}
          <div className="grid grid-cols-4 gap-1 mb-1">
            {typeOptions.map((opt) => {
              const isActive = activeTypeFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updateCurrentFolderViewSettings({ typeFilter: opt.id })}
                  className={`flex items-center justify-center py-1 px-1 rounded-md border text-[11px] text-center transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-white/10 text-white border-white/20 font-medium'
                      : 'bg-panel/40 text-zinc-400 border-white/[0.04] hover:bg-white/[0.04] hover:text-zinc-200'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Inbox mode filter */}
          {isInbox && (
            <div className="mt-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-1">
                Статус разбора
              </span>
              <div className="grid grid-cols-3 gap-1">
                {inboxOptions.map((opt) => {
                  const isActive = inboxMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateCurrentFolderViewSettings({ inboxMode: opt.id })}
                      className={`flex items-center justify-center py-1 px-1 rounded-md border text-[11px] text-center transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-white/10 text-white border-white/20 font-medium'
                          : 'bg-panel/40 text-zinc-400 border-white/[0.04] hover:bg-white/[0.04] hover:text-zinc-200'
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Toggles */}
        <div className="space-y-1 pt-1.5 border-t border-white/[0.06]">
          <div
            onClick={() => updateCurrentFolderViewSettings({ hideCompletedTasks: !hideCompletedTasks })}
            className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-1.5 text-zinc-300 text-[11px]">
              <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
              <span>Скрыть выполненные</span>
            </div>
            <div
              className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                hideCompletedTasks ? 'bg-white border-white text-black' : 'border-white/20'
              }`}
            >
              {hideCompletedTasks && <Check className="w-2.5 h-2.5 stroke-[3]" />}
            </div>
          </div>

          <div
            onClick={() => setIsPinnedOnlyFilter(!isPinnedOnlyFilter)}
            className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-1.5 text-zinc-300 text-[11px]">
              <Pin className="w-3.5 h-3.5 text-zinc-500" />
              <span>Только закрепленные</span>
            </div>
            <div
              className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                isPinnedOnlyFilter ? 'bg-white border-white text-black' : 'border-white/20'
              }`}
            >
              {isPinnedOnlyFilter && <Check className="w-2.5 h-2.5 stroke-[3]" />}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-1.5 border-t border-white/[0.06] flex items-center justify-between">
          <button
            type="button"
            onClick={resetCurrentFolderViewSettings}
            className="flex items-center gap-1 px-1.5 py-1 text-[11px] font-mono text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Вернуть стандартный вид"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Сбросить вид</span>
          </button>
          <button
            type="button"
            onClick={closeFolderViewModal}
            className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white font-medium text-[11px] transition-colors cursor-pointer"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
