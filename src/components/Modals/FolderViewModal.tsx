// The per-folder view settings sheet: layout, sort, filters, and resetting them.
import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { FeedViewMode, SlagItemType, SortField, InboxMode } from '../../types';
import {
  Layers,
  Kanban,
  Calendar,
  ArrowDownAZ,
  ArrowUpZA,
  RotateCcw,
} from 'lucide-react';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { usePresence } from '../../hooks/ui/usePresence';

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

  const isInbox = currentFolder === DEFAULT_INBOX_FOLDER;
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const [cachedCoords, setCachedCoords] = useState<{ top: number; right: number } | null>(null);
  if (coords && coords !== cachedCoords) {
    setCachedCoords(coords);
  }
  const effectiveCoords = coords || cachedCoords;

  const { ref, phase, isPresent, onTransitionEnd } = usePresence(isFolderViewModalOpen);

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

  if (!isPresent) return null;

  const viewModes: { id: FeedViewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'feed', label: 'Лента', icon: <Layers className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'kanban', label: 'Канбан', icon: <Kanban className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'calendar', label: 'Календарь', icon: <Calendar className="w-3.5 h-3.5 shrink-0" /> },
  ];

  const sortFields: { id: SortField; label: string }[] = [
    { id: 'createdAt', label: 'Создание' },
    { id: 'updatedAt', label: 'Изменение' },
    { id: 'title', label: 'Название' },
    { id: 'dueDate', label: 'Дедлайн' },
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

  const directionLabel =
    sortBy === 'title'
      ? sortOrder === 'asc'
        ? 'А → Я'
        : 'Я → А'
      : sortOrder === 'asc'
        ? 'Старые'
        : 'Новые';

  return (
    <div className="fixed inset-0 z-50 pointer-events-none select-none">
      {/* Invisible backdrop to dismiss popover on outside click without darkening screen */}
      <div
        className="fixed inset-0 pointer-events-auto bg-transparent"
        onClick={closeFolderViewModal}
      />

      {/* Lightweight Linear Dark dropdown popover */}
      <div
        ref={ref}
        role="dialog"
        aria-label="Вид и фильтры"
        aria-modal="true"
        data-motion-state={phase}
        onTransitionEnd={onTransitionEnd}
        inert={!isFolderViewModalOpen}
        style={{
          position: 'fixed',
          top: effectiveCoords ? `${effectiveCoords.top}px` : '56px',
          right: effectiveCoords ? `${effectiveCoords.right}px` : '16px',
        }}
        className="pointer-events-auto w-[310px] max-w-[calc(100vw-16px)] rounded-2xl bg-surface-elevated/98 border border-white/[0.08] shadow-2xl shadow-black/90 backdrop-blur-xl p-3 space-y-3 motion-popover text-xs text-zinc-200"
      >
        {/* Section 1: View Modes with Reset Icon in top-right */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Режим отображения
            </span>
            <button
              type="button"
              onClick={resetCurrentFolderViewSettings}
              className="p-1 -mr-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Сбросить вид по умолчанию"
              aria-label="Сбросить вид"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.04]">
            {viewModes.map((m) => {
              const isActive = feedViewMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => updateCurrentFolderViewSettings({ viewMode: m.id })}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-[color,background-color,box-shadow] cursor-pointer ${
                    isActive
                      ? 'bg-white/10 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
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
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Сортировка
            </span>
            <button
              type="button"
              onClick={() => updateCurrentFolderViewSettings({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' })}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-white/[0.06] text-[11px] font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Переключить направление сортировки"
            >
              <span>{directionLabel}</span>
              {sortOrder === 'asc' ? (
                <ArrowDownAZ className="w-3.5 h-3.5 text-zinc-400" />
              ) : (
                <ArrowUpZA className="w-3.5 h-3.5 text-zinc-400" />
              )}
            </button>
          </div>

          <div className="flex p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.04]">
            {sortFields.map((sf) => {
              const isActive = sortBy === sf.id;
              return (
                <button
                  key={sf.id}
                  type="button"
                  onClick={() => updateCurrentFolderViewSettings({ sortBy: sf.id })}
                  className={`flex-1 py-1 rounded-md text-[11px] text-center transition-[color,background-color,box-shadow] cursor-pointer ${
                    isActive
                      ? 'bg-white/10 text-white font-medium shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {sf.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 3: Filters */}
        <div className="space-y-2 pt-0.5">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-1.5">
              Фильтрация записей
            </span>
            <div className="flex p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.04]">
              {typeOptions.map((opt) => {
                const isActive = activeTypeFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateCurrentFolderViewSettings({ typeFilter: opt.id })}
                    className={`flex-1 py-1 rounded-md text-[11px] text-center transition-[color,background-color,box-shadow] cursor-pointer ${
                      isActive
                        ? 'bg-white/10 text-white font-medium shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inbox mode filter */}
          {isInbox && (
            <div className="flex p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.04]">
              {inboxOptions.map((opt) => {
                const isActive = inboxMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateCurrentFolderViewSettings({ inboxMode: opt.id })}
                    className={`flex-1 py-1 px-1 rounded-md text-[11px] text-center transition-[color,background-color,box-shadow] cursor-pointer whitespace-nowrap truncate ${
                      isActive
                        ? 'bg-white/10 text-white font-medium shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 4: iOS / Linear Switches */}
        <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
          <div
            onClick={() => updateCurrentFolderViewSettings({ hideCompletedTasks: !hideCompletedTasks })}
            className="flex items-center justify-between py-0.5 px-1 rounded-md hover:bg-white/[0.04] cursor-pointer transition-colors group"
          >
            <span className="text-zinc-300 group-hover:text-white transition-colors text-xs">
              Скрыть выполненные
            </span>
            <div
              className={`w-7 h-4 rounded-full transition-colors relative shrink-0 ${
                hideCompletedTasks ? 'bg-white' : 'bg-white/[0.12] group-hover:bg-white/[0.18]'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full transition-transform ${
                  hideCompletedTasks ? 'translate-x-3 bg-black' : 'translate-x-0 bg-zinc-400'
                }`}
              />
            </div>
          </div>

          <div
            onClick={() => setIsPinnedOnlyFilter(!isPinnedOnlyFilter)}
            className="flex items-center justify-between py-0.5 px-1 rounded-md hover:bg-white/[0.04] cursor-pointer transition-colors group"
          >
            <span className="text-zinc-300 group-hover:text-white transition-colors text-xs">
              Только закрепленные
            </span>
            <div
              className={`w-7 h-4 rounded-full transition-colors relative shrink-0 ${
                isPinnedOnlyFilter ? 'bg-white' : 'bg-white/[0.12] group-hover:bg-white/[0.18]'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full transition-transform ${
                  isPinnedOnlyFilter ? 'translate-x-3 bg-black' : 'translate-x-0 bg-zinc-400'
                }`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
