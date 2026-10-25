import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem } from '../../types';
import { getTaskTimeSlot } from '../../lib/todoistTaskParser';
import { computeAntiOverlapLayout, type LayoutPositionedTask } from '../../lib/calendarLayout';
import { useDragToScroll } from '../../hooks/useDragToScroll';
import { useCalendarSchedule } from '../../hooks/useCalendarSchedule';
import { usePointerDnd, type DragItemPayload } from '../../hooks/usePointerDnd';
import {
  getISODateString,
  getTodayString,
  getTomorrowString,
  getNextWeekString,
  getMondayOfWeek,
  getWeekDays,
  getMonthCalendarDays,
  RUSSIAN_MONTHS,
  RUSSIAN_WEEKDAYS,
} from '../../lib/dateUtils';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Check,
  AlertCircle,
  Clock,
  Inbox,
  X,
  ListTodo,
  Repeat
} from 'lucide-react';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getPriorityBadge(priority?: 'none' | 'low' | 'medium' | 'high'): {
  bg: string;
  border: string;
  text: string;
  dot: string;
  checkboxBorder: string;
  checkboxHover: string;
} {
  switch (priority) {
    case 'high':
      return {
        bg: 'bg-rose-500/12 hover:bg-rose-500/18',
        border: 'border-rose-500/35',
        text: 'text-rose-200',
        dot: 'bg-rose-500',
        checkboxBorder: 'border-rose-500',
        checkboxHover: 'hover:border-rose-400 hover:bg-rose-500/25 text-rose-300',
      };
    case 'medium':
      return {
        bg: 'bg-amber-500/12 hover:bg-amber-500/18',
        border: 'border-amber-500/35',
        text: 'text-amber-200',
        dot: 'bg-amber-500',
        checkboxBorder: 'border-amber-400',
        checkboxHover: 'hover:border-amber-300 hover:bg-amber-400/25 text-amber-300',
      };
    case 'low':
      return {
        bg: 'bg-blue-500/12 hover:bg-blue-500/18',
        border: 'border-blue-500/35',
        text: 'text-blue-200',
        dot: 'bg-blue-400',
        checkboxBorder: 'border-blue-400',
        checkboxHover: 'hover:border-blue-300 hover:bg-blue-400/25 text-blue-300',
      };
    default:
      return {
        bg: 'bg-[#18181c] hover:bg-[#202024]',
        border: 'border-white/[0.08]',
        text: 'text-zinc-200',
        dot: 'bg-zinc-500',
        checkboxBorder: 'border-zinc-400',
        checkboxHover: 'hover:border-zinc-200 hover:bg-white/[0.12] text-zinc-200',
      };
  }
}

function cleanTimeFromTitle(title: string): string {
  let clean = title;
  clean = clean.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\s*[-—]\s*([01]?\d|2[0-3]):([0-5]\d)\b/g, '').trim();
  clean = clean.replace(/(?:^|\s|[вВ@])\s*([01]?\d|2[0-3]):([0-5]\d)\b/g, '').trim();
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean || title;
}

export const CalendarView: React.FC = () => {
  const {
    items,
    currentFolder,
    updateItem,
    toggleTaskComplete,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    openContextMenu,
    addToast,
    openComposerModal,
  } = useApp();

  // Mode: 'week' | 'month'
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');

  // Currently focused date anchor
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  // Drawer for Overdue and Unscheduled tasks
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'overdue' | 'unscheduled'>('overdue');

  // Pointer Events Drag and Drop hook (desktop & mobile robust)
  const {
    isDragging,
    draggingPayload,
    dragPos,
    activeZoneData,
    handlePointerDown,
  } = usePointerDnd<DragItemPayload>({
    onDrop: (payload, targetZone, targetData, dropPos) => {
      const realTaskId = payload.id;
      const task = items.find(i => i.id === realTaskId);
      if (!task || !targetZone) return;

      if (targetData.dropZone === 'calendar-hour') {
        const dateStr = targetData.dropDate;
        const hour = parseInt(targetData.dropHour, 10);
        const rect = targetZone.getBoundingClientRect();
        const offsetY = dropPos.y - rect.top;
        const quarter = Math.min(3, Math.max(0, Math.floor((offsetY / 52) * 4)));
        const minute = quarter * 15;

        const [year, month, day] = dateStr.split('-').map(Number);
        const targetDate = new Date(year, month - 1, day, hour, minute, 0, 0);
        const reminder = targetDate.toISOString();

        updateItem({
          ...task,
          dueDate: dateStr,
          reminder,
        });
        const timeFormatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        addToast(`Задача перенесена на ${dateStr} в ${timeFormatted}`, 'info');
      } else if (targetData.dropZone === 'calendar-allday') {
        const dateStr = targetData.dropDate;
        const updatedTitle = cleanTimeFromTitle(task.title);
        updateItem({
          ...task,
          title: updatedTitle,
          dueDate: dateStr,
          reminder: undefined,
        });
        addToast(`Задача перенесена на ${dateStr} (весь день)`, 'info');
      } else if (targetData.dropZone === 'calendar-month') {
        const dateStr = targetData.dropDate;
        let reminder: string | undefined = undefined;
        if (task.reminder) {
          try {
            const oldDate = new Date(task.reminder);
            if (!isNaN(oldDate.getTime())) {
              const [year, month, day] = dateStr.split('-').map(Number);
              const target = new Date(year, month - 1, day, oldDate.getHours(), oldDate.getMinutes(), 0, 0);
              reminder = target.toISOString();
            }
          } catch {
            reminder = undefined;
          }
        }
        updateItem({
          ...task,
          dueDate: dateStr,
          reminder,
        });
        addToast(`Задача перенесена на ${dateStr}`, 'info');
      } else if (targetData.dropZone === 'calendar-unscheduled') {
        const updatedTitle = cleanTimeFromTitle(task.title);
        updateItem({
          ...task,
          title: updatedTitle,
          dueDate: undefined,
          reminder: undefined,
        });
        addToast('Срок задачи снят (перемещена в "Без срока")', 'info');
      }
    },
  });

  const draggingTaskId = isDragging ? draggingPayload?.id ?? null : null;

  // Card bottom-edge resize state for time-blocking duration
  const [resizingTask, setResizingTask] = useState<{
    taskId: string;
    initialY: number;
    initialDuration: number;
    currentDuration: number;
  } | null>(null);

  // Guard to prevent card onClick from firing immediately after a resize drag
  const isJustResizedRef = useRef(false);

  // Expanded Day Card modal for Month view
  const [expandedDayDateStr, setExpandedDayDateStr] = useState<string | null>(null);

  // Live minute ticker for Red Ribbon Indicator
  const [nowMinute, setNowMinute] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  const timeGridRef = useRef<HTMLDivElement | null>(null);
  const weekHorizontalScrollRef = useRef<HTMLDivElement | null>(null);
  const monthHorizontalScrollRef = useRef<HTMLDivElement | null>(null);

  // Mouse drag-to-scroll for Week View (horizontal week days + vertical time grid)
  useDragToScroll<HTMLDivElement>(
    {
      direction: 'both',
      getContainerX: () => weekHorizontalScrollRef.current,
      getContainerY: (target: HTMLElement) => {
        if (target.closest('[data-testid="calendar-time-grid"]')) {
          return timeGridRef.current;
        }
        return null;
      },
      ignoreSelector:
        'button, a, input, textarea, select, [contenteditable="true"], [data-draggable="true"], [draggable="true"], [data-no-pan], [data-testid="calendar-card"], [data-resize-handle], .cursor-ns-resize',
    },
    weekHorizontalScrollRef
  );

  // Mouse drag-to-scroll for Month View
  useDragToScroll<HTMLDivElement>(
    {
      direction: 'both',
      getContainerX: (_target: HTMLElement, container: HTMLDivElement) => container,
      getContainerY: (target: HTMLElement) => target.closest('.overflow-y-auto') as HTMLElement | null,
      ignoreSelector:
        'button, a, input, textarea, select, [contenteditable="true"], [data-draggable="true"], [draggable="true"], [data-no-pan]',
    },
    monthHorizontalScrollRef
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const d = new Date();
      setNowMinute(d.getHours() * 60 + d.getMinutes());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Current Week Days (Monday to Sunday)
  const weekDays = useMemo(() => {
    const monday = getMondayOfWeek(currentDate);
    return getWeekDays(monday);
  }, [currentDate]);

  // Month Calendar Grid Cells
  const monthCells = useMemo(() => {
    return getMonthCalendarDays(currentDate.getFullYear(), currentDate.getMonth());
  }, [currentDate]);

  const rangeStart = useMemo(() => {
    if (viewMode === 'week' && weekDays.length > 0) return getISODateString(weekDays[0]);
    if (viewMode === 'month' && monthCells.length > 0) return monthCells[0].dateStr;
    return undefined;
  }, [viewMode, weekDays, monthCells]);

  const rangeEnd = useMemo(() => {
    if (viewMode === 'week' && weekDays.length > 0) return getISODateString(weekDays[6]);
    if (viewMode === 'month' && monthCells.length > 0) return monthCells[monthCells.length - 1].dateStr;
    return undefined;
  }, [viewMode, weekDays, monthCells]);

  const {
    overdueTasks,
    unscheduledTasks,
    tasksByDate: tasksByDueDate,
    todayStr,
  } = useCalendarSchedule({
    items,
    currentFolder,
    filterByFolder: true,
    rangeStart,
    rangeEnd,
  });

  // Auto-scroll time grid to current hour - 1 and scroll week horizontally to today if overflowed
  useEffect(() => {
    if (viewMode === 'week') {
      if (timeGridRef.current) {
        const currentHour = Math.floor(nowMinute / 60);
        const scrollHour = Math.max(0, currentHour - 1);
        timeGridRef.current.scrollTop = scrollHour * 52;
      }
      if (weekHorizontalScrollRef.current) {
        const container = weekHorizontalScrollRef.current;
        const todayIndex = weekDays.findIndex(d => getISODateString(d) === todayStr);
        if (todayIndex > 1 && container.scrollWidth > container.clientWidth) {
          const colWidth = (container.scrollWidth - 56) / 7;
          const targetScrollLeft = Math.max(0, 56 + todayIndex * colWidth - container.clientWidth / 2);
          container.scrollLeft = targetScrollLeft;
        }
      }
    }
  }, [viewMode, currentDate, weekDays, todayStr, nowMinute]);

  // Navigation handlers
  const handlePrev = () => {
    setCurrentDate(prev => {
      const next = new Date(prev);
      if (viewMode === 'week') {
        next.setDate(next.getDate() - 7);
      } else {
        next.setMonth(next.getMonth() - 1);
      }
      return next;
    });
  };

  const handleNext = () => {
    setCurrentDate(prev => {
      const next = new Date(prev);
      if (viewMode === 'week') {
        next.setDate(next.getDate() + 7);
      } else {
        next.setMonth(next.getMonth() + 1);
      }
      return next;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
    if (weekHorizontalScrollRef.current) {
      const container = weekHorizontalScrollRef.current;
      const todayIndex = weekDays.findIndex(d => getISODateString(d) === todayStr);
      if (todayIndex >= 0 && container.scrollWidth > container.clientWidth) {
        const colWidth = (container.scrollWidth - 56) / 7;
        const targetScrollLeft = Math.max(0, 56 + todayIndex * colWidth - container.clientWidth / 2);
        container.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
      }
    }
  };

  // Month and Year label
  const headerTitle = useMemo(() => {
    const month = RUSSIAN_MONTHS[currentDate.getMonth()];
    const year = currentDate.getFullYear();
    return `${month} ${year}`;
  }, [currentDate]);

  // 1-Click reschedule helper
  const handleQuickSchedule = (task: SlagItem, newDate: string) => {
    updateItem({
      ...task,
      dueDate: newDate,
    });
    addToast(`Задача перенесена на ${newDate}`, 'info');
  };

  // Render a Compact All-Day Task Pill
  const renderAllDayTaskPill = (task: SlagItem & { isVirtual?: boolean }) => {
    const isDone = task.status === 'done';
    const styling = getPriorityBadge(task.priority);
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
            title: task.title || 'Задача',
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
        className={`group flex items-center gap-1.5 px-2 py-1 rounded-md border text-left text-xs transition-all min-w-0 touch-none ${styling.bg} ${styling.border} ${styling.text} ${
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
          className={`truncate font-medium text-[11px] leading-tight select-none flex-1 min-w-[20px] ${
            isDone ? 'line-through text-zinc-500' : 'text-zinc-200'
          }`}
        >
          {task.title || 'Безымянная задача'}
        </span>

        {task.tags && task.tags.length > 0 && (
          <span className="hidden xl:inline text-[9px] font-mono text-zinc-500 shrink-0">
            #{task.tags[0]}
          </span>
        )}
      </div>
    );
  };

  function formatDurationBadge(mins: number): string {
    if (mins < 60) return `${mins}м`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}ч ${m}м` : `${h}ч`;
  }

  // Handle dragging bottom edge to resize task duration (time-blocking with 15-min snapping)
  const handleResizeStart = (e: React.MouseEvent, taskId: string, initialDuration: number) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    setResizingTask({
      taskId,
      initialY: startY,
      initialDuration,
      currentDuration: initialDuration,
    });

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      // 52px per 60 min -> 13px per 15 min quantum
      const deltaMinutes = Math.round(((deltaY / 52) * 60) / 15) * 15;
      const nextDuration = Math.max(15, Math.min(1440, initialDuration + deltaMinutes));
      setResizingTask(prev => (prev ? { ...prev, currentDuration: nextDuration } : null));
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      const deltaY = upEvent.clientY - startY;
      const deltaMinutes = Math.round(((deltaY / 52) * 60) / 15) * 15;
      const finalDuration = Math.max(15, Math.min(1440, initialDuration + deltaMinutes));

      setResizingTask(null);
      isJustResizedRef.current = true;
      setTimeout(() => {
        isJustResizedRef.current = false;
      }, 200);

      const realId = taskId.replace(/_virtual_.*$/, '');
      const target = items.find(i => i.id === realId);
      if (target) {
        updateItem({
          ...target,
          duration: finalDuration,
        });
        addToast(
          `Длительность: ${formatDurationBadge(finalDuration)}`,
          'success'
        );
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Render a Time-Blocked Card in Week View with Anti-Overlap and Duration States
  const renderTimedTaskBlock = (positioned: LayoutPositionedTask) => {
    const { task, slot, topPx, heightPx, colIndex, totalCols } = positioned;
    const isDone = task.status === 'done';
    const styling = getPriorityBadge(task.priority);
    const isDragging = draggingTaskId === task.id;
    const isResizing = resizingTask?.taskId === task.id;
    const realTaskId = task.id.replace(/_virtual_.*$/, '');

    const colWidth = 94 / totalCols;
    const left = 3 + colIndex * colWidth;
    const width = totalCols > 1 ? colWidth - 1 : 94;

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
              title: task.title || 'Задача',
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
          left: `${left}%`,
          width: `${width}%`,
        }}
        className={`group/card absolute rounded-lg border select-none transition-all duration-75 z-10 shadow-sm touch-none ${styling.bg} ${styling.border} ${styling.text} ${
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
                  <span className="flex items-center gap-0.5 text-[9px]">
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
              className={`w-8 h-0.5 rounded-full transition-all duration-150 ${
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

  return (
    <div className="flex-1 flex flex-col h-full bg-[#09090b] text-[#f4f4f5] select-none overflow-hidden relative">
      {/* ============================================================== */}
      {/* 1. Header Toolbar (Todoist Upcoming Style)                     */}
      {/* ============================================================== */}
      <div className="h-12 px-4 border-b border-white/[0.06] bg-[#0c0c0e] flex items-center justify-between gap-3 shrink-0">
        {/* Left: Upcoming Title + Month/Year */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="w-4 h-4 text-zinc-300" />
            <h2 className="text-xs font-semibold text-zinc-100 tracking-tight">
              {headerTitle}
            </h2>
          </div>

          {/* Navigation Buttons: < Сегодня > */}
          <div className="flex items-center gap-1 bg-white/[0.03] p-0.5 rounded-md border border-white/[0.04]">
            <button
              onClick={handlePrev}
              className="p-1 rounded hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Предыдущий период"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleToday}
              className="px-2 py-0.5 rounded text-[11px] font-medium text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Перейти к сегодняшнему дню"
            >
              Сегодня
            </button>
            <button
              onClick={handleNext}
              className="p-1 rounded hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Следующий период"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right: View Switcher [ Неделя | Месяц ] & Overdue/Unscheduled Drawer Toggle */}
        <div className="flex items-center gap-2">
          {/* View Mode Switcher: Linear-grade segmented control */}
          <div aria-label="Режим календаря" className="flex items-center h-8 bg-[#141417] p-0.5 rounded-lg border border-white/[0.08] shadow-inner shrink-0">
            <button
              onClick={() => setViewMode('week')}
              className={`h-7 px-3 rounded-md text-[12px] font-medium transition-all cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              Неделя
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`h-7 px-3 rounded-md text-[12px] font-medium transition-all cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              Месяц
            </button>
          </div>

          {/* Drawer Toggle */}
          <button
            onClick={() => setIsDrawerOpen(prev => !prev)}
            onDragOver={e => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (!isDrawerOpen) setIsDrawerOpen(true);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer ${
              isDrawerOpen
                ? 'bg-white/10 border-white/[0.12] text-white'
                : 'bg-white/[0.03] border-white/[0.05] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
            }`}
            title="Открыть список просроченных и незапланированных задач"
          >
            {overdueTasks.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Сроки</span>
            <span className="text-[10px] font-mono text-zinc-500">
              ({overdueTasks.length + unscheduledTasks.length})
            </span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. Main Calendar Content Area + Side Drawer                   */}
      {/* ============================================================== */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {viewMode === 'week' ? (
            /* ========================================================== */
            /* WEEK TIME-BLOCKING VIEW                                    */
            /* ========================================================== */
            <div
              ref={weekHorizontalScrollRef}
              data-testid="calendar-week-scroll-container"
              className="flex-1 flex flex-col overflow-x-auto overflow-y-hidden min-h-0 min-w-0 scrollbar-thin select-none cursor-grab"
            >
              <div className="flex-1 flex flex-col min-w-[896px] h-full">
                {/* Day Headers (ПН 10, ВТ 11...) */}
                <div className="flex border-b border-white/[0.06] bg-[#0c0c0e]/90 shrink-0 cursor-grab">
                  <div className="w-14 shrink-0 border-r border-white/[0.04] flex items-center justify-center text-[10px] font-mono text-zinc-600 sticky left-0 z-20 bg-[#0c0c0e] cursor-grab">
                    UTC
                  </div>
                  <div className="flex-1 grid grid-cols-7">
                  {weekDays.map((date, idx) => {
                    const dateStr = getISODateString(date);
                    const isToday = dateStr === todayStr;
                    const weekdayName = RUSSIAN_WEEKDAYS[idx];
                    const dayNum = date.getDate();

                    return (
                      <div
                        key={dateStr}
                        className="px-2 py-2 text-center border-r border-white/[0.04] last:border-r-0 flex flex-col items-center justify-center gap-1"
                      >
                        <span className="text-[10px] font-mono text-zinc-500 tracking-wider">
                          {weekdayName}
                        </span>
                        {isToday ? (
                          <span className="w-6 h-6 rounded-full bg-white text-[#09090b] text-xs font-bold flex items-center justify-center shadow-sm">
                            {dayNum}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-zinc-300">
                            {dayNum}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* All-Day (Весь день) Section */}
              <div className="flex border-b border-white/[0.06] bg-[#09090b] shrink-0 max-h-36 overflow-y-auto scrollbar-thin">
                <div className="w-14 shrink-0 border-r border-white/[0.04] px-1.5 py-2 flex items-start justify-end text-[10px] font-mono text-zinc-500 select-none sticky left-0 z-20 bg-[#09090b]">
                  Весь день
                </div>
                <div className="flex-1 grid grid-cols-7 min-h-[44px]">
                  {weekDays.map(date => {
                    const dateStr = getISODateString(date);
                    const dayTasks = tasksByDueDate.get(dateStr) || [];
                    const allDayTasks = dayTasks.filter(t => getTaskTimeSlot(t).isAllDay);
                    const isOver = isDragging && activeZoneData?.dropZone === 'calendar-allday' && activeZoneData.dropDate === dateStr;

                    return (
                      <div
                        key={dateStr}
                        data-drop-zone="calendar-allday"
                        data-drop-date={dateStr}
                        className={`p-1 border-r border-white/[0.04] last:border-r-0 space-y-1 transition-colors min-h-[44px] ${
                          isOver ? 'bg-blue-500/15 ring-1 ring-blue-500/40 rounded-sm' : ''
                        }`}
                      >
                        {allDayTasks.map(task => renderAllDayTaskPill(task))}

                        {isOver && allDayTasks.length === 0 && (
                          <div className="text-[10px] font-mono text-blue-300 py-1 text-center border border-dashed border-blue-500/40 rounded bg-blue-500/10 pointer-events-none">
                            Весь день
                          </div>
                        )}

                        {/* Add Task Hover Trigger */}
                        <button
                          onClick={() => {
                            openComposerModal({
                              type: 'task',
                              dueDate: dateStr,
                              folder: currentFolder,
                            });
                          }}
                          className="w-full opacity-0 hover:opacity-100 focus:opacity-100 py-0.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] rounded flex items-center justify-center transition-opacity text-[10px] cursor-pointer"
                          title="Добавить задачу на весь день"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hourly Time Grid (08:00 - 22:00) with Time-Blocked Cards & Red Ribbon */}
              <div
                ref={timeGridRef}
                data-testid="calendar-time-grid"
                className="flex-1 overflow-y-auto scrollbar-thin relative bg-[#09090b] flex"
              >
                {/* Time markers column */}
                <div className="w-14 shrink-0 border-r border-white/[0.04] bg-[#0c0c0e] select-none sticky left-0 z-30 shadow-[1px_0_0_0_rgba(255,255,255,0.04)] cursor-grab">
                  {HOURS.map(hour => (
                    <div
                      key={hour}
                      className="h-[52px] border-b border-white/[0.04] pr-2 text-right text-[10px] font-mono text-zinc-500 pt-1"
                    >
                      {String(hour).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>

                {/* 7 Days Time Grid */}
                <div className="flex-1 grid grid-cols-7 relative">
                  {weekDays.map(date => {
                    const dateStr = getISODateString(date);
                    const isToday = dateStr === todayStr;
                    const dayTasks = tasksByDueDate.get(dateStr) || [];
                    const timedTasks = dayTasks.filter(t => !getTaskTimeSlot(t).isAllDay);

                    // Red time ribbon position
                    const showRedRibbon = isToday;
                    const redRibbonTopPx = (nowMinute / 60) * 52;

                    return (
                      <div
                        key={dateStr}
                        className="relative border-r border-white/[0.04] last:border-r-0 h-full"
                      >
                        {/* Hour slot background rows with 1-click add */}
                        {HOURS.map(hour => {
                          const isOver = isDragging && activeZoneData?.dropZone === 'calendar-hour' && activeZoneData.dropDate === dateStr && activeZoneData.dropHour === String(hour);
                          return (
                            <div
                              key={hour}
                              data-drop-zone="calendar-hour"
                              data-drop-date={dateStr}
                              data-drop-hour={hour}
                              onClick={e => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const offsetY = e.clientY - rect.top;
                                const quarter = Math.min(3, Math.max(0, Math.floor((offsetY / 52) * 4)));
                                const minute = quarter * 15;
                                openComposerModal({
                                  type: 'task',
                                  dueDate: dateStr,
                                  reminder: `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
                                  folder: currentFolder,
                                });
                              }}
                              className={`h-[52px] border-b border-white/[0.04] transition-colors relative group cursor-pointer ${
                                isOver
                                  ? 'bg-blue-500/15 border-blue-500/40 ring-1 ring-blue-500/30'
                                  : 'hover:bg-white/[0.02]'
                              }`}
                            >
                              {/* Subtle 30-min dashed line */}
                              <div className="absolute inset-x-0 top-[26px] border-b border-white/[0.02] pointer-events-none" />
                              {isOver ? (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                                  <span className="flex items-center gap-1 text-[10px] font-mono font-medium text-blue-300 bg-[#141418] px-2 py-0.5 rounded border border-blue-500/40 shadow-sm">
                                    <Clock className="w-2.5 h-2.5 text-blue-400" />
                                    <span>{String(hour).padStart(2, '0')}:00</span>
                                  </span>
                                </div>
                              ) : (
                                /* Hover indicator with time */
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none transition-opacity">
                                  <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 bg-[#18181c] px-2 py-0.5 rounded border border-white/[0.06] shadow-sm">
                                    <Plus className="w-2.5 h-2.5 text-zinc-400" />
                                    <span>{String(hour).padStart(2, '0')}:00</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Blue Time Ribbon for Today */}
                        {showRedRibbon && (
                          <div
                            style={{ top: `${redRibbonTopPx}px` }}
                            className="absolute inset-x-0 h-[2px] bg-blue-500 z-20 pointer-events-none"
                          >
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 -mt-1 -ml-1 shadow-sm shadow-blue-500/80" />
                          </div>
                        )}

                        {/* Render Timed Task Cards with Anti-Overlap Layout */}
                        {computeAntiOverlapLayout(
                          timedTasks,
                          52,
                          resizingTask?.taskId || null,
                          resizingTask?.currentDuration || null
                        ).map(positioned => renderTimedTaskBlock(positioned))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          ) : (
            /* ========================================================== */
            /* MONTH VIEW (with compact task rows & day expansion)       */
            /* ========================================================== */
            <div
              ref={monthHorizontalScrollRef}
              className="flex-1 flex flex-col overflow-x-auto overflow-y-hidden min-h-0 min-w-0 scrollbar-thin bg-[#09090b] cursor-grab"
            >
              <div className="flex-1 flex flex-col min-w-[700px] h-full">
                {/* Day Header Row */}
                <div className="grid grid-cols-7 border-b border-white/[0.06] bg-[#0c0c0e]/80 shrink-0 cursor-grab">
                {RUSSIAN_WEEKDAYS.map(day => (
                  <div
                    key={day}
                    className="py-1.5 text-center text-[10px] font-mono text-zinc-500 tracking-wider border-r border-white/[0.04] last:border-r-0"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Month Calendar Cells Grid */}
              <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-y-auto scrollbar-thin">
                {monthCells.map(cell => {
                  const dayTasks = tasksByDueDate.get(cell.dateStr) || [];
                  const isToday = cell.dateStr === todayStr;
                  const isOver = isDragging && activeZoneData?.dropZone === 'calendar-month' && activeZoneData.dropDate === cell.dateStr;

                  return (
                    <div
                      key={cell.dateStr}
                      data-drop-zone="calendar-month"
                      data-drop-date={cell.dateStr}
                      onClick={() => setExpandedDayDateStr(cell.dateStr)}
                      className={`min-h-[96px] p-1.5 border-b border-r border-white/[0.04] flex flex-col justify-between transition-colors cursor-pointer group ${
                        cell.isCurrentMonth ? 'bg-[#09090b] hover:bg-[#0c0c0e]' : 'bg-[#070709] text-zinc-600'
                      } ${isOver ? 'bg-blue-500/15 ring-1 ring-blue-500/40 border-blue-500/30' : ''}`}
                    >
                      {/* Cell Header: Day Number */}
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-mono ${
                            isToday
                              ? 'w-5 h-5 rounded-full bg-white text-[#09090b] font-bold text-xs flex items-center justify-center shadow-sm'
                              : cell.isCurrentMonth
                              ? 'text-zinc-300 font-medium'
                              : 'text-zinc-600'
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
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-opacity cursor-pointer"
                          title="Добавить задачу"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Tasks in cell (compact list) */}
                      <div className="flex-1 overflow-hidden space-y-1 my-1">
                        {dayTasks.slice(0, 3).map(task => {
                          const slot = getTaskTimeSlot(task);
                          const styling = getPriorityBadge(task.priority);
                          const isDone = task.status === 'done';
                          const realTaskId = task.id.replace(/_virtual_.*$/, '');

                          return (
                            <div
                              key={task.id}
                              data-draggable="true"
                              onPointerDown={e =>
                                handlePointerDown(e, {
                                  type: 'task',
                                  id: realTaskId,
                                  title: task.title || 'Задача',
                                })
                              }
                              onClick={e => {
                                e.stopPropagation();
                                const target = items.find(i => i.id === realTaskId) || task;
                                setSelectedItem(target);
                                setIsFullscreenEditorOpen(true);
                              }}
                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-white/[0.03] hover:bg-white/[0.08] text-[10px] text-zinc-300 truncate transition-colors touch-none ${
                                task.isVirtual ? 'border border-dashed border-white/20 opacity-80' : ''
                              } ${
                                isDragging && draggingTaskId === realTaskId
                                  ? 'opacity-40 ring-1 ring-blue-500/50 scale-[0.98]'
                                  : 'cursor-grab active:cursor-grabbing'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styling.dot}`} />
                              <span className={`truncate flex-1 ${isDone ? 'line-through text-zinc-500' : ''}`}>
                                {task.title}
                              </span>
                              {task.recurrence && (
                                <span title="Повторяющаяся задача" className="shrink-0 flex items-center">
                                  <Repeat className="w-2.5 h-2.5 text-amber-400" />
                                </span>
                              )}
                              {!slot.isAllDay && (
                                <span className="text-[9px] font-mono text-zinc-500 shrink-0">
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
                          className="text-[9px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors text-right cursor-pointer"
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
          )}
        </div>

        {/* ============================================================== */}
        {/* 3. Side Drawer: Overdue and Unscheduled Tasks                 */}
        {/* ============================================================== */}
        {isDrawerOpen && (
          <div className="w-72 sm:w-80 border-l border-white/[0.06] bg-[#0c0c0e]/95 flex flex-col shrink-0 transition-all duration-200 z-20">
            {/* Drawer Tabs */}
            <div className="h-10 px-2 border-b border-white/[0.06] flex items-center justify-between bg-[#121215]">
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
                  className={`p-3 rounded-lg border-2 border-dashed transition-all text-center text-xs font-mono flex items-center justify-center gap-2 cursor-pointer ${
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
                    Нет просроченных задач
                  </div>
                ) : (
                  overdueTasks.map(task => {
                    return (
                      <div
                        key={task.id}
                        data-draggable="true"
                        onPointerDown={e =>
                          handlePointerDown(e, {
                            type: 'task',
                            id: task.id,
                            title: task.title || 'Задача',
                          })
                        }
                        onClick={() => {
                          setSelectedItem(task);
                          setIsFullscreenEditorOpen(true);
                        }}
                        className={`p-2.5 rounded-lg bg-[#141417] hover:bg-[#18181c] border border-rose-500/20 hover:border-rose-500/40 transition-all text-left space-y-2 shadow-sm cursor-grab active:cursor-grabbing touch-none ${
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
                    );
                  })
                )
              ) : unscheduledTasks.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-600 font-mono">
                  Все задачи имеют срок выполнения
                </div>
              ) : (
                unscheduledTasks.map(task => {
                  return (
                    <div
                      key={task.id}
                      data-draggable="true"
                      onPointerDown={e =>
                        handlePointerDown(e, {
                          type: 'task',
                          id: task.id,
                          title: task.title || 'Задача',
                        })
                      }
                      onClick={() => {
                        setSelectedItem(task);
                        setIsFullscreenEditorOpen(true);
                      }}
                      className={`p-2.5 rounded-lg bg-[#141417] hover:bg-[#18181c] border border-white/[0.06] hover:border-white/[0.12] transition-all text-left space-y-2 shadow-sm cursor-grab active:cursor-grabbing touch-none ${
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
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 4. Expanded Day Card Popover (Modal like Todoist Image 3)      */}
      {/* ============================================================== */}
      {expandedDayDateStr && (
        <div
          onClick={() => setExpandedDayDateStr(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#141417] border border-white/[0.1] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between bg-[#18181c]">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-zinc-300" />
                <h3 className="text-sm font-semibold text-zinc-100">
                  {expandedDayDateStr}
                </h3>
                <span className="text-[11px] font-mono text-zinc-500">
                  ({(tasksByDueDate.get(expandedDayDateStr) || []).length} задач)
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
              {(tasksByDueDate.get(expandedDayDateStr) || []).length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500 font-mono">
                  На этот день пока нет задач
                </div>
              ) : (
                (tasksByDueDate.get(expandedDayDateStr) || []).map(task => {
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
                          title: task.title || 'Задача',
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
                          <span title="Повторяющаяся задача" className="shrink-0 flex items-center">
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
            <div className="p-3 border-t border-white/[0.06] bg-[#18181c]">
              <button
                onClick={() => {
                  if (!expandedDayDateStr) return;
                  openComposerModal({
                    type: 'task',
                    dueDate: expandedDayDateStr,
                    folder: currentFolder,
                  });
                }}
                className="w-full flex items-center justify-center gap-2 bg-[#09090b] hover:bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.16] rounded-xl px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-zinc-400" />
                <span>Добавить задачу...</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Floating Drag Ghost Overlay */}
      {isDragging && dragPos && draggingPayload && (
        <div
          className="fixed pointer-events-none z-50 px-3 py-1.5 rounded-lg bg-[#18181c] border border-blue-500/40 text-xs font-medium text-white shadow-2xl flex items-center gap-2 transform -translate-x-1/2 -translate-y-1/2 opacity-90 scale-105"
          style={{
            left: `${dragPos.x}px`,
            top: `${dragPos.y}px`,
          }}
        >
          <CalendarIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="truncate max-w-[200px]">{draggingPayload.title || 'Задача'}</span>
        </div>
      )}
    </div>
  );
};
