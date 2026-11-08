import React from 'react';
import type { SlagItem } from '../../types';
import { getTaskTimeSlot } from '../../lib/todoistTaskParser';
import { getPriorityBadge } from './calendarHelpers';
import {
  Calendar as CalendarIcon,
  Check,
  X,
  Plus,
  Repeat,
} from 'lucide-react';
import { pluralRu } from '../../lib/dateUtils';

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
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 motion-fade"
    >
      <div
        onClick={e => e.stopPropagation()}
        data-motion-state={expandedDayPhase}
        className="w-full max-w-md rounded-2xl bg-surface border border-white/[0.1] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden motion-dialog"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between bg-surface-elevated">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-zinc-300" />
            <h3 className="text-sm font-semibold text-zinc-100">
              {effectiveDayDateStr}
            </h3>
            <span className="text-[11px] font-mono text-zinc-500">
              ({dayTasks.length} {pluralRu(dayTasks.length, ['таска', 'таски', 'тасок'])})
            </span>
          </div>
          <button
            data-testid="close-expanded-day-modal"
            title="Закрыть (Esc)"
            onClick={() => setExpandedDayDateStr(null)}
            className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tasks list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin">
          {dayTasks.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500 font-mono">
              На этот день пока нет тасок
            </div>
          ) : (
            dayTasks.map(task => {
              const slot = getTaskTimeSlot(task);
              const styling = getPriorityBadge(task.priority);
              const isDone = task.status === 'done';
              const isDragging = draggingTaskId === task.id;
              const realTaskId = task.id.replace(/_virtual_.*$/, '');

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
                      <Check className={`w-2.5 h-2.5 stroke-[3] transition-opacity ${isDone ? 'opacity-100 text-white' : 'opacity-0 group-hover/chk:opacity-100'}`} />
                    </button>
                    <span
                      className={`text-xs font-medium leading-snug truncate ${
                        isDone ? 'line-through text-zinc-500' : 'text-zinc-200'
                      }`}
                    >
                      {task.title}
                    </span>
                    {task.recurrence && (
                      <span title="Повторяющаяся таска" className="shrink-0 flex items-center">
                        <Repeat className="w-3 h-3 text-amber-400" />
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                    {slot.isAllDay ? 'Весь день' : slot.timeLabel}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Quick Add at bottom */}
        <div className="p-3 border-t border-white/[0.06] bg-surface-elevated">
          <button
            onClick={() => {
              openComposerModal({
                type: 'task',
                dueDate: effectiveDayDateStr,
                folder: currentFolder,
              });
            }}
            className="w-full flex items-center justify-center gap-2 bg-canvas hover:bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.16] rounded-xl px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-zinc-400" />
            <span>Добавить таску...</span>
          </button>
        </div>
      </div>
    </div>
  );
};
