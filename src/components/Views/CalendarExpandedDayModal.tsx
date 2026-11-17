// A single day blown up: all of its tasks, with add, drag and complete right there.
import React from 'react';
import type { SlagItem } from '../../types';
import { getTaskTimeSlot } from '../../lib/time/todoistTaskParser';
import { getPriorityBadge } from './calendarHelpers';
import { baseTaskId } from '../../lib/tasks/taskUtils';
import { Icon } from '../UI/icons/Icon';
import { pluralRu } from '../../lib/time/dateUtils';

export interface CalendarExpandedDayModalProps {
  isExpandedDayPresent: boolean;
  effectiveDayDateStr: string | null;
  isExpandedDayOpen: boolean;
  expandedDayPhase: 'entering' | 'open' | 'exiting' | 'closed';
  expandedDayRef: React.RefObject<HTMLDivElement | null>;
  onExpandedDayTransitionEnd: (event: React.TransitionEvent<HTMLDivElement>) => void;
  setExpandedDayDateStr: (val: string | null) => void;
  tasksByDueDate: Map<string, Array<SlagItem & { isVirtual?: boolean }>>;
  items: SlagItem[];
  draggingTaskId: string | null;
  handlePointerDown: (e: React.PointerEvent, payload: { type: 'task'; id: string; title: string }) => void;
  setSelectedItem: (item: SlagItem) => void;
  setIsFullscreenEditorOpen: (open: boolean) => void;
  toggleTaskComplete: (id: string) => void;
  openComposerModal: (params: { type: 'task'; dueDate?: string; folder?: string }) => void;
  currentFolder: string;
}

export const CalendarExpandedDayModal: React.FC<CalendarExpandedDayModalProps> = ({
  isExpandedDayPresent,
  effectiveDayDateStr,
  isExpandedDayOpen,
  expandedDayPhase,
  expandedDayRef,
  onExpandedDayTransitionEnd,
  setExpandedDayDateStr,
  tasksByDueDate,
  items,
  draggingTaskId,
  handlePointerDown,
  setSelectedItem,
  setIsFullscreenEditorOpen,
  toggleTaskComplete,
  openComposerModal,
  currentFolder,
}) => {
  if (!isExpandedDayPresent || !effectiveDayDateStr) return null;

  const dayTasks = tasksByDueDate.get(effectiveDayDateStr) || [];

  return (
    <div
      ref={expandedDayRef}
      data-motion-state={expandedDayPhase}
      onTransitionEnd={onExpandedDayTransitionEnd}
      inert={!isExpandedDayOpen}
      onClick={() => setExpandedDayDateStr(null)}
      className="fixed inset-0 z-50 bg-scrim-70 flex items-center justify-center p-4 motion-fade"
    >
      <div
        onClick={e => e.stopPropagation()}
        data-motion-state={expandedDayPhase}
        className="w-full max-w-md rounded-2xl bg-surface border border-tint-10 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden motion-dialog"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-tint-6 flex items-center justify-between bg-surface-elevated">
          <div className="flex items-center gap-2">
            <Icon name="time.date" size="md" tone="tertiary" />
            <h3 className="text-sm font-semibold text-fg-primary">
              {effectiveDayDateStr}
            </h3>
            <span className="text-2xs font-mono text-fg-muted">
              ({dayTasks.length} {pluralRu(dayTasks.length, ['таска', 'таски', 'тасок'])})
            </span>
          </div>
          <button
            data-testid="close-expanded-day-modal"
            title="Закрыть (Esc)"
            onClick={() => setExpandedDayDateStr(null)}
            className="p-1 rounded-md text-fg-secondary hover:text-white hover:bg-tint-8 transition-colors cursor-pointer"
          >
            <Icon name="action.close" size="md" tone="inherit" />
          </button>
        </div>

        {/* Tasks list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin">
          {dayTasks.length === 0 ? (
            <div className="py-12 text-center text-xs text-fg-muted font-mono">
              На этот день пока нет тасок
            </div>
          ) : (
            dayTasks.map(task => {
              const slot = getTaskTimeSlot(task);
              const styling = getPriorityBadge(task.priority);
              const isDone = task.status === 'done';
              const isDragging = draggingTaskId === task.id;
              const realTaskId = baseTaskId(task.id);

              return (
                <div
                  key={task.id}
                  data-draggable="true"
                  onPointerDown={e =>
                    handlePointerDown(e, {
                      type: 'task',
                      id: realTaskId,
                      title: task.title || 'Таска',
                    })
                  }
                  onClick={() => {
                    const target = items.find(i => i.id === realTaskId) || task;
                    setSelectedItem(target);
                    setIsFullscreenEditorOpen(true);
                  }}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-colors cursor-grab active:cursor-grabbing touch-none ${styling.bg} ${styling.border} ${
                    task.isVirtual ? 'border-dashed opacity-85' : ''
                  } ${
                    isDragging && draggingTaskId === realTaskId ? 'opacity-40 ring-1 ring-blue-500/50 scale-[0.98]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        toggleTaskComplete(realTaskId);
                      }}
                      className={`group/chk w-4 h-4 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                        isDone
                          ? 'border-2 border-blue-500 bg-blue-500 text-white'
                          : `border-2 ${styling.checkboxBorder} ${styling.checkboxHover} bg-transparent`
                      }`}
                    >
                      <Icon name="action.check" size="xs" tone="inherit" className={`w-2.5 h-2.5 stroke-[3] transition-opacity ${isDone ? 'opacity-100 text-white' : 'opacity-0 group-hover/chk:opacity-100'}`} />
                    </button>
                    <span
                      className={`text-xs font-medium leading-snug truncate ${
                        isDone ? 'line-through text-fg-muted' : 'text-fg-soft'
                      }`}
                    >
                      {task.title}
                    </span>
                    {task.recurrence && (
                      <span title="Повторяющаяся таска" className="shrink-0 flex items-center">
                        <Icon name="time.repeat" size="xs" tone="warning" />
                      </span>
                    )}
                  </div>

                  <span className="text-3xs font-mono text-fg-secondary shrink-0">
                    {slot.isAllDay ? 'Весь день' : slot.timeLabel}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Quick Add at bottom */}
        <div className="p-3 border-t border-tint-6 bg-surface-elevated">
          <button
            onClick={() => {
              openComposerModal({
                type: 'task',
                dueDate: effectiveDayDateStr,
                folder: currentFolder,
              });
            }}
            className="w-full flex items-center justify-center gap-2 bg-canvas hover:bg-tint-4 border border-tint-8 hover:border-tint-16 rounded-xl px-3 py-2 text-xs text-fg-secondary hover:text-fg-soft transition-colors cursor-pointer"
          >
            <Icon name="action.add" size="sm" />
            <span>Добавить таску...</span>
          </button>
        </div>
      </div>
    </div>
  );
};
