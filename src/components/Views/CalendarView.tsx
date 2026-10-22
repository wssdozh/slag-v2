import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, SlagSubtask } from '../../types';
import { parseTodoistInput, getTaskTimeSlot } from '../../lib/todoistTaskParser';
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
  Maximize2,
  Folder as FolderIcon,
  ListTodo
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
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

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
        checkboxHover: 'hover:border-[#e44332] hover:bg-[#e44332]/20 text-[#e44332]',
      };
  }
}

export const CalendarView: React.FC = () => {
  const {
    items,
    currentFolder,
    updateItem,
    saveItem,
    toggleTaskComplete,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    openContextMenu,
    addToast
  } = useApp();

  // Mode: 'week' | 'month'
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');

  // Currently focused date anchor
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  // Drawer for Overdue and Unscheduled tasks
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'overdue' | 'unscheduled'>('overdue');

  // Drag over target date
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // Quick Inline Add state for All-Day or Month cell
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [newTaskInput, setNewTaskInput] = useState('');

  // Quick Add for specific hour slot: { dateStr: string; hour: number }
  const [addingSlot, setAddingSlot] = useState<{ dateStr: string; hour: number } | null>(null);
  const [slotTaskInput, setSlotTaskInput] = useState('');

  // Expanded Day Card modal for Month view
  const [expandedDayDateStr, setExpandedDayDateStr] = useState<string | null>(null);
  const [dayCardInput, setDayCardInput] = useState('');

  // Task Details Popover state
  const [inspectingTask, setInspectingTask] = useState<SlagItem | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

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

  // Keyboard shortcut for closing modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inspectingTask) setInspectingTask(null);
        else if (expandedDayDateStr) setExpandedDayDateStr(null);
        else if (addingSlot) setAddingSlot(null);
        else if (addingDate) setAddingDate(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectingTask, expandedDayDateStr, addingSlot, addingDate]);

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

  // Group tasks by dueDate
  const tasksByDueDate = useMemo(() => {
    const map = new Map<string, SlagItem[]>();
    folderTasks.forEach(task => {
      if (task.dueDate) {
        const list = map.get(task.dueDate) || [];
        list.push(task);
        map.set(task.dueDate, list);
      }
    });
    return map;
  }, [folderTasks]);

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

  // Current Week Days (Monday to Sunday)
  const weekDays = useMemo(() => {
    const monday = getMondayOfWeek(currentDate);
    return getWeekDays(monday);
  }, [currentDate]);

  // Month Calendar Grid Cells
  const monthCells = useMemo(() => {
    return getMonthCalendarDays(currentDate.getFullYear(), currentDate.getMonth());
  }, [currentDate]);

  // 1-Click reschedule helper
  const handleQuickSchedule = (task: SlagItem, newDate: string) => {
    updateItem({
      ...task,
      dueDate: newDate,
    });
    addToast(`Задача перенесена на ${newDate}`, 'info');
  };

  // Drag and Drop
  const handleDragStartTask = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: taskId }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverDate = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    if (dragOverDate !== dateStr) {
      setDragOverDate(dateStr);
    }
  };

  const handleDragLeaveDate = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverDate(null);
  };

  const handleDropOnDate = (e: React.DragEvent, dateStr: string, specificHour?: number) => {
    e.preventDefault();
    setDragOverDate(null);
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;

    try {
      const payload = JSON.parse(raw);
      if (payload.id) {
        const task = items.find(i => i.id === payload.id);
        if (task) {
          const reminder = specificHour !== undefined
            ? new Date(new Date(dateStr).setHours(specificHour, 0, 0, 0)).toISOString()
            : task.reminder;

          updateItem({
            ...task,
            dueDate: dateStr,
            reminder,
          });
          addToast(`Задача перенесена на ${dateStr}`, 'info');
        }
      }
    } catch {
      // Ignored
    }
  };

  // Quick Add for specific hour slot in Week Time-blocking
  const handleQuickAddSlotTask = (dateStr: string, hour: number) => {
    if (!slotTaskInput.trim()) {
      setAddingSlot(null);
      return;
    }

    const parsed = parseTodoistInput(slotTaskInput.trim());
    const reminderDate = new Date(dateStr);
    reminderDate.setHours(hour, 0, 0, 0);

    saveItem({
      type: 'task',
      title: parsed.cleanTitle || slotTaskInput.trim(),
      content: '',
      folder: currentFolder,
      status: 'todo',
      priority: parsed.priority || 'none',
      tags: parsed.tags || [],
      dueDate: parsed.dueDate || dateStr,
      reminder: parsed.reminder || reminderDate.toISOString(),
    });

    setSlotTaskInput('');
    setAddingSlot(null);
    addToast(`Задача запланирована на ${hour}:00`, 'success');
  };

  // Inline Quick Add Task for All-Day or Month cell
  const handleQuickAddTask = (dateStr: string) => {
    if (!newTaskInput.trim()) {
      setAddingDate(null);
      return;
    }

    const parsed = parseTodoistInput(newTaskInput.trim());
    saveItem({
      type: 'task',
      title: parsed.cleanTitle || newTaskInput.trim(),
      content: '',
      folder: currentFolder,
      status: 'todo',
      priority: parsed.priority || 'none',
      tags: parsed.tags || [],
      dueDate: parsed.dueDate || dateStr,
      reminder: parsed.reminder,
    });

    setNewTaskInput('');
    setAddingDate(null);
    addToast('Задача запланирована', 'success');
  };

  // Add task in Expanded Day Card
  const handleAddDayCardTask = (dateStr: string) => {
    if (!dayCardInput.trim()) return;

    const parsed = parseTodoistInput(dayCardInput.trim());
    saveItem({
      type: 'task',
      title: parsed.cleanTitle || dayCardInput.trim(),
      content: '',
      folder: currentFolder,
      status: 'todo',
      priority: parsed.priority || 'none',
      tags: parsed.tags || [],
      dueDate: parsed.dueDate || dateStr,
      reminder: parsed.reminder,
    });

    setDayCardInput('');
    addToast('Задача добавлена', 'success');
  };

  // Toggle subtask in Task Details Popover
  const handleToggleSubtask = (task: SlagItem, subtaskId: string) => {
    const updatedSubtasks = (task.subtasks || []).map(st =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );
    const updated = { ...task, subtasks: updatedSubtasks };
    updateItem(updated);
    setInspectingTask(updated);
  };

  // Add new subtask in Task Details Popover
  const handleAddSubtask = (task: SlagItem) => {
    if (!newSubtaskTitle.trim()) return;
    const newSt: SlagSubtask = {
      id: `st_${Date.now()}`,
      title: newSubtaskTitle.trim(),
      completed: false,
    };
    const updated = {
      ...task,
      subtasks: [...(task.subtasks || []), newSt],
    };
    updateItem(updated);
    setInspectingTask(updated);
    setNewSubtaskTitle('');
  };

  // Render a Compact All-Day Task Pill
  const renderAllDayTaskPill = (task: SlagItem) => {
    const isDone = task.status === 'done';
    const styling = getPriorityBadge(task.priority);

    return (
      <div
        key={task.id}
        draggable
        onDragStart={e => handleDragStartTask(e, task.id)}
        onClick={() => setInspectingTask(task)}
        onContextMenu={e => {
          e.preventDefault();
          e.stopPropagation();
          openContextMenu({
            x: e.clientX,
            y: e.clientY,
            type: 'item',
            item: task,
          });
        }}
        className={`group flex items-center gap-1.5 px-2 py-1 rounded-md border text-left text-xs transition-all cursor-pointer ${styling.bg} ${styling.border} ${styling.text}`}
      >
        <button
          onClick={e => {
            e.stopPropagation();
            toggleTaskComplete(task.id);
          }}
          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors shrink-0 ${
            isDone
              ? 'border border-[#e44332] bg-[#e44332] text-white'
              : `border border-zinc-500 ${styling.checkboxHover}`
          }`}
          title={isDone ? 'Возобновить' : 'Выполнить'}
        >
          <Check className="w-2 h-2 stroke-[3]" />
        </button>

        <span
          className={`truncate font-medium text-[11px] leading-tight select-none flex-1 ${
            isDone ? 'line-through text-zinc-500' : 'text-zinc-200'
          }`}
        >
          {task.title || 'Безымянная задача'}
        </span>

        {task.tags && task.tags.length > 0 && (
          <span className="text-[9px] font-mono text-zinc-500 shrink-0">
            #{task.tags[0]}
          </span>
        )}
      </div>
    );
  };

  // Render a Time-Blocked Card in Week View
  const renderTimedTaskBlock = (task: SlagItem, slot: ReturnType<typeof getTaskTimeSlot>) => {
    const isDone = task.status === 'done';
    const styling = getPriorityBadge(task.priority);

    const startH = Math.max(8, Math.min(22, slot.startHour));
    const topPx = (startH - 8) * 52 + (slot.startMinute / 60) * 52;
    const heightPx = Math.max(44, (slot.durationMinutes / 60) * 52);

    const completedSubtasks = task.subtasks?.filter(s => s.completed).length || 0;
    const totalSubtasks = task.subtasks?.length || 0;

    return (
      <div
        key={task.id}
        draggable
        onDragStart={e => handleDragStartTask(e, task.id)}
        onClick={() => setInspectingTask(task)}
        onContextMenu={e => {
          e.preventDefault();
          e.stopPropagation();
          openContextMenu({
            x: e.clientX,
            y: e.clientY,
            type: 'item',
            item: task,
          });
        }}
        style={{ top: `${topPx}px`, height: `${heightPx}px`, left: '3%', width: '94%' }}
        className={`absolute rounded-lg p-2 border flex flex-col justify-between select-none cursor-pointer transition-all duration-150 z-10 shadow-sm ${styling.bg} ${styling.border} ${styling.text}`}
      >
        <div className="flex items-start gap-1.5 min-w-0">
          <button
            onClick={e => {
              e.stopPropagation();
              toggleTaskComplete(task.id);
            }}
            className={`mt-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors shrink-0 ${
              isDone
                ? 'border border-[#e44332] bg-[#e44332] text-white'
                : `border border-zinc-500 ${styling.checkboxHover}`
            }`}
            title={isDone ? 'Возобновить' : 'Выполнить'}
          >
            <Check className="w-2 h-2 stroke-[3]" />
          </button>

          <span
            className={`font-semibold text-xs leading-snug truncate flex-1 ${
              isDone ? 'line-through text-zinc-500' : 'text-zinc-100'
            }`}
          >
            {task.title || 'Безымянная задача'}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono opacity-80 pt-0.5">
          <span className="truncate">{slot.timeLabel}</span>
          {totalSubtasks > 0 && (
            <span className="flex items-center gap-0.5 shrink-0">
              <ListTodo className="w-2.5 h-2.5" />
              <span>{completedSubtasks}/{totalSubtasks}</span>
            </span>
          )}
        </div>
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
            <CalendarIcon className="w-4 h-4 text-[#e44332]" />
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
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer ${
              isDrawerOpen
                ? 'bg-white/10 border-white/[0.12] text-white'
                : 'bg-white/[0.03] border-white/[0.05] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
            }`}
            title="Открыть список просроченных и незапланированных задач"
          >
            {overdueTasks.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-[#e44332] animate-pulse" />
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
                          <span className="w-6 h-6 rounded-full bg-[#e44332] text-white text-xs font-bold flex items-center justify-center shadow-sm">
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
                    const isOver = dragOverDate === dateStr;

                    return (
                      <div
                        key={dateStr}
                        onDragOver={e => handleDragOverDate(e, dateStr)}
                        onDragLeave={handleDragLeaveDate}
                        onDrop={e => handleDropOnDate(e, dateStr)}
                        className={`p-1 border-r border-white/[0.04] last:border-r-0 space-y-1 transition-colors min-h-[44px] ${
                          isOver ? 'bg-blue-500/10' : ''
                        }`}
                      >
                        {allDayTasks.map(task => renderAllDayTaskPill(task))}

                        {/* Inline add input if active for this day */}
                        {addingDate === dateStr && (
                          <div className="p-1 rounded bg-[#18181c] border border-blue-500/40">
                            <input
                              autoFocus
                              type="text"
                              placeholder="Новая задача..."
                              value={newTaskInput}
                              onChange={e => setNewTaskInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleQuickAddTask(dateStr);
                                } else if (e.key === 'Escape') {
                                  setAddingDate(null);
                                }
                              }}
                              className="w-full bg-transparent text-[11px] text-zinc-100 outline-none"
                            />
                          </div>
                        )}

                        {/* Add Task Hover Trigger */}
                        {addingDate !== dateStr && (
                          <button
                            onClick={() => {
                              setAddingDate(dateStr);
                              setNewTaskInput('');
                            }}
                            className="w-full opacity-0 hover:opacity-100 focus:opacity-100 py-0.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] rounded flex items-center justify-center transition-opacity text-[10px] cursor-pointer"
                            title="Добавить задачу на весь день"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
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
                    const showRedRibbon = isToday && nowMinute >= 8 * 60 && nowMinute <= 23 * 60;
                    const redRibbonTopPx = showRedRibbon ? ((nowMinute - 8 * 60) / 60) * 52 : 0;

                    return (
                      <div
                        key={dateStr}
                        className="relative border-r border-white/[0.04] last:border-r-0 h-full"
                      >
                        {/* Hour slot background rows with 1-click add */}
                        {HOURS.map(hour => {
                          const isSlotAdding = addingSlot?.dateStr === dateStr && addingSlot?.hour === hour;

                          return (
                            <div
                              key={hour}
                              onClick={() => {
                                setAddingSlot({ dateStr, hour });
                                setSlotTaskInput('');
                              }}
                              onDragOver={e => handleDragOverDate(e, dateStr)}
                              onDragLeave={handleDragLeaveDate}
                              onDrop={e => handleDropOnDate(e, dateStr, hour)}
                              className="h-[52px] border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors relative group cursor-pointer"
                            >
                              {/* Hover indicator with time */}
                              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none transition-opacity">
                                <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 bg-[#18181c] px-2 py-0.5 rounded border border-white/[0.06] shadow-sm">
                                  <Plus className="w-2.5 h-2.5 text-zinc-400" />
                                  <span>{String(hour).padStart(2, '0')}:00</span>
                                </span>
                              </div>

                              {/* Inline Quick Add Input on slot click */}
                              {isSlotAdding && (
                                <div
                                  onClick={e => e.stopPropagation()}
                                  className="absolute inset-x-1 top-1 z-30 p-2 rounded-lg bg-[#18181c] border border-blue-500/50 shadow-xl"
                                >
                                  <input
                                    autoFocus
                                    type="text"
                                    placeholder={`Задача на ${hour}:00...`}
                                    value={slotTaskInput}
                                    onChange={e => setSlotTaskInput(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleQuickAddSlotTask(dateStr, hour);
                                      } else if (e.key === 'Escape') {
                                        setAddingSlot(null);
                                      }
                                    }}
                                    className="w-full bg-transparent text-xs text-zinc-100 outline-none"
                                  />
                                  <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-500 font-mono">
                                    <span>Enter — сохранить</span>
                                    <span>Esc — отмена</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Red Time Ribbon for Today */}
                        {showRedRibbon && (
                          <div
                            style={{ top: `${redRibbonTopPx}px` }}
                            className="absolute inset-x-0 h-[2px] bg-[#e44332] z-20 pointer-events-none"
                          >
                            <div className="w-2.5 h-2.5 rounded-full bg-[#e44332] -mt-1 -ml-1 shadow-sm shadow-red-500/80" />
                          </div>
                        )}

                        {/* Render Timed Task Cards */}
                        {timedTasks.map(task => {
                          const slot = getTaskTimeSlot(task);
                          return renderTimedTaskBlock(task, slot);
                        })}
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
                  const isOver = dragOverDate === cell.dateStr;

                  return (
                    <div
                      key={cell.dateStr}
                      onDragOver={e => handleDragOverDate(e, cell.dateStr)}
                      onDragLeave={handleDragLeaveDate}
                      onDrop={e => handleDropOnDate(e, cell.dateStr)}
                      onClick={() => setExpandedDayDateStr(cell.dateStr)}
                      className={`min-h-[96px] p-1.5 border-b border-r border-white/[0.04] flex flex-col justify-between transition-colors cursor-pointer group ${
                        cell.isCurrentMonth ? 'bg-[#09090b] hover:bg-[#0c0c0e]' : 'bg-[#070709] text-zinc-600'
                      } ${isOver ? 'bg-blue-500/10' : ''}`}
                    >
                      {/* Cell Header: Day Number */}
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-mono ${
                            isToday
                              ? 'w-5 h-5 rounded-full bg-[#e44332] text-white font-bold flex items-center justify-center'
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
                            setAddingDate(cell.dateStr);
                            setNewTaskInput('');
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

                          return (
                            <div
                              key={task.id}
                              onClick={e => {
                                e.stopPropagation();
                                setInspectingTask(task);
                              }}
                              className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-white/[0.03] hover:bg-white/[0.08] text-[10px] text-zinc-300 truncate transition-colors"
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styling.dot}`} />
                              <span className={`truncate flex-1 ${isDone ? 'line-through text-zinc-500' : ''}`}>
                                {task.title}
                              </span>
                              {!slot.isAllDay && (
                                <span className="text-[9px] font-mono text-zinc-500 shrink-0">
                                  {String(slot.startHour).padStart(2, '0')}:{String(slot.startMinute).padStart(2, '0')}
                                </span>
                              )}
                            </div>
                          );
                        })}

                        {/* Inline input if active */}
                        {addingDate === cell.dateStr && (
                          <div
                            onClick={e => e.stopPropagation()}
                            className="p-1 rounded bg-[#18181c] border border-blue-500/40"
                          >
                            <input
                              autoFocus
                              type="text"
                              placeholder="Новая задача..."
                              value={newTaskInput}
                              onChange={e => setNewTaskInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleQuickAddTask(cell.dateStr);
                                } else if (e.key === 'Escape') {
                                  setAddingDate(null);
                                }
                              }}
                              className="w-full bg-transparent text-[10px] text-zinc-100 outline-none"
                            />
                          </div>
                        )}
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
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                    drawerTab === 'unscheduled'
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
              {drawerTab === 'overdue' ? (
                overdueTasks.length === 0 ? (
                  <div className="py-12 text-center text-xs text-zinc-600 font-mono">
                    Нет просроченных задач
                  </div>
                ) : (
                  overdueTasks.map(task => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={e => handleDragStartTask(e, task.id)}
                      onClick={() => setInspectingTask(task)}
                      className="p-2.5 rounded-lg bg-[#141417] hover:bg-[#18181c] border border-rose-500/20 hover:border-rose-500/40 transition-all text-left space-y-2 shadow-sm cursor-pointer"
                    >
                      <div className="flex items-start gap-2">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            toggleTaskComplete(task.id);
                          }}
                          className="mt-0.5 w-3.5 h-3.5 rounded-full border border-zinc-600 hover:border-[#e44332] flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <Check className="w-2 h-2 text-[#e44332] opacity-0 hover:opacity-100" />
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
                    draggable
                    onDragStart={e => handleDragStartTask(e, task.id)}
                    onClick={() => setInspectingTask(task)}
                    className="p-2.5 rounded-lg bg-[#141417] hover:bg-[#18181c] border border-white/[0.06] hover:border-white/[0.12] transition-all text-left space-y-2 shadow-sm cursor-pointer"
                  >
                    <div className="flex items-start gap-2">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          toggleTaskComplete(task.id);
                        }}
                        className="mt-0.5 w-3.5 h-3.5 rounded-full border border-zinc-600 hover:border-[#e44332] flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        <Check className="w-2 h-2 text-[#e44332] opacity-0 hover:opacity-100" />
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
                <CalendarIcon className="w-4 h-4 text-[#e44332]" />
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

                  return (
                    <div
                      key={task.id}
                      onClick={() => setInspectingTask(task)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-colors cursor-pointer ${styling.bg} ${styling.border}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            toggleTaskComplete(task.id);
                          }}
                          className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                            isDone
                              ? 'border border-[#e44332] bg-[#e44332] text-white'
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
              <div className="flex items-center gap-2 bg-[#09090b] border border-white/[0.08] rounded-xl px-3 py-1.5 focus-within:border-white/20 transition-colors">
                <Plus className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <input
                  type="text"
                  placeholder="Добавить задачу... (Enter для сохранения)"
                  value={dayCardInput}
                  onChange={e => setDayCardInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddDayCardTask(expandedDayDateStr);
                    }
                  }}
                  className="w-full bg-transparent text-xs text-zinc-100 placeholder-zinc-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. Task Details Popover (Floating Card like Todoist Image 3)   */}
      {/* ============================================================== */}
      {inspectingTask && (
        <div
          onClick={() => setInspectingTask(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-[#141417] border border-white/[0.1] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
          >
            {/* Header: Folder + Actions */}
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between bg-[#18181c]">
              <div className="flex items-center gap-2 text-xs text-zinc-400 truncate">
                <FolderIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span className="truncate">{inspectingTask.folder}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setSelectedItem(inspectingTask);
                    setIsFullscreenEditorOpen(true);
                    setInspectingTask(null);
                  }}
                  className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  title="Открыть в фокус-редакторе"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setInspectingTask(null)}
                  className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
              {/* Title & Complete Checkbox */}
              <div className="flex items-start gap-3">
                <button
                  onClick={() => {
                    toggleTaskComplete(inspectingTask.id);
                    setInspectingTask({
                      ...inspectingTask,
                      status: inspectingTask.status === 'done' ? 'todo' : 'done',
                    });
                  }}
                  className={`mt-1 w-4 h-4 rounded-full flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                    inspectingTask.status === 'done'
                      ? 'border border-[#e44332] bg-[#e44332] text-white'
                      : 'border border-zinc-500 hover:border-[#e44332] text-transparent hover:text-[#e44332]'
                  }`}
                >
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </button>
                <h2
                  className={`text-sm font-semibold leading-snug ${
                    inspectingTask.status === 'done'
                      ? 'line-through text-zinc-500'
                      : 'text-zinc-100'
                  }`}
                >
                  {inspectingTask.title}
                </h2>
              </div>

              {/* Content / Notes */}
              {inspectingTask.content && (
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {inspectingTask.content}
                </div>
              )}

              {/* Due date and fast reschedule */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                  Срок выполнения
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-xs font-mono text-zinc-200">
                    {inspectingTask.dueDate || 'Без срока'}
                  </span>
                  <button
                    onClick={() => {
                      handleQuickSchedule(inspectingTask, getTodayString());
                      setInspectingTask({ ...inspectingTask, dueDate: getTodayString() });
                    }}
                    className="px-2 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.08] text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Сегодня
                  </button>
                  <button
                    onClick={() => {
                      handleQuickSchedule(inspectingTask, getTomorrowString());
                      setInspectingTask({ ...inspectingTask, dueDate: getTomorrowString() });
                    }}
                    className="px-2 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.08] text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Завтра
                  </button>
                  <button
                    onClick={() => {
                      handleQuickSchedule(inspectingTask, getNextWeekString());
                      setInspectingTask({ ...inspectingTask, dueDate: getNextWeekString() });
                    }}
                    className="px-2 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.08] text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    +1 Неделя
                  </button>
                </div>
              </div>

              {/* Subtasks checklist */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                    Подзадачи (
                    {(inspectingTask.subtasks || []).filter(s => s.completed).length}/
                    {(inspectingTask.subtasks || []).length}
                    )
                  </span>
                </div>

                <div className="space-y-1">
                  {(inspectingTask.subtasks || []).map(st => (
                    <div
                      key={st.id}
                      onClick={() => handleToggleSubtask(inspectingTask, st.id)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] text-xs text-zinc-300 transition-colors cursor-pointer"
                    >
                      <button
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                          st.completed
                            ? 'bg-[#e44332] border-[#e44332] text-white'
                            : 'border-zinc-600 hover:border-zinc-400'
                        }`}
                      >
                        {st.completed && <Check className="w-2 h-2 stroke-[3]" />}
                      </button>
                      <span className={`truncate flex-1 ${st.completed ? 'line-through text-zinc-500' : ''}`}>
                        {st.title}
                      </span>
                    </div>
                  ))}

                  {/* Add Subtask Input */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Добавить подзадачу..."
                      value={newSubtaskTitle}
                      onChange={e => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSubtask(inspectingTask);
                        }
                      }}
                      className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-1 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-white/20"
                    />
                    <button
                      onClick={() => handleAddSubtask(inspectingTask)}
                      className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs text-zinc-300 transition-colors cursor-pointer"
                    >
                      Добавить
                    </button>
                  </div>
                </div>
              </div>

              {/* Priority and Tags */}
              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-zinc-500">Приоритет:</span>
                  <select
                    value={inspectingTask.priority || 'none'}
                    onChange={e => {
                      const newPrio = e.target.value as any;
                      const updated = { ...inspectingTask, priority: newPrio };
                      updateItem(updated);
                      setInspectingTask(updated);
                    }}
                    className="bg-[#18181c] border border-white/[0.08] rounded px-2 py-0.5 text-xs text-zinc-300 outline-none"
                  >
                    <option value="high">Высокий (P1)</option>
                    <option value="medium">Средний (P2)</option>
                    <option value="low">Низкий (P3)</option>
                    <option value="none">Обычный (P4)</option>
                  </select>
                </div>

                {inspectingTask.tags && inspectingTask.tags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {inspectingTask.tags.map(t => (
                      <span
                        key={t}
                        className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[10px] font-mono text-zinc-400"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
