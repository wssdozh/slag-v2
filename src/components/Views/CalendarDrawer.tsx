// The calendar's side drawer: overdue and unscheduled tasks, draggable onto the grid.
import React from 'react';
import type { SlagItem } from '../../types';
import { Icon } from '../UI/icons/Icon';
import { getTodayString, getTomorrowString, getNextWeekString } from '../../lib/time/dateUtils';

export interface CalendarDrawerProps {
  isDrawerOpen: boolean;
  drawerTab: 'overdue' | 'unscheduled';
  setDrawerTab: (tab: 'overdue' | 'unscheduled') => void;
  setIsDrawerOpen: (open: boolean) => void;
  overdueTasks: SlagItem[];
  unscheduledTasks: SlagItem[];
  isCompletedFilter?: boolean;
  onOpenTransitionEnd?: () => void;
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
  isCompletedFilter = false,
  onOpenTransitionEnd,
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
  const isOverdueTab = drawerTab === 'overdue';
  const tasks = isOverdueTab ? overdueTasks : unscheduledTasks;
  const handleQuickSchedule = (task: SlagItem, newDate: string) => {
    updateItem({
      ...task,
      dueDate: newDate,
    });
    addToast(`Таска перенесена на ${newDate}`, 'info');
  };

  return (
    <div
      inert={!isDrawerOpen}
      onTransitionEnd={event => {
        if (isDrawerOpen && event.target === event.currentTarget && event.propertyName === 'width') onOpenTransitionEnd?.();
      }}
      className={`border-l border-tint-6 bg-panel/95 flex flex-col shrink-0 z-20 overflow-hidden transition-[width] duration-200 ease-out ${
        isDrawerOpen ? 'w-72 sm:w-80' : 'w-0 border-l-0'
      }`}
    >
      <div className="w-72 sm:w-80 flex flex-col h-full shrink-0">
        {/* Drawer Tabs */}
        <div className="h-10 px-2 border-b border-tint-6 flex items-center justify-between bg-panel">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDrawerTab('overdue')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                drawerTab === 'overdue'
                  ? 'bg-rose-500/15 text-rose-300 font-medium'
                  : 'text-fg-secondary hover:text-fg-soft'
              }`}
            >
              <Icon name="status.alert" size="sm" tone="danger" />
              <span>Просроченные</span>
              <span className="text-3xs font-mono">({overdueTasks.length})</span>
            </button>
            <button
              onClick={() => setDrawerTab('unscheduled')}
              data-drop-zone="calendar-unscheduled"
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                isDragging && activeZoneData?.dropZone === 'calendar-unscheduled'
                  ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40'
                  : drawerTab === 'unscheduled'
                  ? 'bg-tint-10 text-white font-medium'
                  : 'text-fg-secondary hover:text-fg-soft'
              }`}
            >
              <Icon name="entity.inbox" size="sm" />
              <span>Без срока</span>
              <span className="text-3xs font-mono">({unscheduledTasks.length})</span>
            </button>
          </div>

          <button
            onClick={() => setIsDrawerOpen(false)}
            className="p-1 rounded hover:bg-tint-8 text-fg-secondary hover:text-white transition-colors cursor-pointer"
            title="Свернуть панель"
          >
            <Icon name="nav.next" size="md" tone="inherit" />
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
                  : 'bg-tint-2 border-tint-10 text-fg-secondary hover:border-fg-muted'
              }`}
            >
              <Icon name="entity.inbox" size="sm" tone="warning" />
              <span>Снять срок (перенести в «Без срока»)</span>
            </div>
          )}

          {tasks.length === 0 && (
            <p className="py-12 text-center font-mono text-xs text-fg-muted">
              {isOverdueTab ? 'Нет просроченных тасок' : isCompletedFilter ? 'Нет выполненных задач без даты' : 'Все задачи имеют срок выполнения'}
            </p>
          )}
          {tasks.map(task => {
            const done = task.status === 'done';
            const title = task.title || 'Безымянная задача';
            return (
              <div key={task.id} data-draggable="true" data-testid="calendar-drawer-task"
                onPointerDown={e => handlePointerDown(e, { type: 'task', id: task.id, title })}
                className={`space-y-2 rounded-lg border bg-surface p-2.5 text-left shadow-sm transition-colors hover:bg-surface-elevated cursor-grab active:cursor-grabbing touch-none ${isOverdueTab ? 'border-danger/20 hover:border-danger/40' : 'border-tint-6 hover:border-tint-12'} ${isDragging && draggingTaskId === task.id ? 'opacity-40 scale-[0.98]' : ''}`}>
                <div className="flex items-start gap-2">
                  <button type="button" role="checkbox" aria-checked={done} aria-label={`Выполнена: ${title}`}
                    onPointerDown={e => e.stopPropagation()} onClick={() => toggleTaskComplete(task.id)}
                    className={`group/check mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border hover:border-accent focus-visible:border-accent ${done ? 'border-success' : 'border-fg-dim'}`}>
                    <Icon name="action.check" size="xs" tone={done ? 'success' : 'accent'} className={done ? '' : 'opacity-0 group-hover/check:opacity-100'} />
                  </button>
                  <button type="button" onClick={() => {
                    setSelectedItem(task);
                    setIsFullscreenEditorOpen(true);
                  }} className="line-clamp-2 min-w-0 text-start text-xs font-medium leading-snug text-fg-soft hover:text-fg-primary">
                    {title}
                  </button>
                </div>
                {isOverdueTab && <p className="border-t border-tint-4 pt-1 font-mono text-3xs text-danger">Срок: {task.dueDate}</p>}
                {!done && <div className="flex items-center gap-1.5 pt-1 font-mono text-3xs">
                  {!isOverdueTab && <span className="mr-auto text-fg-muted">Назначить:</span>}
                  {([
                    ['Сегодня', getTodayString], ['Завтра', getTomorrowString], ['+Неделя', getNextWeekString],
                  ] as const).map(([label, getDate]) => (
                    <button key={label} type="button" onPointerDown={e => e.stopPropagation()}
                      onClick={() => handleQuickSchedule(task, getDate())}
                      className="rounded bg-tint-4 px-2 py-0.5 text-fg-tertiary transition-colors hover:bg-tint-10 focus-visible:bg-tint-10">
                      {label}
                    </button>
                  ))}
                </div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
