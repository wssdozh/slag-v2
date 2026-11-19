// The per-folder view settings sheet: layout, sort, filters, and resetting them.
import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { FeedViewMode, SlagItemType, SortField, InboxMode } from '../../types';
import { Icon } from '../UI/icons/Icon';
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
    setHideCompletedTasks,
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
    { id: 'feed', label: 'Лента', icon: <Icon name="entity.layers" size="sm" tone="inherit" className="shrink-0" /> },
    { id: 'kanban', label: 'Канбан', icon: <Icon name="entity.kanban" size="sm" tone="inherit" className="shrink-0" /> },
    { id: 'calendar', label: 'Календарь', icon: <Icon name="time.date" size="sm" tone="inherit" className="shrink-0" /> },
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
        className="pointer-events-auto w-[310px] max-w-[calc(100vw-16px)] rounded-2xl bg-surface-elevated/98 border border-tint-8 shadow-2xl shadow-scrim-90 backdrop-blur-xl p-3 space-y-3 motion-popover text-xs text-fg-soft"
      >
        {/* Section 1: View Modes with Reset Icon in top-right */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-3xs font-mono uppercase tracking-wider text-fg-muted">
              Режим отображения
            </span>
            <button
              type="button"
              onClick={resetCurrentFolderViewSettings}
              className="p-1 -mr-1 rounded-md text-fg-muted hover:text-fg-soft hover:bg-tint-6 transition-colors cursor-pointer"
              title="Сбросить вид по умолчанию"
              aria-label="Сбросить вид"
            >
              <Icon name="action.retry" size="sm" tone="inherit" />
            </button>
          </div>
          <div className="flex p-0.5 rounded-lg bg-tint-4 border border-tint-4">
            {viewModes.map((m) => {
              const isActive = feedViewMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => updateCurrentFolderViewSettings({ viewMode: m.id })}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-[color,background-color,box-shadow] cursor-pointer ${
                    isActive
                      ? 'bg-tint-10 text-white shadow-sm'
                      : 'text-fg-secondary hover:text-fg-soft'
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
            <span className="text-3xs font-mono uppercase tracking-wider text-fg-muted">
              Сортировка
            </span>
            <button
              type="button"
              onClick={() => updateCurrentFolderViewSettings({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' })}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-tint-6 text-2xs font-mono text-fg-secondary hover:text-white transition-colors cursor-pointer"
              title="Переключить направление сортировки"
            >
              <span>{directionLabel}</span>
              {sortOrder === 'asc' ? (
                <Icon name="action.sortAsc" size="sm" />
              ) : (
                <Icon name="action.sortDesc" size="sm" />
              )}
            </button>
          </div>

          <div className="flex p-0.5 rounded-lg bg-tint-4 border border-tint-4">
            {sortFields.map((sf) => {
              const isActive = sortBy === sf.id;
              return (
                <button
                  key={sf.id}
                  type="button"
                  onClick={() => updateCurrentFolderViewSettings({ sortBy: sf.id })}
                  className={`flex-1 py-1 rounded-md text-2xs text-center transition-[color,background-color,box-shadow] cursor-pointer ${
                    isActive
                      ? 'bg-tint-10 text-white font-medium shadow-sm'
                      : 'text-fg-secondary hover:text-fg-soft'
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
            <span className="text-3xs font-mono uppercase tracking-wider text-fg-muted block mb-1.5">
              Фильтрация записей
            </span>
            <div className="flex p-0.5 rounded-lg bg-tint-4 border border-tint-4">
              {typeOptions.map((opt) => {
                const isActive = activeTypeFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateCurrentFolderViewSettings({ typeFilter: opt.id })}
                    className={`flex-1 py-1 rounded-md text-2xs text-center transition-[color,background-color,box-shadow] cursor-pointer ${
                      isActive
                        ? 'bg-tint-10 text-white font-medium shadow-sm'
                        : 'text-fg-secondary hover:text-fg-soft'
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
            <div className="flex p-0.5 rounded-lg bg-tint-4 border border-tint-4">
              {inboxOptions.map((opt) => {
                const isActive = inboxMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateCurrentFolderViewSettings({ inboxMode: opt.id })}
                    className={`flex-1 py-1 px-1 rounded-md text-2xs text-center transition-[color,background-color,box-shadow] cursor-pointer whitespace-nowrap truncate ${
                      isActive
                        ? 'bg-tint-10 text-white font-medium shadow-sm'
                        : 'text-fg-secondary hover:text-fg-soft'
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
        <div className="pt-2 border-t border-tint-6 space-y-1.5">
          <div
            onClick={() => setHideCompletedTasks(!hideCompletedTasks)}
            className="flex items-center justify-between py-0.5 px-1 rounded-md hover:bg-tint-4 cursor-pointer transition-colors group"
          >
            <span className="text-fg-tertiary group-hover:text-white transition-colors text-xs">
              Скрыть выполненные
            </span>
            <div
              className={`w-7 h-4 rounded-full transition-colors relative shrink-0 ${
                hideCompletedTasks ? 'bg-white' : 'bg-tint-12 group-hover:bg-tint-18'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full transition-transform ${
                  hideCompletedTasks ? 'translate-x-3 bg-black' : 'translate-x-0 bg-fg-secondary'
                }`}
              />
            </div>
          </div>

          <div
            onClick={() => setIsPinnedOnlyFilter(!isPinnedOnlyFilter)}
            className="flex items-center justify-between py-0.5 px-1 rounded-md hover:bg-tint-4 cursor-pointer transition-colors group"
          >
            <span className="text-fg-tertiary group-hover:text-white transition-colors text-xs">
              Только закрепленные
            </span>
            <div
              className={`w-7 h-4 rounded-full transition-colors relative shrink-0 ${
                isPinnedOnlyFilter ? 'bg-white' : 'bg-tint-12 group-hover:bg-tint-18'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full transition-transform ${
                  isPinnedOnlyFilter ? 'translate-x-3 bg-black' : 'translate-x-0 bg-fg-secondary'
                }`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
