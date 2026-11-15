// The month grid: six weeks of cells, the task pills in each, and drop zones while dragging.
import React from 'react';
import type { SlagItem } from '../../types';
import type { MonthCalendarCell } from '../../lib/time/dateUtils';
import { RUSSIAN_WEEKDAYS } from '../../lib/time/dateUtils';
import { getTaskTimeSlot } from '../../lib/time/todoistTaskParser';
import { baseTaskId } from '../../lib/tasks/taskUtils';
import { Icon } from '../UI/icons/Icon';
export interface CalendarMonthViewProps {
  monthHorizontalScrollRef: React.RefObject<HTMLDivElement | null>;
  monthGridRef: React.RefObject<HTMLDivElement | null>;
  monthGridScrollbarWidth: number;
  monthCells: MonthCalendarCell[];
  tasksByDueDate: Map<string, Array<SlagItem & { isVirtual?: boolean }>>;
  todayStr: string;
  isDragging: boolean;
  draggingTaskId: string | null;
  activeZoneData: Record<string, string> | null;
  items: SlagItem[];
  currentFolder: string;
  getPriorityBadge: (priority?: 'none' | 'low' | 'medium' | 'high') => {
    bg: string;
    border: string;
    text: string;
    dot: string;
    checkboxBorder: string;
    checkboxHover: string;
  };
  handlePointerDown: (e: React.PointerEvent, payload: { type: 'task'; id: string; title: string }) => void;
  setSelectedItem: (item: SlagItem) => void;
  setIsFullscreenEditorOpen: (open: boolean) => void;
  openComposerModal: (params: { type: 'task'; dueDate?: string; folder?: string }) => void;
  setExpandedDayDateStr: (dateStr: string) => void;
}

export const CalendarMonthView: React.FC<CalendarMonthViewProps> = ({
  monthHorizontalScrollRef,
  monthGridRef,
  monthGridScrollbarWidth,
  monthCells,
  tasksByDueDate,
  todayStr,
  isDragging,
  draggingTaskId,
  activeZoneData,
  items,
  currentFolder,
  getPriorityBadge,
  handlePointerDown,
  setSelectedItem,
  setIsFullscreenEditorOpen,
  openComposerModal,
  setExpandedDayDateStr,
}) => {
  return (
    <div
      ref={monthHorizontalScrollRef}
      className="flex-1 flex flex-col overflow-x-auto overflow-y-hidden min-h-0 min-w-0 scrollbar-thin bg-canvas cursor-grab"
    >
      <div className="flex-1 flex flex-col min-w-[700px] h-full">
        {/* Day Header Row */}
        <div className="flex border-b border-tint-6 bg-panel/80 shrink-0 cursor-grab">
          <div className="flex-1 grid grid-cols-7">
            {RUSSIAN_WEEKDAYS.map(day => (
              <div
                key={day}
                className="py-1.5 text-center text-3xs font-mono text-fg-muted tracking-wider border-r border-tint-4 last:border-r-0"
              >
                {day}
              </div>
            ))}
          </div>
          {monthGridScrollbarWidth > 0 && (
            <div style={{ width: monthGridScrollbarWidth }} className="shrink-0 bg-panel" />
          )}
        </div>

        {/* Month Calendar Cells Grid */}
        <div
          ref={monthGridRef}
          className="flex-1 grid grid-cols-7 auto-rows-fr overflow-y-auto scrollbar-thin"
        >
          {monthCells.map(cell => {
            const dayTasks = tasksByDueDate.get(cell.dateStr) || [];
            const isToday = cell.dateStr === todayStr;
            const isOver =
              isDragging &&
              activeZoneData?.dropZone === 'calendar-month' &&
              activeZoneData.dropDate === cell.dateStr;

            return (
              <div
                key={cell.dateStr}
                data-drop-zone="calendar-month"
                data-drop-date={cell.dateStr}
                onClick={() => {
                  openComposerModal({
                    type: 'task',
                    dueDate: cell.dateStr,
                    folder: currentFolder,
                  });
                }}
                className={`min-h-[96px] p-1.5 border-b border-r border-tint-4 flex flex-col justify-between transition-colors cursor-pointer group ${
                  cell.isCurrentMonth ? 'bg-canvas hover:bg-panel' : 'bg-canvas-subtle text-fg-dim'
                } ${isOver ? 'bg-blue-500/15 ring-1 ring-blue-500/40 border-blue-500/30' : ''}`}
              >
                {/* Cell Header: Day Number */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-mono ${
                      isToday
                        ? 'w-5 h-5 rounded-full bg-white text-canvas font-bold text-xs flex items-center justify-center shadow-sm'
                        : cell.isCurrentMonth
                        ? 'text-fg-tertiary font-medium'
                        : 'text-fg-dim'
                    }`}
                  >
                    {cell.date.getDate()}
                  </span>

                  {/* Quick Add Button */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      openComposerModal({
                        type: 'task',
                        dueDate: cell.dateStr,
                        folder: currentFolder,
                      });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-tint-8 text-fg-secondary hover:text-white transition-opacity cursor-pointer"
                    title="Добавить таску"
                  >
                    <Icon name="action.add" size="xs" tone="inherit" />
                  </button>
                </div>

                {/* Tasks in cell (compact list) */}
                <div className="flex-1 overflow-hidden space-y-1 my-1">
                  {dayTasks.slice(0, 3).map(task => {
                    const slot = getTaskTimeSlot(task);
                    const styling = getPriorityBadge(task.priority);
                    const isDone = task.status === 'done';
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
                        onClick={e => {
                          e.stopPropagation();
                          const target = items.find(i => i.id === realTaskId) || task;
                          setSelectedItem(target);
                          setIsFullscreenEditorOpen(true);
                        }}
                        className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-tint-3 hover:bg-tint-8 text-3xs text-fg-tertiary truncate transition-colors touch-none ${
                          task.isVirtual ? 'border border-dashed border-tint-20 opacity-80' : ''
                        } ${
                          isDragging && draggingTaskId === realTaskId
                            ? 'opacity-40 ring-1 ring-blue-500/50 scale-[0.98]'
                            : 'cursor-grab active:cursor-grabbing'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styling.dot}`} />
                        <span className={`truncate flex-1 ${isDone ? 'line-through text-fg-muted' : ''}`}>
                          {task.title}
                        </span>
                        {task.recurrence && (
                          <span title="Повторяющаяся таска" className="shrink-0 flex items-center">
                            <Icon name="time.repeat" size="none" tone="warning" className="w-2.5 h-2.5" />
                          </span>
                        )}
                        {!slot.isAllDay && (
                          <span className="text-2xs font-mono text-fg-muted shrink-0">
                            {String(slot.startHour).padStart(2, '0')}:{String(slot.startMinute).padStart(2, '0')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Overflow badge "+N еще" */}
                {dayTasks.length > 3 && (
                  <div
                    onClick={e => {
                      e.stopPropagation();
                      setExpandedDayDateStr(cell.dateStr);
                    }}
                    className="text-2xs font-mono text-fg-secondary hover:text-fg-soft transition-colors text-right cursor-pointer"
                  >
                    +{dayTasks.length - 3} еще
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
