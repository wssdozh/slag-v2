// One day of the agenda: its heading, the now line, task rows, and adding a task inline.
import React from 'react';
import type { SlagItem } from '../../../types';
import { pluralRu, RUSSIAN_MONTHS } from '../../../lib/time/dateUtils';
import { Icon } from '../../UI/icons/Icon';
import { CalendarTaskRow } from './CalendarTaskRow';
import type { AgendaDayLayout } from './calendarPositions';

export interface AgendaDayGroupProps {
  layout: AgendaDayLayout;
  nowLabel: string;
  isAdding: boolean;
  addTitle: string;
  onChangeAddTitle: (value: string) => void;
  onStartAdding: () => void;
  onCancelAdding: () => void;
  onSubmitAdd: (event: React.FormEvent<HTMLFormElement>) => void;
  onSelectTask: (task: SlagItem) => void;
  onToggleTask: (task: SlagItem) => void;
  onOpenTaskActions: (task: SlagItem) => void;
  sectionRef: (element: HTMLDivElement | null) => void;
}

interface NowLineProps {
  label: string;
  divider?: boolean;
}

const NowLine: React.FC<NowLineProps> = ({ label, divider = false }) => (
  <div
    className={`w-full flex items-center gap-2 p-2.5 sm:p-3 select-none${
      divider ? ' border-b border-tint-4' : ''
    }`}
  >
    <div className="w-6 flex items-center justify-center shrink-0">
      <span className="w-2 h-2 rounded-full bg-rose-500 shadow-xs shadow-rose-500/80" />
    </div>
    <span className="text-2xs font-mono font-semibold text-rose-400 shrink-0">
      {label}
    </span>
    <div className="h-px flex-1 bg-rose-500/40" />
  </div>
);

/**
 * Один день повестки: заголовок со счётчиком, карточка со строками тасок, линия
 * «сейчас» и форма быстрого добавления.
 */
export const AgendaDayGroup: React.FC<AgendaDayGroupProps> = ({
  layout,
  nowLabel,
  isAdding,
  addTitle,
  onChangeAddTitle,
  onStartAdding,
  onCancelAdding,
  onSubmitAdd,
  onSelectTask,
  onToggleTask,
  onOpenTaskActions,
  sectionRef,
}) => {
  const { day, heading, isToday, sortedTasks, nowLineIndex } = layout;
  const hasNowLine = nowLineIndex >= 0;

  return (
    <div
      ref={sectionRef}
      className="flex flex-col gap-1.5 scroll-mt-2"
    >
      <div className="flex items-center justify-between px-1">
        <span className={`text-xs font-semibold tracking-tight ${isToday ? 'text-white' : 'text-fg-secondary'}`}>
          {heading}
        </span>
        {sortedTasks.length > 0 && (
          <span className="text-3xs font-mono text-fg-muted">
            {sortedTasks.length} {pluralRu(sortedTasks.length, ['таска', 'таски', 'тасок'])}
          </span>
        )}
      </div>

      <div className="rounded-2xl bg-surface/70 border border-tint-5 overflow-hidden">
        {sortedTasks.length > 0 ? (
          <div className="divide-y divide-tint-4">
            {sortedTasks.map((task, index) => (
              <React.Fragment key={task.id}>
                {hasNowLine && nowLineIndex === index && <NowLine label={nowLabel} />}
                <CalendarTaskRow
                  task={task}
                  onSelect={() => onSelectTask(task)}
                  onToggleComplete={() => onToggleTask(task)}
                  onOpenActionSheet={() => onOpenTaskActions(task)}
                />
              </React.Fragment>
            ))}
            {hasNowLine && nowLineIndex === sortedTasks.length && <NowLine label={nowLabel} />}
          </div>
        ) : (
          <div className="flex flex-col">
            {isToday && <NowLine label={nowLabel} divider />}
            <div className="p-3 text-xs text-fg-muted flex items-center justify-between">
              <span>— нет тасок</span>
              <button
                type="button"
                onClick={onStartAdding}
                className="text-fg-secondary hover:text-white flex items-center gap-1 cursor-pointer text-xs"
              >
                <Icon name="action.add" size="sm" tone="inherit" />
                <span>Добавить</span>
              </button>
            </div>
          </div>
        )}

        {isAdding ? (
          <form
            onSubmit={onSubmitAdd}
            className="p-2.5 bg-scrim-40 border-t border-tint-6 flex items-center gap-2 motion-fade"
          >
            <input
              type="text"
              value={addTitle}
              onChange={e => onChangeAddTitle(e.target.value)}
              placeholder={`Новая задача на ${day.dayNum} ${RUSSIAN_MONTHS[day.date.getMonth()].slice(0, 3)}...`}
              autoFocus
              className="flex-1 bg-scrim-50 border border-tint-8 rounded-xl px-3 py-1.5 text-xs text-white placeholder-fg-muted outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-xl bg-white text-black text-xs font-semibold cursor-pointer motion-press shrink-0"
            >
              OK
            </button>
            <button
              type="button"
              onClick={onCancelAdding}
              className="p-1 rounded-lg text-fg-secondary hover:text-white cursor-pointer"
            >
              <Icon name="action.close" size="sm" tone="inherit" />
            </button>
          </form>
        ) : sortedTasks.length > 0 ? (
          <button
            type="button"
            onClick={onStartAdding}
            className="w-full py-2 px-3 flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg-tertiary hover:bg-tint-2 border-t border-tint-4 transition-colors cursor-pointer"
          >
            <Icon name="action.add" size="sm" tone="inherit" />
            <span>Добавить таску</span>
          </button>
        ) : null}
      </div>
    </div>
  );
};
