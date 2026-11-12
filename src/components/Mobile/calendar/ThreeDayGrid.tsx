import React from 'react';
import type { SlagItem } from '../../../types';
import { RUSSIAN_WEEKDAYS } from '../../../lib/time/dateUtils';
import { Repeat, X } from 'lucide-react';
import type { CalendarSlotTarget, ThreeDayColumn } from './calendarPositions';
import { formatClockLabel, HOURS_24, HOUR_HEIGHT, realTaskId } from './calendarPositions';
import { timedBlockBox } from '../../../lib/time/calendarLayout';
import { PRIORITY_TONE_DOT, priorityTone } from '../../UI/priorityTone';

export interface ThreeDayGridProps {
  columns: ThreeDayColumn[];
  items: SlagItem[];
  addingSlot: CalendarSlotTarget | null;
  slotTitle: string;
  onChangeSlotTitle: (value: string) => void;
  onStartAddingSlot: (slot: CalendarSlotTarget) => void;
  onCancelAddingSlot: () => void;
  onSubmitSlot: (event: React.FormEvent<HTMLFormElement>) => void;
  onSelectTask: (task: SlagItem) => void;
  onTouchStart: React.TouchEventHandler<HTMLDivElement>;
  onTouchEnd: React.TouchEventHandler<HTMLDivElement>;
  gridRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Трёхдневная сетка на 24 часа: шапка дней, полоса «весь день», рельс часов и
 * колонки с тасками по времени.
 */
export const ThreeDayGrid: React.FC<ThreeDayGridProps> = ({
  columns,
  items,
  addingSlot,
  slotTitle,
  onChangeSlotTitle,
  onStartAddingSlot,
  onCancelAddingSlot,
  onSubmitSlot,
  onSelectTask,
  onTouchStart,
  onTouchEnd,
  gridRef,
}) => {
  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="flex-1 flex flex-col overflow-hidden select-none bg-canvas"
    >
      {/* 3-Day Column Headers (Sticky Top) */}
      <div className="flex border-b border-white/[0.06] bg-panel shrink-0">
        {/* Time label left spacer */}
        <div className="w-11 shrink-0 border-r border-white/[0.04]" />

        {/* 3 Days columns */}
        <div className="flex-1 grid grid-cols-3 divide-x divide-white/[0.04]">
          {columns.map(column => (
            <div
              key={column.day.dateStr}
              className="py-2 px-1 flex flex-col items-center justify-center text-center"
            >
              <span className="text-[10px] font-mono text-zinc-500 uppercase">
                {RUSSIAN_WEEKDAYS[column.day.weekdayIndex]}
              </span>
              <span
                className={`text-xs font-bold mt-0.5 px-2 py-0.5 rounded-full ${
                  column.isToday ? 'bg-white text-black shadow-xs' : 'text-zinc-200'
                }`}
              >
                {column.day.dayNum}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* All Day Row (Chips for tasks without specific time slot) */}
      <div className="flex border-b border-white/[0.06] bg-panel/50 shrink-0 min-h-[36px]">
        <div className="w-11 shrink-0 border-r border-white/[0.04] flex items-center justify-center text-2xs font-mono text-zinc-500 uppercase p-1">
          Весь день
        </div>
        <div className="flex-1 grid grid-cols-3 divide-x divide-white/[0.04] p-1 gap-1">
          {columns.map(column => (
            <div key={column.day.dateStr} className="flex flex-col gap-1 min-w-0">
              {column.allDayTasks.map(task => (
                <div
                  key={task.id}
                  onClick={() => {
                    const target = items.find(i => i.id === realTaskId(task.id)) || task;
                    onSelectTask(target);
                  }}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[10px] text-zinc-300 truncate cursor-pointer motion-press ${
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
          ))}
        </div>
      </div>

      {/* 24-Hour Scrollable Grid (00:00 - 23:00) */}
      <div
        ref={gridRef}
        className="flex-1 overflow-y-auto scrollbar-thin relative bg-canvas flex pb-24"
      >
        {/* Time rail left column */}
        <div className="w-11 shrink-0 border-r border-white/[0.04] bg-panel/30 select-none">
          {HOURS_24.map(h => (
            <div
              key={h}
              style={{ height: `${HOUR_HEIGHT}px` }}
              className="border-b border-white/[0.04] pr-1.5 text-right text-[10px] font-mono text-zinc-500 pt-1"
            >
              {formatClockLabel(h, 0)}
            </div>
          ))}
        </div>

        {/* 3 Day Columns Grid */}
        <div className="flex-1 grid grid-cols-3 relative divide-x divide-white/[0.04]">
          {columns.map(column => (
            <div key={column.day.dateStr} className="relative h-full">
              {/* Hour slots with tap to add */}
              {HOURS_24.map(hour => {
                const isAddingThis =
                  addingSlot?.dateStr === column.day.dateStr && addingSlot?.hour === hour;

                return (
                  <div
                    key={hour}
                    onClick={() => onStartAddingSlot({ dateStr: column.day.dateStr, hour })}
                    style={{ height: `${HOUR_HEIGHT}px` }}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors relative cursor-pointer group"
                  >
                    {/* Inline Add Modal in Grid Slot */}
                    {isAddingThis && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className="absolute inset-x-1 top-1 z-30 bg-surface-elevated border border-white/20 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1.5 motion-popover"
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                          <span>{formatClockLabel(hour, 0)}</span>
                          <button
                            type="button"
                            onClick={onCancelAddingSlot}
                            className="text-zinc-500 hover:text-white"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <form onSubmit={onSubmitSlot} className="flex flex-col gap-1">
                          <input
                            type="text"
                            value={slotTitle}
                            onChange={e => onChangeSlotTitle(e.target.value)}
                            placeholder="Название..."
                            autoFocus
                            className="bg-black/50 border border-white/10 rounded px-1.5 py-1 text-xs text-white placeholder-zinc-500 outline-none"
                          />
                          <button
                            type="submit"
                            className="py-1 rounded bg-white text-black text-[10px] font-semibold cursor-pointer motion-press"
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
              {column.isToday && (
                <div
                  style={{ top: `${column.ribbonTopPx}px` }}
                  className="absolute inset-x-0 h-[2px] bg-rose-500 z-20 pointer-events-none"
                >
                  <div className="w-2 h-2 rounded-full bg-rose-500 -mt-[3px] -ml-1 shadow-sm shadow-rose-500/80" />
                </div>
              )}

              {/* Timed Task Blocks with Anti-Overlap and Clean Monochrome Styling */}
              {column.timedBlocks.map(positioned => {
                const { task, slot, topPx, heightPx, colIndex, totalCols } = positioned;
                const isDone = task.status === 'done';
                const box = timedBlockBox(colIndex, totalCols);

                return (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    style={{
                      top: `${topPx}px`,
                      height: `${heightPx}px`,
                      left: `${box.left}%`,
                      width: `${box.width}%`
                    }}
                    className="absolute rounded-lg p-1.5 border border-white/[0.08] bg-surface/95 hover:bg-surface-elevated flex flex-col justify-between select-none cursor-pointer transition-colors z-10 shadow-sm"
                  >
                    <div className="flex items-start gap-1 min-w-0">
                      {task.priority && task.priority !== 'none' && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${PRIORITY_TONE_DOT[priorityTone(task.priority)]}`}
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

                    <div className="flex items-center justify-between text-2xs font-mono text-zinc-500 mt-0.5">
                      <span>{slot.timeLabel.split('-')[0].trim()}</span>
                      {task.folder && (
                        <span className="truncate max-w-[50px] opacity-75">{task.folder}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
