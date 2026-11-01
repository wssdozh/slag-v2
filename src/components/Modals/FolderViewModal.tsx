import React from 'react';
import { useApp } from '../../context/AppContext';
import { BaseModal } from './BaseModal';
import { Button } from '../UI/Button';
import { Checkbox } from '../UI/Checkbox';
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
  StickyNote,
  CheckSquare,
  FileText,
  FolderCheck,
  Inbox,
  Pin,
  EyeOff,
  RotateCcw,
} from 'lucide-react';

export const FolderViewModal: React.FC = () => {
  const {
    isFolderViewModalOpen,
    closeFolderViewModal,
    currentFolder,
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
  } = useApp();

  const isInbox = currentFolder === 'Входящие';

  const viewModes: { id: FeedViewMode; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      id: 'feed',
      label: 'Лента',
      desc: 'Поток записей',
      icon: <Layers className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'kanban',
      label: 'Канбан',
      desc: 'Доска задач',
      icon: <Kanban className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'calendar',
      label: 'Календарь',
      desc: 'Сетка дедлайнов',
      icon: <Calendar className="w-4 h-4 shrink-0" />,
    },
  ];

  const sortFields: { id: SortField; label: string; icon: React.ReactNode }[] = [
    { id: 'createdAt', label: 'По дате создания', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'updatedAt', label: 'По дате изменения', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'title', label: 'По названию', icon: <ArrowDownAZ className="w-3.5 h-3.5" /> },
    { id: 'dueDate', label: 'По дедлайну', icon: <CalendarClock className="w-3.5 h-3.5" /> },
  ];

  const typeOptions: { id: SlagItemType | 'all'; label: string; icon?: React.ReactNode }[] = [
    { id: 'all', label: 'Все' },
    { id: 'note', label: 'Заметки', icon: <StickyNote className="w-3.5 h-3.5" /> },
    { id: 'task', label: 'Таски', icon: <CheckSquare className="w-3.5 h-3.5" /> },
    { id: 'article', label: 'Статьи', icon: <FileText className="w-3.5 h-3.5" /> },
  ];

  const inboxOptions: { id: InboxMode; label: string; icon?: React.ReactNode }[] = [
    { id: 'all', label: 'Все' },
    { id: 'sorted', label: 'Разобранные', icon: <FolderCheck className="w-3.5 h-3.5" /> },
    { id: 'unsorted', label: 'Неразобранные', icon: <Inbox className="w-3.5 h-3.5" /> },
  ];

  const ascLabel = sortBy === 'title' ? 'А → Я' : 'Сначала старые';
  const descLabel = sortBy === 'title' ? 'Я → А' : 'Сначала новые';

  return (
    <BaseModal
      isOpen={isFolderViewModalOpen}
      onClose={closeFolderViewModal}
      maxWidth="max-w-md"
      icon={<SlidersHorizontal className="w-4 h-4 text-zinc-300" />}
      title="Вид и фильтры"
      subtitle={`Папка «${currentFolder}»`}
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={resetCurrentFolderViewSettings}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Вернуть стандартный вид"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Сбросить вид</span>
          </button>
          <Button
            size="sm"
            variant="primary"
            onClick={closeFolderViewModal}
          >
            Готово
          </Button>
        </div>
      }
    >
      <div className="p-4 sm:p-5 space-y-5 text-xs text-zinc-200 select-none">
        {/* Section 1: View Modes */}
        <div>
          <label className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 block mb-2">
            Режим отображения
          </label>
          <div className="grid grid-cols-3 gap-2">
            {viewModes.map((m) => {
              const isActive = feedViewMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => updateCurrentFolderViewSettings({ viewMode: m.id })}
                  className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white/10 text-white border-white/20 shadow-sm'
                      : 'bg-panel/40 text-zinc-400 border-white/[0.06] hover:bg-white/[0.04] hover:text-zinc-200'
                  }`}
                >
                  <div className={isActive ? 'text-white' : 'text-zinc-400'}>
                    {m.icon}
                  </div>
                  <span className="font-medium text-xs text-zinc-100">{m.label}</span>
                  <span className="text-[10px] text-zinc-500 truncate max-w-full">
                    {m.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Sorting */}
        <div className="space-y-2.5 pt-1 border-t border-white/[0.04]">
          <label className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 block mb-1">
            Сортировка
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {sortFields.map((sf) => {
              const isActive = sortBy === sf.id;
              return (
                <button
                  key={sf.id}
                  type="button"
                  onClick={() => updateCurrentFolderViewSettings({ sortBy: sf.id })}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-white/10 text-white border-white/20 font-medium'
                      : 'bg-panel/30 text-zinc-400 border-white/[0.06] hover:bg-white/[0.04] hover:text-zinc-200'
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

          {/* Direction toggle */}
          <div className="flex items-center gap-1.5 pt-1">
            <span className="text-zinc-500 text-[11px] font-mono w-16 shrink-0">Порядок:</span>
            <div className="grid grid-cols-2 gap-1.5 flex-1">
              <button
                type="button"
                onClick={() => updateCurrentFolderViewSettings({ sortOrder: 'asc' })}
                className={`flex items-center justify-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-colors cursor-pointer ${
                  sortOrder === 'asc'
                    ? 'bg-white/10 text-white border-white/20'
                    : 'bg-panel/30 text-zinc-400 border-white/[0.06] hover:text-zinc-200 hover:bg-white/[0.04]'
                }`}
              >
                <ArrowDownAZ className="w-3.5 h-3.5" />
                <span>{ascLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => updateCurrentFolderViewSettings({ sortOrder: 'desc' })}
                className={`flex items-center justify-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-colors cursor-pointer ${
                  sortOrder === 'desc'
                    ? 'bg-white/10 text-white border-white/20'
                    : 'bg-panel/30 text-zinc-400 border-white/[0.06] hover:text-zinc-200 hover:bg-white/[0.04]'
                }`}
              >
                <ArrowUpZA className="w-3.5 h-3.5" />
                <span>{descLabel}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Section 3: Filters */}
        <div className="space-y-3 pt-1 border-t border-white/[0.04]">
          <label className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 block mb-1">
            Фильтрация записей
          </label>

          {/* Type filter */}
          <div>
            <span className="text-zinc-500 text-[11px] font-mono block mb-1.5">Тип контента:</span>
            <div className="grid grid-cols-4 gap-1.5">
              {typeOptions.map((opt) => {
                const isActive = activeTypeFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateCurrentFolderViewSettings({ typeFilter: opt.id })}
                    className={`flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-lg border text-center transition-colors cursor-pointer text-xs ${
                      isActive
                        ? 'bg-white/10 text-white border-white/20 font-medium'
                        : 'bg-panel/30 text-zinc-400 border-white/[0.06] hover:bg-white/[0.04] hover:text-zinc-200'
                    }`}
                  >
                    {opt.icon && <span className={isActive ? 'text-white' : 'text-zinc-500'}>{opt.icon}</span>}
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inbox mode filter (only for Inbox) */}
          {isInbox && (
            <div>
              <span className="text-zinc-500 text-[11px] font-mono block mb-1.5">Статус разбора:</span>
              <div className="grid grid-cols-3 gap-1.5">
                {inboxOptions.map((opt) => {
                  const isActive = inboxMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateCurrentFolderViewSettings({ inboxMode: opt.id })}
                      className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border text-center transition-colors cursor-pointer text-xs ${
                        isActive
                          ? 'bg-white/10 text-white border-white/20 font-medium'
                          : 'bg-panel/30 text-zinc-400 border-white/[0.06] hover:bg-white/[0.04] hover:text-zinc-200'
                      }`}
                    >
                      {opt.icon && <span className={isActive ? 'text-white' : 'text-zinc-500'}>{opt.icon}</span>}
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick toggle options */}
          <div className="space-y-2 pt-1.5">
            <div className="flex items-center justify-between p-2 rounded-lg bg-panel/30 border border-white/[0.04]">
              <div className="flex items-center gap-2">
                <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-300">Скрыть выполненные задачи</span>
              </div>
              <Checkbox
                checked={hideCompletedTasks}
                onChange={(checked) => updateCurrentFolderViewSettings({ hideCompletedTasks: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-panel/30 border border-white/[0.04]">
              <div className="flex items-center gap-2">
                <Pin className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-300">Только закрепленные</span>
              </div>
              <Checkbox
                checked={isPinnedOnlyFilter}
                onChange={(checked) => setIsPinnedOnlyFilter(checked)}
              />
            </div>
          </div>
        </div>
      </div>
    </BaseModal>
  );
};
