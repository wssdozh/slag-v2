import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem } from '../../types';
import { getTaskTimeSlot, type TaskTimeSlot } from '../../lib/todoistTaskParser';
import { getRecurringOccurrencesInRange } from '../../lib/recurrenceHelper';
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

function getISODateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getTodayString(): string {
  return getISODateString(new Date());
}

function getTomorrowString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return getISODateString(d);
}

function getNextWeekString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return getISODateString(d);
}

function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getWeekDays(monday: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const next = new Date(monday);
    next.setDate(monday.getDate() + i);
    days.push(next);
  }
  return days;
}

function getMonthCalendarDays(year: number, month: number): { date: Date; isCurrentMonth: boolean; dateStr: string }[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startMonday = getMondayOfWeek(firstDay);

  const cells: { date: Date; isCurrentMonth: boolean; dateStr: string }[] = [];
  const current = new Date(startMonday);

  while (current <= lastDay || cells.length % 7 !== 0) {
    cells.push({
      date: new Date(current),
      isCurrentMonth: current.getMonth() === month,
      dateStr: getISODateString(current),
    });
    current.setDate(current.getDate() + 1);
  }

  return cells;
}

const RUSSIAN_MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const RUSSIAN_WEEKDAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getPriorityBadge(priority?: 'none' | 'low' | 'medium' | 'high'): {
  bg: string;
  border: string;
  text: string;
  dot: string;
  checkboxHover: string;
} {
  switch (priority) {
    case 'high':
      return {
        bg: 'bg-rose-500/12 hover:bg-rose-500/18',
        border: 'border-rose-500/35',
        text: 'text-rose-200',
        dot: 'bg-rose-500',
        checkboxHover: 'hover:border-rose-500 hover:bg-rose-500/20 text-rose-400',
      };
    case 'medium':
      return {
        bg: 'bg-amber-500/12 hover:bg-amber-500/18',
        border: 'border-amber-500/35',
        text: 'text-amber-200',
        dot: 'bg-amber-500',
        checkboxHover: 'hover:border-amber-400 hover:bg-amber-400/20 text-amber-400',
      };
    case 'low':
      return {
        bg: 'bg-blue-500/12 hover:bg-blue-500/18',
        border: 'border-blue-500/35',
        text: 'text-blue-200',
        dot: 'bg-blue-400',
        checkboxHover: 'hover:border-blue-400 hover:bg-blue-400/20 text-blue-400',
      };
    default:
      return {
        bg: 'bg-[#18181c] hover:bg-[#202024]',
        border: 'border-white/[0.08]',
        text: 'text-zinc-200',
        dot: 'bg-zinc-500',
        checkboxHover: 'hover:border-zinc-300 hover:bg-white/[0.08] text-zinc-300',
      };
  }
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

  // Drag over target and dragging item state
  type CalendarDragTarget =
    | { type: 'hour'; dateStr: string; hour: number }
    | { type: 'allday'; dateStr: string }
    | { type: 'month'; dateStr: string }
    | { type: 'unscheduled' };

  const [dragTarget, setDragTarget] = useState<CalendarDragTarget | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  // Card bottom-edge resize state for time-blocking duration
  const [resizingTask, setResizingTask] = useState<{
    taskId: string;
    initialY: number;
    initialDuration: number;
    currentDuration: number;
  } | null>(null);

  // Expanded Day Card modal for Month view
  const [expandedDayDateStr, setExpandedDayDateStr] = useState<string | null>(null);

  // Live minute ticker for Red Ribbon Indicator
  const [nowMinute, setNowMinute] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  const timeGridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const d = new Date();
      setNowMinute(d.getHours() * 60 + d.getMinutes());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll time grid to current hour - 1 on mount/view change
  useEffect(() => {
    if (viewMode === 'week' && timeGridRef.current) {
      const currentHour = Math.floor(nowMinute / 60);
      const scrollHour = Math.max(0, currentHour - 1);
      timeGridRef.current.scrollTop = scrollHour * 52;
    }
  }, [viewMode, nowMinute]);

  // Keyboard shortcut for closing modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (expandedDayDateStr) setExpandedDayDateStr(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedDayDateStr]);

  // Scoped tasks in current folder
  const folderTasks = useMemo(() => {
    return items.filter(item => {
      if (item.type !== 'task') return false;
      if (currentFolder === 'Входящие') return true;
      return item.folder === currentFolder || item.folder.startsWith(currentFolder + '/');
    });
  }, [items, currentFolder]);

  const todayStr = useMemo(() => getTodayString(), []);

  // Overdue tasks: dueDate < today and not done
  const overdueTasks = useMemo(() => {
    return folderTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < todayStr);
  }, [folderTasks, todayStr]);

  // Unscheduled tasks: no dueDate and not done
  const unscheduledTasks = useMemo(() => {
    return folderTasks.filter(t => t.status !== 'done' && !t.dueDate);
  }, [folderTasks]);

  // Current Week Days (Monday to Sunday)
  const weekDays = useMemo(() => {
    const monday = getMondayOfWeek(currentDate);
    return getWeekDays(monday);
  }, [currentDate]);

  // Month Calendar Grid Cells
  const monthCells = useMemo(() => {
    return getMonthCalendarDays(currentDate.getFullYear(), currentDate.getMonth());
  }, [currentDate]);

  // Group tasks by dueDate and project future occurrences of recurring tasks
  const tasksByDueDate = useMemo(() => {
    const map = new Map<string, (SlagItem & { isVirtual?: boolean })[]>();

    // 1. Place real tasks
    folderTasks.forEach(task => {
      if (task.dueDate) {
        const list = map.get(task.dueDate) || [];
        list.push(task);
        map.set(task.dueDate, list);
      }
    });

    // 2. Project virtual occurrences of recurring tasks in visible range
    let startRangeStr = todayStr;
    let endRangeStr = todayStr;
    if (viewMode === 'week' && weekDays.length > 0) {
      startRangeStr = getISODateString(weekDays[0]);
      endRangeStr = getISODateString(weekDays[6]);
    } else if (viewMode === 'month' && monthCells.length > 0) {
      startRangeStr = monthCells[0].dateStr;
      endRangeStr = monthCells[monthCells.length - 1].dateStr;
    }

    folderTasks.forEach(task => {
      if (task.recurrence && task.dueDate && task.status !== 'done') {
        const occurrences = getRecurringOccurrencesInRange(task, startRangeStr, endRangeStr);
        occurrences.forEach(occDate => {
          if (occDate !== task.dueDate) {
            const list = map.get(occDate) || [];
            if (!list.some(it => it.id.startsWith(task.id + '_virtual_'))) {
              let nextReminder: string | undefined = undefined;
              if (task.reminder) {
                try {
                  const orig = new Date(task.reminder);
                  const [y, m, d] = occDate.split('-').map(Number);
                  nextReminder = new Date(y, m - 1, d, orig.getHours(), orig.getMinutes(), 0, 0).toISOString();
                } catch {
                  // ignore
                }
              }

              const virtualItem: SlagItem & { isVirtual?: boolean } = {
                ...task,
                id: `${task.id}_virtual_${occDate}`,
                dueDate: occDate,
                reminder: nextReminder,
                isVirtual: true,
              };
              list.push(virtualItem);
              map.set(occDate, list);
            }
          }
        });
      }
    });

    return map;
  }, [folderTasks, viewMode, weekDays, monthCells, todayStr]);

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

  // Drag and Drop helpers & handlers
  const cleanTimeFromTitle = (title: string): string => {
    let clean = title;
    clean = clean.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\s*[-—]\s*([01]?\d|2[0-3]):([0-5]\d)\b/g, '').trim();
    clean = clean.replace(/(?:^|\s|[вВ@])\s*([01]?\d|2[0-3]):([0-5]\d)\b/g, '').trim();
    clean = clean.replace(/\s+/g, ' ').trim();
    return clean || title;
  };

  const extractTaskId = (e: React.DragEvent): string | null => {
    const jsonRaw = e.dataTransfer.getData('application/json');
    if (jsonRaw) {
      try {
        const parsed = JSON.parse(jsonRaw);
        if (parsed && typeof parsed.id === 'string') return parsed.id;
      } catch {
        // ignore
      }
    }
    const textRaw = e.dataTransfer.getData('text/plain');
    if (textRaw) {
      try {
        const parsed = JSON.parse(textRaw);
        if (parsed && typeof parsed.id === 'string') return parsed.id;
      } catch {
        if (textRaw.trim()) return textRaw.trim();
      }
    }
    return draggingTaskId;
  };

  const handleDragStartTask = (e: React.DragEvent, taskId: string) => {
    e.stopPropagation();
    setDraggingTaskId(taskId);
    e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'task', id: taskId }));
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'task', id: taskId }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = (e?: React.DragEvent) => {
    if (e) e.stopPropagation();
    setDraggingTaskId(null);
    setDragTarget(null);
  };

  const handleDragOverHour = (e: React.DragEvent, dateStr: string, hour: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragTarget?.type !== 'hour' || dragTarget.dateStr !== dateStr || dragTarget.hour !== hour) {
      setDragTarget({ type: 'hour', dateStr, hour });
    }
  };

  const handleDragOverAllDay = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragTarget?.type !== 'allday' || dragTarget.dateStr !== dateStr) {
      setDragTarget({ type: 'allday', dateStr });
    }
  };

  const handleDragOverMonth = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragTarget?.type !== 'month' || dragTarget.dateStr !== dateStr) {
      setDragTarget({ type: 'month', dateStr });
    }
  };

  const handleDragOverUnscheduled = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragTarget?.type !== 'unscheduled') {
      setDragTarget({ type: 'unscheduled' });
    }
  };

  const handleDropHour = (e: React.DragEvent, dateStr: string, hour: number) => {
    e.preventDefault();
    e.stopPropagation();
    const taskId = extractTaskId(e);
    handleDragEnd(e);
    if (!taskId) return;

    const task = items.find(i => i.id === taskId);
    if (!task) return;

    const [year, month, day] = dateStr.split('-').map(Number);
    const targetDate = new Date(year, month - 1, day, hour, 0, 0, 0);
    const reminder = targetDate.toISOString();

    updateItem({
      ...task,
      dueDate: dateStr,
      reminder,
    });
    addToast(`Задача перенесена на ${dateStr} в ${String(hour).padStart(2, '0')}:00`, 'info');
  };

  const handleDropAllDay = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    const taskId = extractTaskId(e);
    handleDragEnd(e);
    if (!taskId) return;

    const task = items.find(i => i.id === taskId);
    if (!task) return;

    const updatedTitle = cleanTimeFromTitle(task.title);

    updateItem({
      ...task,
      title: updatedTitle,
      dueDate: dateStr,
      reminder: undefined,
    });
    addToast(`Задача перенесена на ${dateStr} (весь день)`, 'info');
  };

  const handleDropMonth = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    const taskId = extractTaskId(e);
    handleDragEnd(e);
    if (!taskId) return;

    const task = items.find(i => i.id === taskId);
    if (!task) return;

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
  };

  const handleDropUnscheduled = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const taskId = extractTaskId(e);
    handleDragEnd(e);
    if (!taskId) return;

    const task = items.find(i => i.id === taskId);
    if (!task) return;

    const updatedTitle = cleanTimeFromTitle(task.title);

    updateItem({
      ...task,
      title: updatedTitle,
      dueDate: undefined,
      reminder: undefined,
    });
    addToast('Срок задачи снят (перемещена в "Без срока")', 'info');
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
        draggable
        onDragStart={e => handleDragStartTask(e, realTaskId)}
        onDragEnd={handleDragEnd}
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
        className={`group flex items-center gap-1.5 px-2 py-1 rounded-md border text-left text-xs transition-all min-w-0 ${styling.bg} ${styling.border} ${styling.text} ${
          task.isVirtual ? 'border-dashed opacity-85' : ''
        } ${
          isDragging
            ? 'opacity-40 ring-1 ring-blue-500/50 scale-[0.98] pointer-events-none'
            : draggingTaskId !== null
            ? 'pointer-events-none'
            : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <button
          onClick={e => {
            e.stopPropagation();
            toggleTaskComplete(realTaskId);
          }}
          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors shrink-0 ${
            isDone
              ? 'border border-blue-500 bg-blue-500 text-white'
              : `border border-zinc-500 ${styling.checkboxHover}`
          }`}
          title={isDone ? 'Возобновить' : 'Выполнить'}
        >
          <Check className="w-2 h-2 stroke-[3]" />
        </button>

        <span
          className={`truncate font-medium text-[11px] leading-tight select-none flex-1 min-w-[20px] ${
            isDone ? 'line-through text-zinc-500' : 'text-zinc-200'
          }`}
        >
          {task.title || 'Безымянная задача'}
        </span>

        {task.recurrence && (
          <span title="Повторяющаяся задача" className="shrink-0 flex items-center">
            <Repeat className="w-2.5 h-2.5 text-amber-400" />
          </span>
        )}

        {task.tags && task.tags.length > 0 && (
          <span className="hidden xl:inline text-[9px] font-mono text-zinc-500 shrink-0">
            #{task.tags[0]}
          </span>
        )}
      </div>
    );
  };

  // Handle dragging bottom edge to resize task duration (time-blocking)
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

      const realId = taskId.replace(/_virtual_.*$/, '');
      const target = items.find(i => i.id === realId);
      if (target) {
        updateItem({
          ...target,
          duration: finalDuration,
        });
        addToast(
          `Длительность: ${
            finalDuration >= 60
              ? `${Math.floor(finalDuration / 60)}ч ${finalDuration % 60 ? `${finalDuration % 60}м` : ''}`.trim()
              : `${finalDuration}м`
          }`,
          'success'
        );
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  interface LayoutPositionedTask {
    task: SlagItem & { isVirtual?: boolean };
    slot: TaskTimeSlot;
    topPx: number;
    heightPx: number;
    colIndex: number;
    totalCols: number;
  }

  function computeAntiOverlapLayout(
    tasks: (SlagItem & { isVirtual?: boolean })[],
    resizingTaskId: string | null,
    resizingDuration: number | null
  ): LayoutPositionedTask[] {
    if (tasks.length === 0) return [];

    // 1. Calculate slot & interval for each task
    const layoutItems = tasks.map(task => {
      const rawSlot = getTaskTimeSlot(task);
      const isBeingResized = resizingTaskId && (task.id === resizingTaskId || task.id.startsWith(resizingTaskId + '_virtual_'));
      const durationMinutes = isBeingResized && resizingDuration ? resizingDuration : rawSlot.durationMinutes;

      const slot: TaskTimeSlot = {
        ...rawSlot,
        durationMinutes,
      };

      const startMinutes = slot.startHour * 60 + slot.startMinute;
      const endMinutes = startMinutes + slot.durationMinutes;
      const startH = Math.max(0, Math.min(23, slot.startHour));
      const topPx = startH * 52 + (slot.startMinute / 60) * 52;
      const heightPx = Math.max(26, (slot.durationMinutes / 60) * 52);

      return {
        task,
        slot,
        startMinutes,
        endMinutes,
        topPx,
        heightPx,
        colIndex: 0,
        totalCols: 1,
      };
    });

    // 2. Sort by startMinutes ASC, then durationMinutes DESC
    layoutItems.sort((a, b) => a.startMinutes - b.startMinutes || (b.endMinutes - b.startMinutes) - (a.endMinutes - a.startMinutes));

    // 3. Cluster overlapping tasks
    const clusters: typeof layoutItems[] = [];
    let currentCluster: typeof layoutItems = [];
    let clusterEnd = -1;

    for (const item of layoutItems) {
      if (currentCluster.length === 0) {
        currentCluster.push(item);
        clusterEnd = item.endMinutes;
      } else if (item.startMinutes < clusterEnd) {
        currentCluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.endMinutes);
      } else {
        clusters.push(currentCluster);
        currentCluster = [item];
        clusterEnd = item.endMinutes;
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    // 4. Assign columns within each cluster
    const result: LayoutPositionedTask[] = [];

    for (const cluster of clusters) {
      const columns: number[] = [];

      for (const item of cluster) {
        let placedCol = -1;
        for (let c = 0; c < columns.length; c++) {
          if (columns[c] <= item.startMinutes) {
            placedCol = c;
            columns[c] = item.endMinutes;
            break;
          }
        }
        if (placedCol === -1) {
          placedCol = columns.length;
          columns.push(item.endMinutes);
        }
        item.colIndex = placedCol;
      }

      const totalCols = Math.max(1, columns.length);
      for (const item of cluster) {
        item.totalCols = totalCols;
        result.push(item);
      }
    }

    return result;
  }

  // Render a Time-Blocked Card in Week View with Anti-Overlap
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
    const isShort = heightPx < 38;

    return (
      <div
        key={task.id}
        draggable={!resizingTask}
        onDragStart={e => handleDragStartTask(e, realTaskId)}
        onDragEnd={handleDragEnd}
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
        title={`${task.title || 'Безымянная задача'} (${slot.timeLabel})`}
        data-testid={`task-timed-card-${task.id}`}
        style={{
          top: `${topPx}px`,
          height: `${heightPx}px`,
          left: `${left}%`,
          width: `${width}%`,
        }}
        className={`absolute rounded-lg ${totalCols > 1 ? 'p-1' : 'p-2'} border flex flex-col justify-between select-none transition-all duration-75 z-10 shadow-sm ${styling.bg} ${styling.border} ${styling.text} ${
          task.isVirtual ? 'border-dashed opacity-85' : ''
        } ${
          isDragging
            ? 'opacity-40 ring-1 ring-blue-500/50 scale-[0.98] pointer-events-none'
            : draggingTaskId !== null
            ? 'pointer-events-none'
            : isResizing
            ? 'ring-1 ring-blue-500 shadow-md z-30'
            : 'cursor-grab active:cursor-grabbing hover:border-white/20 hover:z-20'
        }`}
      >
        <div className={`flex items-start ${totalCols > 1 ? 'gap-1' : 'gap-1.5'} min-w-0`}>
          <button
            onClick={e => {
              e.stopPropagation();
              toggleTaskComplete(realTaskId);
            }}
            className={`mt-0.5 ${totalCols > 1 ? 'w-3 h-3' : 'w-3.5 h-3.5'} rounded-full flex items-center justify-center transition-colors shrink-0 ${
              isDone
                ? 'border border-blue-500 bg-blue-500 text-white'
                : `border border-zinc-500 ${styling.checkboxHover}`
            }`}
            title={isDone ? 'Возобновить' : 'Выполнить'}
          >
            <Check className="w-2 h-2 stroke-[3]" />
          </button>

          <span
            className={`font-semibold text-xs leading-snug truncate flex-1 min-w-0 ${
              isDone ? 'line-through text-zinc-500' : 'text-zinc-100'
            }`}
          >
            {task.title || 'Безымянная задача'}
          </span>

          {task.recurrence && (
            <span title="Повторяющаяся задача" className="shrink-0 flex items-center mt-0.5">
              <Repeat className="w-3 h-3 text-amber-400" />
            </span>
          )}
        </div>

        {!isShort && totalCols < 3 && (
          <div className="flex items-center justify-between text-[10px] font-mono opacity-80 pt-0.5">
            <span className="truncate">{slot.timeLabel}</span>
            {totalSubtasks > 0 && (
              <span className="flex items-center gap-0.5 shrink-0">
                <ListTodo className="w-2.5 h-2.5" />
                <span>{completedSubtasks}/{totalSubtasks}</span>
              </span>
            )}
          </div>
        )}

        {/* Bottom edge resize handle for interactive time-blocking duration */}
        {!task.isVirtual && (
          <div
            data-testid={`resize-handle-${task.id}`}
            onMouseDown={e => handleResizeStart(e, task.id, slot.durationMinutes)}
            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize hover:bg-blue-400/20 rounded-b-lg transition-colors z-20 flex items-center justify-center group/resize"
            title="Потяните для изменения длительности"
          >
            <div className="w-6 h-0.5 bg-white/20 rounded-full group-hover/resize:bg-white/50" />
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
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Day Headers (ПН 10, ВТ 11...) */}
              <div className="flex border-b border-white/[0.06] bg-[#0c0c0e]/90 shrink-0">
                <div className="w-14 shrink-0 border-r border-white/[0.04] flex items-center justify-center text-[10px] font-mono text-zinc-600">
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
                <div className="w-14 shrink-0 border-r border-white/[0.04] px-1.5 py-2 flex items-start justify-end text-[10px] font-mono text-zinc-500 select-none">
                  Весь день
                </div>
                <div className="flex-1 grid grid-cols-7 min-h-[44px]">
                  {weekDays.map(date => {
                    const dateStr = getISODateString(date);
                    const dayTasks = tasksByDueDate.get(dateStr) || [];
                    const allDayTasks = dayTasks.filter(t => getTaskTimeSlot(t).isAllDay);
                    const isOver = dragTarget?.type === 'allday' && dragTarget.dateStr === dateStr;

                    return (
                      <div
                        key={dateStr}
                        onDragEnter={e => handleDragOverAllDay(e, dateStr)}
                        onDragOver={e => handleDragOverAllDay(e, dateStr)}
                        onDrop={e => handleDropAllDay(e, dateStr)}
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
                className="flex-1 overflow-y-auto scrollbar-thin relative bg-[#09090b] flex"
              >
                {/* Time markers column */}
                <div className="w-14 shrink-0 border-r border-white/[0.04] bg-[#0c0c0e]/50 select-none">
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
                          const isOver = dragTarget?.type === 'hour' && dragTarget.dateStr === dateStr && dragTarget.hour === hour;
                          return (
                            <div
                              key={hour}
                              onClick={() => {
                                openComposerModal({
                                  type: 'task',
                                  dueDate: dateStr,
                                  reminder: `${dateStr}T${String(hour).padStart(2, '0')}:00:00`,
                                  folder: currentFolder,
                                });
                              }}
                              onDragEnter={e => handleDragOverHour(e, dateStr, hour)}
                              onDragOver={e => handleDragOverHour(e, dateStr, hour)}
                              onDrop={e => handleDropHour(e, dateStr, hour)}
                              className={`h-[52px] border-b border-white/[0.04] transition-colors relative group cursor-pointer ${
                                isOver
                                  ? 'bg-blue-500/15 border-blue-500/40 ring-1 ring-blue-500/30'
                                  : 'hover:bg-white/[0.02]'
                              }`}
                            >
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
                          resizingTask?.taskId || null,
                          resizingTask?.currentDuration || null
                        ).map(positioned => renderTimedTaskBlock(positioned))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================== */
            /* MONTH VIEW (with compact task rows & day expansion)       */
            /* ========================================================== */
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-[#09090b]">
              {/* Day Header Row */}
              <div className="grid grid-cols-7 border-b border-white/[0.06] bg-[#0c0c0e]/80 shrink-0">
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
                  const isOver = dragTarget?.type === 'month' && dragTarget.dateStr === cell.dateStr;

                  return (
                    <div
                      key={cell.dateStr}
                      onDragEnter={e => handleDragOverMonth(e, cell.dateStr)}
                      onDragOver={e => handleDragOverMonth(e, cell.dateStr)}
                      onDrop={e => handleDropMonth(e, cell.dateStr)}
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
                          const isDragging = draggingTaskId === task.id;
                          const realTaskId = task.id.replace(/_virtual_.*$/, '');

                          return (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={e => handleDragStartTask(e, realTaskId)}
                              onDragEnd={handleDragEnd}
                              onClick={e => {
                                e.stopPropagation();
                                const target = items.find(i => i.id === realTaskId) || task;
                                setSelectedItem(target);
                                setIsFullscreenEditorOpen(true);
                              }}
                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-white/[0.03] hover:bg-white/[0.08] text-[10px] text-zinc-300 truncate transition-colors ${
                                task.isVirtual ? 'border border-dashed border-white/20 opacity-80' : ''
                              } ${
                                isDragging
                                  ? 'opacity-40 ring-1 ring-blue-500/50 pointer-events-none'
                                  : draggingTaskId !== null
                                  ? 'pointer-events-none'
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
                  onDragEnter={handleDragOverUnscheduled}
                  onDragOver={handleDragOverUnscheduled}
                  onDrop={handleDropUnscheduled}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                    dragTarget?.type === 'unscheduled'
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
              {draggingTaskId && (
                <div
                  onDragEnter={handleDragOverUnscheduled}
                  onDragOver={handleDragOverUnscheduled}
                  onDrop={handleDropUnscheduled}
                  className={`p-3 rounded-lg border-2 border-dashed transition-all text-center text-xs font-mono flex items-center justify-center gap-2 cursor-pointer ${
                    dragTarget?.type === 'unscheduled'
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
                    const isDragging = draggingTaskId === task.id;
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={e => handleDragStartTask(e, task.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => {
                          setSelectedItem(task);
                          setIsFullscreenEditorOpen(true);
                        }}
                        className={`p-2.5 rounded-lg bg-[#141417] hover:bg-[#18181c] border border-rose-500/20 hover:border-rose-500/40 transition-all text-left space-y-2 shadow-sm cursor-grab active:cursor-grabbing ${
                          isDragging ? 'opacity-40 ring-1 ring-blue-500/50 scale-[0.98] pointer-events-none' : ''
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
                  const isDragging = draggingTaskId === task.id;
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={e => handleDragStartTask(e, task.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => {
                        setSelectedItem(task);
                        setIsFullscreenEditorOpen(true);
                      }}
                      className={`p-2.5 rounded-lg bg-[#141417] hover:bg-[#18181c] border border-white/[0.06] hover:border-white/[0.12] transition-all text-left space-y-2 shadow-sm cursor-grab active:cursor-grabbing ${
                        isDragging ? 'opacity-40 ring-1 ring-blue-500/50 scale-[0.98] pointer-events-none' : ''
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
                      draggable
                      onDragStart={e => handleDragStartTask(e, realTaskId)}
                      onDragEnd={handleDragEnd}
                      onClick={() => {
                        const target = items.find(i => i.id === realTaskId) || task;
                        setSelectedItem(target);
                        setIsFullscreenEditorOpen(true);
                      }}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-colors cursor-grab active:cursor-grabbing ${styling.bg} ${styling.border} ${
                        task.isVirtual ? 'border-dashed opacity-85' : ''
                      } ${
                        isDragging ? 'opacity-40 ring-1 ring-blue-500/50 scale-[0.98]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            toggleTaskComplete(realTaskId);
                          }}
                          className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                            isDone
                              ? 'border border-blue-500 bg-blue-500 text-white'
                              : `border border-zinc-500 ${styling.checkboxHover}`
                          }`}
                        >
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
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
    </div>
  );
};
