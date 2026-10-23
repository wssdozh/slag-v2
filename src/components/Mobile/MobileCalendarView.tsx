import React, { useState, useMemo, useSyncExternalStore, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, TaskStatus } from '../../types';
import {
  Circle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  MoreVertical,
  AlertCircle
} from 'lucide-react';

function subscribeToNow() {
  return () => {};
}

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function getTomorrowString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getISODateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const RUSSIAN_MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const RUSSIAN_WEEKDAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

interface MobileCalendarViewProps {
  headerRightExtra?: React.ReactNode;
}

interface MobileCalendarTaskRowProps {
  task: SlagItem;
  onSelect: () => void;
  onToggleComplete: () => void;
  onOpenActionSheet: () => void;
}

const MobileCalendarTaskRow: React.FC<MobileCalendarTaskRowProps> = ({
  task,
  onSelect,
  onToggleComplete,
  onOpenActionSheet
}) => {
  const isDone = task.status === 'done';

  return (
    <div
      onClick={onSelect}
      className="w-full flex items-center justify-between p-3 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors cursor-pointer gap-2.5"
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onToggleComplete();
        }}
        className="p-1 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
        aria-label="Изменить статус задачи"
      >
        {isDone ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
        ) : (
          <Circle
            className={`w-4 h-4 ${
              task.priority === 'high'
                ? 'text-rose-400'
                : task.priority === 'medium'
                ? 'text-amber-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          />
        )}
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <div
          className={`text-xs font-medium leading-snug truncate ${
            isDone ? 'line-through text-zinc-500' : 'text-zinc-200'
          }`}
        >
          {task.title || 'Без названия'}
        </div>
      </div>

      {/* Folder tag & More button */}
      <div className="flex items-center gap-1.5 shrink-0">
        {task.folder && (
          <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[100px]">
            {task.folder}
          </span>
        )}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onOpenActionSheet();
          }}
          className="p-1 text-zinc-600 hover:text-zinc-300 cursor-pointer rounded"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const MobileCalendarView: React.FC<MobileCalendarViewProps> = ({ headerRightExtra }) => {
  const {
    items,
    saveItem,
    toggleTaskComplete,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    setMobileActionSheetItem,
    currentFolder
  } = useApp();

  const todayStr = useSyncExternalStore(subscribeToNow, getTodayString, () => '');
  const tomorrowStr = useMemo(() => getTomorrowString(), []);

  // Selected date and week state
  const [selectedDate, setSelectedDate] = useState<string>(() => todayStr || getISODateString(new Date()));
  const [currentWeekMonday, setCurrentWeekMonday] = useState<Date>(() => getMondayOfWeek(new Date()));

  // Sheets
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [isNoDateSheetOpen, setIsNoDateSheetOpen] = useState(false);

  // Picker Month offset
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date().getMonth());

  // Inline Task Creation on specific date
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [inlineTitle, setInlineTitle] = useState('');

  // Swipe gesture detection on Week Strip
  const [stripTouchStartX, setStripTouchStartX] = useState<number | null>(null);
  const [stripTouchStartY, setStripTouchStartY] = useState<number | null>(null);

  // References for scrolling to dates
  const dateSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // All task items
  const allTasks = useMemo(() => {
    return items.filter(i => i.type === 'task' || (i.subtasks && i.subtasks.length > 0));
  }, [items]);

  // Tasks grouped by dueDate
  const { tasksByDate, overdueTasks, noDateTasks } = useMemo(() => {
    const map: Record<string, SlagItem[]> = {};
    const overdue: SlagItem[] = [];
    const noDate: SlagItem[] = [];

    allTasks.forEach(task => {
      const isDone = task.status === 'done';
      if (!task.dueDate) {
        if (!isDone) noDate.push(task);
      } else {
        if (task.dueDate < todayStr && !isDone) {
          overdue.push(task);
        }
        if (!map[task.dueDate]) map[task.dueDate] = [];
        map[task.dueDate].push(task);
      }
    });

    overdue.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

    return { tasksByDate: map, overdueTasks: overdue, noDateTasks: noDate };
  }, [allTasks, todayStr]);

  // Generate 7 days for the current week strip
  const weekDays = useMemo(() => {
    const days: { date: Date; dateStr: string; dayNum: number; weekdayIndex: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekMonday);
      d.setDate(currentWeekMonday.getDate() + i);
      days.push({
        date: d,
        dateStr: getISODateString(d),
        dayNum: d.getDate(),
        weekdayIndex: i
      });
    }
    return days;
  }, [currentWeekMonday]);

  // Month Calendar Days for Picker
  const monthCalendarDays = useMemo(() => {
    const firstDay = new Date(pickerYear, pickerMonth, 1);
    const lastDay = new Date(pickerYear, pickerMonth + 1, 0);
    const startMonday = getMondayOfWeek(firstDay);

    const cells: { date: Date; isCurrentMonth: boolean; dateStr: string; dayNum: number }[] = [];
    const current = new Date(startMonday);

    while (current <= lastDay || cells.length % 7 !== 0) {
      cells.push({
        date: new Date(current),
        isCurrentMonth: current.getMonth() === pickerMonth,
        dateStr: getISODateString(current),
        dayNum: current.getDate()
      });
      current.setDate(current.getDate() + 1);
    }

    return cells;
  }, [pickerYear, pickerMonth]);

  // Month & Year title for Header
  const currentWeekMonthLabel = useMemo(() => {
    // Determine the month corresponding to selected date or week monday
    const d = new Date(currentWeekMonday);
    d.setDate(currentWeekMonday.getDate() + 3); // mid-week day
    return `${RUSSIAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }, [currentWeekMonday]);

  const isCurrentWeek = useMemo(() => {
    if (!todayStr) return false;
    const parts = todayStr.split('-');
    const todayDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const todayMonday = getMondayOfWeek(todayDate);
    return getISODateString(todayMonday) === getISODateString(currentWeekMonday);
  }, [currentWeekMonday, todayStr]);

  // Navigation handlers
  const handlePrevWeek = () => {
    const prev = new Date(currentWeekMonday);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeekMonday(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(currentWeekMonday);
    next.setDate(next.getDate() + 7);
    setCurrentWeekMonday(next);
  };

  const handleGoToToday = () => {
    const parts = (todayStr || getTodayString()).split('-');
    const today = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const todayMonday = getMondayOfWeek(today);
    const todayDateStr = getISODateString(today);
    setCurrentWeekMonday(todayMonday);
    setSelectedDate(todayDateStr);
    scrollToDate(todayDateStr);
  };

  const scrollToDate = (dateStr: string) => {
    const el = dateSectionRefs.current[dateStr];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSelectDay = (dateStr: string) => {
    setSelectedDate(dateStr);
    scrollToDate(dateStr);
  };

  // Month Picker Select
  const handleSelectDateFromPicker = (dateStr: string) => {
    const parts = dateStr.split('-');
    const picked = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    setCurrentWeekMonday(getMondayOfWeek(picked));
    setSelectedDate(dateStr);
    setIsMonthPickerOpen(false);
    setTimeout(() => scrollToDate(dateStr), 100);
  };

  // Inline Task Creation Form
  const handleCreateTaskOnDate = (dateStr: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineTitle.trim()) return;

    saveItem({
      title: inlineTitle.trim(),
      content: '',
      type: 'task',
      folder: currentFolder || 'Входящие',
      dueDate: dateStr,
      status: 'todo' as TaskStatus,
      priority: 'none',
      attachments: [],
      tags: [],
    });

    setInlineTitle('');
    setAddingDate(null);
  };

  // Quick schedule task from No Date sheet
  const handleScheduleTask = (task: SlagItem, targetDate: string) => {
    saveItem({
      ...task,
      dueDate: targetDate,
    });
  };

  // Swipe gesture on Week Strip
  const handleStripTouchStart = (e: React.TouchEvent) => {
    setStripTouchStartX(e.touches[0].clientX);
    setStripTouchStartY(e.touches[0].clientY);
  };

  const handleStripTouchEnd = (e: React.TouchEvent) => {
    if (stripTouchStartX === null || stripTouchStartY === null) return;
    const deltaX = e.changedTouches[0].clientX - stripTouchStartX;
    const deltaY = e.changedTouches[0].clientY - stripTouchStartY;
    setStripTouchStartX(null);
    setStripTouchStartY(null);

    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0) {
        handleNextWeek();
      } else {
        handlePrevWeek();
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] text-[#f4f4f5] overflow-hidden select-none relative">
      {/* 1. Top Header Bar (Todoist Style: Month Dropdown + Mode Switcher) */}
      <header
        className="h-14 border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-md px-3.5 flex items-center justify-between shrink-0 z-20"
        style={{ paddingTop: 'max(var(--sat), 0px)' }}
      >
        {/* Month Dropdown Button */}
        <button
          type="button"
          onClick={() => {
            setPickerYear(currentWeekMonday.getFullYear());
            setPickerMonth(currentWeekMonday.getMonth());
            setIsMonthPickerOpen(true);
          }}
          className="flex items-center gap-1.5 py-1 px-2 -ml-1 rounded-lg hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer text-left shrink-0"
        >
          <span className="text-sm font-bold text-white tracking-tight">
            {currentWeekMonthLabel}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
        </button>

        {/* Right: Mode Switcher (e.g. [Задачи | Календарь]) */}
        {headerRightExtra && (
          <div className="flex items-center shrink-0">
            {headerRightExtra}
          </div>
        )}
      </header>

      {/* 2. Week Strip: 7 Days horizontal bar with sub-header and swipe gesture */}
      <div
        onTouchStart={handleStripTouchStart}
        onTouchEnd={handleStripTouchEnd}
        className="px-3 pt-2 pb-2.5 border-b border-white/[0.06] bg-[#0c0c0e]/80 flex flex-col gap-2 shrink-0"
      >
        {/* Sub-header row: date range and action shortcuts */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-mono text-zinc-500">
            {weekDays[0].dayNum} — {weekDays[6].dayNum} {RUSSIAN_MONTHS[weekDays[6].date.getMonth()].slice(0, 3).toLowerCase()}
          </span>

          <div className="flex items-center gap-1.5">
            {/* Today Button (Highlighted if viewing another week/day) */}
            <button
              type="button"
              onClick={handleGoToToday}
              className={`h-6 px-2 rounded-md text-[11px] font-medium transition-all cursor-pointer active:scale-95 flex items-center gap-1 ${
                isCurrentWeek && selectedDate === todayStr
                  ? 'text-zinc-500 hover:text-zinc-300'
                  : 'bg-white/10 text-white shadow-xs font-semibold'
              }`}
              title="Перейти к сегодняшнему дню"
            >
              <span>Сегодня</span>
            </button>

            {/* No Date Button */}
            <button
              type="button"
              onClick={() => setIsNoDateSheetOpen(true)}
              className="h-6 px-2 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-medium text-zinc-400 hover:text-white transition-all cursor-pointer active:scale-95 flex items-center gap-1"
              title="Задачи без даты"
            >
              <span>Без даты</span>
              {noDateTasks.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-white/10 text-[9px] font-mono text-zinc-300">
                  {noDateTasks.length}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekDays.map(day => {
            const isToday = day.dateStr === todayStr;
            const isSelected = day.dateStr === selectedDate;
            const hasTasks = (tasksByDate[day.dateStr] || []).length > 0;

            return (
              <button
                key={day.dateStr}
                type="button"
                onClick={() => handleSelectDay(day.dateStr)}
                className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all cursor-pointer relative active:scale-95 ${
                  isSelected
                    ? 'bg-white text-black font-bold shadow-sm'
                    : isToday
                    ? 'bg-white/[0.08] text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                <span className={`text-[10px] font-mono uppercase ${isSelected ? 'text-black/70' : 'text-zinc-500'}`}>
                  {RUSSIAN_WEEKDAYS[day.weekdayIndex]}
                </span>
                <span className="text-xs font-semibold mt-0.5">
                  {day.dayNum}
                </span>

                {/* Event Dot Indicator */}
                <div className="h-1 flex items-center justify-center mt-0.5">
                  {hasTasks ? (
                    <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-black' : 'bg-zinc-400'}`} />
                  ) : isToday && !isSelected ? (
                    <span className="w-1 h-1 rounded-full bg-zinc-600" />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Main Agenda Feed (Scrollable Timeline grouped by Days) */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4 pb-28">
        {/* Section: Overdue Tasks (if any) */}
        {overdueTasks.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 px-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Просрочено</span>
              <span className="text-[10px] font-mono opacity-80">({overdueTasks.length})</span>
            </div>

            <div className="rounded-2xl bg-[#141417]/80 border border-rose-500/20 overflow-hidden divide-y divide-white/[0.04]">
              {overdueTasks.map(task => (
                <MobileCalendarTaskRow
                  key={task.id}
                  task={task}
                  onSelect={() => {
                    setSelectedItem(task);
                    setIsFullscreenEditorOpen(true);
                  }}
                  onToggleComplete={() => toggleTaskComplete(task.id)}
                  onOpenActionSheet={() => setMobileActionSheetItem(task)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Sections for each day in the current week */}
        {weekDays.map(day => {
          const dayTasks = tasksByDate[day.dateStr] || [];
          const isToday = day.dateStr === todayStr;
          const isTomorrow = day.dateStr === tomorrowStr;

          // Date format label (e.g. "23 окт. · Сегодня · Среда")
          const dayTitle = isToday
            ? `Сегодня · ${day.dayNum} ${RUSSIAN_MONTHS[day.date.getMonth()].slice(0, 3).toLowerCase()}., ${RUSSIAN_WEEKDAYS[day.weekdayIndex]}`
            : isTomorrow
            ? `Завтра · ${day.dayNum} ${RUSSIAN_MONTHS[day.date.getMonth()].slice(0, 3).toLowerCase()}., ${RUSSIAN_WEEKDAYS[day.weekdayIndex]}`
            : `${day.dayNum} ${RUSSIAN_MONTHS[day.date.getMonth()].slice(0, 3).toLowerCase()}., ${RUSSIAN_WEEKDAYS[day.weekdayIndex]}`;

          return (
            <div
              key={day.dateStr}
              ref={el => { dateSectionRefs.current[day.dateStr] = el; }}
              className="flex flex-col gap-1.5 scroll-mt-2"
            >
              {/* Day Header */}
              <div className="flex items-center justify-between px-1">
                <span
                  className={`text-xs font-semibold tracking-tight ${
                    isToday ? 'text-white' : 'text-zinc-400'
                  }`}
                >
                  {dayTitle}
                </span>
                {dayTasks.length > 0 && (
                  <span className="text-[10px] font-mono text-zinc-500">
                    {dayTasks.length} {dayTasks.length === 1 ? 'задача' : 'задач'}
                  </span>
                )}
              </div>

              {/* Day Tasks Container or Empty State Placeholder */}
              <div className="rounded-2xl bg-[#141417]/70 border border-white/[0.05] overflow-hidden">
                {dayTasks.length > 0 ? (
                  <div className="divide-y divide-white/[0.04]">
                    {dayTasks.map(task => (
                      <MobileCalendarTaskRow
                        key={task.id}
                        task={task}
                        onSelect={() => {
                          setSelectedItem(task);
                          setIsFullscreenEditorOpen(true);
                        }}
                        onToggleComplete={() => toggleTaskComplete(task.id)}
                        onOpenActionSheet={() => setMobileActionSheetItem(task)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="p-3 text-xs text-zinc-500 flex items-center justify-between">
                    <span>— нет задач</span>
                    <button
                      type="button"
                      onClick={() => setAddingDate(day.dateStr)}
                      className="text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Добавить</span>
                    </button>
                  </div>
                )}

                {/* Inline Add Task Form under this day */}
                {addingDate === day.dateStr ? (
                  <form
                    onSubmit={e => handleCreateTaskOnDate(day.dateStr, e)}
                    className="p-2.5 bg-black/40 border-t border-white/[0.06] flex items-center gap-2 animate-in fade-in"
                  >
                    <input
                      type="text"
                      value={inlineTitle}
                      onChange={e => setInlineTitle(e.target.value)}
                      placeholder={`Новая задача на ${day.dayNum} ${RUSSIAN_MONTHS[day.date.getMonth()].slice(0, 3)}...`}
                      autoFocus
                      className="flex-1 bg-black/50 border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-xl bg-white text-black text-xs font-semibold cursor-pointer active:scale-95 transition-all shrink-0"
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingDate(null)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : dayTasks.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setAddingDate(day.dateStr)}
                    className="w-full py-2 px-3 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02] border-t border-white/[0.04] transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить задачу</span>
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Sheet: Tasks with No Date (Bottom Sheet) */}
      {isNoDateSheetOpen && (
        <div data-testid="no-date-sheet" className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-xs animate-in fade-in select-none">
          <div
            className="w-full max-h-[80vh] bg-[#141417] border-t border-white/[0.1] rounded-t-3xl flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-200"
            style={{ paddingBottom: 'max(var(--sab), 1rem)' }}
          >
            {/* Sheet Handle & Header */}
            <div className="flex flex-col items-center pt-2 px-4 border-b border-white/[0.06] shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20 mb-3" />
              <div className="w-full flex items-center justify-between pb-3">
                <button
                  type="button"
                  onClick={() => setIsNoDateSheetOpen(false)}
                  className="text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  Закрыть
                </button>
                <span className="text-sm font-semibold text-white">
                  Без даты ({noDateTasks.length})
                </span>
                <span className="w-10" />
              </div>
            </div>

            {/* Sheet Content: List of unscheduled tasks */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
              {noDateTasks.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 text-xs">
                  Все задачи запланированы по датам.
                </div>
              ) : (
                noDateTasks.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] gap-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => toggleTaskComplete(task.id)}
                      className="p-1 rounded text-zinc-400 hover:text-white cursor-pointer"
                    >
                      <Circle className="w-4 h-4 text-zinc-500" />
                    </button>
                    <span
                      onClick={() => {
                        setSelectedItem(task);
                        setIsFullscreenEditorOpen(true);
                        setIsNoDateSheetOpen(false);
                      }}
                      className="flex-1 text-xs font-medium text-zinc-200 truncate cursor-pointer"
                    >
                      {task.title || 'Без названия'}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleScheduleTask(task, todayStr)}
                        className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-medium text-white transition-colors cursor-pointer"
                      >
                        Сегодня
                      </button>
                      <button
                        type="button"
                        onClick={() => handleScheduleTask(task, tomorrowStr)}
                        className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 text-[11px] font-medium text-zinc-300 transition-colors cursor-pointer"
                      >
                        Завтра
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Sheet: Month Date Picker (Select a Date) */}
      {isMonthPickerOpen && (
        <div data-testid="month-picker-sheet" className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-xs animate-in fade-in select-none">
          <div
            className="w-full max-h-[85vh] bg-[#141417] border-t border-white/[0.1] rounded-t-3xl flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-200"
            style={{ paddingBottom: 'max(var(--sab), 1rem)' }}
          >
            {/* Handle & Header */}
            <div className="flex flex-col items-center pt-2 px-4 border-b border-white/[0.06] shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20 mb-3" />
              <div className="w-full flex items-center justify-between pb-3">
                <button
                  type="button"
                  onClick={() => setIsMonthPickerOpen(false)}
                  className="text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  Отмена
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (pickerMonth === 0) {
                        setPickerMonth(11);
                        setPickerYear(y => y - 1);
                      } else {
                        setPickerMonth(m => m - 1);
                      }
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-semibold text-white">
                    {RUSSIAN_MONTHS[pickerMonth]} {pickerYear}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (pickerMonth === 11) {
                        setPickerMonth(0);
                        setPickerYear(y => y + 1);
                      } else {
                        setPickerMonth(m => m + 1);
                      }
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleSelectDateFromPicker(todayStr);
                  }}
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  Сегодня
                </button>
              </div>
            </div>

            {/* Month Calendar Grid */}
            <div className="p-4 flex flex-col gap-2">
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-mono text-zinc-500 uppercase">
                {RUSSIAN_WEEKDAYS.map(w => (
                  <div key={w} className="py-1">{w}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {monthCalendarDays.map(cell => {
                  const isToday = cell.dateStr === todayStr;
                  const isSelected = cell.dateStr === selectedDate;
                  const hasTasks = (tasksByDate[cell.dateStr] || []).length > 0;

                  return (
                    <button
                      key={cell.dateStr}
                      type="button"
                      onClick={() => handleSelectDateFromPicker(cell.dateStr)}
                      className={`h-10 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer relative active:scale-95 ${
                        isSelected
                          ? 'bg-white text-black font-bold shadow-sm'
                          : isToday
                          ? 'border border-white/30 text-white font-semibold'
                          : cell.isCurrentMonth
                          ? 'text-zinc-200 hover:bg-white/[0.04]'
                          : 'text-zinc-600 hover:bg-white/[0.02]'
                      }`}
                    >
                      <span className="text-xs">{cell.dayNum}</span>
                      <div className="h-1 flex items-center justify-center">
                        {hasTasks && (
                          <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-black' : 'bg-zinc-400'}`} />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
