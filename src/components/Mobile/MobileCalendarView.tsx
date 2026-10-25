import React, { useState, useMemo, useSyncExternalStore, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, TaskStatus } from '../../types';
import { getTaskTimeSlot } from '../../lib/todoistTaskParser';
import { computeAntiOverlapLayout } from '../../lib/calendarLayout';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import { useCalendarSchedule } from '../../hooks/useCalendarSchedule';
import {
  getISODateString,
  getTodayString,
  getTomorrowString,
  getMondayOfWeek,
  RUSSIAN_MONTHS,
  RUSSIAN_WEEKDAYS,
} from '../../lib/dateUtils';
import {
  Circle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  MoreVertical,
  AlertCircle,
  ListTodo,
  Columns,
  Repeat
} from 'lucide-react';

function subscribeToNow() {
  return () => {};
}

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 54; // px per hour

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
  const slot = getTaskTimeSlot(task);

  return (
    <div
      onClick={onSelect}
      className="w-full flex items-center justify-between p-2.5 sm:p-3 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors cursor-pointer gap-2"
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
                : task.priority === 'low'
                ? 'text-blue-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          />
        )}
      </button>

      {/* Title & Time */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        {!slot.isAllDay && slot.hasTime && (
          <span className="text-[11px] font-mono text-zinc-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06] shrink-0">
            {String(slot.startHour).padStart(2, '0')}:{String(slot.startMinute).padStart(2, '0')}
          </span>
        )}
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
          <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[90px]">
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

  // Calendar Mode: 'agenda' (Week Strip + List) vs '3day' (3-Day 24h Time Grid)
  const [calendarLayout, setCalendarLayout] = useState<'agenda' | '3day'>('agenda');

  // Selected date and week state for Agenda
  const [selectedDate, setSelectedDate] = useState<string>(() => todayStr || getISODateString(new Date()));
  const [currentWeekMonday, setCurrentWeekMonday] = useState<Date>(() => getMondayOfWeek(new Date()));

  // 3-Day View Start Date (3 consecutive days)
  const [threeDayStartDate, setThreeDayStartDate] = useState<string>(() => todayStr || getISODateString(new Date()));

  // Sheets
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [isNoDateSheetOpen, setIsNoDateSheetOpen] = useState(false);

  // Picker Month offset
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date().getMonth());

  // Inline Task Creation on specific date (Agenda)
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [inlineTitle, setInlineTitle] = useState('');

  // 1-Click Add slot on 3-day grid: { dateStr, hour }
  const [addingTimeSlot, setAddingTimeSlot] = useState<{ dateStr: string; hour: number } | null>(null);
  const [slotTaskTitle, setSlotTaskTitle] = useState('');

  // Time grid scroll ref
  const timeGridScrollRef = useRef<HTMLDivElement | null>(null);
  const dateSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Current time minute-of-day for the red ribbon line
  const [nowMinute, setNowMinute] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const d = new Date();
      setNowMinute(d.getHours() * 60 + d.getMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll 3-day view once on mount or layout switch to current hour - 1
  const hasInitialScrolledRef = useRef(false);
  useEffect(() => {
    if (calendarLayout === '3day' && timeGridScrollRef.current && !hasInitialScrolledRef.current) {
      const currentHour = Math.floor(nowMinute / 60);
      const scrollHour = Math.max(0, currentHour - 1);
      timeGridScrollRef.current.scrollTop = scrollHour * HOUR_HEIGHT;
      hasInitialScrolledRef.current = true;
    }
    if (calendarLayout !== '3day') {
      hasInitialScrolledRef.current = false;
    }
  }, [calendarLayout, nowMinute]);

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

  // Tasks grouped by dueDate using unified schedule hook
  const rangeStart = weekDays[0]?.dateStr || todayStr;
  const rangeEnd = weekDays[6]?.dateStr || todayStr;

  const {
    overdueTasks,
    unscheduledTasks: noDateTasks,
    tasksByDate: tasksByDateMap,
  } = useCalendarSchedule({
    items,
    rangeStart,
    rangeEnd,
  });

  const tasksByDate = useMemo(() => {
    const obj: Record<string, (SlagItem & { isVirtual?: boolean })[]> = {};
    tasksByDateMap.forEach((tasks, dateStr) => {
      obj[dateStr] = tasks;
    });
    return obj;
  }, [tasksByDateMap]);

  // Generate 3 consecutive days for 3-Day View
  const threeDays = useMemo(() => {
    const parts = threeDayStartDate.split('-');
    const base = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const list: { date: Date; dateStr: string; dayNum: number; weekdayIndex: number }[] = [];

    for (let i = 0; i < 3; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      list.push({
        date: d,
        dateStr: getISODateString(d),
        dayNum: d.getDate(),
        weekdayIndex: (d.getDay() + 6) % 7 // 0 = ПН
      });
    }
    return list;
  }, [threeDayStartDate]);

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
  const currentMonthLabel = useMemo(() => {
    if (calendarLayout === '3day') {
      const parts = threeDayStartDate.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      const monthName = headerRightExtra ? RUSSIAN_MONTHS[d.getMonth()].slice(0, 3) : RUSSIAN_MONTHS[d.getMonth()];
      return `${monthName} ${d.getFullYear()}`;
    }
    const d = new Date(currentWeekMonday);
    d.setDate(currentWeekMonday.getDate() + 3);
    const monthName = headerRightExtra ? RUSSIAN_MONTHS[d.getMonth()].slice(0, 3) : RUSSIAN_MONTHS[d.getMonth()];
    return `${monthName} ${d.getFullYear()}`;
  }, [calendarLayout, currentWeekMonday, headerRightExtra, threeDayStartDate]);

  const isCurrentWeek = useMemo(() => {
    if (!todayStr) return false;
    const parts = todayStr.split('-');
    const todayDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const todayMonday = getMondayOfWeek(todayDate);
    return getISODateString(todayMonday) === getISODateString(currentWeekMonday);
  }, [currentWeekMonday, todayStr]);

  const isThreeDayToday = useMemo(() => {
    return threeDayStartDate === todayStr;
  }, [threeDayStartDate, todayStr]);

  // Navigation handlers
  const handlePrev = () => {
    if (calendarLayout === '3day') {
      const parts = threeDayStartDate.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      d.setDate(d.getDate() - 3);
      setThreeDayStartDate(getISODateString(d));
    } else {
      const prev = new Date(currentWeekMonday);
      prev.setDate(prev.getDate() - 7);
      setCurrentWeekMonday(prev);
    }
  };

  const handleNext = () => {
    if (calendarLayout === '3day') {
      const parts = threeDayStartDate.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      d.setDate(d.getDate() + 3);
      setThreeDayStartDate(getISODateString(d));
    } else {
      const next = new Date(currentWeekMonday);
      next.setDate(next.getDate() + 7);
      setCurrentWeekMonday(next);
    }
  };

  const handleGoToToday = () => {
    const parts = (todayStr || getTodayString()).split('-');
    const today = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const todayMonday = getMondayOfWeek(today);
    const todayDateStr = getISODateString(today);

    setCurrentWeekMonday(todayMonday);
    setSelectedDate(todayDateStr);
    setThreeDayStartDate(todayDateStr);

    if (calendarLayout === 'agenda') {
      scrollToDate(todayDateStr);
    } else if (timeGridScrollRef.current) {
      const currentHour = Math.floor(nowMinute / 60);
      timeGridScrollRef.current.scrollTop = Math.max(0, currentHour - 1) * HOUR_HEIGHT;
    }
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
    setThreeDayStartDate(dateStr);
    setIsMonthPickerOpen(false);
    if (calendarLayout === 'agenda') {
      setTimeout(() => scrollToDate(dateStr), 100);
    }
  };

  // Inline Task Creation Form (Agenda)
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

  // 1-Click Add on 3-Day Grid Slot
  const handleCreateTaskInTimeSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingTimeSlot || !slotTaskTitle.trim()) return;

    const timeStr = `${String(addingTimeSlot.hour).padStart(2, '0')}:00`;
    const fullDate = `${addingTimeSlot.dateStr}T${timeStr}:00`;

    saveItem({
      title: slotTaskTitle.trim(),
      content: '',
      type: 'task',
      folder: currentFolder || 'Входящие',
      dueDate: addingTimeSlot.dateStr,
      reminder: fullDate,
      status: 'todo' as TaskStatus,
      priority: 'none',
      attachments: [],
      tags: [],
    });

    setSlotTaskTitle('');
    setAddingTimeSlot(null);
  };

  // Quick schedule task from No Date sheet
  const handleScheduleTask = (task: SlagItem, targetDate: string) => {
    saveItem({
      ...task,
      dueDate: targetDate,
    });
  };

  // Swipe gesture handling
  const { onTouchStart: handleTouchStart, onTouchEnd: handleTouchEnd } = useSwipeGesture({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
  });

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] text-[#f4f4f5] overflow-hidden select-none relative">
      {/* 1. Unified Mobile Calendar Header (Single Bar, 44px) */}
      <header
        className="h-11 border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-md px-2 flex items-center justify-between shrink-0 z-20 gap-1 overflow-x-auto scrollbar-none"
        style={{ paddingTop: 'max(var(--sat), 0px)' }}
      >
        {/* Left: Month Dropdown Button & Today shortcut */}
        <div className="flex items-center gap-1 min-w-0 shrink-0">
          <button
            type="button"
            onClick={() => {
              const parts = (calendarLayout === '3day' ? threeDayStartDate : getISODateString(currentWeekMonday)).split('-');
              setPickerYear(Number(parts[0]));
              setPickerMonth(Number(parts[1]) - 1);
              setIsMonthPickerOpen(true);
            }}
            className="flex items-center gap-1 py-1 px-1.5 -ml-1 rounded-lg hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer text-left shrink-0"
          >
            <span className="text-xs font-bold text-white tracking-tight">
              {currentMonthLabel}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          <button
            type="button"
            onClick={handleGoToToday}
            className={`h-6 px-1.5 rounded-md text-[10px] font-medium transition-all cursor-pointer active:scale-95 flex items-center gap-0.5 shrink-0 ${
              (calendarLayout === 'agenda' && isCurrentWeek && selectedDate === todayStr) ||
              (calendarLayout === '3day' && isThreeDayToday)
                ? 'text-zinc-500 hover:text-zinc-300'
                : 'bg-white/10 text-white font-semibold'
            }`}
            title="Перейти к сегодняшнему дню"
          >
            <span>Сегодня</span>
          </button>
        </div>

        {/* Center: Layout toggle [Список | 3 дня] */}
        <div className="flex items-center bg-[#141417] p-0.5 rounded-lg border border-white/[0.08] shrink-0">
          <button
            type="button"
            onClick={() => setCalendarLayout('agenda')}
            className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all cursor-pointer flex items-center gap-1 ${
              calendarLayout === 'agenda'
                ? 'bg-white/10 text-white shadow-xs font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Режим списка (Повестка)"
          >
            <ListTodo className="w-3 h-3" />
            <span>Список</span>
          </button>
          <button
            type="button"
            onClick={() => setCalendarLayout('3day')}
            className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all cursor-pointer flex items-center gap-1 ${
              calendarLayout === '3day'
                ? 'bg-white/10 text-white shadow-xs font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Режим 3 дня (24 часа)"
          >
            <Columns className="w-3 h-3" />
            <span>3 дня</span>
          </button>
        </div>

        {/* Right: [Без даты] and ViewModeSwitcher / Extra */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsNoDateSheetOpen(true)}
            className="h-6 px-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[10px] font-medium text-zinc-400 hover:text-white transition-all cursor-pointer active:scale-95 flex items-center gap-1 shrink-0"
            title="Задачи без даты"
          >
            <span>Без даты</span>
            {noDateTasks.length > 0 && (
              <span className="px-1 py-0.1 rounded-full bg-white/10 text-[9px] font-mono text-zinc-300">
                {noDateTasks.length}
              </span>
            )}
          </button>

          {headerRightExtra && (
            <div className="flex items-center shrink-0">
              {headerRightExtra}
            </div>
          )}
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 3. MODE A: AGENDA VIEW (Week Strip + Grouped Days Timeline)                */}
      {/* ========================================================================= */}
      {calendarLayout === 'agenda' ? (
        <>
          {/* Week Strip (7 Days) */}
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="px-3 py-2 border-b border-white/[0.06] bg-[#0c0c0e]/80 shrink-0"
          >
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

          {/* Agenda Feed */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4 pb-28">
            {/* Overdue Section */}
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
                      onToggleComplete={() => toggleTaskComplete(task.id.replace(/_virtual_.*$/, ''))}
                      onOpenActionSheet={() => setMobileActionSheetItem(task)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Days in the week */}
            {weekDays.map(day => {
              const dayTasks = tasksByDate[day.dateStr] || [];
              const isToday = day.dateStr === todayStr;
              const isTomorrow = day.dateStr === tomorrowStr;

              const dayTitle = isToday
                ? `Сегодня · ${day.dayNum} ${RUSSIAN_MONTHS[day.date.getMonth()].slice(0, 3).toLowerCase()}., ${RUSSIAN_WEEKDAYS[day.weekdayIndex]}`
                : isTomorrow
                ? `Завтра · ${day.dayNum} ${RUSSIAN_MONTHS[day.date.getMonth()].slice(0, 3).toLowerCase()}., ${RUSSIAN_WEEKDAYS[day.weekdayIndex]}`
                : `${day.dayNum} ${RUSSIAN_MONTHS[day.date.getMonth()].slice(0, 3).toLowerCase()}., ${RUSSIAN_WEEKDAYS[day.weekdayIndex]}`;

              // Chronological sorting: all-day tasks first, then timed tasks by startMinutes ASC
              const sortedDayTasks = [...dayTasks].sort((a, b) => {
                const slotA = getTaskTimeSlot(a);
                const slotB = getTaskTimeSlot(b);
                if (slotA.isAllDay && !slotB.isAllDay) return -1;
                if (!slotA.isAllDay && slotB.isAllDay) return 1;
                if (!slotA.isAllDay && !slotB.isAllDay) {
                  const minA = slotA.startHour * 60 + slotA.startMinute;
                  const minB = slotB.startHour * 60 + slotB.startMinute;
                  return minA - minB;
                }
                return 0;
              });

              const nowHour = Math.floor(nowMinute / 60);
              const nowMin = nowMinute % 60;
              const nowTimeLabel = `${String(nowHour).padStart(2, '0')}:${String(nowMin).padStart(2, '0')}`;

              return (
                <div
                  key={day.dateStr}
                  ref={el => { dateSectionRefs.current[day.dateStr] = el; }}
                  className="flex flex-col gap-1.5 scroll-mt-2"
                >
                  <div className="flex items-center justify-between px-1">
                    <span className={`text-xs font-semibold tracking-tight ${isToday ? 'text-white' : 'text-zinc-400'}`}>
                      {dayTitle}
                    </span>
                    {dayTasks.length > 0 && (
                      <span className="text-[10px] font-mono text-zinc-500">
                        {dayTasks.length} {dayTasks.length === 1 ? 'задача' : 'задач'}
                      </span>
                    )}
                  </div>

                  <div className="rounded-2xl bg-[#141417]/70 border border-white/[0.05] overflow-hidden">
                    {sortedDayTasks.length > 0 ? (
                      <div className="divide-y divide-white/[0.04]">
                        {(() => {
                          const elements: React.ReactNode[] = [];
                          let nowLineInserted = false;

                          const renderNowLine = () => (
                            <div key="now-timeline-indicator" className="flex items-center gap-2 py-1 px-3 select-none bg-rose-500/[0.03]">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-xs shadow-rose-500/80 shrink-0" />
                              <span className="text-[10px] font-mono font-medium text-rose-400 shrink-0">{nowTimeLabel} · Сейчас</span>
                              <div className="h-px flex-1 bg-rose-500/25" />
                            </div>
                          );

                          sortedDayTasks.forEach((task) => {
                            if (isToday && !nowLineInserted) {
                              const slot = getTaskTimeSlot(task);
                              const taskMinutes = slot.isAllDay ? -1 : slot.startHour * 60 + slot.startMinute;
                              if (taskMinutes > nowMinute) {
                                elements.push(renderNowLine());
                                nowLineInserted = true;
                              }
                            }

                            elements.push(
                              <MobileCalendarTaskRow
                                key={task.id}
                                task={task}
                                onSelect={() => {
                                  setSelectedItem(task);
                                  setIsFullscreenEditorOpen(true);
                                }}
                                onToggleComplete={() => toggleTaskComplete(task.id.replace(/_virtual_.*$/, ''))}
                                onOpenActionSheet={() => setMobileActionSheetItem(task)}
                              />
                            );
                          });

                          if (isToday && !nowLineInserted) {
                            elements.push(renderNowLine());
                          }

                          return elements;
                        })()}
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {isToday && (
                          <div className="flex items-center gap-2 py-1 px-3 select-none bg-rose-500/[0.03] border-b border-white/[0.04]">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-xs shadow-rose-500/80 shrink-0" />
                            <span className="text-[10px] font-mono font-medium text-rose-400 shrink-0">{nowTimeLabel} · Сейчас</span>
                            <div className="h-px flex-1 bg-rose-500/25" />
                          </div>
                        )}
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
                      </div>
                    )}

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
        </>
      ) : (
        /* ========================================================================= */
        /* 4. MODE B: 3-DAY 24-HOUR TIME GRID (Todoist Multi-Day View)               */
        /* ========================================================================= */
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="flex-1 flex flex-col overflow-hidden select-none bg-[#09090b]"
        >
          {/* 3-Day Column Headers (Sticky Top) */}
          <div className="flex border-b border-white/[0.06] bg-[#0c0c0e] shrink-0">
            {/* Time label left spacer */}
            <div className="w-11 shrink-0 border-r border-white/[0.04]" />

            {/* 3 Days columns */}
            <div className="flex-1 grid grid-cols-3 divide-x divide-white/[0.04]">
              {threeDays.map(day => {
                const isToday = day.dateStr === todayStr;

                return (
                  <div
                    key={day.dateStr}
                    className="py-2 px-1 flex flex-col items-center justify-center text-center"
                  >
                    <span className="text-[10px] font-mono text-zinc-500 uppercase">
                      {RUSSIAN_WEEKDAYS[day.weekdayIndex]}
                    </span>
                    <span
                      className={`text-xs font-bold mt-0.5 px-2 py-0.5 rounded-full ${
                        isToday ? 'bg-white text-black shadow-xs' : 'text-zinc-200'
                      }`}
                    >
                      {day.dayNum}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* All Day Row (Chips for tasks without specific time slot) */}
          <div className="flex border-b border-white/[0.06] bg-[#0c0c0e]/50 shrink-0 min-h-[36px]">
            <div className="w-11 shrink-0 border-r border-white/[0.04] flex items-center justify-center text-[9px] font-mono text-zinc-500 uppercase p-1">
              Весь день
            </div>
            <div className="flex-1 grid grid-cols-3 divide-x divide-white/[0.04] p-1 gap-1">
              {threeDays.map(day => {
                const dayTasks = tasksByDate[day.dateStr] || [];
                const allDayTasks = dayTasks.filter(t => getTaskTimeSlot(t).isAllDay);

                return (
                  <div key={day.dateStr} className="flex flex-col gap-1 min-w-0">
                    {allDayTasks.map(task => (
                      <div
                        key={task.id}
                        onClick={() => {
                          const realId = task.id.replace(/_virtual_.*$/, '');
                          const target = items.find(i => i.id === realId) || task;
                          setSelectedItem(target);
                          setIsFullscreenEditorOpen(true);
                        }}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[10px] text-zinc-300 truncate cursor-pointer active:scale-95 transition-all ${
                          task.isVirtual ? 'border-dashed opacity-85' : ''
                        }`}
                        title={task.title}
                      >
                        <span className="truncate flex-1">{task.title || 'Без названия'}</span>
                        {task.recurrence && (
                          <Repeat className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 24-Hour Scrollable Grid (00:00 - 23:00) */}
          <div
            ref={timeGridScrollRef}
            className="flex-1 overflow-y-auto scrollbar-thin relative bg-[#09090b] flex pb-24"
          >
            {/* Time rail left column */}
            <div className="w-11 shrink-0 border-r border-white/[0.04] bg-[#0c0c0e]/30 select-none">
              {HOURS_24.map(h => (
                <div
                  key={h}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                  className="border-b border-white/[0.04] pr-1.5 text-right text-[10px] font-mono text-zinc-500 pt-1"
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* 3 Day Columns Grid */}
            <div className="flex-1 grid grid-cols-3 relative divide-x divide-white/[0.04]">
              {threeDays.map(day => {
                const isToday = day.dateStr === todayStr;
                const dayTasks = tasksByDate[day.dateStr] || [];
                const timedTasks = dayTasks.filter(t => !getTaskTimeSlot(t).isAllDay);

                // Red time line position
                const redRibbonTopPx = (nowMinute / 60) * HOUR_HEIGHT;

                return (
                  <div key={day.dateStr} className="relative h-full">
                    {/* Hour slots with tap to add */}
                    {HOURS_24.map(hour => {
                      const isAddingThis = addingTimeSlot?.dateStr === day.dateStr && addingTimeSlot?.hour === hour;

                      return (
                        <div
                          key={hour}
                          onClick={() => {
                            setAddingTimeSlot({ dateStr: day.dateStr, hour });
                            setSlotTaskTitle('');
                          }}
                          style={{ height: `${HOUR_HEIGHT}px` }}
                          className="border-b border-white/[0.04] hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors relative cursor-pointer group"
                        >
                          {/* Inline Add Modal in Grid Slot */}
                          {isAddingThis && (
                            <div
                              onClick={e => e.stopPropagation()}
                              className="absolute inset-x-1 top-1 z-30 bg-[#18181c] border border-white/20 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1.5 animate-in fade-in"
                            >
                              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                                <span>{String(hour).padStart(2, '0')}:00</span>
                                <button
                                  type="button"
                                  onClick={() => setAddingTimeSlot(null)}
                                  className="text-zinc-500 hover:text-white"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                              <form onSubmit={handleCreateTaskInTimeSlot} className="flex flex-col gap-1">
                                <input
                                  type="text"
                                  value={slotTaskTitle}
                                  onChange={e => setSlotTaskTitle(e.target.value)}
                                  placeholder="Название..."
                                  autoFocus
                                  className="bg-black/50 border border-white/10 rounded px-1.5 py-1 text-xs text-white placeholder-zinc-500 outline-none"
                                />
                                <button
                                  type="submit"
                                  className="py-1 rounded bg-white text-black text-[10px] font-semibold cursor-pointer active:scale-95 transition-all"
                                >
                                  Добавить
                                </button>
                              </form>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Red Ribbon Line on Today's column */}
                    {isToday && (
                      <div
                        style={{ top: `${redRibbonTopPx}px` }}
                        className="absolute inset-x-0 h-[2px] bg-rose-500 z-20 pointer-events-none"
                      >
                        <div className="w-2 h-2 rounded-full bg-rose-500 -mt-[3px] -ml-1 shadow-sm shadow-rose-500/80" />
                      </div>
                    )}

                    {/* Timed Task Blocks with Anti-Overlap and Clean Monochrome Styling */}
                    {computeAntiOverlapLayout(timedTasks, HOUR_HEIGHT).map(positioned => {
                      const { task, slot, topPx, heightPx, colIndex, totalCols } = positioned;
                      const isDone = task.status === 'done';
                      const colWidth = 94 / totalCols;
                      const left = 3 + colIndex * colWidth;
                      const width = totalCols > 1 ? colWidth - 1 : 94;

                      return (
                        <div
                          key={task.id}
                          onClick={() => {
                            setSelectedItem(task);
                            setIsFullscreenEditorOpen(true);
                          }}
                          style={{
                            top: `${topPx}px`,
                            height: `${heightPx}px`,
                            left: `${left}%`,
                            width: `${width}%`
                          }}
                          className="absolute rounded-lg p-1.5 border border-white/[0.08] bg-[#141417]/95 hover:bg-[#18181c] flex flex-col justify-between select-none cursor-pointer transition-all z-10 shadow-sm active:scale-[0.98]"
                        >
                          <div className="flex items-start gap-1 min-w-0">
                            {task.priority && task.priority !== 'none' && (
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${
                                  task.priority === 'high'
                                    ? 'bg-rose-500'
                                    : task.priority === 'medium'
                                    ? 'bg-amber-400'
                                    : 'bg-blue-400'
                                }`}
                              />
                            )}
                            <span
                              className={`text-[11px] font-medium leading-tight truncate flex-1 ${
                                isDone ? 'line-through text-zinc-500' : 'text-zinc-200'
                              }`}
                            >
                              {task.title || 'Без названия'}
                            </span>
                            {task.recurrence && (
                              <Repeat className="w-2.5 h-2.5 text-amber-400 shrink-0 mt-0.5" />
                            )}
                          </div>

                          <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 mt-0.5">
                            <span>{slot.timeLabel.split('-')[0].trim()}</span>
                            {task.folder && (
                              <span className="truncate max-w-[50px] opacity-75">{task.folder}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. SHEET: Tasks with No Date (Bottom Sheet)                              */}
      {/* ========================================================================= */}
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

      {/* ========================================================================= */}
      {/* 6. SHEET: Month Date Picker (Select a Date)                              */}
      {/* ========================================================================= */}
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
