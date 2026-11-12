// The calendar's side drawer: overdue and unscheduled tasks, draggable onto the grid.
import React from 'react';
import type { SlagItem } from '../../types';
import {
  Check,
  AlertCircle,
  Inbox,
  ChevronRight,
} from 'lucide-react';
import { getTodayString, getTomorrowString, getNextWeekString } from '../../lib/time/dateUtils';

export interface CalendarDrawerProps {
  isDrawerOpen: boolean;
  drawerTab: 'overdue' | 'unscheduled';
  setDrawerTab: (tab: 'overdue' | 'unscheduled') => void;
  setIsDrawerOpen: (open: boolean) => void;
  overdueTasks: SlagItem[];
  unscheduledTasks: SlagItem[];
  isDragging: boolean;
  activeZoneData: Record<string, string> | null;
  draggingTaskId: string | null;
  handlePointerDown: (e: React.PointerEvent, payload: { type: 'task'; id: string; title: string }) => void;
  setSelectedItem: (item: SlagItem) => void;
  setIsFullscreenEditorOpen: (open: boolean) => void;
  toggleTaskComplete: (id: string) => void;
  updateItem: (item: SlagItem) => void;
  addToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
}

export const CalendarDrawer: React.FC<CalendarDrawerProps> = ({
  isDrawerOpen,
  drawerTab,
  setDrawerTab,
  setIsDrawerOpen,
  overdueTasks,
  unscheduledTasks,
  isDragging,
  activeZoneData,
  draggingTaskId,
  handlePointerDown,
  setSelectedItem,
  setIsFullscreenEditorOpen,
  toggleTaskComplete,
  updateItem,
  addToast,
}) => {
  const handleQuickSchedule = (task: SlagItem, newDate: string) => {
    updateItem({
      ...task,
      dueDate: newDate,
    });
    addToast(`Таска перенесена на ${newDate}`, 'info');
  };

  return (
    <div
      className={`border-l border-white/[0.06] bg-panel/95 flex flex-col shrink-0 z-20 overflow-hidden transition-[width] duration-200 ease-out ${
        isDrawerOpen ? 'w-72 sm:w-80' : 'w-0 border-l-0'
      }`}
    >
      <div className="w-72 sm:w-80 flex flex-col h-full shrink-0">
        {/* Drawer Tabs */}
        <div className="h-10 px-2 border-b border-white/[0.06] flex items-center justify-between bg-panel">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDrawerTab('overdue')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                drawerTab === 'overdue'
                  ? 'bg-rose-500/15 text-rose-300 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>Просроченные</span>
              <span className="text-[10px] font-mono">({overdueTasks.length})</span>
            </button>
            <button
              onClick={() => setDrawerTab('unscheduled')}
              data-drop-zone="calendar-unscheduled"
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                isDragging && activeZoneData?.dropZone === 'calendar-unscheduled'
                  ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40'
                  : drawerTab === 'unscheduled'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Inbox className="w-3.5 h-3.5 text-zinc-400" />
              <span>Без срока</span>
              <span className="text-[10px] font-mono">({unscheduledTasks.length})</span>
            </button>
          </div>

          <button
            onClick={() => setIsDrawerOpen(false)}
            className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Свернуть панель"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Tasks List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin">
          {isDragging && (
            <div
              data-drop-zone="calendar-unscheduled"
              className={`p-3 rounded-lg border-2 border-dashed transition-colors text-center text-xs font-mono flex items-center justify-center gap-2 cursor-pointer ${
                activeZoneData?.dropZone === 'calendar-unscheduled'
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-200 scale-[1.01]'
                  : 'bg-white/[0.02] border-white/[0.1] text-zinc-400 hover:border-zinc-500'
              }`}
            >
              <Inbox className="w-3.5 h-3.5 text-amber-400" />
              <span>Снять срок (перенести в «Без срока»)</span>
            </div>
          )}

          {drawerTab === 'overdue' ? (
            overdueTasks.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-600 font-mono">
                Нет просроченных тасок
              </div>
            ) : (
              overdueTasks.map(task => (
                <div
                  key={task.id}
                  data-draggable="true"
                  onPointerDown={e =>
                    handlePointerDown(e, {
                      type: 'task',
                      id: task.id,
                      title: task.title || 'Таска',
                    })
                  }
                  onClick={() => {
                    setSelectedItem(task);
                    setIsFullscreenEditorOpen(true);
                  }}
                  className={`p-2.5 rounded-lg bg-surface hover:bg-surface-elevated border border-rose-500/20 hover:border-rose-500/40 transition-colors text-left space-y-2 shadow-sm cursor-grab active:cursor-grabbing touch-none ${
                    isDragging && draggingTaskId === task.id ? 'opacity-40 ring-1 ring-blue-500/50 scale-[0.98]' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        toggleTaskComplete(task.id);
                      }}
                      className="mt-0.5 w-3.5 h-3.5 rounded-full border border-zinc-600 hover:border-blue-400 flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Check className="w-2 h-2 text-blue-400 opacity-0 hover:opacity-100" />
                    </button>
                    <span className="text-xs font-medium text-zinc-200 leading-snug line-clamp-2">
                      {task.title || 'Безымянная задача'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-rose-400 pt-1 border-t border-white/[0.04]">
                    <span>Срок: {task.dueDate}</span>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1 text-[10px] font-mono">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleQuickSchedule(task, getTodayString());
                      }}
                      className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 transition-colors cursor-pointer"
                    >
                      Сегодня
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleQuickSchedule(task, getTomorrowString());
                      }}
                      className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 transition-colors cursor-pointer"
                    >
                      Завтра
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleQuickSchedule(task, getNextWeekString());
                      }}
                      className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 transition-colors cursor-pointer"
                    >
                      +Неделя
                    </button>
                  </div>
                </div>
              ))
            )
          ) : unscheduledTasks.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-600 font-mono">
              Все задачи имеют срок выполнения
            </div>
          ) : (
            unscheduledTasks.map(task => (
              <div
                key={task.id}
                data-draggable="true"
                onPointerDown={e =>
                  handlePointerDown(e, {
                    type: 'task',
                    id: task.id,
                    title: task.title || 'Таска',
                  })
                }
                onClick={() => {
                  setSelectedItem(task);
                  setIsFullscreenEditorOpen(true);
                }}
                className={`p-2.5 rounded-lg bg-surface hover:bg-surface-elevated border border-white/[0.06] hover:border-white/[0.12] transition-colors text-left space-y-2 shadow-sm cursor-grab active:cursor-grabbing touch-none ${
                  isDragging && draggingTaskId === task.id ? 'opacity-40 ring-1 ring-blue-500/50 scale-[0.98]' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      toggleTaskComplete(task.id);
                    }}
                    className="mt-0.5 w-3.5 h-3.5 rounded-full border border-zinc-600 hover:border-blue-400 flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <Check className="w-2 h-2 text-blue-400 opacity-0 hover:opacity-100" />
                  </button>
                  <span className="text-xs font-medium text-zinc-200 leading-snug line-clamp-2">
                    {task.title || 'Безымянная задача'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 pt-1 text-[10px] font-mono border-t border-white/[0.04]">
                  <span className="text-zinc-500 mr-auto">Назначить:</span>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleQuickSchedule(task, getTodayString());
                    }}
                    className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 transition-colors cursor-pointer"
                  >
                    Сегодня
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleQuickSchedule(task, getTomorrowString());
                    }}
                    className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 transition-colors cursor-pointer"
                  >
                    Завтра
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleQuickSchedule(task, getNextWeekString());
                    }}
                    className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 transition-colors cursor-pointer"
                  >
                    +Неделя
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
