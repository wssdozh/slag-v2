import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem } from '../../types';
import { parseTodoistInput } from '../../lib/todoistTaskParser';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Check,
  AlertCircle,
  Clock,
  Inbox
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
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

function getPriorityBorder(priority?: 'none' | 'low' | 'medium' | 'high'): string {
  switch (priority) {
    case 'high':
      return 'border-l-rose-500 bg-rose-500/[0.08] text-rose-200 hover:border-rose-400';
    case 'medium':
      return 'border-l-amber-400 bg-amber-400/[0.08] text-amber-200 hover:border-amber-300';
    case 'low':
      return 'border-l-zinc-500 bg-zinc-500/[0.08] text-zinc-300 hover:border-zinc-400';
    default:
      return 'border-l-zinc-700 bg-white/[0.03] text-zinc-300 hover:border-zinc-600';
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

  // Quick Inline Add state
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [newTaskInput, setNewTaskInput] = useState('');

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

  const handleDropOnDate = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(null);
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;

    try {
      const payload = JSON.parse(raw);
      if (payload.id) {
        const task = items.find(i => i.id === payload.id);
        if (task) {
          updateItem({
            ...task,
            dueDate: dateStr,
          });
          addToast(`Задача перенесена на ${dateStr}`, 'info');
        }
      }
    } catch {
      // Ignored non-json drops
    }
  };

  // Inline Quick Add Task on a specific date
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

  // Render a Todoist-style Task item
  const renderTaskChip = (task: SlagItem) => {
    const isDone = task.status === 'done';

    return (
      <div
        key={task.id}
        draggable
        onDragStart={e => handleDragStartTask(e, task.id)}
        onClick={() => {
          setSelectedItem(task);
          setIsFullscreenEditorOpen(true);
        }}
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
        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded border border-white/[0.04] border-l-2 transition-all cursor-grab active:cursor-grabbing text-left text-xs ${getPriorityBorder(
          task.priority
        )}`}
      >
        {/* Todoist Circular Checkbox */}
        <button
          onClick={e => {
            e.stopPropagation();
            toggleTaskComplete(task.id);
          }}
          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors shrink-0 ${
            isDone
              ? 'border border-[#e44332] bg-[#e44332] text-white'
              : 'border border-zinc-600 hover:border-[#e44332] hover:bg-[#e44332]/15 text-transparent hover:text-[#e44332]'
          }`}
          title={isDone ? 'Возобновить задачу' : 'Выполнить задачу'}
        >
          <Check className="w-2 h-2 stroke-[3]" />
        </button>

        {/* Task Title */}
        <span
          className={`truncate font-medium text-[11px] leading-tight select-none flex-1 ${
            isDone ? 'line-through text-zinc-500' : 'text-zinc-200'
          }`}
        >
          {task.title || 'Безымянная задача'}
        </span>

        {/* Tags indicator */}
        {task.tags && task.tags.length > 0 && (
          <span className="text-[9px] font-mono text-zinc-500 shrink-0">
            #{task.tags[0]}
          </span>
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
            <CalendarIcon className="w-4 h-4 text-[#e44332]" />
            <h2 className="text-xs font-semibold text-zinc-100 tracking-tight">
              {headerTitle}
            </h2>
          </div>

          {/* Navigation Buttons: < Сегодня > */}
          <div className="flex items-center gap-1 bg-white/[0.03] p-0.5 rounded-md border border-white/[0.04]">
            <button
              onClick={handlePrev}
              className="p-1 rounded hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors"
              title="Предыдущий период"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleToday}
              className="px-2 py-0.5 rounded text-[11px] font-medium text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Перейти к сегодняшнему дню"
            >
              Сегодня
            </button>
            <button
              onClick={handleNext}
              className="p-1 rounded hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors"
              title="Следующий период"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right: View Switcher [ Неделя | Месяц ] & Overdue/Unscheduled Drawer Toggle */}
        <div className="flex items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-white/[0.03] p-0.5 rounded-md border border-white/[0.04]">
            <button
              onClick={() => setViewMode('week')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                viewMode === 'week'
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Неделя
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                viewMode === 'month'
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Месяц
            </button>
          </div>

          {/* Drawer Toggle */}
          <button
            onClick={() => setIsDrawerOpen(prev => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors ${
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
        {/* ============================================================== */}
        {/* Calendar Grid View (Week or Month)                             */}
        {/* ============================================================== */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {viewMode === 'week' ? (
            /* ========================================================== */
            /* WEEK VIEW                                                  */
            /* ========================================================== */
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Day Headers (ПН 10, ВТ 11...) */}
              <div className="grid grid-cols-7 border-b border-white/[0.06] bg-[#0c0c0e]/80 shrink-0">
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

              {/* All-Day (Весь день) Section */}
              <div className="border-b border-white/[0.06] bg-[#09090b] flex flex-col shrink-0 max-h-48 overflow-y-auto">
                <div className="grid grid-cols-7 min-h-[56px]">
                  {weekDays.map(date => {
                    const dateStr = getISODateString(date);
                    const dayTasks = tasksByDueDate.get(dateStr) || [];
                    const isOver = dragOverDate === dateStr;

                    return (
                      <div
                        key={dateStr}
                        onDragOver={e => handleDragOverDate(e, dateStr)}
                        onDragLeave={handleDragLeaveDate}
                        onDrop={e => handleDropOnDate(e, dateStr)}
                        className={`p-1.5 border-r border-white/[0.04] last:border-r-0 space-y-1 transition-colors min-h-[56px] ${
                          isOver ? 'bg-blue-500/10' : ''
                        }`}
                      >
                        {dayTasks.map(task => renderTaskChip(task))}

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
                            className="w-full opacity-0 hover:opacity-100 focus:opacity-100 py-0.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] rounded flex items-center justify-center transition-opacity text-[10px]"
                            title="Добавить задачу на этот день"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hourly Time Grid (08:00 - 20:00) */}
              <div className="flex-1 overflow-y-auto scrollbar-thin relative bg-[#09090b]">
                <div className="relative">
                  {HOURS.map(hour => {
                    const hourLabel = `${String(hour).padStart(2, '0')}:00`;

                    return (
                      <div
                        key={hour}
                        className="flex h-12 border-b border-white/[0.04] text-[10px] font-mono text-zinc-600"
                      >
                        {/* Time marker column */}
                        <div className="w-12 px-2 py-1 text-right select-none border-r border-white/[0.04] shrink-0">
                          {hourLabel}
                        </div>

                        {/* 7 Day slots */}
                        <div className="flex-1 grid grid-cols-7">
                          {weekDays.map(date => {
                            const dateStr = getISODateString(date);

                            return (
                              <div
                                key={dateStr}
                                onDragOver={e => handleDragOverDate(e, dateStr)}
                                onDragLeave={handleDragLeaveDate}
                                onDrop={e => handleDropOnDate(e, dateStr)}
                                className="border-r border-white/[0.03] last:border-r-0 hover:bg-white/[0.02] transition-colors relative"
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================== */
            /* MONTH VIEW                                                 */
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
                      className={`min-h-[90px] p-1.5 border-b border-r border-white/[0.04] flex flex-col justify-between transition-colors ${
                        cell.isCurrentMonth ? 'bg-[#09090b]' : 'bg-[#070709] text-zinc-600'
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
                          onClick={() => {
                            setAddingDate(cell.dateStr);
                            setNewTaskInput('');
                          }}
                          className="opacity-0 group-hover:opacity-100 hover:opacity-100 p-0.5 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-opacity"
                          title="Добавить задачу"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Tasks in cell */}
                      <div className="flex-1 overflow-y-auto space-y-1 my-1 max-h-24 scrollbar-thin">
                        {dayTasks.map(task => renderTaskChip(task))}

                        {/* Inline input if active */}
                        {addingDate === cell.dateStr && (
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

                      {/* Bottom count badge if more */}
                      {dayTasks.length > 2 && (
                        <div className="text-[9px] font-mono text-zinc-500 text-right">
                          Всего: {dayTasks.length}
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
          <div className="w-72 sm:w-80 border-l border-white/[0.06] bg-[#0c0c0e]/95 flex flex-col shrink-0 transition-all duration-200">
            {/* Drawer Tabs */}
            <div className="h-10 px-2 border-b border-white/[0.06] flex items-center justify-between bg-[#121215]">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDrawerTab('overdue')}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
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
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
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
                className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors"
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
                      className="p-2.5 rounded-lg bg-[#141417] hover:bg-[#18181c] border border-rose-500/20 hover:border-rose-500/40 transition-all text-left space-y-2 shadow-sm"
                    >
                      <div className="flex items-start gap-2">
                        {/* Completion Button */}
                        <button
                          onClick={() => toggleTaskComplete(task.id)}
                          className="mt-0.5 w-3.5 h-3.5 rounded-full border border-zinc-600 hover:border-[#e44332] flex items-center justify-center shrink-0"
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

                      {/* 1-Click Rescheduling Buttons */}
                      <div className="flex items-center gap-1.5 pt-1 text-[10px] font-mono">
                        <button
                          onClick={() => handleQuickSchedule(task, getTodayString())}
                          className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 transition-colors"
                        >
                          Сегодня
                        </button>
                        <button
                          onClick={() => handleQuickSchedule(task, getTomorrowString())}
                          className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 transition-colors"
                        >
                          Завтра
                        </button>
                        <button
                          onClick={() => handleQuickSchedule(task, getNextWeekString())}
                          className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 transition-colors"
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
                    className="p-2.5 rounded-lg bg-[#141417] hover:bg-[#18181c] border border-white/[0.06] hover:border-white/[0.12] transition-all text-left space-y-2 shadow-sm"
                  >
                    <div className="flex items-start gap-2">
                      <button
                        onClick={() => toggleTaskComplete(task.id)}
                        className="mt-0.5 w-3.5 h-3.5 rounded-full border border-zinc-600 hover:border-[#e44332] flex items-center justify-center shrink-0"
                      >
                        <Check className="w-2 h-2 text-[#e44332] opacity-0 hover:opacity-100" />
                      </button>
                      <span className="text-xs font-medium text-zinc-200 leading-snug line-clamp-2">
                        {task.title || 'Безымянная задача'}
                      </span>
                    </div>

                    {/* 1-Click Quick Scheduling */}
                    <div className="flex items-center gap-1.5 pt-1 text-[10px] font-mono border-t border-white/[0.04]">
                      <span className="text-zinc-500 mr-auto">Назначить:</span>
                      <button
                        onClick={() => handleQuickSchedule(task, getTodayString())}
                        className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 transition-colors"
                      >
                        Сегодня
                      </button>
                      <button
                        onClick={() => handleQuickSchedule(task, getTomorrowString())}
                        className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 transition-colors"
                      >
                        Завтра
                      </button>
                      <button
                        onClick={() => handleQuickSchedule(task, getNextWeekString())}
                        className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 transition-colors"
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
    </div>
  );
};
