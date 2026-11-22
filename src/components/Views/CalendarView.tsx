// The desktop calendar: month and week grids, drag to reschedule, and the overdue drawer.
import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { getTaskTimeSlot } from '../../lib/time/todoistTaskParser';
import { computeAntiOverlapLayout } from '../../lib/time/calendarLayout';
import { useDragToScroll } from '../../hooks/gestures/useDragToScroll';
import { useCalendarSchedule } from '../../hooks/useCalendarSchedule';
import { usePointerDnd, type DragItemPayload } from '../../hooks/gestures/usePointerDnd';
import { usePresence } from '../../hooks/ui/usePresence';
import {
  getISODateString,
  getMondayOfWeek,
  getWeekDays,
  getMonthCalendarDays,
  RUSSIAN_MONTHS,
  RUSSIAN_WEEKDAYS,
} from '../../lib/time/dateUtils';
import { Icon } from '../UI/icons/Icon';
import {
  DEFAULT_HOUR_HEIGHT,
  useCalendarInteractions,
} from './useCalendarInteractions';
import {
  getPriorityBadge,
  cleanTimeFromTitle,
} from './calendarHelpers';
import { AllDayTaskPill, TimedTaskBlock } from './CalendarTaskBlock';
import { CalendarMonthView } from './CalendarMonthView';
import { CalendarExpandedDayModal } from './CalendarExpandedDayModal';
import { CalendarDrawer } from './CalendarDrawer';
import type { TaskQuickFilter } from '../../lib/tasks/taskQuickFilter';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const CalendarView: React.FC<{ taskFilter?: TaskQuickFilter }> = ({ taskFilter }) => {
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

  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'overdue' | 'unscheduled'>('overdue');

  const timeGridRef = useRef<HTMLDivElement | null>(null);
  const monthGridRef = useRef<HTMLDivElement | null>(null);
  const weekHorizontalScrollRef = useRef<HTMLDivElement | null>(null);
  const monthHorizontalScrollRef = useRef<HTMLDivElement | null>(null);
  const [gridScrollbarWidth, setGridScrollbarWidth] = useState(0);
  const [monthGridScrollbarWidth, setMonthGridScrollbarWidth] = useState(0);

  const {
    hourHeight,
    hourHeightRef,
    timelineResizing,
    resizingTask,
    isJustResizedRef,
    handleTimelineRulerMouseDown,
    handleTimelineRulerWheel,
    handleTimelineDoubleClick,
    handleResizeStart,
  } = useCalendarInteractions({
    timeGridRef,
    items,
    updateItem,
    addToast,
  });

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
        let minute = 0;
        if (targetData.dropMinute !== undefined) {
          minute = parseInt(targetData.dropMinute, 10);
        } else {
          const rect = targetZone.getBoundingClientRect();
          const offsetY = dropPos.y - rect.top;
          const currentH = hourHeightRef.current;
          const quarter = Math.min(3, Math.max(0, Math.floor((offsetY / currentH) * 4)));
          minute = quarter * 15;
        }

        const [year, month, day] = dateStr.split('-').map(Number);
        const targetDate = new Date(year, month - 1, day, hour, minute, 0, 0);
        const reminder = targetDate.toISOString();

        updateItem({
          ...task,
          dueDate: dateStr,
          reminder,
        });
        const timeFormatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        addToast(`Таска перенесена на ${dateStr} в ${timeFormatted}`, 'info');
      } else if (targetData.dropZone === 'calendar-allday') {
        const dateStr = targetData.dropDate;
        const updatedTitle = cleanTimeFromTitle(task.title);
        updateItem({
          ...task,
          title: updatedTitle,
          dueDate: dateStr,
          reminder: undefined,
        });
        addToast(`Таска перенесена на ${dateStr} (весь день)`, 'info');
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
        addToast(`Таска перенесена на ${dateStr}`, 'info');
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

  const [expandedDayDateStr, setExpandedDayDateStr] = useState<string | null>(null);
  const [cachedDayDateStr, setCachedDayDateStr] = useState<string | null>(null);
  if (expandedDayDateStr && expandedDayDateStr !== cachedDayDateStr) {
    setCachedDayDateStr(expandedDayDateStr);
  }
  const isExpandedDayOpen = Boolean(expandedDayDateStr);
  const {
    ref: expandedDayRef,
    phase: expandedDayPhase,
    isPresent: isExpandedDayPresent,
    onTransitionEnd: onExpandedDayTransitionEnd,
  } = usePresence(isExpandedDayOpen);
  const effectiveDayDateStr = expandedDayDateStr || cachedDayDateStr;

  const [nowMinute, setNowMinute] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

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

  useEffect(() => {
    const el = timeGridRef.current;
    if (!el) return;
    const update = () => {
      const sw = el.offsetWidth - el.clientWidth;
      setGridScrollbarWidth(sw > 0 ? sw : 0);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode, items]);

  useEffect(() => {
    const el = monthGridRef.current;
    if (!el) return;
    const update = () => {
      const sw = el.offsetWidth - el.clientWidth;
      setMonthGridScrollbarWidth(sw > 0 ? sw : 0);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode, items]);

  const weekDays = useMemo(() => {
    const monday = getMondayOfWeek(currentDate);
    return getWeekDays(monday);
  }, [currentDate]);

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
    allTasks,
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
    taskFilter,
  });

  const filterId = taskFilter?.id;
  const [previousFilter, setPreviousFilter] = useState<typeof filterId>();
  if (previousFilter !== filterId) {
    setPreviousFilter(filterId);
    if (filterId === 'today') {
      setCurrentDate(new Date(`${todayStr}T12:00:00`));
      setDrawerTab('overdue');
      setIsDrawerOpen(overdueTasks.length > 0);
    } else if (filterId === 'upcoming') {
      const firstDate = allTasks.reduce<string | undefined>((first, task) =>
        task.dueDate && (!first || task.dueDate < first) ? task.dueDate : first, undefined);
      if (firstDate) setCurrentDate(new Date(`${firstDate}T12:00:00`));
      setIsDrawerOpen(false);
    } else if (filterId === 'undated' || filterId === 'completed') {
      setDrawerTab('unscheduled');
      setIsDrawerOpen(filterId === 'undated' || unscheduledTasks.length > 0);
    }
  }

  const scrollWeekToDay = useCallback((day: string, behavior: ScrollBehavior = 'instant') => {
    const container = weekHorizontalScrollRef.current;
    const index = weekDays.findIndex(date => getISODateString(date) === day);
    if (!container || index < 0 || container.scrollWidth <= container.clientWidth) return;
    const columnWidth = (container.scrollWidth - 56) / 7;
    container.scrollTo({ left: Math.max(0, 56 + index * columnWidth - container.clientWidth / 2), behavior });
  }, [weekDays]);

  const revealTodayAfterDrawerOpens = useCallback(() => {
    if (filterId === 'today') scrollWeekToDay(todayStr);
  }, [filterId, scrollWeekToDay, todayStr]);

  useEffect(() => {
    if (viewMode === 'week') {
      if (timeGridRef.current) {
        const currentHour = Math.floor(nowMinute / 60);
        const scrollHour = Math.max(0, currentHour - 1);
        timeGridRef.current.scrollTop = scrollHour * hourHeightRef.current;
      }
    }
  }, [viewMode, currentDate, nowMinute, hourHeightRef]);

  useEffect(() => {
    if (filterId === 'upcoming') scrollWeekToDay(getISODateString(currentDate));
    else scrollWeekToDay(todayStr);
  }, [currentDate, filterId, scrollWeekToDay, todayStr, viewMode]);

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
    scrollWeekToDay(todayStr, 'smooth');
  };

  const headerTitle = useMemo(() => {
    const month = RUSSIAN_MONTHS[currentDate.getMonth()];
    const year = currentDate.getFullYear();
    return `${month} ${year}`;
  }, [currentDate]);

  const slotStepMinutes: 15 | 30 | 60 = hourHeight >= 112 ? 15 : hourHeight >= 68 ? 30 : 60;
  const subMinutes = useMemo(() => {
    return slotStepMinutes === 15 ? [0, 15, 30, 45] : slotStepMinutes === 30 ? [0, 30] : [0];
  }, [slotStepMinutes]);
  const subSlotHeight = hourHeight / subMinutes.length;

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas text-fg-primary select-none overflow-hidden relative">
      <div className="h-12 px-4 border-b border-tint-6 bg-panel flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Icon name="time.date" size="md" tone="tertiary" />
            <h2 className="text-xs font-semibold text-fg-primary tracking-tight">
              {headerTitle}
            </h2>
          </div>

          <div className="flex items-center gap-1 bg-tint-3 p-0.5 rounded-md border border-tint-4">
            <button onClick={handlePrev} className="p-1 rounded hover:bg-tint-6 text-fg-secondary hover:text-white transition-colors cursor-pointer" title="Предыдущий период"><Icon name="nav.prev" size="sm" tone="inherit" /></button>
            <button onClick={handleToday} className="px-2 py-0.5 rounded text-2xs font-medium text-fg-tertiary hover:text-white hover:bg-tint-6 transition-colors cursor-pointer" title="Перейти к сегодняшнему дню">Сегодня</button>
            <button onClick={handleNext} className="p-1 rounded hover:bg-tint-6 text-fg-secondary hover:text-white transition-colors cursor-pointer" title="Следующий период"><Icon name="nav.next" size="sm" tone="inherit" /></button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div aria-label="Режим календаря" className="flex items-center h-8 bg-surface p-0.5 rounded-lg border border-tint-8 shadow-inner shrink-0">
            <button onClick={() => setViewMode('week')} className={`h-7 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${viewMode === 'week' ? 'bg-tint-10 text-white font-medium shadow-sm border border-tint-8' : 'text-fg-secondary hover:text-fg-soft hover:bg-tint-4 border border-transparent'}`}>Неделя</button>
            <button onClick={() => setViewMode('month')} className={`h-7 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${viewMode === 'month' ? 'bg-tint-10 text-white font-medium shadow-sm border border-tint-8' : 'text-fg-secondary hover:text-fg-soft hover:bg-tint-4 border border-transparent'}`}>Месяц</button>
          </div>

          <button
            onClick={() => setIsDrawerOpen(prev => !prev)}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!isDrawerOpen) setIsDrawerOpen(true); }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer ${isDrawerOpen ? 'bg-tint-10 border-tint-12 text-white' : 'bg-tint-3 border-tint-5 text-fg-secondary hover:text-fg-soft hover:bg-tint-6'}`}
            title="Открыть список просроченных и незапланированных задач"
          >
            {overdueTasks.length > 0 && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
            <Icon name="time.time" size="sm" />
            <span className="hidden sm:inline">Сроки</span>
            <span className="text-3xs font-mono text-fg-muted">({overdueTasks.length + unscheduledTasks.length})</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {viewMode === 'week' ? (
            <div ref={weekHorizontalScrollRef} data-testid="calendar-week-scroll-container" className="flex-1 flex flex-col overflow-x-auto overflow-y-hidden min-h-0 min-w-0 scrollbar-thin select-none cursor-grab">
              <div className="flex-1 flex flex-col min-w-[896px] h-full">
                <div className="flex border-b border-tint-6 bg-panel/90 shrink-0 cursor-grab">
                  <div data-resize-handle="timeline" title="Масштаб времени (двойной клик — сброс к 52px)" onDoubleClick={handleTimelineDoubleClick} className="w-14 shrink-0 border-r border-tint-4 flex items-center justify-center text-3xs font-mono text-fg-dim sticky left-0 z-20 bg-panel select-none hover:text-fg-secondary transition-colors cursor-pointer">{hourHeight !== DEFAULT_HOUR_HEIGHT ? `${hourHeight}px` : 'UTC'}</div>
                  <div className="flex-1 grid grid-cols-7">
                  {weekDays.map((date, idx) => {
                    const dateStr = getISODateString(date);
                    const isToday = dateStr === todayStr;
                    return (
                      <div key={dateStr} className="px-2 py-2 text-center border-r border-tint-4 last:border-r-0 flex flex-col items-center justify-center gap-1">
                        <span className="text-3xs font-mono text-fg-muted tracking-wider">{RUSSIAN_WEEKDAYS[idx]}</span>
                        {isToday ? <span className="w-6 h-6 rounded-full bg-white text-canvas text-xs font-bold flex items-center justify-center shadow-sm">{date.getDate()}</span> : <span className="text-xs font-medium text-fg-tertiary">{date.getDate()}</span>}
                      </div>
                    );
                  })}
                  </div>
                  {gridScrollbarWidth > 0 && <div style={{ width: gridScrollbarWidth }} className="shrink-0 bg-panel" />}
                </div>

                <div className="flex border-b border-tint-6 bg-canvas shrink-0 max-h-36 overflow-y-auto scrollbar-thin">
                  <div className="w-14 shrink-0 border-r border-tint-4 px-1.5 py-2 flex items-start justify-end text-3xs font-mono text-fg-muted select-none sticky left-0 z-20 bg-canvas">Весь день</div>
                  <div className="flex-1 grid grid-cols-7 min-h-[44px]">
                    {weekDays.map(date => {
                      const dateStr = getISODateString(date);
                      const allDayTasks = (tasksByDueDate.get(dateStr) || []).filter(t => getTaskTimeSlot(t).isAllDay);
                      const isOver = isDragging && activeZoneData?.dropZone === 'calendar-allday' && activeZoneData.dropDate === dateStr;
                      return (
                        <div key={dateStr} data-drop-zone="calendar-allday" data-drop-date={dateStr} className={`p-1 border-r border-tint-4 last:border-r-0 space-y-1 transition-colors min-h-[44px] ${isOver ? 'bg-blue-500/15 ring-1 ring-blue-500/40 rounded-sm' : ''}`}>
                          {allDayTasks.map(task => <AllDayTaskPill key={task.id} task={task} items={items} draggingTaskId={draggingTaskId} handlePointerDown={handlePointerDown} setSelectedItem={setSelectedItem} setIsFullscreenEditorOpen={setIsFullscreenEditorOpen} openContextMenu={openContextMenu} toggleTaskComplete={toggleTaskComplete} />)}
                          {isOver && allDayTasks.length === 0 && <div className="text-3xs font-mono text-blue-300 py-1 text-center border border-dashed border-blue-500/40 rounded bg-blue-500/10 pointer-events-none">Весь день</div>}
                          <button onClick={() => openComposerModal({ type: 'task', dueDate: dateStr, folder: currentFolder })} className="w-full opacity-0 hover:opacity-100 focus:opacity-100 py-0.5 text-fg-muted hover:text-fg-tertiary hover:bg-tint-4 rounded flex items-center justify-center transition-opacity text-3xs cursor-pointer" title="Добавить таску на весь день"><Icon name="action.add" size="sm" tone="inherit" /></button>
                        </div>
                      );
                    })}
                  </div>
                  {gridScrollbarWidth > 0 && <div style={{ width: gridScrollbarWidth }} className="shrink-0 bg-canvas" />}
                </div>

                <div ref={timeGridRef} data-testid="calendar-time-grid" className="flex-1 overflow-y-auto scrollbar-thin relative bg-canvas flex">
                  <div data-resize-handle="timeline" data-testid="timeline-hour-ruler" onMouseDown={handleTimelineRulerMouseDown} onDoubleClick={handleTimelineDoubleClick} onWheel={handleTimelineRulerWheel} title={`Шкала времени: зажмите и тяните для приближения делений (сейчас шаг ${slotStepMinutes}м). Двойной клик — сброс.`} className="w-14 shrink-0 border-r border-tint-4 bg-panel select-none sticky left-0 z-30 shadow-[1px_0_0_0_rgba(255,255,255,0.04)] cursor-ns-resize hover:bg-surface-hover transition-colors">
                    {HOURS.map(hour => (
                      <div key={hour} data-hour={hour} style={{ height: `${hourHeight}px` }} className="flex flex-col cursor-ns-resize">
                        {subMinutes.map((minute, mIdx) => {
                          const isTop = minute === 0;
                          return (
                            <div key={minute} data-minute={minute} style={{ height: `${subSlotHeight}px` }} className={`border-b ${mIdx === subMinutes.length - 1 ? 'border-tint-4' : 'border-tint-3 border-dashed'} pr-2 text-right font-mono pt-0.5 select-none flex items-start justify-end ${isTop ? 'text-2xs text-fg-secondary' : 'text-2xs text-fg-dim'}`}>
                              <span className="hover:text-blue-300 pointer-events-none">{isTop ? `${String(hour).padStart(2, '0')}:00` : `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}</span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  <div className="flex-1 grid grid-cols-7 relative">
                    {weekDays.map(date => {
                      const dateStr = getISODateString(date);
                      const timedTasks = (tasksByDueDate.get(dateStr) || []).filter(t => !getTaskTimeSlot(t).isAllDay);
                      return (
                        <div key={dateStr} className="relative border-r border-tint-4 last:border-r-0 h-full">
                          {HOURS.map(hour => (
                            <div key={hour} data-hour={hour} style={{ height: `${hourHeight}px` }} className="flex flex-col">
                              {subMinutes.map((minute) => (
                                <div key={minute} data-drop-zone="calendar-hour" data-drop-date={dateStr} data-drop-hour={hour} data-drop-minute={minute} style={{ height: `${subSlotHeight}px` }} onClick={() => openComposerModal({ type: 'task', dueDate: dateStr, reminder: `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`, folder: currentFolder })} className="h-[52px] border-b border-tint-3 border-dashed hover:bg-tint-3 transition-colors relative group cursor-pointer" />
                              ))}
                            </div>
                          ))}
                          {dateStr === todayStr && (
                            <div style={{ top: `${(nowMinute / 60) * hourHeight}px` }} className="absolute inset-x-0 h-[2px] bg-blue-500 z-20 pointer-events-none">
                              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 -mt-1 -ml-1 shadow-sm shadow-blue-500/80" />
                            </div>
                          )}
                          {computeAntiOverlapLayout(timedTasks, hourHeight, resizingTask?.taskId || null, resizingTask?.currentDuration || null).map(positioned => (
                            <TimedTaskBlock key={positioned.task.id} positioned={positioned} items={items} draggingTaskId={draggingTaskId} resizingTask={resizingTask} isJustResizedRef={isJustResizedRef} handlePointerDown={handlePointerDown} setSelectedItem={setSelectedItem} setIsFullscreenEditorOpen={setIsFullscreenEditorOpen} openContextMenu={openContextMenu} toggleTaskComplete={toggleTaskComplete} handleResizeStart={handleResizeStart} />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <CalendarMonthView
              monthHorizontalScrollRef={monthHorizontalScrollRef}
              monthGridRef={monthGridRef}
              monthGridScrollbarWidth={monthGridScrollbarWidth}
              monthCells={monthCells}
              tasksByDueDate={tasksByDueDate}
              todayStr={todayStr}
              isDragging={isDragging}
              draggingTaskId={draggingTaskId}
              activeZoneData={activeZoneData}
              items={items}
              currentFolder={currentFolder}
              getPriorityBadge={getPriorityBadge}
              handlePointerDown={handlePointerDown}
              setSelectedItem={setSelectedItem}
              setIsFullscreenEditorOpen={setIsFullscreenEditorOpen}
              openComposerModal={openComposerModal}
              setExpandedDayDateStr={setExpandedDayDateStr}
            />
          )}
        </div>

        {timelineResizing && (
          <div data-testid="timeline-resize-tooltip" className={`fixed z-50 pointer-events-none px-3.5 py-2 rounded-xl bg-surface-elevated/95 border text-xs font-mono text-fg-primary shadow-2xl backdrop-blur-md flex items-center gap-2.5 ${timelineResizing.isSnapped ? 'border-blue-400' : 'border-tint-15'}`} style={{ left: 72, top: Math.max(70, Math.min(window.innerHeight - 60, timelineResizing.startY)) }}>
            <div className={`w-2 h-2 rounded-full ${timelineResizing.isSnapped ? 'bg-blue-400' : 'bg-blue-500'}`} />
            <span className="font-semibold text-fg-primary">{timelineResizing.currentHeight}px</span>
            <span className="text-fg-muted">•</span>
            <span className="text-blue-400 font-medium">Деления: {timelineResizing.slotStep} мин</span>
          </div>
        )}

        <CalendarDrawer
          isDrawerOpen={isDrawerOpen}
          drawerTab={drawerTab}
          setDrawerTab={setDrawerTab}
          setIsDrawerOpen={setIsDrawerOpen}
          overdueTasks={overdueTasks}
          unscheduledTasks={unscheduledTasks}
          isCompletedFilter={filterId === 'completed'}
          onOpenTransitionEnd={revealTodayAfterDrawerOpens}
          isDragging={isDragging}
          activeZoneData={activeZoneData}
          draggingTaskId={draggingTaskId}
          handlePointerDown={handlePointerDown}
          setSelectedItem={setSelectedItem}
          setIsFullscreenEditorOpen={setIsFullscreenEditorOpen}
          toggleTaskComplete={toggleTaskComplete}
          updateItem={updateItem}
          addToast={addToast}
        />
      </div>

      <CalendarExpandedDayModal
        isExpandedDayPresent={isExpandedDayPresent}
        effectiveDayDateStr={effectiveDayDateStr}
        isExpandedDayOpen={isExpandedDayOpen}
        expandedDayPhase={expandedDayPhase}
        expandedDayRef={expandedDayRef}
        onExpandedDayTransitionEnd={onExpandedDayTransitionEnd}
        setExpandedDayDateStr={setExpandedDayDateStr}
        tasksByDueDate={tasksByDueDate}
        items={items}
        draggingTaskId={draggingTaskId}
        handlePointerDown={handlePointerDown}
        setSelectedItem={setSelectedItem}
        setIsFullscreenEditorOpen={setIsFullscreenEditorOpen}
        toggleTaskComplete={toggleTaskComplete}
        openComposerModal={openComposerModal}
        currentFolder={currentFolder}
      />
      {isDragging && dragPos && draggingPayload && (
        <div className="fixed pointer-events-none z-50 px-3 py-1.5 rounded-lg bg-surface-elevated border border-blue-500/40 text-xs font-medium text-white shadow-2xl flex items-center gap-2 transform -translate-x-1/2 -translate-y-1/2 opacity-90 scale-105" style={{ left: `${dragPos.x}px`, top: `${dragPos.y}px` }}>
          <Icon name="time.date" size="sm" tone="accent" className="shrink-0" />
          <span className="truncate max-w-[200px]">{draggingPayload.title || 'Задача'}</span>
        </div>
      )}
    </div>
  );
};
