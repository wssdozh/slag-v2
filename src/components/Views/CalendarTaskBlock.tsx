// The two task shapes on the calendar: the all-day pill and the timed block with handles.
import React from 'react';
import type { SlagItem } from '../../types';
import type { LayoutPositionedTask } from '../../lib/time/calendarLayout';
import { timedBlockBox } from '../../lib/time/calendarLayout';
import { getPriorityBadge, formatDurationBadge } from './calendarHelpers';
import { baseTaskId } from '../../lib/tasks/taskUtils';
import { Check, ListTodo } from 'lucide-react';

export interface AllDayTaskPillProps {
  task: SlagItem & { isVirtual?: boolean };
  items: SlagItem[];
  draggingTaskId: string | null;
  handlePointerDown: (e: React.PointerEvent, payload: { type: 'task'; id: string; title: string }) => void;
  setSelectedItem: (item: SlagItem) => void;
  setIsFullscreenEditorOpen: (open: boolean) => void;
  openContextMenu: (params: { x: number; y: number; type: 'item'; item: SlagItem }) => void;
  toggleTaskComplete: (id: string) => void;
}

export const AllDayTaskPill: React.FC<AllDayTaskPillProps> = ({
  task,
  items,
  draggingTaskId,
  handlePointerDown,
  setSelectedItem,
  setIsFullscreenEditorOpen,
  openContextMenu,
  toggleTaskComplete,
}) => {
  const isDone = task.status === 'done';
  const styling = getPriorityBadge(task.priority);
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
      onContextMenu={e => {
        e.preventDefault();
        e.stopPropagation();
        const target = items.find(i => i.id === realTaskId) || task;
        openContextMenu({
          x: e.clientX,
          y: e.clientY,
          type: 'item',
          item: target,
        });
      }}
      title={task.title}
      className={`group flex items-center gap-1.5 px-2 py-1 rounded-md border text-left text-xs transition-[color,background-color,border-color,opacity] min-w-0 touch-none ${styling.bg} ${styling.border} ${styling.text} ${
        task.isVirtual ? 'border-dashed opacity-85' : ''
      } ${
        isDragging && draggingTaskId === realTaskId
          ? 'opacity-40 ring-1 ring-blue-500/50 scale-[0.98]'
          : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      <button
        onClick={e => {
          e.stopPropagation();
          toggleTaskComplete(realTaskId);
        }}
        className={`group/chk w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors shrink-0 ${
          isDone
            ? 'border-2 border-blue-500 bg-blue-500 text-white'
            : `border-2 ${styling.checkboxBorder} ${styling.checkboxHover} bg-transparent`
        }`}
        title={isDone ? 'Возобновить' : 'Выполнить'}
      >
        <Check className={`w-2 h-2 stroke-[3] transition-opacity ${isDone ? 'opacity-100 text-white' : 'opacity-0 group-hover/chk:opacity-100'}`} />
      </button>

      <span
        className={`truncate font-medium text-xs leading-tight select-none flex-1 min-w-[20px] ${
          isDone ? 'line-through text-zinc-500' : 'text-zinc-200'
        }`}
      >
        {task.title || 'Безымянная задача'}
      </span>

      {task.tags && task.tags.length > 0 && (
        <span className="hidden xl:inline text-2xs font-mono text-zinc-500 shrink-0">
          #{task.tags[0]}
        </span>
      )}
    </div>
  );
};

export interface TimedTaskBlockProps {
  positioned: LayoutPositionedTask;
  items: SlagItem[];
  draggingTaskId: string | null;
  resizingTask: {
    taskId: string;
    initialY: number;
    initialDuration: number;
    currentDuration: number;
  } | null;
  isJustResizedRef: React.RefObject<boolean>;
  handlePointerDown: (e: React.PointerEvent, payload: { type: 'task'; id: string; title: string }) => void;
  setSelectedItem: (item: SlagItem) => void;
  setIsFullscreenEditorOpen: (open: boolean) => void;
  openContextMenu: (params: { x: number; y: number; type: 'item'; item: SlagItem }) => void;
  toggleTaskComplete: (id: string) => void;
  handleResizeStart: (e: React.MouseEvent, taskId: string, initialDuration: number) => void;
}

export const TimedTaskBlock: React.FC<TimedTaskBlockProps> = ({
  positioned,
  items,
  draggingTaskId,
  resizingTask,
  isJustResizedRef,
  handlePointerDown,
  setSelectedItem,
  setIsFullscreenEditorOpen,
  openContextMenu,
  toggleTaskComplete,
  handleResizeStart,
}) => {
  const { task, slot, topPx, heightPx, colIndex, totalCols } = positioned;
  const isDone = task.status === 'done';
  const styling = getPriorityBadge(task.priority);
  const isDragging = draggingTaskId === task.id;
  const isResizing = resizingTask?.taskId === task.id;
  const realTaskId = baseTaskId(task.id);

  const box = timedBlockBox(colIndex, totalCols);

  const completedSubtasks = task.subtasks?.filter(s => s.completed).length || 0;
  const totalSubtasks = task.subtasks?.length || 0;

  // Distinct card states based on height
  // - Compact (15m: 20px, 30m: 26px): single-line centered pill, no vertical crowding
  // - Medium (45m: 39px): 2 compact rows
  // - Full (60m+: 52px+): 2 comfortable rows with badges
  const isCompact = heightPx < 36;
  const isMedium = heightPx >= 36 && heightPx < 48;

  return (
    <div
      key={task.id}
      data-draggable="true"
      onPointerDown={e => {
        if (!resizingTask) {
          handlePointerDown(e, {
            type: 'task',
            id: realTaskId,
            title: task.title || 'Таска',
          });
        }
      }}
      onClick={() => {
        if (isJustResizedRef.current) return;
        const target = items.find(i => i.id === realTaskId) || task;
        setSelectedItem(target);
        setIsFullscreenEditorOpen(true);
      }}
      onContextMenu={e => {
        e.preventDefault();
        e.stopPropagation();
        const target = items.find(i => i.id === realTaskId) || task;
        openContextMenu({
          x: e.clientX,
          y: e.clientY,
          type: 'item',
          item: target,
        });
      }}
      title={`${task.title || 'Безымянная задача'} (${slot.timeLabel})`}
      data-testid={`task-timed-card-${task.id}`}
      style={{
        top: `${topPx}px`,
        height: `${heightPx}px`,
        left: `${box.left}%`,
        width: `${box.width}%`,
      }}
      className={`group/card absolute rounded-lg border select-none transition-[color,background-color,border-color,opacity] duration-75 z-10 shadow-sm touch-none ${styling.bg} ${styling.border} ${styling.text} ${
        isCompact
          ? totalCols > 1
            ? 'px-1.5 py-0 flex items-center justify-between'
            : 'px-2 py-0 flex items-center justify-between'
          : isMedium
          ? totalCols > 1
            ? 'px-1.5 py-1 flex flex-col justify-between'
            : 'px-2 py-1 flex flex-col justify-between'
          : totalCols > 1
          ? 'px-1.5 py-1.5 flex flex-col justify-between'
          : 'px-2.5 py-1.5 flex flex-col justify-between'
      } ${task.isVirtual ? 'border-dashed opacity-85' : ''} ${
        isDragging && draggingTaskId === realTaskId
          ? 'opacity-40 ring-1 ring-blue-500/50 scale-[0.98]'
          : isResizing
          ? 'ring-2 ring-blue-500 shadow-xl z-30'
          : 'cursor-grab active:cursor-grabbing hover:border-white/20 hover:z-20'
      }`}
    >
      {isCompact ? (
        /* ========================================================== */
        /* 1. COMPACT STATE (15m - 30m): Single-Line Centered Row     */
        /* ========================================================== */
        <div className="flex items-center justify-between w-full min-w-0 h-full gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <button
              onClick={e => {
                e.stopPropagation();
                toggleTaskComplete(realTaskId);
              }}
              className={`group/chk ${totalCols > 1 ? 'w-3 h-3' : 'w-3.5 h-3.5'} rounded-full flex items-center justify-center transition-colors shrink-0 ${
                isDone
                  ? 'border-2 border-blue-500 bg-blue-500 text-white'
                  : `border-2 ${styling.checkboxBorder} ${styling.checkboxHover} bg-transparent`
              }`}
              title={isDone ? 'Возобновить' : 'Выполнить'}
            >
              <Check className={`w-2 h-2 stroke-[3] transition-opacity ${isDone ? 'opacity-100 text-white' : 'opacity-0 group-hover/chk:opacity-100'}`} />
            </button>

            <span
              className={`font-medium text-[11px] leading-tight truncate min-w-0 ${
                isDone ? 'line-through text-zinc-500' : 'text-zinc-100'
              }`}
            >
              {task.title || 'Безымянная задача'}
            </span>
          </div>

          {/* Time label and optional subtask counter on right (shown when single column) */}
          {totalCols === 1 && (
            <div className="flex items-center gap-1.5 text-[10px] font-mono opacity-70 shrink-0">
              <span className="truncate">
                {slot.durationMinutes <= 15
                  ? `${String(slot.startHour).padStart(2, '0')}:${String(slot.startMinute).padStart(2, '0')}`
                  : slot.timeLabel}
              </span>
              {totalSubtasks > 0 && (
                <span className="flex items-center gap-0.5 text-2xs font-mono">
                  <ListTodo className="w-2.5 h-2.5" />
                  <span>{completedSubtasks}/{totalSubtasks}</span>
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================== */
        /* 2. MEDIUM & FULL STATES (45m+): 2-Row Layout               */
        /* ========================================================== */
        <>
          <div className={`flex items-start ${totalCols > 1 ? 'gap-1' : 'gap-1.5'} w-full min-w-0`}>
            <button
              onClick={e => {
                e.stopPropagation();
                toggleTaskComplete(realTaskId);
              }}
              className={`group/chk mt-0.5 ${totalCols > 1 ? 'w-3 h-3' : 'w-3.5 h-3.5'} rounded-full flex items-center justify-center transition-colors shrink-0 ${
                isDone
                  ? 'border-2 border-blue-500 bg-blue-500 text-white'
                  : `border-2 ${styling.checkboxBorder} ${styling.checkboxHover} bg-transparent`
              }`}
              title={isDone ? 'Возобновить' : 'Выполнить'}
            >
              <Check className={`w-2 h-2 stroke-[3] transition-opacity ${isDone ? 'opacity-100 text-white' : 'opacity-0 group-hover/chk:opacity-100'}`} />
            </button>

            <span
              className={`font-semibold text-xs leading-snug truncate flex-1 min-w-0 ${
                isDone ? 'line-through text-zinc-500' : 'text-zinc-100'
              }`}
            >
              {task.title || 'Безымянная задача'}
            </span>
          </div>

          {totalCols === 1 && (
            <div className="flex items-center justify-between w-full text-[10px] font-mono opacity-80 pt-0.5">
              <span className="truncate">{slot.timeLabel}</span>
              {totalSubtasks > 0 && (
                <span className="flex items-center gap-0.5 shrink-0">
                  <ListTodo className="w-2.5 h-2.5" />
                  <span>{completedSubtasks}/{totalSubtasks}</span>
                </span>
              )}
            </div>
          )}
        </>
      )}

      {/* Live floating tooltip badge during interactive resize */}
      {isResizing && (
        <div
          data-testid="resize-live-tooltip"
          className="absolute -bottom-8 left-1/2 -translate-x-1/2 z-50 px-2.5 py-1 rounded-md bg-zinc-950/95 border border-blue-500/80 text-[11px] font-mono text-zinc-100 shadow-2xl whitespace-nowrap pointer-events-none flex items-center gap-1.5 backdrop-blur-sm"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span>{slot.timeLabel}</span>
          <span className="text-blue-400 font-semibold">({formatDurationBadge(slot.durationMinutes)})</span>
        </div>
      )}

      {/* Bottom edge resize handle (hidden by default, revealed on card hover) */}
      {!task.isVirtual && (
        <div
          data-testid={`resize-handle-${task.id}`}
          onMouseDown={e => handleResizeStart(e, task.id, slot.durationMinutes)}
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="absolute inset-x-0 bottom-0 h-2.5 cursor-ns-resize z-20 flex items-end justify-center pb-0.5 group/handle"
          title="Потяните для изменения длительности (шаг 15 мин)"
        >
          <div
            className={`w-8 h-0.5 rounded-full transition-[background-color,opacity] duration-150 ${
              isResizing
                ? 'bg-blue-400 opacity-100 shadow-sm'
                : 'bg-white/40 opacity-0 group-hover/card:opacity-100 group-hover/handle:opacity-100'
            }`}
          />
        </div>
      )}
    </div>
  );
};
