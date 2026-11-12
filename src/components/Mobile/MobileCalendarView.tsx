// The phone calendar: agenda and three-day modes, day swipes, and a month picker.
import React, { useState, useMemo, useSyncExternalStore, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, TaskStatus } from '../../types';
import {
  getISODateString,
  getMondayOfWeek,
  getTodayString,
  getTomorrowString,
} from '../../lib/time/dateUtils';
import { useSwipeGesture } from '../../hooks/gestures/useSwipeGesture';
import { useCalendarSchedule, type CalendarTask } from '../../hooks/useCalendarSchedule';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { CalendarHeader } from './calendar/CalendarHeader';
import { WeekStrip } from './calendar/WeekStrip';
import { AgendaOverdueSection } from './calendar/AgendaOverdueSection';
import { AgendaDayGroup } from './calendar/AgendaDayGroup';
import { ThreeDayGrid } from './calendar/ThreeDayGrid';
import { MonthPickerSheet } from './calendar/MonthPickerSheet';
import {
  buildThreeDayWindow,
  buildWeekDays,
  formatMonthHeading,
  isCurrentWeekMonday,
  parseISODate,
  pickerAnchorDate,
  shiftDateStr,
  shiftWeek,
  todayAnchor,
  type MobileCalendarMode,
} from './calendar/calendarRange';
import {
  buildAgendaDay,
  buildThreeDayColumns,
  formatClockLabel,
  realTaskId,
  scrollTopForHour,
  type CalendarSlotTarget,
} from './calendar/calendarPositions';

function subscribeToNow() {
  return () => {};
}

interface MobileCalendarViewProps {
  headerRightExtra?: React.ReactNode;
  embedded?: boolean;
}

export const MobileCalendarView: React.FC<MobileCalendarViewProps> = ({
  headerRightExtra,
  embedded = false,
}) => {
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
  const [calendarLayout, setCalendarLayout] = useState<MobileCalendarMode>('agenda');

  // Selected date and week state for Agenda
  const [selectedDate, setSelectedDate] = useState<string>(() => todayStr || getISODateString(new Date()));
  const [currentWeekMonday, setCurrentWeekMonday] = useState<Date>(() => getMondayOfWeek(new Date()));

  // 3-Day View Start Date (3 consecutive days)
  const [threeDayStartDate, setThreeDayStartDate] = useState<string>(() => todayStr || getISODateString(new Date()));

  // Sheets
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);

  // Picker Month offset
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date().getMonth());

  // Inline Task Creation on specific date (Agenda)
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [inlineTitle, setInlineTitle] = useState('');

  // 1-Click Add slot on 3-day grid: { dateStr, hour }
  const [addingTimeSlot, setAddingTimeSlot] = useState<CalendarSlotTarget | null>(null);
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
      timeGridScrollRef.current.scrollTop = scrollTopForHour(currentHour);
      hasInitialScrolledRef.current = true;
    }
    if (calendarLayout !== '3day') {
      hasInitialScrolledRef.current = false;
    }
  }, [calendarLayout, nowMinute]);

  // Generate 7 days for the current week strip
  const weekDays = useMemo(() => buildWeekDays(currentWeekMonday), [currentWeekMonday]);

  // Tasks grouped by dueDate using unified schedule hook
  const rangeStart = weekDays[0]?.dateStr || todayStr;
  const rangeEnd = weekDays[6]?.dateStr || todayStr;

  const {
    overdueTasks,
    tasksByDate: tasksByDateMap,
  } = useCalendarSchedule({
    items,
    rangeStart,
    rangeEnd,
  });

  const { tasksByDate, datesWithTasks } = useMemo(() => {
    const byDate: Record<string, CalendarTask[]> = {};
    const withTasks = new Set<string>();
    tasksByDateMap.forEach((tasks, dateStr) => {
      byDate[dateStr] = tasks;
      if (tasks.length > 0) withTasks.add(dateStr);
    });
    return { tasksByDate: byDate, datesWithTasks: withTasks };
  }, [tasksByDateMap]);

  // Generate 3 consecutive days for 3-Day View
  const threeDays = useMemo(() => buildThreeDayWindow(threeDayStartDate), [threeDayStartDate]);

  // Month & Year title for Header
  const currentMonthLabel = useMemo(
    () => formatMonthHeading(calendarLayout, currentWeekMonday, threeDayStartDate),
    [calendarLayout, currentWeekMonday, threeDayStartDate]
  );

  const isCurrentWeek = useMemo(
    () => isCurrentWeekMonday(currentWeekMonday, todayStr),
    [currentWeekMonday, todayStr]
  );

  // Кнопка «Сегодня» гаснет, когда мы и так смотрим текущий период
  const isViewingToday = calendarLayout === 'agenda'
    ? isCurrentWeek && selectedDate === todayStr
    : threeDayStartDate === todayStr;

  const nowLabel = formatClockLabel(Math.floor(nowMinute / 60), nowMinute % 60);

  // Раскладка повестки: заголовки дней, порядок строк, место линии «сейчас»
  const agendaDays = useMemo(
    () => weekDays.map(day => buildAgendaDay(day, tasksByDate[day.dateStr] ?? [], {
      todayStr,
      tomorrowStr,
      nowMinute,
    })),
    [weekDays, tasksByDate, todayStr, tomorrowStr, nowMinute]
  );

  // Раскладка трёхдневки: чипы «весь день», блоки по времени, красная линия
  const threeDayColumns = useMemo(
    () => buildThreeDayColumns(threeDays, tasksByDate, todayStr, nowMinute),
    [threeDays, tasksByDate, todayStr, nowMinute]
  );

  const handleSelectTask = useCallback((task: SlagItem) => {
    setSelectedItem(task);
    setIsFullscreenEditorOpen(true);
  }, [setSelectedItem, setIsFullscreenEditorOpen]);

  const handleToggleTask = useCallback((task: SlagItem) => {
    toggleTaskComplete(realTaskId(task.id));
  }, [toggleTaskComplete]);

  const handleOpenTaskActions = useCallback((task: SlagItem) => {
    setMobileActionSheetItem(task);
  }, [setMobileActionSheetItem]);

  // Navigation handlers
  const handlePrev = () => {
    if (calendarLayout === '3day') {
      setThreeDayStartDate(prev => shiftDateStr(prev, -3));
    } else {
      setCurrentWeekMonday(prev => shiftWeek(prev, -1));
    }
  };

  const handleNext = () => {
    if (calendarLayout === '3day') {
      setThreeDayStartDate(prev => shiftDateStr(prev, 3));
    } else {
      setCurrentWeekMonday(prev => shiftWeek(prev, 1));
    }
  };

  const handleGoToToday = () => {
    const { monday, dateStr } = todayAnchor(todayStr);

    setCurrentWeekMonday(monday);
    setSelectedDate(dateStr);
    setThreeDayStartDate(dateStr);

    if (calendarLayout === 'agenda') {
      scrollToDate(dateStr);
    } else if (timeGridScrollRef.current) {
      const currentHour = Math.floor(nowMinute / 60);
      timeGridScrollRef.current.scrollTop = scrollTopForHour(currentHour);
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

  const handleOpenMonthPicker = () => {
    const anchor = pickerAnchorDate(calendarLayout, currentWeekMonday, threeDayStartDate);
    setPickerYear(anchor.getFullYear());
    setPickerMonth(anchor.getMonth());
    setIsMonthPickerOpen(true);
  };

  const handleShiftPickerMonth = (delta: -1 | 1) => {
    if (delta < 0) {
      if (pickerMonth === 0) {
        setPickerMonth(11);
        setPickerYear(y => y - 1);
      } else {
        setPickerMonth(m => m - 1);
      }
      return;
    }
    if (pickerMonth === 11) {
      setPickerMonth(0);
      setPickerYear(y => y + 1);
    } else {
      setPickerMonth(m => m + 1);
    }
  };

  // Month Picker Select
  const handleSelectDateFromPicker = (dateStr: string) => {
    setCurrentWeekMonday(getMondayOfWeek(parseISODate(dateStr)));
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
      folder: currentFolder || DEFAULT_INBOX_FOLDER,
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
      folder: currentFolder || DEFAULT_INBOX_FOLDER,
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

  const handleStartAddingSlot = (slot: CalendarSlotTarget) => {
    setAddingTimeSlot(slot);
    setSlotTaskTitle('');
  };

  // Swipe gesture handling
  const { onTouchStart: handleTouchStart, onTouchEnd: handleTouchEnd } = useSwipeGesture({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
  });

  return (
    <div className="flex-1 flex flex-col bg-canvas text-fg-primary overflow-hidden select-none relative">
      {/* 1. Unified Mobile Calendar Header (Single Bar, 44px) */}
      <CalendarHeader
        embedded={embedded}
        mode={calendarLayout}
        monthLabel={currentMonthLabel}
        isViewingToday={isViewingToday}
        rightSlot={headerRightExtra}
        onOpenMonthPicker={handleOpenMonthPicker}
        onGoToToday={handleGoToToday}
        onChangeMode={setCalendarLayout}
      />

      {/* ========================================================================= */}
      {/* 3. MODE A: AGENDA VIEW (Week Strip + Grouped Days Timeline)                */}
      {/* ========================================================================= */}
      {calendarLayout === 'agenda' ? (
        <>
          {/* Week Strip (7 Days) */}
          <WeekStrip
            days={weekDays}
            todayStr={todayStr}
            selectedDate={selectedDate}
            datesWithTasks={datesWithTasks}
            onSelectDay={handleSelectDay}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          />

          {/* Agenda Feed */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4 pb-28">
            {/* Overdue Section */}
            <AgendaOverdueSection
              tasks={overdueTasks}
              onSelectTask={handleSelectTask}
              onToggleTask={handleToggleTask}
              onOpenTaskActions={handleOpenTaskActions}
            />

            {/* Days in the week */}
            {agendaDays.map(layout => (
              <AgendaDayGroup
                key={layout.day.dateStr}
                layout={layout}
                nowLabel={nowLabel}
                isAdding={addingDate === layout.day.dateStr}
                addTitle={inlineTitle}
                onChangeAddTitle={setInlineTitle}
                onStartAdding={() => setAddingDate(layout.day.dateStr)}
                onCancelAdding={() => setAddingDate(null)}
                onSubmitAdd={e => handleCreateTaskOnDate(layout.day.dateStr, e)}
                onSelectTask={handleSelectTask}
                onToggleTask={handleToggleTask}
                onOpenTaskActions={handleOpenTaskActions}
                sectionRef={el => { dateSectionRefs.current[layout.day.dateStr] = el; }}
              />
            ))}
          </div>
        </>
      ) : (
        /* ========================================================================= */
        /* 4. MODE B: 3-DAY 24-HOUR TIME GRID (Todoist Multi-Day View)               */
        /* ========================================================================= */
        <ThreeDayGrid
          columns={threeDayColumns}
          items={items}
          addingSlot={addingTimeSlot}
          slotTitle={slotTaskTitle}
          onChangeSlotTitle={setSlotTaskTitle}
          onStartAddingSlot={handleStartAddingSlot}
          onCancelAddingSlot={() => setAddingTimeSlot(null)}
          onSubmitSlot={handleCreateTaskInTimeSlot}
          onSelectTask={handleSelectTask}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          gridRef={timeGridScrollRef}
        />
      )}

      {/* ========================================================================= */}
      {/* 5. SHEET: Month Date Picker (Select a Date)                              */}
      {/* ========================================================================= */}
      <MonthPickerSheet
        isOpen={isMonthPickerOpen}
        pickerYear={pickerYear}
        pickerMonth={pickerMonth}
        todayStr={todayStr}
        selectedDate={selectedDate}
        datesWithTasks={datesWithTasks}
        onClose={() => setIsMonthPickerOpen(false)}
        onShiftMonth={handleShiftPickerMonth}
        onSelectDate={handleSelectDateFromPicker}
        onSelectToday={() => handleSelectDateFromPicker(todayStr)}
      />
    </div>
  );
};
